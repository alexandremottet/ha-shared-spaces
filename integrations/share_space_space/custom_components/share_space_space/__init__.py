"""Share Space Space: isometric floor plan panel with interactive hotspots."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.loader import IntegrationNotFound, async_get_integration
from homeassistant.setup import async_setup_component

from . import websocket_api
from .const import DATA_STORE, DOMAIN
from .home import async_open_share_space_once
from .panel import async_register_space_panel, async_register_static, async_remove_space_panel
from .store import FloorplanStore

HEATING_DOMAIN = "share_space_heating"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    websocket_api.async_register(hass)
    await async_register_static(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store = FloorplanStore(hass)
    await store.async_load()
    hass.data[DOMAIN] = {DATA_STORE: store}
    await async_register_space_panel(hass)
    await async_open_share_space_once(hass, store)
    # Settings creates the first heating zone: load heating even before it has one
    try:
        await async_get_integration(hass, HEATING_DOMAIN)
    except IntegrationNotFound:
        pass
    else:
        await async_setup_component(hass, HEATING_DOMAIN, {})
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    async_remove_space_panel(hass)
    hass.data.pop(DOMAIN, None)
    return True
