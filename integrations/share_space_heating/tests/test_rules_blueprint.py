"""Run blueprints/automation/share_space/rules.yaml against the rule and strategy fixtures."""
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import async_fire_time_changed, async_mock_service

from .test_blueprint_parity import SENSOR, WEEKDAYS, _minutes, planning_states, setup_zone

FIXTURES = Path(__file__).parents[3] / "fixtures" / "heating"
RULE_CASES = json.loads((FIXTURES / "rules_cases.json").read_text())
STRATEGY_CASES = json.loads((FIXTURES / "strategy_cases.json").read_text())
BLUEPRINT = (
    Path(__file__).parents[1] / "custom_components/share_space_heating/blueprints/automation/share_space/rules.yaml"
)


# Python port of frontend/ui/src/rules/templates.ts; both are checked against strategy_cases.json.
def office_saver_rules(inputs: dict) -> dict:
    comfort = {"type": "temperature", "value": inputs["comfort_temp"]}
    return {
        "version": 1,
        "rules": [
            {"label": "Occupied", "when": [{"type": "occupied"}], "then": comfort},
            {"label": "Preheat", "when": [{"type": "occupied_within", "hours": inputs["preheat_hours"]}], "then": comfort},
            {
                "label": "Between working days",
                "when": [{"type": "between_days", "gap_hours": inputs["max_gap_hours"]}],
                "then": {"type": "temperature", "value": inputs["setback_temp"]},
            },
        ],
        "fallback": {"label": "Away", "then": {"type": "off"}},
    }


def lunch_room_rules(inputs: dict) -> dict:
    fallback = {"label": "Outside lunch hours", "then": {"type": "off"}}
    if _minutes(inputs["heat_start"]) >= _minutes(inputs["heat_end"]):
        return {"version": 1, "rules": [], "fallback": fallback}
    lunch_hours = {"type": "time", "start": inputs["heat_start"], "end": inputs["heat_end"]}
    every = [
        {"start": inputs["morning_start"], "end": inputs["morning_end"]},
        {"start": inputs["afternoon_start"], "end": inputs["afternoon_end"]},
    ]
    windows = [w for w in every if _minutes(w["start"]) < _minutes(w["end"])]
    can_lunch = len(windows) > 0 if inputs["match"] == "any" else len(windows) == len(every)
    rules = []
    if can_lunch:
        rules.append(
            {
                "label": "Lunch",
                "when": [lunch_hours, {"type": "planned", "windows": windows, "match": inputs["match"]}],
                "then": {"type": "temperature", "value": inputs["temperature"]},
            }
        )
    rules.append({"label": "No lunch today", "when": [lunch_hours], "then": {"type": "off"}})
    return {"version": 1, "rules": rules, "fallback": fallback}


TEMPLATES = {"office_saver": office_saver_rules, "lunch_room": lunch_room_rules}
DEFAULT_TEMPS = {"comfort": 21, "eco": 17}

RULE_PARAMS = [
    pytest.param(
        case["schedule"], case["strategy"], case.get("temps", DEFAULT_TEMPS), case["tz"], check,
        id=f"rules-{i}-{j}-{case['name'][:40]}",
    )
    for i, case in enumerate(RULE_CASES)
    for j, check in enumerate(case["checks"])
]
STRATEGY_PARAMS = [
    pytest.param(
        case["schedule"], TEMPLATES[case["preset"]](case["inputs"]), DEFAULT_TEMPS, case["tz"], check,
        id=f"template-{i}-{j}-{case['name'][:40]}",
    )
    for i, case in enumerate(STRATEGY_CASES)
    for j, check in enumerate(case["checks"])
]


def _set_planning(hass, area, schedule, now, tz):
    full = {day: [list(r) for r in schedule.get(day, [])] for day in WEEKDAYS}
    plan = planning_states(full, now, tz)
    hass.states.async_set(f"binary_sensor.share_space_{area}", "on" if plan["on"] else "off", {"schedule": full})
    for key in ("next_on", "previous_off"):
        value = plan[key]
        hass.states.async_set(
            f"sensor.share_space_{area}_{key}",
            value.isoformat() if value else "unknown",
            {"device_class": "timestamp"},
        )


async def _run_rules(hass, rules, area="oa"):
    assert await async_setup_component(
        hass,
        "automation",
        {
            "automation": [
                {
                    "alias": "rules",
                    "use_blueprint": {
                        "path": "share_space/rules.yaml",
                        "input": {"zone": SENSOR, "area": area, "rules": rules},
                    },
                }
            ]
        },
    )
    await hass.async_block_till_done()
    await hass.services.async_call(
        "automation", "trigger", {"entity_id": "automation.rules", "skip_condition": True}, blocking=True
    )
    await hass.async_block_till_done()


@pytest.mark.parametrize(("schedule", "strategy", "temps", "tz_name", "check"), RULE_PARAMS + STRATEGY_PARAMS)
async def test_rules_blueprint_matches_fixture(hass, freezer, schedule, strategy, temps, tz_name, check):
    tz = ZoneInfo(tz_name)
    await hass.config.async_set_time_zone(tz_name)
    now = datetime.fromisoformat(check["now"])
    freezer.move_to(now)

    entry, _ = await setup_zone(hass, comfort_temp=temps["comfort"], eco_temp=temps["eco"])
    _set_planning(hass, "oa", schedule, now, tz)
    await _run_rules(hass, strategy)

    state = hass.states.get(SENSOR)
    expected = check["expected"]
    want = 7.0 if expected.get("off") else float(expected["target"])
    assert float(state.state) == want
    assert state.attributes["active_rule"] == check["reason"]
    assert state.attributes["mode"] == "automation"
    zone = hass.data["share_space_heating"]["zones"][entry.entry_id]
    assert zone.base_preset == expected.get("preset")
    assert zone.base_off is bool(expected.get("off"))


@pytest.mark.parametrize(
    "missing",
    [
        {"main": "unavailable"},
        {"main": "unknown"},
        {"next_on": "unavailable"},
        {"skip": "sensor.share_space_oa_previous_off"},
    ],
)
async def test_rules_blueprint_waits_for_planning(hass, missing):
    for entity, value in (
        ("binary_sensor.share_space_oa", missing.get("main", "off")),
        ("sensor.share_space_oa_next_on", missing.get("next_on", "unknown")),
        ("sensor.share_space_oa_previous_off", "unknown"),
    ):
        if entity != missing.get("skip"):
            hass.states.async_set(entity, value)
    await setup_zone(hass)
    rules = {"version": 1, "rules": [], "fallback": {"label": "Away", "then": {"type": "off"}}}
    base = async_mock_service(hass, "share_space_heating", "set_base_target")
    await _run_rules(hass, rules)
    assert base == []


async def test_rules_blueprint_ignores_previous_rules_and_missing_schedule(hass, freezer):
    freezer.move_to("2026-11-17T10:00:00+00:00")
    await hass.config.async_set_time_zone("UTC")
    hass.states.async_set("binary_sensor.share_space_oa", "off")
    hass.states.async_set("sensor.share_space_oa_next_on", "unknown")
    hass.states.async_set("sensor.share_space_oa_previous_off", "unknown")
    await setup_zone(hass)
    base = async_mock_service(hass, "share_space_heating", "set_base_target")
    planned = {"type": "planned", "windows": [{"start": "09:00", "end": "12:00"}], "match": "any"}
    rules = {
        "version": 1,
        "rules": [{"label": "Planned", "when": [planned], "then": {"type": "comfort"}}],
        "fallback": {"label": "Fallback", "then": {"type": "temperature", "value": 18.5}},
    }
    assert await async_setup_component(
        hass,
        "automation",
        {
            "automation": [
                {
                    "alias": "rules",
                    "use_blueprint": {
                        "path": "share_space/rules.yaml",
                        "input": {
                            "zone": SENSOR,
                            "area": "oa",
                            "rules": rules,
                            "previous_rules": {"version": 1, "rules": [], "fallback": {"label": "Old", "then": {"type": "off"}}},
                        },
                    },
                }
            ]
        },
    )
    await hass.async_block_till_done()
    await hass.services.async_call(
        "automation", "trigger", {"entity_id": "automation.rules", "skip_condition": True}, blocking=True
    )
    await hass.async_block_till_done()
    assert [(c.data.get("temperature"), c.data.get("reason")) for c in base] == [(18.5, "Fallback")]


def test_rules_blueprint_queued_and_versioned():
    text = BLUEPRINT.read_text()
    assert text.startswith("# share_space_blueprint_version: 1\n")
    assert "mode: queued\nmax: 5\nmax_exceeded: silent" in text


@pytest.mark.parametrize(
    ("when", "start", "next_on"),
    [
        ({"type": "occupied_within", "hours": 2}, "2026-11-17T07:01:30+00:00", "2026-11-17T09:02:00+00:00"),
        ({"type": "time", "start": "07:13", "end": "08:00"}, "2026-11-17T07:12:30+00:00", "unknown"),
    ],
)
async def test_rules_blueprint_minute_triggers(hass, freezer, when, start, next_on):
    freezer.move_to(start)
    await hass.config.async_set_time_zone("UTC")
    hass.states.async_set("binary_sensor.share_space_oa", "off")
    hass.states.async_set("sensor.share_space_oa_next_on", next_on, {"device_class": "timestamp"})
    hass.states.async_set("sensor.share_space_oa_previous_off", "unknown")
    await setup_zone(hass)
    base = async_mock_service(hass, "share_space_heating", "set_base_target")
    rules = {
        "version": 1,
        "rules": [{"label": "Hit", "when": [when], "then": {"type": "eco"}}],
        "fallback": {"label": "Idle", "then": {"type": "off"}},
    }
    use = {"path": "share_space/rules.yaml", "input": {"zone": SENSOR, "area": "oa", "rules": rules}}
    assert await async_setup_component(hass, "automation", {"automation": [{"alias": "rules", "use_blueprint": use}]})
    await hass.async_block_till_done()
    assert base == []
    freezer.tick(timedelta(seconds=40))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert [(c.data.get("preset"), c.data.get("reason")) for c in base] == [("eco", "Hit")]
