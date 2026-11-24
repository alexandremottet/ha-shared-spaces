"""People and their plannings, held in Home Assistant itself.

A person's area is the `person` entity's own HA area. A person's weekly planning is an HA
Schedule helper; Share Space only keeps which helper belongs to which person. What older
versions kept in Share Space's own storage is still read, and moves into HA the first time
it is edited in Share Space.
"""
from __future__ import annotations

from collections.abc import Callable

from homeassistant.components.websocket_api.const import DOMAIN as WS_DOMAIN
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store

from .calendar_types import WEEK_DAYS
from .const import (
    STORAGE_KEY_PERSON_AREAS,
    STORAGE_KEY_PERSON_CALENDARS,
    STORAGE_KEY_PERSON_PLANNINGS,
    STORAGE_VERSION,
)

SCHEDULE_ICON = "mdi:calendar-account"


class PersonAreas:
    """Which HA area each `person` entity is in, read from and written to the entity registry."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._legacy_store: Store[dict] = Store(hass, STORAGE_VERSION, STORAGE_KEY_PERSON_AREAS)
        self._legacy: dict[str, str] = {}

    async def async_load(self) -> None:
        self._legacy = await self._legacy_store.async_load() or {}

    def _registry(self) -> er.EntityRegistry:
        return er.async_get(self._hass)

    def _all(self) -> dict[str, str]:
        out = {p: a for p, a in self._legacy.items() if a}
        for e in self._registry().entities.values():
            if e.domain == "person" and e.area_id:
                out[e.entity_id] = e.area_id
        return out

    def get(self, person: str) -> str | None:
        return self._all().get(person)

    def persons_in_area(self, area: str) -> list[str]:
        return sorted(p for p, a in self._all().items() if a == area)

    def areas(self) -> set[str]:
        return set(self._all().values())

    async def async_set(self, person: str, area: str | None) -> None:
        registry = self._registry()
        if registry.async_get(person) is None:
            raise ServiceValidationError(f"{person} is not a person Home Assistant can give an area to")
        if area and ar.async_get(self._hass).async_get_area(area) is None:
            raise ServiceValidationError(f"Unknown area {area}")
        registry.async_update_entity(person, area_id=area or None)
        if self._legacy.pop(person, None) is not None:
            await self._legacy_store.async_save(self._legacy)


def _schedule_collection(hass: HomeAssistant):
    """The Schedule integration's storage collection (the one its own `schedule/*` commands edit)."""
    handler = hass.data.get(WS_DOMAIN, {}).get("schedule/list", (None,))[0]
    collection = getattr(getattr(handler, "__self__", None), "storage_collection", None)
    if collection is None:
        raise HomeAssistantError("The Home Assistant Schedule integration is not loaded")
    return collection


def _hhmm(value: str) -> str:
    return value[:5]


def _to_calendar(item: dict) -> dict:
    return {
        day.value: [{"start": _hhmm(r["from"]), "end": _hhmm(r["to"])} for r in item.get(day.value) or []]
        for day in WEEK_DAYS
        if item.get(day.value)
    }


def _merged(ranges: list[dict]) -> list[dict]:
    """Schedule helpers refuse overlapping ranges: join the ones that overlap or touch."""
    out: list[dict] = []
    for r in sorted(ranges, key=lambda r: r["start"]):
        if out and r["start"] <= out[-1]["end"]:
            out[-1]["end"] = max(out[-1]["end"], r["end"])
        else:
            out.append(dict(r))
    return out


def _to_schedule_days(calendar: dict) -> dict:
    return {
        day.value: [{"from": f"{r['start']}:00", "to": f"{r['end']}:00"} for r in _merged(calendar.get(day.value) or [])]
        for day in WEEK_DAYS
    }


class PersonPlannings:
    """Each person's weekly planning, kept in an HA Schedule helper."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store: Store[dict] = Store(hass, STORAGE_VERSION, STORAGE_KEY_PERSON_PLANNINGS)
        self._links: dict[str, str] = {}
        self._legacy_store: Store[dict] = Store(hass, STORAGE_VERSION, STORAGE_KEY_PERSON_CALENDARS)
        self._legacy: dict[str, dict] = {}

    async def async_load(self) -> None:
        self._links = await self._store.async_load() or {}
        self._legacy = await self._legacy_store.async_load() or {}

    def _item(self, person: str) -> dict | None:
        item_id = self._links.get(person)
        return _schedule_collection(self._hass).data.get(item_id) if item_id else None

    def get(self, person: str) -> dict | None:
        item = self._item(person)
        return _to_calendar(item) if item else self._legacy.get(person)

    def schedule_entity(self, person: str) -> str | None:
        item_id = self._links.get(person)
        return er.async_get(self._hass).async_get_entity_id("schedule", "schedule", item_id) if item_id else None

    def _person_name(self, person: str) -> str:
        state = self._hass.states.get(person)
        if state and state.name:
            return state.name
        entry = er.async_get(self._hass).async_get(person)
        return (entry and (entry.name or entry.original_name)) or person.split(".", 1)[1].replace("_", " ").title()

    async def async_set(self, person: str, calendar: dict) -> None:
        collection = _schedule_collection(self._hass)
        days = _to_schedule_days(calendar)
        item = self._item(person)
        if item is not None:
            kept = {k: v for k, v in item.items() if k in ("name", "icon")}
            await collection.async_update_item(item["id"], kept | days)
            return
        created = await collection.async_create_item({"name": f"Planning {self._person_name(person)}", "icon": SCHEDULE_ICON, **days})
        self._links[person] = created["id"]
        await self._store.async_save(self._links)
        if self._legacy.pop(person, None) is not None:
            await self._legacy_store.async_save(self._legacy)

    @callback
    def async_listen(self, on_change: Callable[[], None]) -> Callable[[], None]:
        """Call `on_change` when a linked Schedule helper is edited, here or in HA's own pages."""

        async def _changed(change_type: str, item_id: str, _config: dict) -> None:
            if item_id in self._links.values():
                if change_type == "removed":
                    self._links = {p: i for p, i in self._links.items() if i != item_id}
                    await self._store.async_save(self._links)
                on_change()

        return _schedule_collection(self._hass).async_add_listener(_changed)
