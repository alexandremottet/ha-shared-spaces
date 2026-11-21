"""Share Space Heating: thermostat zones with timed manual overrides."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import ATTR_ENTITY_ID
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import entity_registry as er

from . import websocket_api
from .const import (
    BLUEPRINT_DIR,
    DATA_STORE,
    DATA_ZONES,
    DOMAIN,
    SERVICE_CLEAR_OVERRIDE,
    SERVICE_EXTEND_OVERRIDE,
    SERVICE_SET_BASE_TARGET,
    SERVICE_SET_OVERRIDE,
)
from .store import OverrideStore
from .zone import Zone

PLATFORMS = ["sensor"]

_HOURS = vol.All(vol.Coerce(float), vol.Range(min=0.01))
SET_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ENTITY_ID): cv.entity_id,
        vol.Required("temperature"): vol.Coerce(float),
        vol.Optional("hours"): _HOURS,
    }
)
EXTEND_SCHEMA = vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_id, vol.Required("hours"): _HOURS})
CLEAR_SCHEMA = vol.Schema({vol.Required(ATTR_ENTITY_ID): cv.entity_id})


def _unbool_off(data):
    # YAML 1.1 and template key rendering turn the key `off` into False
    if isinstance(data, dict) and False in data:
        data = {("off" if key is False else key): value for key, value in data.items()}
    return data


BASE_SCHEMA = vol.All(
    _unbool_off,
    vol.Schema(
        {
            vol.Required(ATTR_ENTITY_ID): cv.entity_id,
            vol.Optional("temperature"): vol.Coerce(float),
            vol.Optional("preset"): vol.In(["comfort", "eco"]),
            vol.Optional("off"): cv.boolean,
            vol.Optional("reason"): cv.string,
        }
    ),
    cv.has_at_most_one_key("temperature", "preset", "off"),
)
BLUEPRINTS_SRC = Path(__file__).parent / "blueprints" / "automation" / "share_space"


_VERSION_RE = re.compile(r"^# share_space_blueprint_version:\s*(\d+)\s*$")


def _blueprint_version(path: Path) -> int | None:
    with path.open(encoding="utf-8") as handle:
        match = _VERSION_RE.match(handle.readline())
    return int(match.group(1)) if match else None


def _install_blueprints(dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for src in BLUEPRINTS_SRC.glob("*.yaml"):
        target = dest / src.name
        if not target.exists():
            shutil.copyfile(src, target)
            continue
        installed, shipped = _blueprint_version(target), _blueprint_version(src)
        if installed is not None and shipped is not None and installed < shipped:
            shutil.copyfile(src, target)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    websocket_api.async_register(hass)
    store = OverrideStore(hass)
    await store.async_load()
    hass.data[DOMAIN] = {DATA_STORE: store, DATA_ZONES: {}}
    _register_services(hass)
    await hass.async_add_executor_job(
        _install_blueprints, Path(hass.config.path(BLUEPRINT_DIR))
    )
    return True


def _zone_for(hass: HomeAssistant, entity_id: str) -> Zone:
    reg_entry = er.async_get(hass).async_get(entity_id)
    zone = (
        hass.data.get(DOMAIN, {}).get(DATA_ZONES, {}).get(reg_entry.config_entry_id)
        if reg_entry and reg_entry.platform == DOMAIN
        else None
    )
    if zone is None:
        raise ServiceValidationError(f"{entity_id} is not a Share Space Heating zone")
    return zone


def _register_services(hass: HomeAssistant) -> None:
    async def set_override(call: ServiceCall) -> None:
        await _zone_for(hass, call.data[ATTR_ENTITY_ID]).async_set_override(
            call.data["temperature"], call.data.get("hours")
        )

    async def extend_override(call: ServiceCall) -> None:
        await _zone_for(hass, call.data[ATTR_ENTITY_ID]).async_extend_override(call.data["hours"])

    async def clear_override(call: ServiceCall) -> None:
        await _zone_for(hass, call.data[ATTR_ENTITY_ID]).async_clear_override()

    async def set_base_target(call: ServiceCall) -> None:
        data = call.data
        await _zone_for(hass, data[ATTR_ENTITY_ID]).async_set_base_target(
            temperature=data.get("temperature"),
            preset=data.get("preset"),
            off=bool(data.get("off")),
            reason=data.get("reason"),
        )

    hass.services.async_register(DOMAIN, SERVICE_SET_BASE_TARGET, set_base_target, BASE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_SET_OVERRIDE, set_override, SET_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_EXTEND_OVERRIDE, extend_override, EXTEND_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_CLEAR_OVERRIDE, clear_override, CLEAR_SCHEMA)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    domain_data = hass.data[DOMAIN]
    zone = Zone(hass, entry, domain_data[DATA_STORE])
    entry.async_on_unload(zone.async_stop)
    domain_data[DATA_ZONES][entry.entry_id] = zone
    try:
        await zone.async_start()
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    except Exception:
        zone.async_stop()
        domain_data[DATA_ZONES].pop(entry.entry_id, None)
        raise
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def _async_reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    zone = hass.data[DOMAIN][DATA_ZONES].pop(entry.entry_id, None)
    if zone:
        zone.async_stop()
    return True


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    store = hass.data.get(DOMAIN, {}).get(DATA_STORE) or OverrideStore(hass)
    if DOMAIN not in hass.data:
        await store.async_load()
    await store.async_delete(entry.entry_id)
