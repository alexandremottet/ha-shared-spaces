"""Shared plumbing for per-area planning entities (dynamic creation, refresh cadence)."""
from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_change, async_track_time_interval

from .const import DATA_PERSON_AREA_STORE, SIGNAL_AREAS_CHANGED, SIGNAL_CALENDAR_CHANGED


def setup_dynamic_areas(
    hass: HomeAssistant,
    entry: ConfigEntry,
    data: dict,
    async_add_entities: AddEntitiesCallback,
    factories: list[Callable[[str], object]],
) -> None:
    known: set[str] = set()

    @callback
    def _add_missing() -> None:
        new = set(data[DATA_PERSON_AREA_STORE]._data.values()) - known
        known.update(new)
        async_add_entities([factory(area) for area in sorted(new) for factory in factories])

    _add_missing()
    entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL_AREAS_CHANGED, _add_missing))


class AreaPlanningMixin:
    """Subclasses define `_refresh` and `_compute_state`; this wires the shared refresh triggers."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _area_id: str
    _suffix: str = ""
    _label: str = ""

    @property
    def name(self) -> str:
        area = ar.async_get(self.hass).async_get_area(self._area_id)
        base = area.name if area else self._area_id
        return f"{base} {self._label}".strip()

    def _wire_refresh(self) -> None:
        self.async_on_remove(async_track_time_interval(self.hass, self._refresh, timedelta(minutes=1)))
        self.async_on_remove(async_track_time_change(self.hass, self._refresh, minute=[0, 30], second=0))
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL_CALENDAR_CHANGED, self._refresh))
