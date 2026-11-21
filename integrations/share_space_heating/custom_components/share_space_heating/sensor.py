"""Zone sensor: state is the effective target temperature."""
from __future__ import annotations

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import slugify

from .const import DATA_ZONES, DOMAIN
from .zone import Zone


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([ZoneSensor(hass, entry, hass.data[DOMAIN][DATA_ZONES][entry.entry_id])])


class ZoneSensor(SensorEntity):
    _attr_device_class = SensorDeviceClass.TEMPERATURE
    _attr_should_poll = False

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, zone: Zone) -> None:
        self._zone = zone
        self._attr_unique_id = entry.entry_id
        self._attr_name = entry.title
        self._attr_native_unit_of_measurement = hass.config.units.temperature_unit
        self.entity_id = f"sensor.{DOMAIN}_{slugify(entry.title)}"

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._zone.async_add_listener(self.async_write_ha_state))

    @property
    def native_value(self) -> float:
        return self._zone.target

    @property
    def extra_state_attributes(self) -> dict:
        zone = self._zone
        return {
            "mode": zone.mode,
            "active_rule": zone.active_rule,
            "override_until": zone.override_until.isoformat() if zone.override_active else None,
            "override_temp": zone.override_temp,
            "presence": zone.presence,
            "climate_entity": zone.climate_entity,
            "current_temperature": zone.current_temperature,
            "comfort_temp": zone.comfort_temp,
            "eco_temp": zone.eco_temp,
            "frost_temp": zone.frost_temp,
        }
