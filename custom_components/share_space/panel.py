"""Register the Share Space sidebar panel."""
from __future__ import annotations

from homeassistant.components.panel_custom import async_register_panel
from homeassistant.core import HomeAssistant

from .const import (
    FRONTEND_SCRIPT_URL,
    PANEL_SIDEBAR_ICON,
    PANEL_SIDEBAR_TITLE,
    PANEL_URL_PATH,
    PANEL_WEBCOMPONENT_NAME,
)


async def async_register_share_space_panel(hass: HomeAssistant) -> None:
    """Register the sidebar panel, served from the same bundle as the card."""
    await async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_WEBCOMPONENT_NAME,
        sidebar_title=PANEL_SIDEBAR_TITLE,
        sidebar_icon=PANEL_SIDEBAR_ICON,
        module_url=FRONTEND_SCRIPT_URL,
        require_admin=False,
    )
