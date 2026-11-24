"""Config and options flow for Share Space Heating zones."""
from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import selector

from .area import area_entities

from .const import (
    CONF_AREA,
    CONF_COMFORT_TEMP,
    CONF_DEFAULT_OVERRIDE_HOURS,
    CONF_ECO_TEMP,
    CONF_FROST_TEMP,
    CONF_MAX_OVERRIDE_HOURS,
    CONF_OFF_MODE,
    CONF_PRESENCE_ENTITY,
    DEFAULT_COMFORT_TEMP,
    DEFAULT_ECO_TEMP,
    DEFAULT_FROST_TEMP,
    DEFAULT_OFF_MODE,
    DEFAULT_MAX_OVERRIDE_HOURS,
    DEFAULT_OVERRIDE_HOURS,
    DOMAIN,
    OFF_MODES,
)

_TEMP = selector.NumberSelector(
    selector.NumberSelectorConfig(min=5, max=35, step=0.5, mode=selector.NumberSelectorMode.BOX)
)
_HOURS = selector.NumberSelector(
    selector.NumberSelectorConfig(min=0.5, max=72, step=0.5, mode=selector.NumberSelectorMode.BOX)
)
_FROST = selector.NumberSelector(
    selector.NumberSelectorConfig(min=5, max=15, step=0.5, mode=selector.NumberSelectorMode.BOX)
)
_OFF_MODE = selector.SelectSelector(
    selector.SelectSelectorConfig(options=OFF_MODES, translation_key="off_mode")
)
_PRESENCE = selector.EntitySelector(selector.EntitySelectorConfig(domain="binary_sensor"))


def _settings_schema(values: dict) -> dict:
    presence = values.get(CONF_PRESENCE_ENTITY)
    presence_key = (
        vol.Optional(CONF_PRESENCE_ENTITY, description={"suggested_value": presence})
        if presence
        else vol.Optional(CONF_PRESENCE_ENTITY)
    )
    return {
        presence_key: _PRESENCE,
        vol.Required(CONF_COMFORT_TEMP, default=values.get(CONF_COMFORT_TEMP, DEFAULT_COMFORT_TEMP)): _TEMP,
        vol.Required(CONF_ECO_TEMP, default=values.get(CONF_ECO_TEMP, DEFAULT_ECO_TEMP)): _TEMP,
        vol.Required(
            CONF_DEFAULT_OVERRIDE_HOURS,
            default=values.get(CONF_DEFAULT_OVERRIDE_HOURS, DEFAULT_OVERRIDE_HOURS),
        ): _HOURS,
        vol.Required(
            CONF_MAX_OVERRIDE_HOURS,
            default=values.get(CONF_MAX_OVERRIDE_HOURS, DEFAULT_MAX_OVERRIDE_HOURS),
        ): _HOURS,
        vol.Required(CONF_FROST_TEMP, default=values.get(CONF_FROST_TEMP, DEFAULT_FROST_TEMP)): _FROST,
        vol.Required(CONF_OFF_MODE, default=values.get(CONF_OFF_MODE, DEFAULT_OFF_MODE)): _OFF_MODE,
    }


class ShareSpaceHeatingConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """One zone per HA area; its thermostat is whatever HA places in that area."""

    VERSION = 2

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return ShareSpaceHeatingOptionsFlow()

    async def _async_create(self, data: dict):
        area = ar.async_get(self.hass).async_get_area(data[CONF_AREA])
        if area is None:
            return self.async_abort(reason="area_not_found")
        await self.async_set_unique_id(area.id)
        self._abort_if_unique_id_configured()
        data = {**data, CONF_PRESENCE_ENTITY: data.get(CONF_PRESENCE_ENTITY) or None}
        return self.async_create_entry(title=area.name, data=data)

    async def async_step_user(self, user_input: dict | None = None):
        errors: dict[str, str] = {}
        if user_input is not None:
            if area_entities(self.hass, user_input[CONF_AREA], "climate"):
                return await self._async_create(user_input)
            errors["base"] = "no_thermostat"
        schema = {
            vol.Required(CONF_AREA): selector.AreaSelector(),
            **_settings_schema(user_input or {}),
        }
        return self.async_show_form(step_id="user", data_schema=vol.Schema(schema), errors=errors)

    async def async_step_import(self, import_data: dict):
        return await self._async_create(
            {
                CONF_COMFORT_TEMP: DEFAULT_COMFORT_TEMP,
                CONF_ECO_TEMP: DEFAULT_ECO_TEMP,
                CONF_DEFAULT_OVERRIDE_HOURS: DEFAULT_OVERRIDE_HOURS,
                CONF_MAX_OVERRIDE_HOURS: DEFAULT_MAX_OVERRIDE_HOURS,
                **import_data,
            }
        )


class ShareSpaceHeatingOptionsFlow(config_entries.OptionsFlow):
    async def async_step_init(self, user_input: dict | None = None):
        current = {**self.config_entry.data, **self.config_entry.options}
        if user_input is not None:
            return self.async_create_entry(
                data={
                    **self.config_entry.options,
                    **user_input,
                    CONF_PRESENCE_ENTITY: user_input.get(CONF_PRESENCE_ENTITY) or None,
                }
            )
        return self.async_show_form(
            step_id="init", data_schema=vol.Schema(_settings_schema(current))
        )
