"""Register the Share Space Space sidebar panel."""
from __future__ import annotations

import hashlib
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


def _bundle_hash() -> str:
    path = Path(__file__).parent / "frontend" / FRONTEND_JS_FILENAME
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12] if path.exists() else "0"


async def async_register_space_panel(hass: HomeAssistant) -> None:
    # Content hash in the URL so browsers drop a stale bundle after each update.
    version = await hass.async_add_executor_job(_bundle_hash)
    await async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_WEBCOMPONENT_NAME,
        sidebar_title=PANEL_SIDEBAR_TITLE,
        sidebar_icon=PANEL_SIDEBAR_ICON,
        module_url=f"{FRONTEND_SCRIPT_URL}?v={version}",
        require_admin=False,
    )


def async_remove_space_panel(hass: HomeAssistant) -> None:
    async_remove_panel(hass, PANEL_URL_PATH)
