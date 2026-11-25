"""Admin button that signs every user out, phones included, so everyone signs back in on Share Space."""
from __future__ import annotations

import logging

from homeassistant.auth.models import TOKEN_TYPE_NORMAL
from homeassistant.components.button import ButtonEntity
from homeassistant.components.frontend.storage import async_system_store, async_user_store
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, SPACE_PANEL

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    async_add_entities([LogoutAllUsersButton(entry)])


async def async_open_share_space_for_everyone(hass: HomeAssistant) -> None:
    """Make Share Space HA's default dashboard and drop each person's own choice, which would win over it."""
    system = await async_system_store(hass)
    await system.async_set_item("core", {**(system.data.get("core") or {}), "default_panel": SPACE_PANEL})
    for user in await hass.auth.async_get_users():
        if user.system_generated:
            continue
        store = await async_user_store(hass, user.id)
        core = store.data.get("core")
        if isinstance(core, dict) and "default_panel" in core:
            await store.async_set_item("core", {k: v for k, v in core.items() if k != "default_panel"})


async def async_logout_all_users(hass: HomeAssistant) -> int:
    """Revoke every login session; long-lived tokens and system users keep working."""
    removed = 0
    for user in await hass.auth.async_get_users():
        for token in list(user.refresh_tokens.values()):
            if token.token_type == TOKEN_TYPE_NORMAL:
                hass.auth.async_remove_refresh_token(token)
                removed += 1
    return removed


class LogoutAllUsersButton(ButtonEntity):
    _attr_has_entity_name = True
    _attr_translation_key = "logout_all_users"
    _attr_entity_category = EntityCategory.CONFIG
    _attr_icon = "mdi:logout"

    def __init__(self, entry: ConfigEntry) -> None:
        self._attr_unique_id = f"{entry.entry_id}_logout_all_users"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="Share Space",
            entry_type=DeviceEntryType.SERVICE,
        )

    async def async_press(self) -> None:
        # Entity permissions let any non-admin press buttons, so gate on admin here.
        user_id = self._context.user_id if self._context else None
        if user_id is not None:
            user = await self.hass.auth.async_get_user(user_id)
            if user is None or not user.is_admin:
                raise Unauthorized(context=self._context)
        await async_open_share_space_for_everyone(self.hass)
        removed = await async_logout_all_users(self.hass)
        _LOGGER.warning("Signed out all users: %d sessions revoked", removed)
