"""Sign-out-all button: revokes login sessions only, and only for admins."""
import pytest
from homeassistant.auth.models import TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN
from homeassistant.components.frontend.storage import async_system_store, async_user_store
from homeassistant.core import Context
from homeassistant.exceptions import Unauthorized
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.share_space.const import DOMAIN

ENTITY_ID = "button.share_space_sign_out_all_users"


@pytest.fixture
async def entry(hass):
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def _press(hass, user):
    await hass.services.async_call(
        "button", "press", {"entity_id": ENTITY_ID}, blocking=True, context=Context(user_id=user.id)
    )


async def test_press_revokes_sessions_but_keeps_long_lived_tokens(hass, entry, hass_admin_user):
    phone = await hass.auth.async_create_refresh_token(hass_admin_user, "https://home-assistant.io/iOS")
    browser = await hass.auth.async_create_refresh_token(hass_admin_user, "http://example.local/")
    long_lived = await hass.auth.async_create_refresh_token(
        hass_admin_user, client_name="deploy", token_type=TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN
    )

    await _press(hass, hass_admin_user)

    assert hass.auth.async_get_refresh_token(phone.id) is None
    assert hass.auth.async_get_refresh_token(browser.id) is None
    assert hass.auth.async_get_refresh_token(long_lived.id) is not None


async def test_non_admin_cannot_press(hass, entry, hass_read_only_user):
    session = await hass.auth.async_create_refresh_token(hass_read_only_user, "http://example.local/")

    with pytest.raises(Unauthorized):
        await _press(hass, hass_read_only_user)

    assert hass.auth.async_get_refresh_token(session.id) is not None


async def test_press_makes_share_space_everyone_s_default_dashboard(hass, entry, hass_admin_user, hass_read_only_user):
    system = await async_system_store(hass)
    await system.async_set_item("core", {"default_panel": "lovelace", "other": 1})
    own = await async_user_store(hass, hass_read_only_user.id)
    await own.async_set_item("core", {"default_panel": "energy", "theme": "dark"})

    await _press(hass, hass_admin_user)

    assert system.data["core"] == {"default_panel": "share-space", "other": 1}
    assert own.data["core"] == {"theme": "dark"}
