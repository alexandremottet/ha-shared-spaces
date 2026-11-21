"""Drive the config flow exactly like the 'Add Integration' UI does (real flow manager, not MockConfigEntry)."""
from custom_components.share_space.const import DOMAIN


async def test_start_config_flow_via_ui_path(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] == "form"


async def test_submit_config_flow_via_ui_path(hass):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    await hass.async_block_till_done()
    assert result["type"] == "create_entry"
