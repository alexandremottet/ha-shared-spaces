"""Area actions store migration, services, runner and websocket."""
import pytest
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed, async_mock_service
from datetime import timedelta

from custom_components.share_space.const import DOMAIN

CAL = {d: [{"start": "10:00", "end": "11:00"}] for d in
       ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]}


async def _setup(hass):
    await hass.config.async_set_time_zone("UTC")
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


LEGACY = {"on_actions": [{"action": "test.on_called"}], "off_actions": [{"action": "test.off_called"}]}


def _legacy(hass_storage, enabled=True):
    hass_storage["share_space.area_actions"] = {
        "version": 2,
        "minor_version": 1,
        "key": "share_space.area_actions",
        "data": {"office": LEGACY | {"enabled": enabled}},
    }


async def _configure(hass):
    await hass.services.async_call(DOMAIN, "set_calendar", {"person": "person.a", "calendar": CAL}, blocking=True)
    await hass.services.async_call(DOMAIN, "assign_person_area", {"person": "person.a", "area": "office"}, blocking=True)
    await hass.async_block_till_done()


async def _tick(hass, freezer, minutes):
    freezer.tick(timedelta(minutes=minutes))
    async_fire_time_changed(hass)
    await hass.async_block_till_done(wait_background_tasks=True)


async def test_kept_actions_run_once_per_transition(hass, freezer, hass_storage):
    _legacy(hass_storage)
    freezer.move_to("2026-01-05 09:00:00+00:00")
    on = async_mock_service(hass, "test", "on_called")
    off = async_mock_service(hass, "test", "off_called")
    await _setup(hass)
    await _configure(hass)
    assert not on and not off
    await _tick(hass, freezer, 60)
    await _tick(hass, freezer, 1)
    assert len(on) == 1 and not off
    assert on[0].context is not None
    await _tick(hass, freezer, 60)
    await _tick(hass, freezer, 60)
    assert len(on) == 1 and len(off) == 1


async def test_no_run_at_startup_when_already_on(hass, freezer, hass_storage):
    _legacy(hass_storage)
    freezer.move_to("2026-01-05 10:15:00+00:00")
    on = async_mock_service(hass, "test", "on_called")
    await _setup(hass)
    await _configure(hass)
    await _tick(hass, freezer, 1)
    assert not on


async def test_disabled_not_run(hass, freezer, hass_storage):
    _legacy(hass_storage, enabled=False)
    freezer.move_to("2026-01-05 09:00:00+00:00")
    on = async_mock_service(hass, "test", "on_called")
    await _setup(hass)
    await _configure(hass)
    await _tick(hass, freezer, 70)
    assert hass.states.get("binary_sensor.share_space_office").state == "on"
    assert not on


async def test_get_and_forget_kept_actions(hass, hass_storage, hass_ws_client):
    _legacy(hass_storage)
    await _setup(hass)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "share_space/get_area_actions", "area": "office"})
    assert (await client.receive_json())["result"] == LEGACY | {"enabled": True}
    await client.send_json({"id": 2, "type": "share_space/forget_area_actions", "area": "office"})
    assert (await client.receive_json())["success"]
    await client.send_json({"id": 3, "type": "share_space/get_area_actions", "area": "office"})
    assert (await client.receive_json())["result"] is None


async def test_forgotten_actions_no_longer_run(hass, freezer, hass_storage):
    from custom_components.share_space.const import DATA_AREA_ACTIONS_STORE

    _legacy(hass_storage)
    freezer.move_to("2026-01-05 09:00:00+00:00")
    on = async_mock_service(hass, "test", "on_called")
    await _setup(hass)
    await _configure(hass)
    await next(iter(hass.data[DOMAIN].values()))[DATA_AREA_ACTIONS_STORE].async_forget("office")
    await _tick(hass, freezer, 70)
    assert hass.states.get("binary_sensor.share_space_office").state == "on"
    assert not on


async def test_forget_area_actions_requires_admin(hass, hass_ws_client, hass_read_only_access_token):
    await _setup(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json({"id": 1, "type": "share_space/forget_area_actions", "area": "office"})
    response = await client.receive_json()
    assert not response["success"] and response["error"]["code"] == "unauthorized"


async def test_ws_defaults_and_list_areas(hass, hass_ws_client):
    entry = await _setup(hass)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "share_space/get_area_actions", "area": "nowhere"})
    assert (await client.receive_json())["result"] is None
    await _configure(hass)
    await client.send_json({"id": 2, "type": "share_space/list_areas"})
    result = (await client.receive_json())["result"]
    assert result == [
        {"area_id": "office", "name": "office", "persons": ["person.a"], "entity_id": "binary_sensor.share_space_office"}
    ]
    assert er.async_get(hass).async_get_entity_id("binary_sensor", DOMAIN, f"{entry.entry_id}_office")


async def test_migration_v1_to_v2(hass, hass_storage):
    hass_storage["share_space.area_actions"] = {
        "version": 1,
        "minor_version": 1,
        "key": "share_space.area_actions",
        "data": {"office": {"on_action": {"action": "light.turn_on"}, "off_action": None}},
    }
    await _setup(hass)
    from custom_components.share_space.const import DATA_AREA_ACTIONS_STORE

    store = next(iter(hass.data[DOMAIN].values()))[DATA_AREA_ACTIONS_STORE]
    assert store.get_actions("office") == {
        "on_actions": [{"action": "light.turn_on"}],
        "off_actions": [],
        "enabled": True,
    }


async def test_migration_v1_skips_non_dict_items(hass, hass_storage):
    hass_storage["share_space.area_actions"] = {
        "version": 1,
        "minor_version": 1,
        "key": "share_space.area_actions",
        "data": {"bad": None, "worse": "x", "office": {"on_action": {"action": "light.turn_on"}}},
    }
    await _setup(hass)
    from custom_components.share_space.const import DATA_AREA_ACTIONS_STORE

    store = next(iter(hass.data[DOMAIN].values()))[DATA_AREA_ACTIONS_STORE]
    assert store.get_actions("office")["on_actions"] == [{"action": "light.turn_on"}]
    assert store.get_actions("bad") == {"on_actions": [], "off_actions": [], "enabled": True}


async def test_set_calendar_rejects_cross_midnight_and_empty(hass):
    import pytest
    import voluptuous as vol

    await _setup(hass)
    for rng in ({"start": "22:00", "end": "02:00"}, {"start": "10:00", "end": "10:00"}):
        with pytest.raises(vol.Invalid):
            await hass.services.async_call(
                DOMAIN, "set_calendar", {"person": "person.a", "calendar": {"monday": [rng]}}, blocking=True
            )
    await hass.services.async_call(
        DOMAIN, "set_calendar", {"person": "person.a", "calendar": {"monday": [{"start": "22:00", "end": "24:00"}]}}, blocking=True
    )


async def test_services_removed_only_after_unload(hass):
    entry = await _setup(hass)
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert not hass.services.has_service(DOMAIN, "set_calendar")
    assert entry.entry_id not in hass.data[DOMAIN]
