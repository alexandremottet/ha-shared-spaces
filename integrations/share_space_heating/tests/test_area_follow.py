"""Zones follow the HA area: devices moved, added or renamed in the HA UI are picked up."""
from homeassistant.config_entries import ConfigEntryState
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service

from custom_components.share_space_heating.const import DOMAIN

from .helpers import place_climate, zone_entry

SENSOR = "sensor.share_space_heating_office"


async def _zone(hass):
    hass.states.async_set("climate.office", "heat", {"temperature": 20.0})
    calls = async_mock_service(hass, "climate", "set_temperature")
    entry = zone_entry(hass, "Office", "climate.office")
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, calls


def _climate_of(hass) -> str | None:
    state = hass.states.get(SENSOR)
    return state.attributes["climate_entity"] if state else None


async def test_thermostat_moved_out_then_back(hass):
    entry, _ = await _zone(hass)
    reg = er.async_get(hass)
    reg.async_update_entity("climate.office", area_id=ar.async_get(hass).async_create("Garage").id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.SETUP_RETRY

    reg.async_update_entity("climate.office", area_id="office")
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    assert _climate_of(hass) == "climate.office"


async def test_thermostat_replaced_in_the_area(hass):
    entry, _ = await _zone(hass)
    hass.states.async_set("climate.new", "heat", {"temperature": 18.0})
    place_climate(hass, "Garage", "climate.new")
    er.async_get(hass).async_update_entity("climate.office", area_id="garage")
    er.async_get(hass).async_update_entity("climate.new", area_id="office")
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    assert _climate_of(hass) == "climate.new"


async def test_thermostat_found_through_its_device(hass):
    hass.states.async_set("climate.dev", "heat", {"temperature": 20.0})
    async_mock_service(hass, "climate", "set_temperature")
    area = ar.async_get(hass).async_create("Office")
    owner = MockConfigEntry(domain="test")
    owner.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(config_entry_id=owner.entry_id, identifiers={("test", "dev")})
    dr.async_get(hass).async_update_device(device.id, area_id=area.id)
    hass.states.async_remove("climate.dev")
    er.async_get(hass).async_get_or_create("climate", "test", "dev", suggested_object_id="dev", device_id=device.id)
    hass.states.async_set("climate.dev", "heat", {"temperature": 20.0})
    entry = MockConfigEntry(domain=DOMAIN, data={"area_id": area.id}, unique_id=area.id, title="Office", version=2)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert _climate_of(hass) == "climate.dev"


async def test_area_presence_sensor_is_picked_up_when_it_appears(hass):
    entry, _ = await _zone(hass)
    assert hass.states.get(SENSOR).attributes["mode"] == "manual_only"
    er.async_get(hass).async_get_or_create(
        "binary_sensor", "share_space", "office", suggested_object_id="share_space_office"
    )
    hass.states.async_set("binary_sensor.share_space_office", "on")
    await hass.async_block_till_done()
    state = hass.states.get(SENSOR)
    assert state.attributes["mode"] == "schedule" and state.attributes["presence"] is True


async def test_area_renamed_and_removed(hass):
    entry, _ = await _zone(hass)
    ar.async_get(hass).async_update("office", name="Study")
    await hass.async_block_till_done()
    assert entry.title == "Study"

    ar.async_get(hass).async_delete("office")
    await hass.async_block_till_done()
    assert hass.config_entries.async_entries(DOMAIN) == []
