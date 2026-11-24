"""Shared strategies: store, starters, WebSocket commands, run_rules `strategy`, blueprint v3."""
import json
from pathlib import Path

import pytest
from homeassistant.exceptions import ServiceValidationError
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service

from custom_components.share_space_heating.const import DATA_STRATEGIES, DOMAIN
from custom_components.share_space_heating.store import StrategyStore

from .helpers import SENSOR, _spy_base, setup_zone
from .test_rules_blueprint import BLUEPRINT

ECO = {"version": 1, "rules": [], "fallback": {"label": "Eco all day", "then": {"type": "eco"}}}
OFF = {"version": 1, "rules": [], "fallback": {"label": "Away", "then": {"type": "off"}}}
OLD = {"version": 1, "rules": [], "fallback": {"label": "Old", "then": {"type": "off"}}}


async def _ws(hass, hass_ws_client, type_, token=None, **payload):
    client = await (hass_ws_client(hass, token) if token else hass_ws_client(hass))
    await client.send_json({"id": 1, "type": f"{DOMAIN}/{type_}", **payload})
    response = await client.receive_json()
    await hass.async_block_till_done()
    return response


def _planning(hass, area="oa", on="on"):
    hass.states.async_set(f"binary_sensor.share_space_{area}", on)
    hass.states.async_set(f"sensor.share_space_{area}_next_on", "unknown")
    hass.states.async_set(f"sensor.share_space_{area}_previous_off", "unknown")


async def _store(hass) -> StrategyStore:
    assert await async_setup_component(hass, DOMAIN, {})
    store = hass.data[DOMAIN][DATA_STRATEGIES]
    for item in store.all():
        await store.async_delete(item["id"])
    return store


async def test_store_round_trip_and_persistence(hass, hass_storage):
    store = await _store(hass)
    assert store.all() == []
    zed = await store.async_save(None, "Zed", ECO, None)
    alpha = await store.async_save(None, "alpha", OFF, OLD)
    assert zed != alpha and len(zed) == 32
    assert [s["name"] for s in store.all()] == ["alpha", "Zed"]
    assert store.get(alpha) == {"id": alpha, "name": "alpha", "rules": OFF, "previous": OLD}
    assert await store.async_save(zed, "Zed 2", OFF, ECO) == zed
    assert store.get(zed)["name"] == "Zed 2"

    reloaded = StrategyStore(hass)
    await reloaded.async_load()
    assert reloaded.all() == store.all()
    assert await reloaded.async_delete(zed) is True
    assert await reloaded.async_delete(zed) is False
    assert reloaded.get(zed) is None


async def test_ws_save_list_update_delete(hass, hass_ws_client):
    await _store(hass)
    created = await _ws(hass, hass_ws_client, "save_strategy", name="  Old building ", rules=ECO)
    assert created["success"]
    sid = created["result"]["id"]
    listed = await _ws(hass, hass_ws_client, "list_strategies")
    assert listed["result"] == [{"id": sid, "name": "Old building", "rules": ECO, "previous": None}]

    updated = await _ws(hass, hass_ws_client, "save_strategy", strategy_id=sid, name="OLD BUILDING", rules=OFF, previous=ECO)
    assert updated["result"] == {"id": sid}
    listed = await _ws(hass, hass_ws_client, "list_strategies")
    assert listed["result"] == [{"id": sid, "name": "OLD BUILDING", "rules": OFF, "previous": ECO}]

    deleted = await _ws(hass, hass_ws_client, "delete_strategy", strategy_id=sid)
    assert deleted["success"] and deleted["result"] == {}
    assert (await _ws(hass, hass_ws_client, "list_strategies"))["result"] == []


async def test_ws_save_errors(hass, hass_ws_client):
    await _store(hass)
    first = (await _ws(hass, hass_ws_client, "save_strategy", name="Alpha", rules=ECO))["result"]["id"]
    other = (await _ws(hass, hass_ws_client, "save_strategy", name="Beta", rules=ECO))["result"]["id"]

    dup = await _ws(hass, hass_ws_client, "save_strategy", name="alpha", rules=ECO)
    assert dup["error"]["code"] == "name_taken"
    dup = await _ws(hass, hass_ws_client, "save_strategy", strategy_id=other, name="ALPHA", rules=ECO)
    assert dup["error"]["code"] == "name_taken"
    same = await _ws(hass, hass_ws_client, "save_strategy", strategy_id=first, name="ALPHA", rules=OFF)
    assert same["success"]

    missing = await _ws(hass, hass_ws_client, "save_strategy", strategy_id="nope", name="X", rules=ECO)
    assert missing["error"]["code"] == "not_found"
    assert (await _ws(hass, hass_ws_client, "delete_strategy", strategy_id="nope"))["error"]["code"] == "not_found"

    for rules in ({}, {**ECO, "version": 2}, {**ECO, "rules": {}}, {**ECO, "fallback": []}):
        bad = await _ws(hass, hass_ws_client, "save_strategy", name="Bad", rules=rules)
        assert bad["error"]["code"] == "invalid_format"
    bad = await _ws(hass, hass_ws_client, "save_strategy", name="Bad", rules=ECO, previous={"version": 1})
    assert bad["error"]["code"] == "invalid_format"
    bad = await _ws(hass, hass_ws_client, "save_strategy", name="   ", rules=ECO)
    assert bad["error"]["code"] == "invalid_format"
    assert len((await _ws(hass, hass_ws_client, "list_strategies"))["result"]) == 2


async def test_ws_non_admin(hass, hass_ws_client, hass_read_only_access_token):
    store = await _store(hass)
    sid = await store.async_save(None, "Alpha", ECO, None)
    token = hass_read_only_access_token
    assert (await _ws(hass, hass_ws_client, "list_strategies", token=token))["success"]
    for type_, payload in (
        ("save_strategy", {"name": "N", "rules": ECO}),
        ("delete_strategy", {"strategy_id": sid}),
    ):
        response = await _ws(hass, hass_ws_client, type_, token=token, **payload)
        assert response["error"]["code"] == "unauthorized"
    assert [s["name"] for s in store.all()] == ["Alpha"]


async def test_run_rules_strategy_resolves(hass, freezer):
    freezer.move_to("2026-11-17T10:00:00+00:00")
    _planning(hass)
    entry, _ = await setup_zone(hass)
    sid = await hass.data[DOMAIN][DATA_STRATEGIES].async_save(None, "Eco", ECO, None)
    base = _spy_base(hass, entry)
    await hass.services.async_call(
        DOMAIN, "run_rules", {"entity_id": SENSOR, "area": "oa", "strategy": sid}, blocking=True
    )
    assert [(c["preset"], c["reason"]) for c in base] == [("eco", "Eco all day")]


async def test_run_rules_strategy_missing_leaves_zone_untouched(hass):
    _planning(hass)
    entry, _ = await setup_zone(hass)
    base = _spy_base(hass, entry)
    with pytest.raises(ServiceValidationError, match="Shared strategy ghost not found"):
        await hass.services.async_call(
            DOMAIN, "run_rules", {"entity_id": SENSOR, "area": "oa", "strategy": "ghost"}, blocking=True
        )
    assert base == []


async def test_run_rules_source_exclusivity(hass):
    _planning(hass)
    await setup_zone(hass)
    call = lambda data: hass.services.async_call(  # noqa: E731
        DOMAIN, "run_rules", {"entity_id": SENSOR, "area": "oa", **data}, blocking=True
    )
    for data in ({}, {"rules": {}, "strategy": ""}, {"rules": ECO, "strategy": "x"}, {"preset": "eco", "strategy": "x"}):
        with pytest.raises(Exception):  # noqa: B017
            await call(data)


async def test_run_rules_empty_rules_with_strategy_like_blueprint(hass, freezer):
    freezer.move_to("2026-11-17T10:00:00+00:00")
    _planning(hass)
    entry, _ = await setup_zone(hass)
    sid = await hass.data[DOMAIN][DATA_STRATEGIES].async_save(None, "Eco", ECO, None)
    base = _spy_base(hass, entry)
    await hass.services.async_call(
        DOMAIN, "run_rules", {"entity_id": SENSOR, "area": "oa", "rules": {}, "strategy": sid}, blocking=True
    )
    assert [c["reason"] for c in base] == ["Eco all day"]
    # inline rules with an empty strategy (the blueprint's default) still work
    await hass.services.async_call(
        DOMAIN, "run_rules", {"entity_id": SENSOR, "area": "oa", "rules": OFF, "strategy": ""}, blocking=True
    )
    assert [c["reason"] for c in base] == ["Eco all day", "Away"]


async def test_two_zones_share_one_strategy_with_own_planning(hass, freezer):
    freezer.move_to("2026-11-17T10:00:00+00:00")
    await hass.config.async_set_time_zone("UTC")
    _planning(hass, "a", "on")
    _planning(hass, "b", "off")
    entry_a, _ = await setup_zone(hass)
    hass.states.async_set("climate.other", "heat", {"temperature": 20.0})
    entry_b = MockConfigEntry(
        domain=DOMAIN,
        data={"name": "Other", "climate_entity": "climate.other", "presence_entity": None},
        unique_id="climate.other",
        title="Other",
    )
    entry_b.add_to_hass(hass)
    async_mock_service(hass, "climate", "set_temperature")
    assert await hass.config_entries.async_setup(entry_b.entry_id)
    await hass.async_block_till_done()
    sensor_b = "sensor.share_space_heating_other"
    shared = {
        "version": 1,
        "rules": [{"label": "Occupied", "when": [{"type": "occupied"}], "then": {"type": "comfort"}}],
        "fallback": {"label": "Empty", "then": {"type": "eco"}},
    }
    sid = await hass.data[DOMAIN][DATA_STRATEGIES].async_save(None, "Shared", shared, None)
    base_a, base_b = _spy_base(hass, entry_a), _spy_base(hass, entry_b)
    for sensor, area in ((SENSOR, "a"), (sensor_b, "b")):
        await hass.services.async_call(
            DOMAIN, "run_rules", {"entity_id": sensor, "area": area, "strategy": sid}, blocking=True
        )
    assert [c["reason"] for c in base_a] == ["Occupied"]
    assert [c["reason"] for c in base_b] == ["Empty"]


def test_rules_blueprint_v4_inputs():
    text = BLUEPRINT.read_text()
    assert text.startswith("# share_space_blueprint_version: 4\n")
    assert "      rules: !input rules\n      strategy: !input strategy\n" in text


async def test_blueprint_automation_with_only_strategy(hass, freezer):
    freezer.move_to("2026-11-17T10:00:00+00:00")
    _planning(hass)
    entry, _ = await setup_zone(hass)
    sid = await hass.data[DOMAIN][DATA_STRATEGIES].async_save(None, "Eco", ECO, None)
    base = _spy_base(hass, entry)
    use = {"path": "share_space/rules.yaml", "input": {"zone": SENSOR, "area": "oa", "strategy": sid}}
    assert await async_setup_component(hass, "automation", {"automation": [{"alias": "rules", "use_blueprint": use}]})
    await hass.async_block_till_done()
    await hass.services.async_call(
        "automation", "trigger", {"entity_id": "automation.rules", "skip_condition": True}, blocking=True
    )
    await hass.async_block_till_done()
    assert [(c["preset"], c["reason"]) for c in base] == [("eco", "Eco all day")]


STARTERS = json.loads((Path(__file__).parents[1] / "custom_components/share_space_heating/starters.json").read_text())


async def test_starters_seeded_on_first_load(hass, hass_storage):
    assert await async_setup_component(hass, DOMAIN, {})
    store = hass.data[DOMAIN][DATA_STRATEGIES]
    assert [s["name"] for s in store.all()] == ["Lunch room", "Office saver", "Old building", "Well insulated"]
    assert store.get("office_saver") == {"id": "office_saver", "name": "Office saver", "rules": STARTERS[0]["rules"], "previous": None}
    ids = {s["id"] for s in STARTERS}
    assert set(hass_storage["share_space_heating.strategies"]["data"]) == ids
    assert set(hass_storage["share_space_heating.starters_offered"]["data"]) == ids


async def test_starters_not_reseeded_when_store_exists(hass, hass_storage):
    store = await _store(hass)
    assert store.all() == []
    reloaded = StrategyStore(hass)
    await reloaded.async_load()
    assert reloaded.all() == []


async def test_deleted_starter_stays_deleted(hass, hass_storage):
    assert await async_setup_component(hass, DOMAIN, {})
    store = hass.data[DOMAIN][DATA_STRATEGIES]
    assert await store.async_delete("lunch_room") is True
    reloaded = StrategyStore(hass)
    await reloaded.async_load()
    assert [s["id"] for s in reloaded.all()] == ["office_saver", "old_building", "well_insulated"]


async def test_legacy_store_gets_only_new_starters(hass, hass_storage):
    # store from before offered ids were tracked: its user deleted both original starters
    hass_storage["share_space_heating.strategies"] = {"version": 1, "key": "share_space_heating.strategies", "data": {}}
    store = StrategyStore(hass)
    await store.async_load()
    assert [s["id"] for s in store.all()] == ["old_building", "well_insulated"]
    assert await store.async_delete("old_building") is True
    reloaded = StrategyStore(hass)
    await reloaded.async_load()
    assert [s["id"] for s in reloaded.all()] == ["well_insulated"]


def test_fixture_starter_cases_use_starter_rules():
    cases = json.loads((Path(__file__).parents[3] / "fixtures" / "heating" / "rules_cases.json").read_text())
    by_prefix = {"starter Office saver": STARTERS[0]["rules"], "starter Lunch room": STARTERS[1]["rules"]}
    starter_cases = [c for c in cases if c["name"].startswith("starter ")]
    assert len(starter_cases) == 6
    for case in starter_cases:
        assert case["strategy"] == next(r for p, r in by_prefix.items() if case["name"].startswith(p))
