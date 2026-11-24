"""Persist small keyed JSON blobs via Home Assistant's storage helper."""
from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import (
    STORAGE_KEY_AREA_ACTIONS,
    STORAGE_VERSION_AREA_ACTIONS,
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


class AreaActionsStore(_KeyedStore):
    """Legacy `{area_id: {on_actions, off_actions, enabled}}`, run until the panel moves them into an HA automation."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__(hass, STORAGE_VERSION_AREA_ACTIONS, STORAGE_KEY_AREA_ACTIONS, _AreaActionsMigratingStore)

    def get_actions(self, area: str) -> dict:
        return {"on_actions": [], "off_actions": [], "enabled": True} | (self._data.get(area) or {})

    def has(self, area: str) -> bool:
        return area in self._data

    async def async_forget(self, area: str) -> None:
        if self._data.pop(area, None) is not None:
            await self._store.async_save(self._data)
