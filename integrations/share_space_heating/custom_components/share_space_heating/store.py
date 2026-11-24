"""Persist per-zone overrides."""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import label_registry as lr
from homeassistant.helpers.storage import Store

from .const import (
    STORAGE_KEY_OVERRIDES,
    STORAGE_KEY_SETTINGS,
    STORAGE_KEY_STARTERS_OFFERED,
    STORAGE_KEY_STRATEGIES,
    STORAGE_VERSION,
)


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
# Starters shipped before offered ids were tracked: a store from then already had its chance at them.
_LEGACY_STARTERS = ["office_saver", "lunch_room"]


def _read_starters() -> list[dict]:
    return json.loads(STARTERS_FILE.read_text())


class StrategyStore:
    """Shared rule strategies: `{id: {name, rules, previous}}`."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store: Store[dict] = Store(hass, STORAGE_VERSION, STORAGE_KEY_STRATEGIES)
        self._offered_store: Store[list] = Store(hass, STORAGE_VERSION, STORAGE_KEY_STARTERS_OFFERED)
        self._data: dict = {}

    async def async_load(self) -> None:
        stored = await self._store.async_load()
        offered = await self._offered_store.async_load()
        self._data = stored or {}
        if offered is None:
            offered = _LEGACY_STARTERS if stored is not None else []
        # each starter is offered once: new ones reach existing installs, deleted ones stay deleted
        starters = await self._hass.async_add_executor_job(_read_starters)
        new = [s for s in starters if s["id"] not in offered and s["id"] not in self._data]
        for s in new:
            self._data[s["id"]] = {"name": s["name"], "rules": s["rules"], "previous": None}
        if new or stored is None:
            await self._store.async_save(self._data)
        all_ids = sorted({*offered, *(s["id"] for s in starters)})
        if all_ids != sorted(offered):
            await self._offered_store.async_save(all_ids)

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


NOT_MANAGED_LABEL = "Share Space: not managed"


class SettingsStore:
    """Space-wide heating settings: `{outdoor_entity}`; areas not managed are an HA label."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store: Store[dict] = Store(hass, STORAGE_VERSION, STORAGE_KEY_SETTINGS)
        self._data: dict = {}

    async def async_load(self) -> None:
        self._data = await self._store.async_load() or {}

    @property
    def outdoor_entity(self) -> str | None:
        return self._data.get("outdoor_entity")

    async def async_set_outdoor_entity(self, entity_id: str | None) -> None:
        self._data["outdoor_entity"] = entity_id
        await self._store.async_save(self._data)

    @property
    def ignored_areas(self) -> list[str]:
        """Areas carrying the "not managed" HA label: Share Space does not set their heating up."""
        label = lr.async_get(self._hass).async_get_label_by_name(NOT_MANAGED_LABEL)
        if label is None:
            return []
        return sorted(a.id for a in ar.async_get(self._hass).areas.values() if label.label_id in a.labels)

    async def async_set_ignored(self, area_id: str, ignored: bool) -> None:
        areas = ar.async_get(self._hass)
        area = areas.async_get_area(area_id)
        labels = lr.async_get(self._hass)
        label = labels.async_get_label_by_name(NOT_MANAGED_LABEL)
        if area is None or (label is None and not ignored):
            return
        if label is None:
            label = labels.async_create(
                NOT_MANAGED_LABEL, icon="mdi:radiator-off", description="Share Space does not set up heating in these areas."
            )
        wanted = set(area.labels) | {label.label_id} if ignored else set(area.labels) - {label.label_id}
        if wanted != set(area.labels):
            areas.async_update(area_id, labels=wanted)

    async def async_migrate(self) -> None:
        """Ignored areas used to be kept here; they are an HA label now."""
        old = self._data.pop("ignored_areas", None)
        if old is None:
            return
        for area_id in old:
            await self.async_set_ignored(area_id, True)
        await self._store.async_save(self._data)
