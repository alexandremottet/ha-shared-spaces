"""Heating an HA area already holds."""
from __future__ import annotations

import re

from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from .area import area_entities, entity_area, managed_devices, zone_climate
from .const import CONF_AREA, DOMAIN


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


# A plug only counts as a heater when it says so: a camera or printer plug must never be driven.
_HEATING_WORDS = re.compile(r"radiat|heat|chauff|convect|(^|[\s._])rad($|[\s._\d])", re.I)


def _heater_like(hass: HomeAssistant, entity_id: str) -> bool:
    entry = er.async_get(hass).async_get(entity_id)
    if entry is not None and entry.entity_category is not None:
        return False  # child lock, LED, relay settings of a plug
    state = hass.states.get(entity_id)
    names = [entity_id, state.name if state else ""]
    if entry is not None:
        names += [entry.name or "", entry.original_name or ""]
        device = dr.async_get(hass).async_get(entry.device_id) if entry.device_id else None
        if device is not None:
            names += [device.name_by_user or "", device.name or ""]
    return any(_HEATING_WORDS.search(n) for n in names if n)


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
    switches = [s for s in hass.states.async_entity_ids("switch") if not _ours(s) and s not in taken and _heater_like(hass, s)]
    # a group switch drives the physical ones: keep it, drop its members
    groups = [s for s in switches if (m := _members(hass, s)) and (in_area(s) or any(in_area(x) for x in m))]
    grouped = {m for g in groups for m in _members(hass, g)}
    heaters = sorted({*groups, *filter(in_area, switches)} - grouped)
    sensor = _temperature_sensor(hass, area_id)
    if not heaters or sensor is None:
        return None
    return {"heaters": heaters, "temperature_sensor": sensor}


def detected_areas(hass: HomeAssistant) -> list[dict]:
    """Areas without a zone whose heating HA already holds; nothing is created until the area gets a rule."""
    zoned = {entry.data.get(CONF_AREA) for entry in hass.config_entries.async_entries(DOMAIN)}
    out = []
    for area in ar.async_get(hass).async_list_areas():
        if area.id in zoned or (found := detect_area_heating(hass, area.id)) is None:
            continue
        out.append({"area_id": area.id, "name": area.name, **found})
    return sorted(out, key=lambda a: a["name"])
