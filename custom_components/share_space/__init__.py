"""Share Space integration."""
from __future__ import annotations

from pathlib import Path

import voluptuous as vol
from homeassistant.components.frontend import add_extra_js_url, async_remove_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace import LOVELACE_DATA
from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .calendar_types import WEEK_DAYS
from .const import (
    ATTR_AREA,
    ATTR_CALENDAR,
    ATTR_OFF_ACTION,
    ATTR_ON_ACTION,
    ATTR_PERSON,
    ATTR_TEMPERATURE,
    DATA_AREA_ACTION_STORE,
    DATA_AREA_SCHEDULER_LINK_STORE,
    DATA_PERSON_AREA_STORE,
    DATA_PERSON_CALENDAR_STORE,
    DOMAIN,
    EVENT_CALENDAR_UPDATED,
    EVENT_HEATING_SHARED,
    EVENT_PERSON_AREA_ASSIGNED,
    FRONTEND_JS_FILENAME,
    FRONTEND_SCRIPT_URL,
    PANEL_URL_PATH,
    SERVICE_ASSIGN_PERSON_AREA,
    SERVICE_SET_AREA_ACTION,
    SERVICE_SET_CALENDAR,
    SERVICE_TRIGGER_HEATING_SHARED,
)
from .panel import async_register_share_space_panel
from .scheduler_bridge import async_sync_area_scheduler
from .store import AreaActionStore, AreaSchedulerLinkStore, PersonAreaStore, PersonCalendarStore
from .websocket_api import async_register_websocket_commands

TRIGGER_HEATING_SHARED_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_AREA): cv.string,
        vol.Optional(ATTR_TEMPERATURE): vol.Coerce(float),
    }
)

_TIME_OF_DAY = vol.Match(r"^([01]\d|2[0-3]):[0-5]\d$|^24:00$")

_TIME_RANGE_SCHEMA = vol.Schema(
    {
        vol.Required("start"): _TIME_OF_DAY,
        vol.Required("end"): _TIME_OF_DAY,
    }
)

_CALENDAR_SCHEMA = vol.Schema({vol.Optional(day.value): [_TIME_RANGE_SCHEMA] for day in WEEK_DAYS})

SET_CALENDAR_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_PERSON): cv.entity_domain("person"),
        vol.Required(ATTR_CALENDAR): _CALENDAR_SCHEMA,
    }
)

ASSIGN_PERSON_AREA_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_PERSON): cv.entity_domain("person"),
        vol.Required(ATTR_AREA): cv.string,
    }
)

SET_AREA_ACTION_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_AREA): cv.string,
        vol.Optional(ATTR_ON_ACTION, default=list): [dict],
        vol.Optional(ATTR_OFF_ACTION, default=list): [dict],
    }
)


async def _async_ensure_lovelace_resource(hass: HomeAssistant) -> None:
    """Register our frontend bundle as a Lovelace resource, best-effort.

    `panel_custom`'s `module_url` only loads the bundle when a user actually visits our own
    panel -- it never reaches any other dashboard, so share-space-card and
    share-space-my-schedule-card would otherwise never appear there. Registering it as a
    Lovelace resource (the same mechanism a user would use via Settings > Dashboards >
    Resources) is what makes the frontend load it on every dashboard.
    """
    lovelace_data = hass.data.get(LOVELACE_DATA)
    if lovelace_data is None:
        return

    resources = lovelace_data.resources
    if not isinstance(resources, ResourceStorageCollection):
        return  # YAML-mode resources are managed by the user's own config, not us.

    await resources.async_get_info()
    if any(item["url"] == FRONTEND_SCRIPT_URL for item in resources.async_items()):
        return

    await resources.async_create_item({"res_type": "module", "url": FRONTEND_SCRIPT_URL})


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up integration from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    person_calendar_store = PersonCalendarStore(hass)
    await person_calendar_store.async_load()
    person_area_store = PersonAreaStore(hass)
    await person_area_store.async_load()
    area_action_store = AreaActionStore(hass)
    await area_action_store.async_load()
    area_scheduler_link_store = AreaSchedulerLinkStore(hass)
    await area_scheduler_link_store.async_load()
    hass.data[DOMAIN][entry.entry_id] = {
        DATA_PERSON_CALENDAR_STORE: person_calendar_store,
        DATA_PERSON_AREA_STORE: person_area_store,
        DATA_AREA_ACTION_STORE: area_action_store,
        DATA_AREA_SCHEDULER_LINK_STORE: area_scheduler_link_store,
    }

    async def _async_sync_area(area: str) -> None:
        await async_sync_area_scheduler(
            hass, person_area_store, person_calendar_store, area_action_store, area_scheduler_link_store, area
        )

    async def _handle_trigger_heating_shared(call: ServiceCall) -> None:
        hass.bus.async_fire(
            EVENT_HEATING_SHARED,
            {
                ATTR_AREA: call.data[ATTR_AREA],
                ATTR_TEMPERATURE: call.data.get(ATTR_TEMPERATURE),
            },
        )

    async def _handle_set_calendar(call: ServiceCall) -> None:
        person = call.data[ATTR_PERSON]
        calendar = call.data[ATTR_CALENDAR]
        await person_calendar_store.async_set(person, calendar)
        hass.bus.async_fire(EVENT_CALENDAR_UPDATED, {ATTR_PERSON: person})
        area = person_area_store.get(person)
        if area:
            await _async_sync_area(area)

    async def _handle_assign_person_area(call: ServiceCall) -> None:
        person = call.data[ATTR_PERSON]
        area = call.data[ATTR_AREA]
        await person_area_store.async_set(person, area)
        hass.bus.async_fire(EVENT_PERSON_AREA_ASSIGNED, {ATTR_PERSON: person, ATTR_AREA: area})
        await _async_sync_area(area)

    async def _handle_set_area_action(call: ServiceCall) -> None:
        area = call.data[ATTR_AREA]
        await area_action_store.async_set(
            area, {ATTR_ON_ACTION: call.data[ATTR_ON_ACTION], ATTR_OFF_ACTION: call.data[ATTR_OFF_ACTION]}
        )
        await _async_sync_area(area)

    hass.services.async_register(
        DOMAIN,
        SERVICE_TRIGGER_HEATING_SHARED,
        _handle_trigger_heating_shared,
        schema=TRIGGER_HEATING_SHARED_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_SET_CALENDAR,
        _handle_set_calendar,
        schema=SET_CALENDAR_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_ASSIGN_PERSON_AREA,
        _handle_assign_person_area,
        schema=ASSIGN_PERSON_AREA_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_SET_AREA_ACTION,
        _handle_set_area_action,
        schema=SET_AREA_ACTION_SCHEMA,
    )

    async_register_websocket_commands(hass)

    frontend_js_path = Path(__file__).parent / "frontend" / FRONTEND_JS_FILENAME
    await hass.http.async_register_static_paths(
        [StaticPathConfig(FRONTEND_SCRIPT_URL, str(frontend_js_path), cache_headers=False)]
    )
    add_extra_js_url(hass, FRONTEND_SCRIPT_URL)
    await _async_ensure_lovelace_resource(hass)

    await async_register_share_space_panel(hass)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    hass.services.async_remove(DOMAIN, SERVICE_TRIGGER_HEATING_SHARED)
    hass.services.async_remove(DOMAIN, SERVICE_SET_CALENDAR)
    hass.services.async_remove(DOMAIN, SERVICE_ASSIGN_PERSON_AREA)
    hass.services.async_remove(DOMAIN, SERVICE_SET_AREA_ACTION)
    async_remove_panel(hass, PANEL_URL_PATH)
    hass.data[DOMAIN].pop(entry.entry_id, None)
    return True
