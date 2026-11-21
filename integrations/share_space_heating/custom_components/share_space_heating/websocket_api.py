"""WebSocket commands for Share Space Heating."""
from __future__ import annotations

import asyncio

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import entity_registry as er

from .const import (
    CONF_CLIMATE_ENTITY,
    CONF_COMFORT_TEMP,
    CONF_DEFAULT_OVERRIDE_HOURS,
    CONF_ECO_TEMP,
    CONF_FROST_TEMP,
    CONF_MAX_OVERRIDE_HOURS,
    CONF_OFF_MODE,
    CONF_PRESENCE_ENTITY,
    DATA_ZONES,
    DOMAIN,
    OFF_MODES,
)


def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_list_zones)
    websocket_api.async_register_command(hass, ws_create_zone)
    websocket_api.async_register_command(hass, ws_update_zone)


def _presence_entity(value):
    if value in (None, ""):
        return None
    value = cv.entity_id(value)
    if not value.startswith("binary_sensor."):
        raise vol.Invalid("presence_entity must be a binary_sensor")
    return value


_TEMP = vol.All(vol.Coerce(float), vol.Range(min=5, max=35))
_HOURS = vol.All(vol.Coerce(float), vol.Range(min=0.5, max=72))
_FROST = vol.All(vol.Coerce(float), vol.Range(min=5, max=15))


def _summary(hass: HomeAssistant, entry_id: str, zone) -> dict:
    return {
        "entry_id": entry_id,
        "name": zone.entry.title,
        "entity_id": _zone_entity_id(hass, entry_id),
        "climate_entity": zone.climate_entity,
        "presence_entity": zone.presence_entity,
        "mode": zone.mode,
        "active_rule": zone.active_rule,
        "target": zone.target,
        "override_until": zone.override_until.isoformat() if zone.override_active else None,
    }


def _zone_entity_id(hass: HomeAssistant, entry_id: str) -> str | None:
    return er.async_get(hass).async_get_entity_id("sensor", DOMAIN, entry_id)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/list_zones"})
@websocket_api.async_response
async def ws_list_zones(hass: HomeAssistant, connection, msg: dict) -> None:
    zones = hass.data.get(DOMAIN, {}).get(DATA_ZONES, {})
    connection.send_result(msg["id"], [_summary(hass, entry_id, zone) for entry_id, zone in zones.items()])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/create_zone",
        vol.Required("name"): str,
        vol.Required(CONF_CLIMATE_ENTITY): str,
        vol.Optional(CONF_PRESENCE_ENTITY): vol.Any(str, None),
        vol.Optional(CONF_COMFORT_TEMP): vol.Coerce(float),
        vol.Optional(CONF_ECO_TEMP): vol.Coerce(float),
        vol.Optional(CONF_DEFAULT_OVERRIDE_HOURS): vol.Coerce(float),
    }
)
@websocket_api.async_response
async def ws_create_zone(hass: HomeAssistant, connection, msg: dict) -> None:
    data = {key: value for key, value in msg.items() if key not in ("id", "type")}
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "import"}, data=data
    )
    if result["type"] != "create_entry":
        connection.send_error(msg["id"], result.get("reason", "failed"), "Zone not created")
        return
    entry_id = result["result"].entry_id
    connection.send_result(msg["id"], {"entry_id": entry_id, "entity_id": _zone_entity_id(hass, entry_id)})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/update_zone",
        vol.Required("entry_id"): str,
        vol.Optional(CONF_PRESENCE_ENTITY): _presence_entity,
        vol.Optional(CONF_COMFORT_TEMP): _TEMP,
        vol.Optional(CONF_ECO_TEMP): _TEMP,
        vol.Optional(CONF_DEFAULT_OVERRIDE_HOURS): _HOURS,
        vol.Optional(CONF_MAX_OVERRIDE_HOURS): _HOURS,
        vol.Optional(CONF_FROST_TEMP): _FROST,
        vol.Optional(CONF_OFF_MODE): vol.In(OFF_MODES),
    }
)
@websocket_api.async_response
async def ws_update_zone(hass: HomeAssistant, connection, msg: dict) -> None:
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    zones = hass.data.get(DOMAIN, {}).get(DATA_ZONES, {})
    if entry is None or entry.domain != DOMAIN or entry.entry_id not in zones:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Zone not found")
        return
    changes = {k: v for k, v in msg.items() if k not in ("id", "type", "entry_id")}
    previous = zones[entry.entry_id]
    if hass.config_entries.async_update_entry(entry, options={**entry.options, **changes}):
        try:
            async with asyncio.timeout(10):
                while (zone := zones.get(entry.entry_id)) is previous or zone is None or not zone._ready:
                    await asyncio.sleep(0.01)
        except TimeoutError:
            connection.send_error(msg["id"], "reload_timeout", "Zone reload timed out")
            return
    connection.send_result(msg["id"], _summary(hass, entry.entry_id, zones[entry.entry_id]))
