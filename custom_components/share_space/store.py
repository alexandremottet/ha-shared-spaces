"""Persist small keyed JSON blobs via Home Assistant's storage helper."""
from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    STORAGE_KEY_AREA_ACTIONS,
    STORAGE_KEY_AREA_SCHEDULER_LINKS,
    STORAGE_KEY_PERSON_AREAS,
    STORAGE_KEY_PERSON_CALENDARS,
    STORAGE_VERSION,
)


class _KeyedStore:
    """Loads/saves a `{key: value}` dict as a single JSON-backed store."""

    def __init__(self, hass: HomeAssistant, version: int, key: str) -> None:
        self._store: Store[dict] = Store(hass, version, key)
        self._data: dict = {}

    async def async_load(self) -> None:
        self._data = await self._store.async_load() or {}

    def get(self, item_key: str):
        return self._data.get(item_key)

    async def async_set(self, item_key: str, value) -> None:
        self._data[item_key] = value
        await self._store.async_save(self._data)


class PersonCalendarStore(_KeyedStore):
    """`{person_entity_id: calendar}`. Each person owns and edits exactly one calendar."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, STORAGE_VERSION, STORAGE_KEY_PERSON_CALENDARS)


class PersonAreaStore(_KeyedStore):
    """`{person_entity_id: area}`. Many persons may share the same area."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, STORAGE_VERSION, STORAGE_KEY_PERSON_AREAS)

    def persons_in_area(self, area: str) -> list[str]:
        return [person for person, assigned_area in self._data.items() if assigned_area == area]


class AreaActionStore(_KeyedStore):
    """`{area: {"on_action": [...], "off_action": [...]}}`. HA action lists (as produced by the
    `action` selector), one area owns at most one pair -- run when its merged schedule turns
    the area's presence on/off."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, STORAGE_VERSION, STORAGE_KEY_AREA_ACTIONS)


class AreaSchedulerLinkStore(_KeyedStore):
    """`{area: [scheduler switch entity_ids]}`. The scheduler-component schedules we created to
    realize an area's merged calendar, so a later re-sync can edit/remove exactly those rather
    than guessing or accumulating duplicates."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, STORAGE_VERSION, STORAGE_KEY_AREA_SCHEDULER_LINKS)
