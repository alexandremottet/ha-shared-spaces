"""WebSocket commands for Share Space Space."""
from __future__ import annotations

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import (
    DATA_STORE,
    DOMAIN,
    WS_TYPE_DELETE_FLOORPLAN,
    WS_TYPE_GET_FLOORPLANS,
    WS_TYPE_SAVE_FLOORPLAN,
)

_PERCENT = vol.All(vol.Coerce(float), vol.Range(min=0, max=100))
_POINT = vol.All(vol.ExactSequence([_PERCENT, _PERCENT]), vol.Coerce(list))

_SHAPE = vol.Schema(
    {
        vol.Required("type"): vol.In(["rect", "polygon"]),
        vol.Required("points"): vol.All([_POINT], vol.Length(min=2)),
    }
)
_TARGET = vol.Schema(
    {
        vol.Required("kind"): vol.In(["heating", "area", "entity", "card"]),
        vol.Required("ref"): vol.Any(str, dict),
    }
)
_HOTSPOT = vol.Schema(
    {
        vol.Required("id"): str,
        vol.Required("label"): str,
        vol.Required("shape"): _SHAPE,
        vol.Required("target"): _TARGET,
    }
)
FLOORPLAN_SCHEMA = vol.Schema(
    {
        vol.Required("id"): vol.All(str, vol.Length(min=1)),
        vol.Required("name"): str,
        vol.Required("image_url"): str,
        vol.Required("hotspots"): [_HOTSPOT],
    }
)


def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_get_floorplans)
    websocket_api.async_register_command(hass, ws_save_floorplan)
    websocket_api.async_register_command(hass, ws_delete_floorplan)


@websocket_api.websocket_command({vol.Required("type"): WS_TYPE_GET_FLOORPLANS})
@websocket_api.async_response
async def ws_get_floorplans(hass: HomeAssistant, connection, msg: dict) -> None:
    store = hass.data.get(DOMAIN, {}).get(DATA_STORE)
    connection.send_result(msg["id"], {"plans": store.plans if store else []})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): WS_TYPE_SAVE_FLOORPLAN, vol.Required("plan"): FLOORPLAN_SCHEMA}
)
@websocket_api.async_response
async def ws_save_floorplan(hass: HomeAssistant, connection, msg: dict) -> None:
    store = hass.data.get(DOMAIN, {}).get(DATA_STORE)
    if store is None:
        connection.send_error(msg["id"], "not_loaded", "Share Space Space is not set up")
        return
    connection.send_result(msg["id"], {"plan": await store.async_upsert(msg["plan"])})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): WS_TYPE_DELETE_FLOORPLAN, vol.Required("plan_id"): str}
)
@websocket_api.async_response
async def ws_delete_floorplan(hass: HomeAssistant, connection, msg: dict) -> None:
    store = hass.data.get(DOMAIN, {}).get(DATA_STORE)
    if store is None or not await store.async_delete(msg["plan_id"]):
        connection.send_error(msg["id"], "not_found", "Floor plan not found")
        return
    connection.send_result(msg["id"], {})
