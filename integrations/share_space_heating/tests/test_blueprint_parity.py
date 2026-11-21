"""Run the real blueprints in a test hass against fixtures/heating/strategy_cases.json."""
import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from homeassistant.core import SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service

from custom_components.share_space_heating.const import DOMAIN

CASES = json.loads(
    (Path(__file__).parents[3] / "fixtures" / "heating" / "strategy_cases.json").read_text()
)
PARAMS = [
    pytest.param(case, check, id=f"{i}-{j}-{case['name'][:40]}")
    for i, case in enumerate(CASES)
    for j, check in enumerate(case["checks"])
]
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
SLOT = timedelta(minutes=30)
CLIMATE = "climate.office"
SENSOR = "sensor.share_space_heating_office"


def _minutes(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def _slot_on(schedule, utc: datetime, tz: ZoneInfo, day_offset: int = 0) -> bool:
    local = utc.astimezone(tz)
    slot = (local.hour * 60 + local.minute) // 30 * 30
    return any(
        _minutes(s) <= slot < _minutes(e) for s, e in schedule[WEEKDAYS[local.weekday()]]
    )


def _floor(utc: datetime) -> datetime:
    return utc.replace(minute=utc.minute // 30 * 30, second=0, microsecond=0)


def planning_states(schedule, now: datetime, tz: ZoneInfo) -> dict:
    now = now.astimezone(ZoneInfo("UTC"))
    cur = _floor(now)
    on = lambda t: _slot_on(schedule, t, tz)  # noqa: E731
    next_on = prev_off = None
    t = cur + SLOT
    while t <= now + timedelta(days=8):
        if on(t) and not on(t - SLOT):
            next_on = t
            break
        t += SLOT
    t = cur
    while t >= now - timedelta(days=8):
        if on(t - SLOT) and not on(t):
            prev_off = t
            break
        t -= SLOT
    return {"on": on(cur), "next_on": next_on, "previous_off": prev_off}


def fake_query_occupancy(hass, schedule, tz: ZoneInfo):
    async def handler(call):
        data = call.data
        day = data.get("day", "today")
        local = datetime.now(tz)
        if day == "tomorrow":
            local += timedelta(days=1)
        elif day in WEEKDAYS:
            local += timedelta(days=(WEEKDAYS.index(day) - local.weekday()) % 7)
        ranges = schedule[WEEKDAYS[local.weekday()]]
        matches = []
        for window in data["windows"]:
            start, end = _minutes(window["start"]), _minutes(window["end"])
            matches.append(
                any(
                    start <= slot < end and any(_minutes(s) <= slot < _minutes(e) for s, e in ranges)
                    for slot in range(0, 24 * 60, 30)
                )
            )
        combine = any if data.get("match", "all") == "any" else all
        return {"occupied": combine(matches), "matches": matches}

    hass.services.async_register(
        "share_space", "query_occupancy", handler, supports_response=SupportsResponse.ONLY
    )


async def setup_zone(hass, **extra):
    hass.states.async_set(CLIMATE, "heat", {"temperature": 20.0})
    calls = async_mock_service(hass, "climate", "set_temperature")
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={"name": "Office", "climate_entity": CLIMATE, "presence_entity": None, **extra},
        unique_id=CLIMATE,
        title="Office",
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, calls


@pytest.mark.parametrize(("case", "check"), PARAMS)
async def test_blueprint_matches_fixture(hass, freezer, case, check):
    tz = ZoneInfo(case["tz"])
    await hass.config.async_set_time_zone(case["tz"])
    now = datetime.fromisoformat(check["now"])
    freezer.move_to(now)

    await setup_zone(hass)
    area = case["area"]
    plan = planning_states(case["schedule"], now, tz)
    hass.states.async_set(f"binary_sensor.share_space_{area}", "on" if plan["on"] else "off")
    for key in ("next_on", "previous_off"):
        value = plan[key]
        hass.states.async_set(
            f"sensor.share_space_{area}_{key}",
            value.isoformat() if value else "unknown",
            {"device_class": "timestamp"},
        )
    fake_query_occupancy(hass, case["schedule"], tz)

    assert await async_setup_component(
        hass,
        "automation",
        {
            "automation": [
                {
                    "alias": "strategy",
                    "use_blueprint": {
                        "path": f"share_space/{case['preset']}.yaml",
                        "input": {"zone": SENSOR, "area": area, **case["inputs"]},
                    },
                }
            ]
        },
    )
    await hass.async_block_till_done()
    await hass.services.async_call(
        "automation", "trigger", {"entity_id": "automation.strategy", "skip_condition": True}, blocking=True
    )
    await hass.async_block_till_done()

    state = hass.states.get(SENSOR)
    expected = check["expected"]
    want = 7.0 if expected.get("off") else float(expected["target"])
    assert float(state.state) == want
    assert state.attributes["active_rule"] == check["reason"]
    assert state.attributes["mode"] == "automation"


async def _setup_blueprint(hass, preset, inputs):
    await setup_zone(hass)
    assert await async_setup_component(
        hass,
        "automation",
        {
            "automation": [
                {
                    "alias": "strategy",
                    "use_blueprint": {
                        "path": f"share_space/{preset}.yaml",
                        "input": {"zone": SENSOR, "area": "oa", **inputs},
                    },
                }
            ]
        },
    )
    await hass.async_block_till_done()
    base = async_mock_service(hass, "share_space_heating", "set_base_target")
    await hass.services.async_call(
        "automation", "trigger", {"entity_id": "automation.strategy", "skip_condition": True}, blocking=True
    )
    await hass.async_block_till_done()
    return base


def _planning(hass, main="on", next_on="unknown", previous_off="unknown", skip=()):
    for entity, value in (
        ("binary_sensor.share_space_oa", main),
        ("sensor.share_space_oa_next_on", next_on),
        ("sensor.share_space_oa_previous_off", previous_off),
    ):
        if entity not in skip:
            hass.states.async_set(entity, value)


@pytest.mark.parametrize(
    ("kwargs"),
    [
        {"main": "unavailable"},
        {"main": "unknown"},
        {"next_on": "unavailable"},
        {"previous_off": "unavailable"},
        {"skip": ("sensor.share_space_oa_next_on",)},
        {"skip": ("sensor.share_space_oa_previous_off",)},
    ],
)
async def test_office_saver_waits_for_planning(hass, kwargs):
    _planning(hass, **kwargs)
    assert await _setup_blueprint(hass, "office_saver", {}) == []


async def test_office_saver_unknown_next_on_means_none(hass):
    _planning(hass, main="off")
    base = await _setup_blueprint(hass, "office_saver", {})
    assert [c.data.get("reason") for c in base] == ["Away"]


async def test_lunch_room_no_response_is_noop(hass, freezer):
    freezer.move_to("2026-03-03T12:30:00+00:00")
    await hass.config.async_set_time_zone("UTC")

    async def boom(call):
        raise HomeAssistantError("down")

    hass.services.async_register("share_space", "query_occupancy", boom, supports_response=SupportsResponse.ONLY)
    base = await _setup_blueprint(hass, "lunch_room", {})
    assert base == []


def test_blueprints_queued_and_versioned():
    for name in ("office_saver", "lunch_room"):
        path = Path(__file__).parents[1] / "custom_components/share_space_heating/blueprints/automation/share_space" / f"{name}.yaml"
        text = path.read_text()
        assert text.startswith("# share_space_blueprint_version: 1\n")
        assert "mode: queued\nmax: 5\nmax_exceeded: silent" in text
