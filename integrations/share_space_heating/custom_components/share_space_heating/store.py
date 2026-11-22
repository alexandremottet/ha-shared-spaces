"""Persist per-zone overrides."""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY_OVERRIDES, STORAGE_KEY_STRATEGIES, STORAGE_VERSION


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


STARTERS_FILE = Path(__file__).parent / "starters.json"


def _read_starters() -> list[dict]:
    return json.loads(STARTERS_FILE.read_text())


class StrategyStore:
    """Shared rule strategies: `{id: {name, rules, previous}}`."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store: Store[dict] = Store(hass, STORAGE_VERSION, STORAGE_KEY_STRATEGIES)
        self._data: dict = {}

    async def async_load(self) -> None:
        stored = await self._store.async_load()
        if stored is not None:
            self._data = stored
            return
        # first run only: seed the starters, later deletions stay deleted
        starters = await self._hass.async_add_executor_job(_read_starters)
        self._data = {s["id"]: {"name": s["name"], "rules": s["rules"], "previous": None} for s in starters}
        await self._store.async_save(self._data)

    def all(self) -> list[dict]:
        items = [{"id": key, **value} for key, value in self._data.items()]
        return sorted(items, key=lambda item: item["name"].casefold())

    def get(self, strategy_id: str) -> dict | None:
        value = self._data.get(strategy_id)
        return {"id": strategy_id, **value} if value is not None else None

    async def async_save(self, strategy_id: str | None, name: str, rules: dict, previous: dict | None) -> str:
        strategy_id = strategy_id or uuid.uuid4().hex
        self._data[strategy_id] = {"name": name, "rules": rules, "previous": previous}
        await self._store.async_save(self._data)
        return strategy_id

    async def async_delete(self, strategy_id: str) -> bool:
        if self._data.pop(strategy_id, None) is None:
            return False
        await self._store.async_save(self._data)
        return True
