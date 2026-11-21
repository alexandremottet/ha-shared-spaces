"""Per-area occupancy binary sensor driven by the merged person calendars."""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Context, HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_change, async_track_time_interval
from homeassistant.helpers.script import Script
from homeassistant.util import dt as dt_util

from .area_schedule import compute_area_schedule
from .const import (
    DATA_AREA_ACTIONS_STORE,
    DATA_AREA_LOCKS,
    DATA_PERSON_AREA_STORE,
    DATA_PERSON_CALENDAR_STORE,
    DOMAIN,
    SIGNAL_AREAS_CHANGED,
    SIGNAL_CALENDAR_CHANGED,
)
from .occupancy import compact_schedule, is_occupied, next_change, occupied_today, occupied_tomorrow
from .planning import AreaPlanningMixin, setup_dynamic_areas

_LOGGER = logging.getLogger(__name__)


async def async_run_area_actions(hass: HomeAssistant, data: dict, area: str, state: str) -> None:
    """Run the area's on/off action list; errors are logged, never raised."""
    config = data[DATA_AREA_ACTIONS_STORE].get_actions(area)
    actions = config["on_actions" if state == "on" else "off_actions"]
    if not actions:
        return
    lock = data[DATA_AREA_LOCKS].setdefault(area, asyncio.Lock())
    try:
        async with lock:
            script = Script(hass, actions, f"Share Space {area}", DOMAIN)
            await script.async_run(run_variables={"area": area, "state": state}, context=Context())
    except Exception:  # noqa: BLE001
        _LOGGER.exception("Share Space actions for area %s (%s) failed", area, state)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    data = hass.data[DOMAIN][entry.entry_id]
    factories = [
        lambda area: AreaOccupancySensor(entry, data, area),
        lambda area: AreaPlanningBinarySensor(entry, data, area, "occupied_today"),
        lambda area: AreaPlanningBinarySensor(entry, data, area, "occupied_tomorrow"),
    ]
    setup_dynamic_areas(hass, entry, data, async_add_entities, factories)


class AreaOccupancySensor(BinarySensorEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_device_class = BinarySensorDeviceClass.OCCUPANCY

    def __init__(self, entry: ConfigEntry, data: dict, area_id: str) -> None:
        self._entry = entry
        self._data = data
        self._area_id = area_id
        self._attr_unique_id = f"{entry.entry_id}_{area_id}"
        self.entity_id = f"binary_sensor.{DOMAIN}_{area_id}"
        self._attr_is_on = None
        self._attr_extra_state_attributes = {"persons": [], "next_change": None, "schedule": compact_schedule({})}

    @property
    def name(self) -> str:
        area = ar.async_get(self.hass).async_get_area(self._area_id)
        return area.name if area else self._area_id

    def _compute(self) -> tuple[bool, dict]:
        now = dt_util.now()
        schedule = compute_area_schedule(
            self._data[DATA_PERSON_AREA_STORE], self._data[DATA_PERSON_CALENDAR_STORE], self._area_id
        )
        following = next_change(schedule, now)
        attrs = {
            "persons": self._data[DATA_PERSON_AREA_STORE].persons_in_area(self._area_id),
            "next_change": following.isoformat() if following else None,
            "schedule": compact_schedule(schedule),
        }
        return is_occupied(schedule, now), attrs

    @callback
    def _refresh(self, *_) -> None:
        previous = self._attr_is_on
        self._attr_is_on, self._attr_extra_state_attributes = self._compute()
        self.async_write_ha_state()
        if previous is not None and previous != self._attr_is_on:
            state = "on" if self._attr_is_on else "off"
            if self._data[DATA_AREA_ACTIONS_STORE].get_actions(self._area_id)["enabled"]:
                self._entry.async_create_background_task(
                    self.hass,
                    async_run_area_actions(self.hass, self._data, self._area_id, state),
                    f"{DOMAIN}_{self._area_id}_{state}_actions",
                )

    async def async_added_to_hass(self) -> None:
        self._attr_is_on, self._attr_extra_state_attributes = self._compute()
        self.async_on_remove(async_track_time_interval(self.hass, self._refresh, timedelta(minutes=1)))
        self.async_on_remove(async_track_time_change(self.hass, self._refresh, minute=[0, 30], second=0))
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL_CALENDAR_CHANGED, self._refresh))


_PLANNING = {
    "occupied_today": ("occupied today", occupied_today),
    "occupied_tomorrow": ("occupied tomorrow", occupied_tomorrow),
}


class AreaPlanningBinarySensor(AreaPlanningMixin, BinarySensorEntity):
    def __init__(self, entry: ConfigEntry, data: dict, area_id: str, suffix: str) -> None:
        self._data = data
        self._area_id = area_id
        self._label, self._fn = _PLANNING[suffix]
        self._attr_unique_id = f"{entry.entry_id}_{area_id}_{suffix}"
        self.entity_id = f"binary_sensor.{DOMAIN}_{area_id}_{suffix}"
        self._attr_is_on = None

    def _compute(self) -> bool:
        schedule = compute_area_schedule(
            self._data[DATA_PERSON_AREA_STORE], self._data[DATA_PERSON_CALENDAR_STORE], self._area_id
        )
        return self._fn(schedule, dt_util.now())

    @callback
    def _refresh(self, *_) -> None:
        self._attr_is_on = self._compute()
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        self._attr_is_on = self._compute()
        self._wire_refresh()
