"""Make Share Space the page Home Assistant opens after login, once, when installed."""
from __future__ import annotations

from homeassistant.components.frontend.storage import async_system_store
from homeassistant.core import HomeAssistant

from .const import PANEL_URL_PATH
from .store import FloorplanStore


async def async_open_share_space_once(hass: HomeAssistant, store: FloorplanStore) -> None:
    """Set HA's system default panel to Share Space the first time, unless an admin already chose one."""
    if store.home_set:
        return
    system = await async_system_store(hass)
    core = dict(system.data.get("core") or {})
    if not core.get("default_panel"):
        core["default_panel"] = PANEL_URL_PATH
        await system.async_set_item("core", core)
    await store.async_mark_home_set()
