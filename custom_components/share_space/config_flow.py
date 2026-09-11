"""Config flow for Share Space."""
from __future__ import annotations

from homeassistant import config_entries

from .const import DOMAIN


class ShareSpaceConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Share Space."""

    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None):
        """Handle the initial step: single-instance setup, no fields needed."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title="Share Space", data={})

        return self.async_show_form(step_id="user")
