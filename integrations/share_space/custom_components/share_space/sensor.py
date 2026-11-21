"""Per-area planning timestamp sensors: next_on, next_off, previous_off."""
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .area_schedule import compute_area_schedule
from .const import DATA_PERSON_AREA_STORE, DATA_PERSON_CALENDAR_STORE, DOMAIN
from .occupancy import next_off, next_on, previous_off
from .planning import AreaPlanningMixin, setup_dynamic_areas

_SENSORS: dict[str, tuple[str, Callable]] = {
    "next_on": ("next on", next_on),
    "next_off": ("next off", next_off),
    "previous_off": ("previous off", previous_off),
}


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    data = hass.data[DOMAIN][entry.entry_id]
    factories = [
        (lambda area, s=suffix: AreaPlanningTimestampSensor(entry, data, area, s)) for suffix in _SENSORS
    ]
    setup_dynamic_areas(hass, entry, data, async_add_entities, factories)


class AreaPlanningTimestampSensor(AreaPlanningMixin, SensorEntity):
    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, entry: ConfigEntry, data: dict, area_id: str, suffix: str) -> None:
        self._data = data
        self._area_id = area_id
        self._label, self._fn = _SENSORS[suffix]
        self._attr_unique_id = f"{entry.entry_id}_{area_id}_{suffix}"
        self.entity_id = f"sensor.{DOMAIN}_{area_id}_{suffix}"
        self._attr_native_value: datetime | None = None

    def _compute(self) -> datetime | None:
        schedule = compute_area_schedule(
            self._data[DATA_PERSON_AREA_STORE], self._data[DATA_PERSON_CALENDAR_STORE], self._area_id
        )
        value = self._fn(schedule, dt_util.now())
        return dt_util.as_utc(value) if value else None

    @callback
    def _refresh(self, *_) -> None:
        self._attr_native_value = self._compute()
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        self._attr_native_value = self._compute()
        self._wire_refresh()
