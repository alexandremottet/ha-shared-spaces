"""Tests for share_space_heating zones."""
import asyncio
from datetime import timedelta

import pytest
from homeassistant.core import Context
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import (
    async_fire_time_changed,
    async_mock_service,
)

from custom_components.share_space_heating.const import DOMAIN

from .helpers import zone_entry

CLIMATE = "climate.living"
PRESENCE = "binary_sensor.presence"
SENSOR = "sensor.share_space_heating_living"


def _climate(hass, temp, context=None):
    hass.states.async_set(
        CLIMATE, "heat", {"temperature": temp, "current_temperature": 19.5}, context=context
    )


async def _setup(hass, presence=PRESENCE, **extra):
    data = {
        "presence_entity": presence,
        "comfort_temp": 21.0,
        "eco_temp": 17.0,
        "default_override_hours": 3.0,
        "max_override_hours": 12.0,
        **extra,
    }
    entry = zone_entry(hass, "Living", CLIMATE, **data)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


@pytest.fixture
def calls(hass):
    _climate(hass, 20.0)
    hass.states.async_set(PRESENCE, "on")
    return async_mock_service(hass, "climate", "set_temperature")


def _temps(calls):
    return [c.data["temperature"] for c in calls]


async def test_presence_drives_target(hass, calls):
    await _setup(hass)
    assert _temps(calls) == [21.0]
    assert hass.states.get(SENSOR).state == "21.0"
    assert hass.states.get(SENSOR).attributes["mode"] == "schedule"
    assert hass.states.get(SENSOR).attributes["presence"] is True
    assert hass.states.get(SENSOR).attributes["current_temperature"] == 19.5
    assert hass.states.get(SENSOR).attributes["comfort_temp"] == 21.0
    assert hass.states.get(SENSOR).attributes["eco_temp"] == 17.0
    assert "frost_temp" in hass.states.get(SENSOR).attributes

    hass.states.async_set(PRESENCE, "off")
    await hass.async_block_till_done()
    assert _temps(calls) == [21.0, 17.0]
    assert hass.states.get(SENSOR).state == "17.0"


async def test_set_override_expires(hass, calls, freezer):
    await _setup(hass)
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 23, "hours": 2}, blocking=True
    )
    state = hass.states.get(SENSOR)
    assert _temps(calls)[-1] == 23.0
    assert state.attributes["mode"] == "override"
    assert state.attributes["override_temp"] == 23.0
    assert dt_util.parse_datetime(state.attributes["override_until"]) == dt_util.utcnow() + timedelta(hours=2)

    freezer.tick(timedelta(hours=2, minutes=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    state = hass.states.get(SENSOR)
    assert state.attributes["mode"] == "schedule"
    assert state.attributes["override_until"] is None
    assert state.state == "21.0"
    assert _temps(calls)[-1] == 21.0


async def test_override_hours_clamped(hass, calls, freezer):
    await _setup(hass)
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 22, "hours": 48}, blocking=True
    )
    until = dt_util.parse_datetime(hass.states.get(SENSOR).attributes["override_until"])
    assert until == dt_util.utcnow() + timedelta(hours=12)


async def test_default_hours(hass, calls, freezer):
    await _setup(hass)
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 22}, blocking=True
    )
    until = dt_util.parse_datetime(hass.states.get(SENSOR).attributes["override_until"])
    assert until == dt_util.utcnow() + timedelta(hours=3)


async def test_extend_override(hass, calls, freezer):
    await _setup(hass)
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 22, "hours": 1}, blocking=True
    )
    await hass.services.async_call(
        DOMAIN, "extend_override", {"entity_id": SENSOR, "hours": 2}, blocking=True
    )
    until = dt_util.parse_datetime(hass.states.get(SENSOR).attributes["override_until"])
    assert until == dt_util.utcnow() + timedelta(hours=3)


async def test_extend_without_override_starts_one(hass, calls):
    await _setup(hass)
    await hass.services.async_call(
        DOMAIN, "extend_override", {"entity_id": SENSOR, "hours": 1}, blocking=True
    )
    state = hass.states.get(SENSOR)
    assert state.attributes["mode"] == "override"
    assert state.attributes["override_temp"] == 21.0


async def test_clear_override(hass, calls):
    await _setup(hass)
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 25, "hours": 2}, blocking=True
    )
    await hass.services.async_call(DOMAIN, "clear_override", {"entity_id": SENSOR}, blocking=True)
    state = hass.states.get(SENSOR)
    assert state.attributes["mode"] == "schedule"
    assert state.state == "21.0"
    assert _temps(calls)[-1] == 21.0


async def test_external_change_creates_override(hass, calls, freezer):
    await _setup(hass)
    count = len(calls)
    _climate(hass, 24.0, context=Context())
    await hass.async_block_till_done()
    state = hass.states.get(SENSOR)
    assert state.attributes["mode"] == "override"
    assert state.attributes["override_temp"] == 24.0
    assert dt_util.parse_datetime(state.attributes["override_until"]) == dt_util.utcnow() + timedelta(hours=3)
    assert len(calls) == count


async def test_manual_only_without_presence(hass):
    _climate(hass, 20.0)
    calls = async_mock_service(hass, "climate", "set_temperature")
    await _setup(hass, presence=None)
    assert calls == []
    assert hass.states.get(SENSOR).attributes["mode"] == "manual_only"
    assert hass.states.get(SENSOR).attributes["presence"] is None

    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 23, "hours": 1}, blocking=True
    )
    assert hass.states.get(SENSOR).attributes["mode"] == "override"
    assert _temps(calls) == [23.0]


async def test_override_survives_reload(hass, calls):
    entry = await _setup(hass)
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 23, "hours": 2}, blocking=True
    )
    until = hass.states.get(SENSOR).attributes["override_until"]
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    state = hass.states.get(SENSOR)
    assert state.attributes["mode"] == "override"
    assert state.attributes["override_until"] == until
    assert state.state == "23.0"


async def test_expired_override_dropped_on_load(hass, hass_storage, calls):
    past = (dt_util.utcnow() - timedelta(hours=1)).isoformat()
    entry = zone_entry(hass, "Living", CLIMATE, presence_entity=PRESENCE)
    hass_storage["share_space_heating.overrides"] = {
        "version": 1,
        "data": {entry.entry_id: {"temp": 25.0, "until": past}},
    }
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).attributes["mode"] == "schedule"


async def test_two_zones_concurrent_setup_and_unload(hass):
    _climate(hass, 20.0)
    hass.states.async_set("climate.bed", "heat", {"temperature": 18})
    hass.states.async_set(PRESENCE, "on")
    async_mock_service(hass, "climate", "set_temperature")
    entries = []
    for name, ent in (("Living", CLIMATE), ("Bed", "climate.bed")):
        entries.append(zone_entry(hass, name, ent, presence_entity=PRESENCE))
    await asyncio.gather(*(hass.config_entries.async_setup(e.entry_id) for e in entries))
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR) is not None
    assert hass.states.get("sensor.share_space_heating_bed") is not None
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": "sensor.share_space_heating_bed", "temperature": 22}, blocking=True
    )
    for e in entries:
        assert await hass.config_entries.async_unload(e.entry_id)


async def test_presence_unavailable_keeps_last_known(hass, calls):
    await _setup(hass)
    hass.states.async_set(PRESENCE, "off")
    await hass.async_block_till_done()
    hass.states.async_set(PRESENCE, "unavailable")
    await hass.async_block_till_done()
    state = hass.states.get(SENSOR)
    assert state.state == "17.0"
    assert state.attributes["presence"] is False
    assert _temps(calls) == [21.0, 17.0]


async def test_presence_never_known_does_not_apply(hass):
    _climate(hass, 20.0)
    hass.states.async_set(PRESENCE, "unknown")
    calls = async_mock_service(hass, "climate", "set_temperature")
    await _setup(hass)
    assert calls == []
    assert hass.states.get(SENSOR).attributes["presence"] is None


def _saved(hass_storage, entry, data):
    hass_storage["share_space_heating.overrides"] = {"version": 1, "data": {entry.entry_id: data}}


async def _setup_with_saved(hass, hass_storage, data, **extra):
    entry = zone_entry(hass, "Living", CLIMATE, presence_entity=PRESENCE, **extra)
    _saved(hass_storage, entry, data)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_restored_override_clamped(hass, hass_storage, calls, freezer):
    until = (dt_util.utcnow() + timedelta(hours=100)).isoformat()
    await _setup_with_saved(hass, hass_storage, {"temp": 25.0, "until": until})
    got = dt_util.parse_datetime(hass.states.get(SENSOR).attributes["override_until"])
    assert got == dt_util.utcnow() + timedelta(hours=12)
    assert _temps(calls) == [25.0]


async def test_extend_never_shrinks(hass, calls, freezer):
    entry = await _setup(hass)
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 22, "hours": 1}, blocking=True
    )
    zone = hass.data[DOMAIN]["zones"][entry.entry_id]
    long = dt_util.utcnow() + timedelta(hours=20)
    zone.override_until = long
    await hass.services.async_call(
        DOMAIN, "extend_override", {"entity_id": SENSOR, "hours": 1}, blocking=True
    )
    assert zone.override_until == long


async def test_startup_external_change_becomes_override(hass, hass_storage, calls):
    _climate(hass, 24.0)
    await _setup_with_saved(hass, hass_storage, {"last_applied": 21.0})
    state = hass.states.get(SENSOR)
    assert state.attributes["mode"] == "override"
    assert state.attributes["override_temp"] == 24.0
    assert calls == []


async def test_startup_matching_device_applies_schedule(hass, hass_storage, calls):
    _climate(hass, 17.0)
    await _setup_with_saved(hass, hass_storage, {"last_applied": 17.0})
    assert hass.states.get(SENSOR).attributes["mode"] == "schedule"
    assert _temps(calls) == [21.0]


async def test_startup_unavailable_device_no_override(hass, hass_storage, calls):
    hass.states.async_set(CLIMATE, "unavailable")
    await _setup_with_saved(hass, hass_storage, {"last_applied": 17.0})
    assert hass.states.get(SENSOR).attributes["mode"] == "schedule"


async def test_unavailable_transition_ignored(hass, calls):
    await _setup(hass)
    hass.states.async_set(CLIMATE, "unavailable")
    await hass.async_block_till_done()
    hass.states.async_set(CLIMATE, "heat", {"temperature": 25.0}, context=Context())
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).attributes["mode"] == "schedule"


async def test_device_rounding_echo_ignored(hass, calls):
    await _setup(hass)
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 21.3}, blocking=True
    )
    hass.states.async_set(
        CLIMATE, "heat", {"temperature": 21.5, "target_temp_step": 0.5}, context=Context()
    )
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).attributes["override_temp"] == 21.3


async def test_single_step_manual_change_is_override(hass, calls):
    await _setup(hass)
    hass.states.async_set(
        CLIMATE, "heat", {"temperature": 21.0, "target_temp_step": 0.5}
    )
    await hass.async_block_till_done()
    hass.states.async_set(
        CLIMATE, "heat", {"temperature": 21.5, "target_temp_step": 0.5}, context=Context()
    )
    await hass.async_block_till_done()
    state = hass.states.get(SENSOR)
    assert state.attributes["mode"] == "override"
    assert state.attributes["override_temp"] == 21.5


async def test_late_echo_of_previous_apply_ignored(hass, calls):
    await _setup(hass)
    hass.states.async_set(PRESENCE, "off")
    await hass.async_block_till_done()
    hass.states.async_set(CLIMATE, "heat", {"temperature": 17.0}, context=Context())
    await hass.async_block_till_done()
    hass.states.async_set(CLIMATE, "heat", {"temperature": 21.0}, context=Context())
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).attributes["mode"] == "schedule"


async def test_stale_apply_echo_after_window_is_override(hass, calls, freezer):
    await _setup(hass)
    hass.states.async_set(CLIMATE, "heat", {"temperature": 20.0})
    await hass.async_block_till_done()
    freezer.tick(timedelta(seconds=120))
    hass.states.async_set(CLIMATE, "heat", {"temperature": 21.0}, context=Context())
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).attributes["mode"] == "override"


async def test_startup_single_step_change_is_override(hass, hass_storage, calls):
    hass.states.async_set(CLIMATE, "heat", {"temperature": 21.5, "target_temp_step": 0.5})
    await _setup_with_saved(hass, hass_storage, {"last_applied": 21.0})
    assert hass.states.get(SENSOR).attributes["override_temp"] == 21.5


async def test_manual_only_expiry_without_previous_clears_cleanly(hass, hass_storage, freezer):
    hass.states.async_set(CLIMATE, "heat", {"current_temperature": 19.0})
    calls = async_mock_service(hass, "climate", "set_temperature")
    await _setup(hass, presence=None)
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 23, "hours": 1}, blocking=True
    )
    freezer.tick(timedelta(hours=1, minutes=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert _temps(calls) == [23.0]
    assert hass.states.get(SENSOR).attributes["mode"] == "manual_only"
    data = next(iter(hass_storage["share_space_heating.overrides"]["data"].values()))
    assert data == {"last_applied": None}


async def test_device_clamp_echo_ignored(hass, calls):
    await _setup(hass)
    limits = {"min_temp": 5, "max_temp": 28.0, "target_temp_step": 0.1}
    hass.states.async_set(CLIMATE, "heat", {"temperature": 20.0, **limits})
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 35}, blocking=True
    )
    hass.states.async_set(CLIMATE, "heat", {"temperature": 28.0, **limits}, context=Context())
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).attributes["override_temp"] == 35.0


async def test_set_override_failure_not_persisted(hass, calls, hass_storage):
    await _setup(hass)

    async def boom(call):
        raise RuntimeError("fail")

    hass.services.async_remove("climate", "set_temperature")
    hass.services.async_register("climate", "set_temperature", boom)
    with pytest.raises(Exception):
        await hass.services.async_call(
            DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 23}, blocking=True
        )
    assert hass.states.get(SENSOR).attributes["mode"] == "schedule"
    data = hass_storage["share_space_heating.overrides"]["data"]
    assert all("temp" not in v for v in data.values())


async def test_manual_only_expiry_restores_previous(hass, freezer):
    _climate(hass, 19.0)
    calls = async_mock_service(hass, "climate", "set_temperature")
    await _setup(hass, presence=None)
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 23, "hours": 1}, blocking=True
    )
    assert _temps(calls) == [23.0]
    freezer.tick(timedelta(hours=1, minutes=1))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert _temps(calls) == [23.0, 19.0]
    assert hass.states.get(SENSOR).attributes["mode"] == "manual_only"
