"""Config flow and websocket tests."""
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers import area_registry as ar
from pytest_homeassistant_custom_component.common import async_mock_service

from custom_components.share_space_heating.const import DOMAIN

from .helpers import place_climate

SETTINGS = {
    "presence_entity": "binary_sensor.presence",
    "comfort_temp": 21,
    "eco_temp": 17,
    "default_override_hours": 3,
    "max_override_hours": 12,
}


def _living(hass) -> dict:
    hass.states.async_set("climate.living", "heat", {"temperature": 20})
    return {"area_id": place_climate(hass, "Living", "climate.living").id, **SETTINGS}


async def test_user_flow_and_duplicate(hass):
    user_input = _living(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] == FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(result["flow_id"], user_input)
    assert result["type"] == FlowResultType.CREATE_ENTRY
    assert result["title"] == "Living"
    assert result["data"]["area_id"] == "living" and "climate_entity" not in result["data"]
    await hass.async_block_till_done()

    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], user_input)
    assert result["type"] == FlowResultType.ABORT
    assert result["reason"] == "already_configured"


async def test_user_flow_needs_a_thermostat_in_the_area(hass):
    area = ar.async_get(hass).async_create("Cellar")
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {**SETTINGS, "area_id": area.id})
    assert result["type"] == FlowResultType.FORM
    assert result["errors"] == {"base": "no_thermostat"}


async def test_options_flow(hass):
    hass.states.async_set("binary_sensor.presence", "on")
    async_mock_service(hass, "climate", "set_temperature")
    user_input = _living(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], user_input)
    await hass.async_block_till_done()
    hass.states.async_set("climate.living", "heat", {"temperature": 21})
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] == FlowResultType.FORM
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {"comfort_temp": 22, "eco_temp": 16, "default_override_hours": 2, "max_override_hours": 8},
    )
    assert result["type"] == FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    assert hass.states.get("sensor.share_space_heating_living").state == "22.0"


async def test_ws_list_zones(hass, hass_ws_client):
    first = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    await hass.config_entries.flow.async_configure(first["flow_id"], _living(hass))
    await hass.async_block_till_done()

    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": f"{DOMAIN}/list_zones"})
    zones = (await client.receive_json())["result"]
    assert len(zones) == 1
    living = zones[0]
    assert living["name"] == "Living" and living["area_id"] == "living"
    assert living["entity_id"] == "sensor.share_space_heating_living"
    assert living["climate_entity"] == "climate.living"
    assert living["presence_entity"] == "binary_sensor.presence"
    assert living["override_until"] is None and not living["managed"]
    assert {"entry_id", "mode", "target"} <= living.keys()


async def _entry_id(hass, **extra):
    hass.states.async_set("climate.living", "heat", {"temperature": 20})
    hass.states.async_set("binary_sensor.presence", "on")
    area = place_climate(hass, "Living", "climate.living")

    async def set_temperature(call):
        hass.states.async_set("climate.living", "heat", {"temperature": call.data["temperature"]})

    hass.services.async_register("climate", "set_temperature", set_temperature)
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "import"}, data={"area_id": area.id, **extra}
    )
    await hass.async_block_till_done()
    return result["result"].entry_id


async def _update(hass, hass_ws_client, **payload):
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": f"{DOMAIN}/update_zone", **payload})
    return await client.receive_json()


async def test_ws_update_zone_links_presence(hass, hass_ws_client):
    entry_id = await _entry_id(hass)
    response = await _update(
        hass, hass_ws_client, entry_id=entry_id, presence_entity="binary_sensor.presence"
    )
    assert response["success"], response
    assert response["result"]["mode"] == "schedule"
    assert response["result"]["presence_entity"] == "binary_sensor.presence"
    assert response["result"]["target"] == 21.0
    assert hass.states.get("sensor.share_space_heating_living").attributes["mode"] == "schedule"


async def test_ws_update_zone_unlink(hass, hass_ws_client):
    entry_id = await _entry_id(hass, presence_entity="binary_sensor.presence")
    response = await _update(hass, hass_ws_client, entry_id=entry_id, presence_entity=None)
    assert response["success"], response
    assert response["result"]["mode"] == "manual_only"
    assert response["result"]["presence_entity"] is None


async def test_ws_update_zone_temps(hass, hass_ws_client):
    entry_id = await _entry_id(hass, presence_entity="binary_sensor.presence")
    response = await _update(
        hass, hass_ws_client, entry_id=entry_id, comfort_temp=22.5, eco_temp=16, max_override_hours=6
    )
    assert response["success"], response
    assert response["result"]["target"] == 22.5
    entry = hass.config_entries.async_get_entry(entry_id)
    assert entry.options["eco_temp"] == 16.0
    assert entry.options["max_override_hours"] == 6.0


async def test_ws_update_zone_rejects_non_binary_sensor(hass, hass_ws_client):
    entry_id = await _entry_id(hass)
    response = await _update(hass, hass_ws_client, entry_id=entry_id, presence_entity="sensor.x")
    assert not response["success"]


async def test_ws_update_zone_non_admin(hass, hass_ws_client, hass_read_only_access_token):
    entry_id = await _entry_id(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json({"id": 1, "type": f"{DOMAIN}/update_zone", "entry_id": entry_id, "eco_temp": 15})
    response = await client.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "unauthorized"


async def test_ws_update_zone_not_found(hass, hass_ws_client):
    await _entry_id(hass)
    response = await _update(hass, hass_ws_client, entry_id="nope", eco_temp=15)
    assert not response["success"]
    assert response["error"]["code"] == "not_found"
