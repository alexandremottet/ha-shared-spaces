"""Register the Share Space Space sidebar panel."""
from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import async_remove_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.panel_custom import async_register_panel
from homeassistant.core import HomeAssistant

from .const import (
    FRONTEND_JS_FILENAME,
    FRONTEND_SCRIPT_URL,
    PANEL_SIDEBAR_ICON,
    PANEL_SIDEBAR_TITLE,
    PANEL_URL_PATH,
    PANEL_WEBCOMPONENT_NAME,
)


async def async_register_static(hass: HomeAssistant) -> None:
    path = Path(__file__).parent / "frontend" / FRONTEND_JS_FILENAME
    await hass.http.async_register_static_paths(
        [StaticPathConfig(FRONTEND_SCRIPT_URL, str(path), cache_headers=False)]
    )


async def async_register_space_panel(hass: HomeAssistant) -> None:
    await async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_WEBCOMPONENT_NAME,
        sidebar_title=PANEL_SIDEBAR_TITLE,
        sidebar_icon=PANEL_SIDEBAR_ICON,
        module_url=FRONTEND_SCRIPT_URL,
        require_admin=False,
    )


def async_remove_space_panel(hass: HomeAssistant) -> None:
    async_remove_panel(hass, PANEL_URL_PATH)
