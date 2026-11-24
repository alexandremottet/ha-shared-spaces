"""Persist floor plans."""
from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY_FLOORPLANS, STORAGE_VERSION


class FloorplanStore:
    """`{plans: [Floorplan]}` in a single JSON-backed store."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict] = Store(hass, STORAGE_VERSION, STORAGE_KEY_FLOORPLANS)
        self._plans: list[dict] = []
        self._home_set = False

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self._plans = list(data.get("plans", []))
        self._home_set = bool(data.get("home_set"))

    @property
    def plans(self) -> list[dict]:
        return list(self._plans)

    @property
    def home_set(self) -> bool:
        """Share Space was made HA's home page once: never again, so turning it off sticks."""
        return self._home_set

    async def async_mark_home_set(self) -> None:
        self._home_set = True
        await self._async_save()

    async def _async_save(self) -> None:
        await self._store.async_save({"plans": self._plans, "home_set": self._home_set})

    async def async_upsert(self, plan: dict) -> dict:
        for i, existing in enumerate(self._plans):
            if existing["id"] == plan["id"]:
                self._plans[i] = plan
                break
        else:
            self._plans.append(plan)
        await self._async_save()
        return plan

    async def async_delete(self, plan_id: str) -> bool:
        kept = [p for p in self._plans if p["id"] != plan_id]
        if len(kept) == len(self._plans):
            return False
        self._plans = kept
        await self._async_save()
        return True
