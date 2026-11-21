"""Persist per-zone overrides."""
from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY_OVERRIDES, STORAGE_VERSION


class OverrideStore:
    """`{entry_id: {temp, until}}` in a single JSON-backed store."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict] = Store(hass, STORAGE_VERSION, STORAGE_KEY_OVERRIDES)
        self._data: dict = {}

    async def async_load(self) -> None:
        self._data = await self._store.async_load() or {}

    def get(self, entry_id: str) -> dict | None:
        return self._data.get(entry_id)

    async def async_set(self, entry_id: str, value: dict) -> None:
        self._data[entry_id] = value
        await self._store.async_save(self._data)

    async def async_delete(self, entry_id: str) -> None:
        if self._data.pop(entry_id, None) is not None:
            await self._store.async_save(self._data)
