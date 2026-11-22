"""Space-wide settings: outdoor sensor picked once, read by rules through the `outdoor` alias."""
from homeassistant.setup import async_setup_component

from custom_components.share_space_heating.const import DOMAIN, OUTDOOR_ALIAS
from custom_components.share_space_heating.rules import eval_value, sensor_reading
from custom_components.share_space_heating.store import SettingsStore

from .helpers import SENSOR, setup_zone
from .test_shared_strategies import _ws

CURVE = {"type": "curve", "entity": OUTDOOR_ALIAS, "default": 10, "points": [{"at": 10, "value": 6}, {"at": 20, "value": 1}]}


async def test_ws_settings_round_trip_and_zone_attribute(hass, hass_ws_client, hass_storage):
    await setup_zone(hass)
    assert (await _ws(hass, hass_ws_client, "get_settings"))["result"] == {"outdoor_entity": None}
    saved = await _ws(hass, hass_ws_client, "save_settings", outdoor_entity="weather.home")
    assert saved["result"] == {"outdoor_entity": "weather.home"}
    assert (await _ws(hass, hass_ws_client, "get_settings"))["result"] == {"outdoor_entity": "weather.home"}
    assert hass.states.get(SENSOR).attributes["outdoor_entity"] == "weather.home"
    assert hass_storage["share_space_heating.settings"]["data"] == {"outdoor_entity": "weather.home"}
    reloaded = SettingsStore(hass)
    await reloaded.async_load()
    assert reloaded.outdoor_entity == "weather.home"
    cleared = await _ws(hass, hass_ws_client, "save_settings", outdoor_entity="")
    assert cleared["result"] == {"outdoor_entity": None}


async def test_ws_save_settings_rejects_bad_entities(hass, hass_ws_client):
    assert await async_setup_component(hass, DOMAIN, {})
    for bad in ("light.kitchen", "not an id"):
        response = await _ws(hass, hass_ws_client, "save_settings", outdoor_entity=bad)
        assert response["error"]["code"] == "invalid_format"


async def test_ws_save_settings_admin_only(hass, hass_ws_client, hass_read_only_access_token):
    assert await async_setup_component(hass, DOMAIN, {})
    response = await _ws(hass, hass_ws_client, "save_settings", token=hass_read_only_access_token, outdoor_entity="sensor.out")
    assert response["error"]["code"] == "unauthorized"


async def test_outdoor_alias_reads_the_settings_sensor(hass, hass_ws_client):
    assert await async_setup_component(hass, DOMAIN, {})
    read = lambda e: sensor_reading(hass, e)  # noqa: E731
    assert read(OUTDOOR_ALIAS) is None
    assert eval_value(CURVE, read) == 6  # no sensor set: curve default (10 °C)
    hass.states.async_set("weather.home", "sunny", {"temperature": 20})
    await _ws(hass, hass_ws_client, "save_settings", outdoor_entity="weather.home")
    assert read(OUTDOOR_ALIAS) == 20
    assert eval_value(CURVE, read) == 1
