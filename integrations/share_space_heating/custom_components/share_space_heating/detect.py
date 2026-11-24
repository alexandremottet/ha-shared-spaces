"""Heating an HA area already holds, and the zones Share Space sets up for it on its own."""
from __future__ import annotations

import logging

from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar

from .area import area_entities, entity_area, managed_devices, zone_climate
from .const import CONF_AREA, DATA_SETTINGS, DOMAIN
from .provision import ProvisionError, async_create_area_zone

_LOGGER = logging.getLogger(__name__)
DATA_AUTO_PENDING = "auto_zones_pending"


def _ours(entity_id: str) -> bool:
    return ".share_space_" in entity_id


def _taken(hass: HomeAssistant) -> set[str]:
    """Thermostats and heaters other zones already drive."""
    taken: set[str] = set()
    for entry in hass.config_entries.async_entries(DOMAIN):
        devices = managed_devices(hass, entry)
        taken.update(devices["heaters"] or [])
        taken.add(devices["heater_switch"] or "")
        taken.add(zone_climate(hass, entry) or "")
    return taken


def _members(hass: HomeAssistant, entity_id: str) -> list[str]:
    state = hass.states.get(entity_id)
    ids = state.attributes.get("entity_id") if state else None
    return [str(i) for i in ids] if isinstance(ids, (list, tuple)) else []


def _temperature_sensor(hass: HomeAssistant, area_id: str) -> str | None:
    area = ar.async_get(hass).async_get_area(area_id)
    chosen = getattr(area, "temperature_entity_id", None)
    if chosen and hass.states.get(chosen):
        return chosen
    for entity_id in area_entities(hass, area_id, "sensor"):
        state = hass.states.get(entity_id)
        if state and not _ours(entity_id) and state.attributes.get("device_class") == "temperature":
            return entity_id
    return None


def detect_area_heating(hass: HomeAssistant, area_id: str) -> dict | None:
    """Arguments for `async_create_area_zone`, or None when the area has no heating Share Space can drive."""
    taken = _taken(hass)
    climates = [c for c in area_entities(hass, area_id, "climate") if c not in taken]
    if climates:
        return {"climate_entity": climates[0]}
    in_area = lambda entity_id: entity_area(hass, entity_id) == area_id  # noqa: E731
    switches = [s for s in hass.states.async_entity_ids("switch") if not _ours(s) and s not in taken]
    # a group switch drives the physical ones: keep it, drop its members
    groups = [s for s in switches if (m := _members(hass, s)) and (in_area(s) or any(in_area(x) for x in m))]
    grouped = {m for g in groups for m in _members(hass, g)}
    heaters = sorted({*groups, *filter(in_area, switches)} - grouped)
    sensor = _temperature_sensor(hass, area_id)
    if not heaters or sensor is None:
        return None
    return {"heaters": heaters, "temperature_sensor": sensor}


async def async_auto_zones(hass: HomeAssistant) -> None:
    """Give every area HA already heats a zone, except areas the admin removed."""
    settings = hass.data[DOMAIN][DATA_SETTINGS]
    ignored = set(settings.ignored_areas)
    zoned = {entry.data.get(CONF_AREA) for entry in hass.config_entries.async_entries(DOMAIN)}
    for area in ar.async_get(hass).async_list_areas():
        if area.id in zoned or area.id in ignored:
            continue
        found = detect_area_heating(hass, area.id)
        if found is None:
            continue
        try:
            await async_create_area_zone(hass, area.id, auto=True, **found)
        except ProvisionError as err:
            _LOGGER.info("Could not set up heating for %s: %s", area.name, err)


def async_schedule_auto_zones(hass: HomeAssistant) -> None:
    """Run `async_auto_zones` once, however many registry events ask for it meanwhile."""
    data = hass.data.get(DOMAIN)
    if data is None or data.get(DATA_AUTO_PENDING):
        return
    data[DATA_AUTO_PENDING] = True

    async def _run() -> None:
        try:
            await async_auto_zones(hass)
        finally:
            data[DATA_AUTO_PENDING] = False

    hass.async_create_task(_run())

