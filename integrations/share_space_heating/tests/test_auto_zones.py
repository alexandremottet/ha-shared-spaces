"""Areas HA already heats get their zone without a setup step, and it stays hands-off until its first rule."""
import pytest
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.share_space_heating.const import DOMAIN, MODE_AUTOMATION, MODE_MANUAL_ONLY
from custom_components.share_space_heating.detect import detect_area_heating

from .helpers import place_climate
from .test_shared_strategies import _ws

pytestmark = pytest.mark.auto_zones


def _zones(hass):
    return hass.data[DOMAIN]["zones"]


def _place(hass, entity_id: str, area_id: str | None) -> None:
    reg = er.async_get(hass)
    if reg.async_get(entity_id) is None:
        state = hass.states.get(entity_id)
        hass.states.async_remove(entity_id)
        domain, object_id = entity_id.split(".", 1)
        reg.async_get_or_create(domain, "test", object_id, suggested_object_id=object_id)
        if state:
            hass.states.async_set(entity_id, state.state, state.attributes)
    reg.async_update_entity(entity_id, area_id=area_id)


async def _start(hass):
    assert await async_setup_component(hass, "homeassistant", {})
    assert await async_setup_component(hass, DOMAIN, {})
    await hass.async_block_till_done()


async def test_area_thermostat_gets_a_hands_off_zone(hass):
    hass.states.async_set("climate.rue", "heat", {"temperature": 19.0})
    calls = async_mock_service(hass, "climate", "set_temperature")
    area = place_climate(hass, "Bureau Rue", "climate.rue")
    hass.states.async_set("binary_sensor.share_space_" + area.id, "off")
    await _start(hass)

    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert entry.title == "Bureau Rue" and entry.data["auto"] is True
    zone = next(iter(_zones(hass).values()))
    assert zone.climate_entity == "climate.rue"
    assert zone.mode == MODE_MANUAL_ONLY
    assert calls == []

    await zone.async_set_base_target(preset="eco", reason="Empty")
    await hass.async_block_till_done()
    assert zone.mode == MODE_AUTOMATION
    assert [c.data["temperature"] for c in calls] == [17.0]


async def test_group_switch_and_area_sensor_build_the_thermostat(hass):
    await _start(hass)
    hass.states.async_set("switch.rad_1", "off")
    hass.states.async_set("switch.rad_2", "off")
    hass.states.async_set("switch.radiateurs", "off", {"entity_id": ["switch.rad_1", "switch.rad_2"]})
    hass.states.async_set("sensor.rue_temp", "18", {"device_class": "temperature", "unit_of_measurement": "°C"})
    area = ar.async_get(hass).async_create("Bureau Rue")
    assert detect_area_heating(hass, area.id) is None
    for entity_id in ("switch.rad_1", "switch.rad_2", "sensor.rue_temp"):
        _place(hass, entity_id, area.id)
    assert detect_area_heating(hass, area.id) == {"heaters": ["switch.radiateurs"], "temperature_sensor": "sensor.rue_temp"}
    await hass.async_block_till_done()

    entries = hass.config_entries.async_entries(DOMAIN)
    assert len(entries) == 1 and entries[0].data["auto"] is True
    thermostat = hass.config_entries.async_entries("generic_thermostat")[0]
    assert thermostat.options["heater"] == "switch.radiateurs"
    assert thermostat.options["target_sensor"] == "sensor.rue_temp"


async def test_area_temperature_setting_wins(hass):
    await _start(hass)
    hass.states.async_set("switch.rad", "off")
    hass.states.async_set("sensor.a", "18", {"device_class": "temperature"})
    hass.states.async_set("sensor.wall", "19", {"device_class": "temperature"})
    reg = ar.async_get(hass)
    area = reg.async_create("Bureau")
    if not hasattr(area, "temperature_entity_id"):
        pytest.skip("HA without area temperature sensor")
    reg.async_update(area.id, temperature_entity_id="sensor.wall")
    _place(hass, "sensor.a", area.id)
    _place(hass, "switch.rad", area.id)
    assert detect_area_heating(hass, area.id)["temperature_sensor"] == "sensor.wall"


async def test_removed_zone_is_not_set_up_again_until_managed(hass, hass_ws_client):
    hass.states.async_set("climate.rue", "heat", {"temperature": 19.0})
    area = place_climate(hass, "Bureau Rue", "climate.rue")
    await _start(hass)
    entry = hass.config_entries.async_entries(DOMAIN)[0]

    assert (await _ws(hass, hass_ws_client, "delete_zone", entry_id=entry.entry_id))["success"]
    await hass.async_block_till_done()
    er.async_get(hass).async_update_entity("climate.rue", name="Rue")
    await hass.async_block_till_done()
    assert hass.config_entries.async_entries(DOMAIN) == []
    settings = (await _ws(hass, hass_ws_client, "get_settings"))["result"]
    assert settings["ignored_areas"] == [area.id]

    assert (await _ws(hass, hass_ws_client, "manage_area", area_id=area.id))["success"]
    await hass.async_block_till_done()
    assert len(hass.config_entries.async_entries(DOMAIN)) == 1
    assert (await _ws(hass, hass_ws_client, "get_settings"))["result"]["ignored_areas"] == []



async def test_not_managed_is_an_ha_label(hass, hass_ws_client):
    from homeassistant.helpers import label_registry as lr

    hass.states.async_set("climate.rue", "heat", {"temperature": 19.0})
    area = place_climate(hass, "Bureau Rue", "climate.rue")
    await _start(hass)
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert (await _ws(hass, hass_ws_client, "delete_zone", entry_id=entry.entry_id))["success"]
    await hass.async_block_till_done()
    label = lr.async_get(hass).async_get_label_by_name("Share Space: not managed")
    assert label.label_id in ar.async_get(hass).async_get_area(area.id).labels

    # Taking the label off in HA's own area page manages the area again.
    ar.async_get(hass).async_update(area.id, labels=set())
    await hass.async_block_till_done()
    assert len(hass.config_entries.async_entries(DOMAIN)) == 1


async def test_ignored_areas_move_to_the_label(hass, hass_storage):
    hass.states.async_set("climate.rue", "heat", {"temperature": 19.0})
    area = place_climate(hass, "Bureau Rue", "climate.rue")
    hass_storage["share_space_heating.settings"] = {
        "version": 1,
        "minor_version": 1,
        "key": "share_space_heating.settings",
        "data": {"outdoor_entity": "sensor.out", "ignored_areas": [area.id]},
    }
    await _start(hass)
    assert hass.config_entries.async_entries(DOMAIN) == []
    assert hass_storage["share_space_heating.settings"]["data"] == {"outdoor_entity": "sensor.out"}
