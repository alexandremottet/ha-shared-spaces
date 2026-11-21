"""Persist small keyed JSON blobs via Home Assistant's storage helper."""
from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    STORAGE_KEY_AREA_ACTIONS,
    STORAGE_VERSION_AREA_ACTIONS,
    STORAGE_KEY_PERSON_AREAS,
    STORAGE_KEY_PERSON_CALENDARS,
    STORAGE_VERSION,
)


def _as_action_list(value) -> list:
    if not value:
        return []
    return value if isinstance(value, list) else [value]


class _AreaActionsMigratingStore(Store):
    async def _async_migrate_func(self, old_major_version, old_minor_version, old_data):
        if old_major_version < 2:
            return {
                area: {
                    "on_actions": _as_action_list(item.get("on_action")),
                    "off_actions": _as_action_list(item.get("off_action")),
                    "enabled": True,
                }
                for area, item in (old_data or {}).items()
                if isinstance(item, dict)
            }
        return old_data


class _KeyedStore:
    """Loads/saves a `{key: value}` dict as a single JSON-backed store."""

    def __init__(self, hass: HomeAssistant, version: int, key: str, store_cls=Store) -> None:
        self._store: Store[dict] = store_cls(hass, version, key)
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


class AreaActionsStore(_KeyedStore):
    """`{area_id: {on_actions, off_actions, enabled}}`."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, STORAGE_VERSION_AREA_ACTIONS, STORAGE_KEY_AREA_ACTIONS, _AreaActionsMigratingStore)

    def get_actions(self, area: str) -> dict:
        return {"on_actions": [], "off_actions": [], "enabled": True} | (self._data.get(area) or {})

    async def async_update(self, area: str, changes: dict) -> None:
        await self.async_set(area, self.get_actions(area) | changes)
