"""Heating HA already holds is found, but nothing is created or changed until the area gets a rule."""
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.share_space_heating.const import DOMAIN, MODE_AUTOMATION, MODE_MANUAL_ONLY
from custom_components.share_space_heating.detect import detect_area_heating

from .helpers import place_climate
from .test_shared_strategies import _ws


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


async def test_installing_changes_nothing(hass, hass_ws_client):
    hass.states.async_set("climate.rue", "heat", {"temperature": 19.0})
    calls = async_mock_service(hass, "climate", "set_temperature")
    area = place_climate(hass, "Bureau Rue", "climate.rue")
    await _start(hass)
    assert hass.config_entries.async_entries(DOMAIN) == []
    assert hass.config_entries.async_entries("generic_thermostat") == []
    assert calls == []
    found = (await _ws(hass, hass_ws_client, "detected_areas"))["result"]
    assert found == [{"area_id": area.id, "name": "Bureau Rue", "climate_entity": "climate.rue"}]


async def test_zone_from_detected_heating_is_hands_off_until_its_first_rule(hass, hass_ws_client):
    hass.states.async_set("climate.rue", "heat", {"temperature": 19.0})
    calls = async_mock_service(hass, "climate", "set_temperature")
    area = place_climate(hass, "Bureau Rue", "climate.rue")
    await _start(hass)
    found = (await _ws(hass, hass_ws_client, "detected_areas"))["result"][0]
    assert (await _ws(hass, hass_ws_client, "create_area_zone", area_id=area.id, climate_entity=found["climate_entity"]))["success"]
    await hass.async_block_till_done()
    zone = next(iter(_zones(hass).values()))
    assert zone.mode == MODE_MANUAL_ONLY
    assert calls == []
    assert (await _ws(hass, hass_ws_client, "detected_areas"))["result"] == []
    await zone.async_set_base_target(preset="eco", reason="Empty")
    await hass.async_block_till_done()
    assert zone.mode == MODE_AUTOMATION
    assert [c.data["temperature"] for c in calls] == [17.0]


async def test_group_switch_and_area_sensor_are_found(hass, hass_ws_client):
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
    assert hass.config_entries.async_entries(DOMAIN) == []
    assert hass.config_entries.async_entries("generic_thermostat") == []


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
