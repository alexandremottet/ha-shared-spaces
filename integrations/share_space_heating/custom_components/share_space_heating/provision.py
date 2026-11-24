"""Zone per area from plain devices: heater switches + temperature sensor -> HA helpers -> zone."""
from __future__ import annotations

import asyncio

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import entity_registry as er

from .area import area_entities, entity_area
from .const import CONF_AREA, CONF_AUTO, CONF_CLIMATE_ENTITY, CONF_MANAGED_ENTRIES, DOMAIN


class ProvisionError(HomeAssistantError):
    """Zone could not be provisioned; `code` is the WebSocket error code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


async def _run_flow(hass: HomeAssistant, domain: str, steps: list[dict]) -> ConfigEntry:
    result = await hass.config_entries.flow.async_init(domain, context={"source": "user"})
    for user_input in steps:
        if result["type"] not in ("form", "menu"):
            break
        result = await hass.config_entries.flow.async_configure(result["flow_id"], user_input)
    if result["type"] != "create_entry":
        if "flow_id" in result:
            hass.config_entries.flow.async_abort(result["flow_id"])
        raise ProvisionError("helper_failed", f"Could not create the {domain} helper: {result.get('errors') or result.get('reason')}")
    return result["result"]


async def _entity_of(hass: HomeAssistant, entry: ConfigEntry, domain: str) -> str:
    reg = er.async_get(hass)
    for _ in range(50):
        for ent in er.async_entries_for_config_entry(reg, entry.entry_id):
            if ent.domain == domain:
                return ent.entity_id
        await asyncio.sleep(0.1)
    raise ProvisionError("helper_failed", f"The {domain} helper created no entity")


async def _remove_entries(hass: HomeAssistant, entry_ids: list[str]) -> None:
    for entry_id in entry_ids:
        if hass.config_entries.async_get_entry(entry_id):
            await hass.config_entries.async_remove(entry_id)


async def async_create_area_zone(
    hass: HomeAssistant,
    area_id: str,
    climate_entity: str | None = None,
    heaters: list[str] | None = None,
    temperature_sensor: str | None = None,
    auto: bool = False,
) -> ConfigEntry:
    """Zone for an area: an existing thermostat, or one built from heater switches + a sensor."""
    area = ar.async_get(hass).async_get_area(area_id)
    if area is None:
        raise ProvisionError("not_found", "Area not found")
    if any(e.data.get(CONF_AREA) == area_id for e in hass.config_entries.async_entries(DOMAIN)):
        raise ProvisionError("already_configured", f"{area.name} already has a heating zone")
    managed: list[str] = []
    data: dict = {CONF_AREA: area_id}
    if auto:
        data[CONF_AUTO] = True
    try:
        if climate_entity is None:
            if not heaters or not temperature_sensor:
                raise ProvisionError("invalid_format", "Pick at least one heater and a temperature sensor")
            heater = heaters[0]
            if len(heaters) > 1:
                group = await _run_flow(
                    hass,
                    "group",
                    [
                        {"next_step_id": "switch"},
                        {"name": f"{area.name} heaters", "entities": heaters, "hide_members": False, "all": False},
                    ],
                )
                managed.append(group.entry_id)
                heater = await _entity_of(hass, group, "switch")
            thermostat = await _run_flow(
                hass,
                "generic_thermostat",
                [
                    {
                        "name": f"{area.name} thermostat",
                        "ac_mode": False,
                        "target_sensor": temperature_sensor,
                        "heater": heater,
                        "cold_tolerance": 0.3,
                        "hot_tolerance": 0.3,
                    },
                    {},
                ],
            )
            managed.append(thermostat.entry_id)
            climate_entity = await _entity_of(hass, thermostat, "climate")
            # generic thermostats start off; the zone only drives the setpoint
            await hass.services.async_call("climate", "set_hvac_mode", {"entity_id": climate_entity, "hvac_mode": "heat"}, blocking=True)
            data[CONF_MANAGED_ENTRIES] = managed
        elif hass.states.get(climate_entity) is None:
            raise ProvisionError("not_found", f"{climate_entity} not found")
        # the zone finds its thermostat through the area, as HA shows it
        reg = er.async_get(hass)
        if reg.async_get(climate_entity) is None:
            raise ProvisionError("invalid_format", f"{climate_entity} has no unique ID, so it cannot be placed in an area")
        if entity_area(hass, climate_entity) != area_id:
            reg.async_update_entity(climate_entity, area_id=area_id)
        if not managed and len(area_entities(hass, area_id, "climate")) > 1:
            data[CONF_CLIMATE_ENTITY] = climate_entity
        result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "import"}, data=data)
        if result["type"] != "create_entry":
            raise ProvisionError(result.get("reason", "failed"), "Zone not created")
        return result["result"]
    except Exception:
        await _remove_entries(hass, managed)
        raise


async def async_remove_managed(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await _remove_entries(hass, list(entry.data.get(CONF_MANAGED_ENTRIES, [])))
