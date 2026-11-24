"""Zone devices read live from the zone's Home Assistant area, never copied into the zone."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from .const import CONF_AREA, CONF_CLIMATE_ENTITY, CONF_MANAGED_ENTRIES, CONF_PRESENCE_ENTITY

GENERIC_THERMOSTAT = "generic_thermostat"
GROUP = "group"


def _conf(entry: ConfigEntry) -> dict:
    return {**entry.data, **entry.options}


def zone_area(entry: ConfigEntry) -> str:
    return entry.data[CONF_AREA]


def entity_area(hass: HomeAssistant, entity_id: str) -> str | None:
    """The entity's own area, else its device's: how HA itself places an entity."""
    ent = er.async_get(hass).async_get(entity_id)
    if ent is None:
        return None
    if ent.area_id or not ent.device_id:
        return ent.area_id
    device = dr.async_get(hass).async_get(ent.device_id)
    return device.area_id if device else None


def area_entities(hass: HomeAssistant, area_id: str, domain: str) -> list[str]:
    ent_reg = er.async_get(hass)
    found = {e.entity_id for e in er.async_entries_for_area(ent_reg, area_id) if e.domain == domain and not e.disabled_by}
    for device in dr.async_entries_for_area(dr.async_get(hass), area_id):
        found.update(
            e.entity_id
            for e in er.async_entries_for_device(ent_reg, device.id)
            if e.domain == domain and e.area_id is None
        )
    return sorted(found)


def _helpers(hass: HomeAssistant, entry: ConfigEntry) -> list[ConfigEntry]:
    ids = _conf(entry).get(CONF_MANAGED_ENTRIES) or []
    return [helper for entry_id in ids if (helper := hass.config_entries.async_get_entry(entry_id))]


def _managed_climates(hass: HomeAssistant, entry: ConfigEntry) -> list[str]:
    reg = er.async_get(hass)
    return [
        ent.entity_id
        for helper in _helpers(hass, entry)
        if helper.domain == GENERIC_THERMOSTAT
        for ent in er.async_entries_for_config_entry(reg, helper.entry_id)
        if ent.domain == "climate"
    ]


def zone_climate(hass: HomeAssistant, entry: ConfigEntry) -> str | None:
    """The area's thermostat: the one Share Space built, the one picked among several, else the first."""
    climates = area_entities(hass, zone_area(entry), "climate")
    preferred = [*_managed_climates(hass, entry), _conf(entry).get(CONF_CLIMATE_ENTITY)]
    return next((c for c in preferred if c in climates), climates[0] if climates else None)


def zone_presence(hass: HomeAssistant, entry: ConfigEntry) -> str | None:
    """A presence sensor picked for the zone, else the area's Share Space occupancy sensor."""
    if picked := _conf(entry).get(CONF_PRESENCE_ENTITY):
        return picked
    auto = f"binary_sensor.share_space_{zone_area(entry)}"
    return auto if er.async_get(hass).async_get(auto) or hass.states.get(auto) else None


def managed_devices(hass: HomeAssistant, entry: ConfigEntry) -> dict:
    """Heaters and sensor of a thermostat Share Space built, as the HA helpers hold them now."""
    heaters: list[str] | None = None
    heater_switch = temperature_sensor = None
    for helper in _helpers(hass, entry):
        if helper.domain == GROUP:
            heaters = list(helper.options.get("entities") or [])
        elif helper.domain == GENERIC_THERMOSTAT:
            heater_switch = helper.options.get("heater")
            temperature_sensor = helper.options.get("target_sensor")
    if heaters is None and heater_switch:
        heaters = [heater_switch]
    return {"heaters": heaters, "heater_switch": heater_switch, "temperature_sensor": temperature_sensor}
