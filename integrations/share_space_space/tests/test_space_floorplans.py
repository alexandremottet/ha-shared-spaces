"""Tests for share_space_space."""
from homeassistant.components.frontend import DATA_PANELS
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.share_space_space.const import DOMAIN, PANEL_URL_PATH

PLAN = {
    "id": "main",
    "name": "Shared space",
    "image_url": "/local/space.png",
    "hotspots": [
        {
            "id": "h1",
            "label": "Desk",
            "shape": {"type": "rect", "points": [[10, 10], [40, 30]]},
            "target": {"kind": "heating", "ref": "sensor.share_space_heating_living"},
        },
        {
            "id": "h2",
            "label": "Card",
            "shape": {"type": "polygon", "points": [[50, 50], [60, 50], [55, 70]]},
            "target": {"kind": "card", "ref": {"type": "markdown", "content": "hi"}},
        },
    ],
}


async def _setup(hass):
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_setup_registers_panel_and_unload_removes(hass):
    entry = await _setup(hass)
    assert PANEL_URL_PATH in hass.data[DATA_PANELS]
    assert await hass.config_entries.async_unload(entry.entry_id)
    assert PANEL_URL_PATH not in hass.data[DATA_PANELS]


async def test_save_get_delete_roundtrip(hass, hass_ws_client):
    await _setup(hass)
    client = await hass_ws_client(hass)

    await client.send_json({"id": 1, "type": "share_space_space/get_floorplans"})
    assert (await client.receive_json())["result"] == {"plans": []}

    await client.send_json({"id": 2, "type": "share_space_space/save_floorplan", "plan": PLAN})
    res = await client.receive_json()
    assert res["success"], res
    assert res["result"]["plan"]["id"] == "main"

    renamed = {**PLAN, "name": "Renamed"}
    await client.send_json({"id": 3, "type": "share_space_space/save_floorplan", "plan": renamed})
    assert (await client.receive_json())["success"]

    await client.send_json({"id": 4, "type": "share_space_space/get_floorplans"})
    plans = (await client.receive_json())["result"]["plans"]
    assert [p["name"] for p in plans] == ["Renamed"]
    assert plans[0]["hotspots"][0]["shape"]["points"] == [[10, 10], [40, 30]]

    await client.send_json({"id": 5, "type": "share_space_space/delete_floorplan", "plan_id": "x"})
    assert not (await client.receive_json())["success"]

    await client.send_json({"id": 6, "type": "share_space_space/delete_floorplan", "plan_id": "main"})
    assert (await client.receive_json())["success"]
    await client.send_json({"id": 7, "type": "share_space_space/get_floorplans"})
    assert (await client.receive_json())["result"] == {"plans": []}


async def test_invalid_shape_rejected(hass, hass_ws_client):
    await _setup(hass)
    client = await hass_ws_client(hass)
    bad = {**PLAN, "hotspots": [{**PLAN["hotspots"][0], "shape": {"type": "circle", "points": []}}]}
    await client.send_json({"id": 1, "type": "share_space_space/save_floorplan", "plan": bad})
    assert not (await client.receive_json())["success"]


async def test_non_admin_cannot_save_or_delete(hass, hass_ws_client, hass_read_only_access_token):
    await _setup(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)

    await client.send_json({"id": 1, "type": "share_space_space/save_floorplan", "plan": PLAN})
    res = await client.receive_json()
    assert not res["success"]
    assert res["error"]["code"] == "unauthorized"

    await client.send_json({"id": 2, "type": "share_space_space/delete_floorplan", "plan_id": "main"})
    assert not (await client.receive_json())["success"]

    await client.send_json({"id": 3, "type": "share_space_space/get_floorplans"})
    assert (await client.receive_json())["success"]


async def test_persistence_across_reload(hass, hass_ws_client):
    entry = await _setup(hass)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "share_space_space/save_floorplan", "plan": PLAN})
    assert (await client.receive_json())["success"]

    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()

    await client.send_json({"id": 2, "type": "share_space_space/get_floorplans"})
    plans = (await client.receive_json())["result"]["plans"]
    assert plans == [PLAN]
