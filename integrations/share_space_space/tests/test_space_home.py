"""Share Space becomes the page HA opens after login when installed, once."""
from homeassistant.components.frontend.storage import async_system_store
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.share_space_space.const import DOMAIN, PANEL_URL_PATH


async def _setup(hass):
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def _default_panel(hass):
    return ((await async_system_store(hass)).data.get("core") or {}).get("default_panel")


async def test_install_opens_share_space_for_everyone(hass):
    await _setup(hass)
    assert await _default_panel(hass) == PANEL_URL_PATH


async def test_admin_turning_it_off_sticks_across_restarts(hass):
    entry = await _setup(hass)
    system = await async_system_store(hass)
    await system.async_set_item("core", {})
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert await _default_panel(hass) is None


async def test_keeps_a_default_page_an_admin_already_chose(hass):
    system = await async_system_store(hass)
    await system.async_set_item("core", {"default_panel": "lovelace", "other": 1})
    await _setup(hass)
    assert (await async_system_store(hass)).data["core"] == {"default_panel": "lovelace", "other": 1}
