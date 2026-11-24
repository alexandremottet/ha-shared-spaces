"""Share Space Heating: thermostat zones with timed manual overrides."""
from __future__ import annotations

import re
import shutil
from pathlib import Path

import logging

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.const import ATTR_ENTITY_ID
from homeassistant.core import Event, HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import ConfigEntryNotReady, ServiceValidationError
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.start import async_at_started

from . import websocket_api
from .area import zone_area, zone_climate, zone_presence
from .const import (
    BLUEPRINT_DIR,
    DATA_SETTINGS,
    DATA_STORE,
    DATA_STRATEGIES,
    DATA_ZONES,
    DOMAIN,
    SERVICE_CLEAR_OVERRIDE,
    SERVICE_EXTEND_OVERRIDE,
    SERVICE_RUN_RULES,
    SERVICE_SET_BASE_TARGET,
    SERVICE_SET_OVERRIDE,
)
from .detect import async_schedule_auto_zones
from .rules import decide, planning_facts
from .provision import async_remove_managed
from .store import OverrideStore, SettingsStore, StrategyStore
from .target import BaseTarget
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
def _one_rules_source(data: dict) -> dict:
    """Exactly one non-empty source; empty `{}` / `""` count as absent (the blueprint passes both)."""
    given = [key for key in ("rules", "strategy") if data.get(key)]
    if len(given) != 1:
        raise vol.Invalid("Provide exactly one of rules or strategy")
    return data


RUN_RULES_SCHEMA = vol.All(
    vol.Schema(
        {
            vol.Optional(ATTR_ENTITY_ID): vol.Any(None, "", cv.entity_id),
            vol.Required("area"): cv.string,
            vol.Optional("rules"): dict,
            vol.Optional("strategy"): cv.string,
        }
    ),
    _one_rules_source,
)
_LOGGER = logging.getLogger(__name__)
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
    strategies = StrategyStore(hass)
    await strategies.async_load()
    settings = SettingsStore(hass)
    await settings.async_load()
    hass.data[DOMAIN] = {DATA_STORE: store, DATA_ZONES: {}, DATA_STRATEGIES: strategies, DATA_SETTINGS: settings}
    _register_services(hass)
    _follow_registries(hass)
    async_at_started(hass, callback(lambda _hass: async_schedule_auto_zones(hass)))
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


def _zone_for_area(hass: HomeAssistant, area: str) -> Zone:
    zone = next((z for z in hass.data.get(DOMAIN, {}).get(DATA_ZONES, {}).values() if z.area == area), None)
    if zone is None:
        raise ServiceValidationError(f"No Share Space Heating zone in area {area}")
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

    async def run_rules(call: ServiceCall) -> None:
        entity_id = call.data.get(ATTR_ENTITY_ID)
        zone = _zone_for(hass, entity_id) if entity_id else _zone_for_area(hass, call.data["area"])
        facts = planning_facts(hass, call.data["area"])
        if facts is None:
            _LOGGER.debug("Planning for area %s not loaded, rules skipped", call.data["area"])
            return
        try:
            if strategy_id := call.data.get("strategy"):
                strategies = hass.data.get(DOMAIN, {}).get(DATA_STRATEGIES)
                shared = strategies.get(strategy_id) if strategies else None
                if shared is None:
                    raise ServiceValidationError(f"Shared strategy {strategy_id} not found")
                rules = shared["rules"]
            else:
                rules = call.data["rules"]
            d = decide(rules, facts)
        except (KeyError, TypeError, ValueError, AttributeError, IndexError) as err:
            raise ServiceValidationError(f"Invalid rules: {err!r}") from err
        # every-minute runs: skip unchanged decisions so the store is not rewritten
        if zone.base == BaseTarget(d.temperature, d.preset, d.off, d.label):
            return
        await zone.async_set_base_target(temperature=d.temperature, preset=d.preset, off=d.off, reason=d.label)

    hass.services.async_register(DOMAIN, SERVICE_RUN_RULES, run_rules, RUN_RULES_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_SET_BASE_TARGET, set_base_target, BASE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_SET_OVERRIDE, set_override, SET_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_EXTEND_OVERRIDE, extend_override, EXTEND_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_CLEAR_OVERRIDE, clear_override, CLEAR_SCHEMA)


def _follow_registries(hass: HomeAssistant) -> None:
    """Zones follow what HA's areas hold: reload when their thermostat or presence changes."""
    pending: set[str] = set()

    async def _reload(entry_id: str) -> None:
        try:
            await hass.config_entries.async_reload(entry_id)
        finally:
            pending.discard(entry_id)

    @callback
    def _changed(_event: Event) -> None:
        if hass.is_running:
            async_schedule_auto_zones(hass)
        areas = ar.async_get(hass)
        for entry in hass.config_entries.async_entries(DOMAIN):
            if entry.entry_id in pending:
                continue
            area = areas.async_get_area(zone_area(entry))
            if area is None:
                # the zone is the area's heating: it goes with the area
                pending.add(entry.entry_id)
                hass.async_create_task(hass.config_entries.async_remove(entry.entry_id))
                continue
            if area.name != entry.title:
                hass.config_entries.async_update_entry(entry, title=area.name)
                continue
            zone = hass.data[DOMAIN][DATA_ZONES].get(entry.entry_id)
            climate = zone_climate(hass, entry)
            if zone is None:
                stale = entry.state is ConfigEntryState.SETUP_RETRY and climate is not None
            else:
                stale = (zone.climate_entity, zone.presence_entity) != (climate, zone_presence(hass, entry))
            if stale:
                pending.add(entry.entry_id)
                hass.async_create_task(_reload(entry.entry_id))

    for event in (ar.EVENT_AREA_REGISTRY_UPDATED, dr.EVENT_DEVICE_REGISTRY_UPDATED, er.EVENT_ENTITY_REGISTRY_UPDATED):
        hass.bus.async_listen(event, _changed)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    domain_data = hass.data[DOMAIN]
    climate = zone_climate(hass, entry)
    if climate is None:
        raise ConfigEntryNotReady(f"No thermostat in area {entry.title}: assign one to it in Home Assistant")
    zone = Zone(hass, entry, domain_data[DATA_STORE], climate, zone_presence(hass, entry))
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
    # helpers built for this zone go with it (own task: not while this entry is being removed)
    hass.async_create_task(async_remove_managed(hass, entry))
