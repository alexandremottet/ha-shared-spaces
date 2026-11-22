"""WebSocket commands for Share Space Heating."""
from __future__ import annotations

import asyncio

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import TemplateError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.template import Template

from .const import (
    CONF_CLIMATE_ENTITY,
    CONF_COMFORT_TEMP,
    CONF_DEFAULT_OVERRIDE_HOURS,
    CONF_ECO_TEMP,
    CONF_FROST_TEMP,
    CONF_MAX_OVERRIDE_HOURS,
    CONF_OFF_MODE,
    CONF_PRESENCE_ENTITY,
    CONF_TARGET_TEMPLATE,
    DATA_STRATEGIES,
    DATA_ZONES,
    DOMAIN,
    OFF_MODES,
)


def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_list_zones)
    websocket_api.async_register_command(hass, ws_create_zone)
    websocket_api.async_register_command(hass, ws_update_zone)
    websocket_api.async_register_command(hass, ws_list_strategies)
    websocket_api.async_register_command(hass, ws_save_strategy)
    websocket_api.async_register_command(hass, ws_delete_strategy)


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


def _template_error(hass: HomeAssistant, msg: dict) -> str | None:
    """Normalize `target_template` in msg ("" -> None); return a syntax error message."""
    if CONF_TARGET_TEMPLATE not in msg:
        return None
    source = msg[CONF_TARGET_TEMPLATE]
    if source is None or not source.strip():
        msg[CONF_TARGET_TEMPLATE] = None
        return None
    try:
        Template(source, hass).ensure_valid()
    except TemplateError as err:
        return str(err)
    return None


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
        "target_template": zone.target_template,
        "template_result": zone.template_result,
        "template_error": zone.template_error,
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
        vol.Optional(CONF_TARGET_TEMPLATE): vol.Any(None, str),
    }
)
@websocket_api.async_response
async def ws_create_zone(hass: HomeAssistant, connection, msg: dict) -> None:
    if error := _template_error(hass, msg):
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, error)
        return
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
        vol.Optional(CONF_TARGET_TEMPLATE): vol.Any(None, str),
    }
)
@websocket_api.async_response
async def ws_update_zone(hass: HomeAssistant, connection, msg: dict) -> None:
    if error := _template_error(hass, msg):
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, error)
        return
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


def _valid_rules(rules: dict) -> bool:
    return rules.get("version") == 1 and isinstance(rules.get("rules"), list) and isinstance(rules.get("fallback"), dict)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/list_strategies"})
@websocket_api.async_response
async def ws_list_strategies(hass: HomeAssistant, connection, msg: dict) -> None:
    store = hass.data.get(DOMAIN, {}).get(DATA_STRATEGIES)
    connection.send_result(msg["id"], store.all() if store else [])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/save_strategy",
        vol.Optional("strategy_id"): str,
        vol.Required("name"): str,
        vol.Required("rules"): dict,
        vol.Optional("previous"): vol.Any(dict, None),
    }
)
@websocket_api.async_response
async def ws_save_strategy(hass: HomeAssistant, connection, msg: dict) -> None:
    store = hass.data[DOMAIN][DATA_STRATEGIES]
    name = msg["name"].strip()
    if not name:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, "Name is required")
        return
    previous = msg.get("previous")
    if not _valid_rules(msg["rules"]) or (previous is not None and not _valid_rules(previous)):
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, "Invalid strategy shape")
        return
    strategy_id = msg.get("strategy_id")
    if strategy_id is not None and store.get(strategy_id) is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Strategy not found")
        return
    if any(s["id"] != strategy_id and s["name"].casefold() == name.casefold() for s in store.all()):
        connection.send_error(msg["id"], "name_taken", "A strategy with this name already exists")
        return
    saved = await store.async_save(strategy_id, name, msg["rules"], previous)
    connection.send_result(msg["id"], {"id": saved})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/delete_strategy", vol.Required("strategy_id"): str})
@websocket_api.async_response
async def ws_delete_strategy(hass: HomeAssistant, connection, msg: dict) -> None:
    if not await hass.data[DOMAIN][DATA_STRATEGIES].async_delete(msg["strategy_id"]):
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Strategy not found")
        return
    connection.send_result(msg["id"], {})
