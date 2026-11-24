"""Zones from plain devices: heater switches + sensor become HA helpers, removed with the zone."""
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component

from custom_components.share_space_heating.const import DOMAIN

from .test_shared_strategies import _ws


async def _setup(hass):
    assert await async_setup_component(hass, "homeassistant", {})
    assert await async_setup_component(hass, DOMAIN, {})
    hass.states.async_set("switch.radiator_a", "off")
    hass.states.async_set("switch.radiator_b", "off")
    hass.states.async_set("sensor.office_temp", "18.5", {"device_class": "temperature", "unit_of_measurement": "°C"})
    return ar.async_get(hass).async_create("Bureau 1")


def _domains(hass):
    return sorted(e.domain for e in hass.config_entries.async_entries())


async def test_two_heaters_make_group_thermostat_and_zone_then_delete_cleans_up(hass, hass_ws_client):
    area = await _setup(hass)
    created = await _ws(
        hass, hass_ws_client, "create_area_zone",
        area_id=area.id, heaters=["switch.radiator_a", "switch.radiator_b"], temperature_sensor="sensor.office_temp",
    )
    assert created["success"], created
    assert _domains(hass) == ["generic_thermostat", "group", DOMAIN]
    zone_data = hass.config_entries.async_entries(DOMAIN)[0].data
    assert set(zone_data) == {"area_id", "managed_entries", "comfort_temp", "eco_temp", "default_override_hours", "max_override_hours", "presence_entity"}
    zones = (await _ws(hass, hass_ws_client, "list_zones"))["result"]
    assert len(zones) == 1
    zone = zones[0]
    assert zone["name"] == "Bureau 1" and zone["area_id"] == area.id and zone["managed"]
    assert zone["heaters"] == ["switch.radiator_a", "switch.radiator_b"]
    assert zone["heater_switch"].startswith("switch.") and zone["heater_switch"] not in zone["heaters"]
    climate = zone["climate_entity"]
    assert er.async_get(hass).async_get(climate).area_id == area.id
    assert hass.states.get(climate).state == "heat"
    assert hass.states.get(climate).attributes["current_temperature"] == 18.5

    again = await _ws(hass, hass_ws_client, "create_area_zone", area_id=area.id, climate_entity=climate)
    assert again["error"]["code"] == "already_configured"

    deleted = await _ws(hass, hass_ws_client, "delete_zone", entry_id=zone["entry_id"])
    assert deleted["success"]
    await hass.async_block_till_done()
    assert _domains(hass) == []


async def test_one_heater_needs_no_group_and_existing_thermostat_is_kept(hass, hass_ws_client):
    area = await _setup(hass)
    created = await _ws(hass, hass_ws_client, "create_area_zone", area_id=area.id, heaters=["switch.radiator_a"], temperature_sensor="sensor.office_temp")
    assert created["success"], created
    assert _domains(hass) == ["generic_thermostat", DOMAIN]
    zone = (await _ws(hass, hass_ws_client, "list_zones"))["result"][0]
    await _ws(hass, hass_ws_client, "delete_zone", entry_id=zone["entry_id"])
    await hass.async_block_till_done()

    er.async_get(hass).async_get_or_create("climate", "test", "existing", suggested_object_id="existing")
    hass.states.async_set("climate.existing", "heat", {"temperature": 19})
    created = await _ws(hass, hass_ws_client, "create_area_zone", area_id=area.id, climate_entity="climate.existing")
    assert created["success"], created
    zone = (await _ws(hass, hass_ws_client, "list_zones"))["result"][0]
    assert not zone["managed"] and zone["climate_entity"] == "climate.existing"
    assert er.async_get(hass).async_get("climate.existing").area_id == area.id
    assert "climate_entity" not in hass.config_entries.async_get_entry(zone["entry_id"]).data
    await _ws(hass, hass_ws_client, "delete_zone", entry_id=zone["entry_id"])
    await hass.async_block_till_done()
    assert _domains(hass) == []
    assert hass.states.get("climate.existing") is not None


async def test_create_area_zone_errors(hass, hass_ws_client, hass_read_only_access_token):
    area = await _setup(hass)
    missing = await _ws(hass, hass_ws_client, "create_area_zone", area_id="nope", climate_entity="climate.x")
    assert missing["error"]["code"] == "not_found"
    hass.states.async_set("climate.no_id", "heat")
    no_id = await _ws(hass, hass_ws_client, "create_area_zone", area_id=area.id, climate_entity="climate.no_id")
    assert no_id["error"]["code"] == "invalid_format"
    no_sensor = await _ws(hass, hass_ws_client, "create_area_zone", area_id=area.id, heaters=["switch.radiator_a"])
    assert no_sensor["error"]["code"] == "invalid_format"
    bad_heater = await _ws(hass, hass_ws_client, "create_area_zone", area_id=area.id, heaters=["light.x"], temperature_sensor="sensor.office_temp")
    assert bad_heater["error"]["code"] == "invalid_format"
    denied = await _ws(hass, hass_ws_client, "create_area_zone", token=hass_read_only_access_token, area_id=area.id, climate_entity="climate.x")
    assert denied["error"]["code"] == "unauthorized"
    assert _domains(hass) == []
