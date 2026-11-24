"""Share Space integration."""
from __future__ import annotations

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, ServiceCall, SupportsResponse, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.util import dt as dt_util

from .area_schedule import compute_area_schedule
from .calendar_types import WEEK_DAYS
from .occupancy import window_matches
from .const import (
    ATTR_AREA,
    ATTR_CALENDAR,
    ATTR_PERSON,
    DATA_AREA_ACTIONS_STORE,
    DATA_AREA_LOCKS,
    DATA_PERSON_AREA_STORE,
    DATA_PERSON_CALENDAR_STORE,
    DOMAIN,
    EVENT_CALENDAR_UPDATED,
    EVENT_PERSON_AREA_ASSIGNED,
    SERVICE_ASSIGN_PERSON_AREA,
    SERVICE_QUERY_OCCUPANCY,
    SERVICE_SET_CALENDAR,
    SIGNAL_AREAS_CHANGED,
    SIGNAL_CALENDAR_CHANGED,
)
from .people import PersonAreas, PersonPlannings
from .store import AreaActionsStore
from .websocket_api import async_register_websocket_commands

_TIME_OF_DAY = vol.Match(r"^([01]\d|2[0-3]):[0-5]\d$|^24:00$")


def _start_before_end(value: dict) -> dict:
    if value["start"] >= value["end"]:
        raise vol.Invalid("start must be before end; ranges cannot cross midnight")
    return value


_TIME_RANGE_SCHEMA = vol.All(
    vol.Schema(
        {
            vol.Required("start"): _TIME_OF_DAY,
            vol.Required("end"): _TIME_OF_DAY,
        }
    ),
    _start_before_end,
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
        vol.Required(ATTR_AREA): vol.Any(None, cv.string),
    }
)

_DAY_CHOICES = ["today", "tomorrow", *(d.value for d in WEEK_DAYS)]

QUERY_OCCUPANCY_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_AREA): cv.string,
        vol.Required("windows"): vol.All(
            [vol.Schema({vol.Required("start"): _TIME_OF_DAY, vol.Required("end"): _TIME_OF_DAY})],
            vol.Length(min=1),
        ),
        vol.Optional("match", default="all"): vol.In(["all", "any"]),
        vol.Optional("day", default="today"): vol.In(_DAY_CHOICES),
    }
)

PLATFORMS = ["binary_sensor", "sensor"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up integration from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    person_calendar_store = PersonPlannings(hass)
    await person_calendar_store.async_load()
    await person_calendar_store.async_migrate()
    person_area_store = PersonAreas(hass)
    await person_area_store.async_migrate()
    area_actions_store = AreaActionsStore(hass)
    await area_actions_store.async_load()
    hass.data[DOMAIN][entry.entry_id] = {
        DATA_AREA_ACTIONS_STORE: area_actions_store,
        DATA_PERSON_CALENDAR_STORE: person_calendar_store,
        DATA_PERSON_AREA_STORE: person_area_store,
        DATA_AREA_LOCKS: {},
    }

    @callback
    def _drop_entry_data() -> None:
        hass.data[DOMAIN].pop(entry.entry_id, None)

    entry.async_on_unload(_drop_entry_data)

    @callback
    def _plannings_changed() -> None:
        async_dispatcher_send(hass, SIGNAL_CALENDAR_CHANGED)

    entry.async_on_unload(person_calendar_store.async_listen(_plannings_changed))

    @callback
    def _person_area_changed(event: Event[er.EventEntityRegistryUpdatedData]) -> None:
        data = event.data
        if not data["entity_id"].startswith("person."):
            return
        if data["action"] == "update" and "area_id" not in data.get("changes", {}):
            return
        async_dispatcher_send(hass, SIGNAL_AREAS_CHANGED)
        async_dispatcher_send(hass, SIGNAL_CALENDAR_CHANGED)

    entry.async_on_unload(hass.bus.async_listen(er.EVENT_ENTITY_REGISTRY_UPDATED, _person_area_changed))

    async def _handle_set_calendar(call: ServiceCall) -> None:
        person = call.data[ATTR_PERSON]
        calendar = call.data[ATTR_CALENDAR]
        await person_calendar_store.async_set(person, calendar)
        hass.bus.async_fire(EVENT_CALENDAR_UPDATED, {ATTR_PERSON: person})
        async_dispatcher_send(hass, SIGNAL_CALENDAR_CHANGED)

    async def _handle_assign_person_area(call: ServiceCall) -> None:
        person = call.data[ATTR_PERSON]
        area = call.data[ATTR_AREA]
        await person_area_store.async_set(person, area)
        hass.bus.async_fire(EVENT_PERSON_AREA_ASSIGNED, {ATTR_PERSON: person, ATTR_AREA: area})

    async def _handle_query_occupancy(call: ServiceCall) -> dict:
        schedule = compute_area_schedule(person_area_store, person_calendar_store, call.data[ATTR_AREA])
        day = call.data["day"]
        if day in ("today", "tomorrow"):
            offset = 0 if day == "today" else 1
            day = WEEK_DAYS[(dt_util.now().weekday() + offset) % 7]
        else:
            day = next(d for d in WEEK_DAYS if d.value == day)
        matches = [window_matches(schedule, day, w["start"], w["end"]) for w in call.data["windows"]]
        combine = all if call.data["match"] == "all" else any
        return {"occupied": combine(matches), "matches": matches}

    if not hass.services.has_service(DOMAIN, SERVICE_SET_CALENDAR):
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
            SERVICE_QUERY_OCCUPANCY,
            _handle_query_occupancy,
            schema=QUERY_OCCUPANCY_SCHEMA,
            supports_response=SupportsResponse.ONLY,
        )

    async_register_websocket_commands(hass)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    for service in (SERVICE_SET_CALENDAR, SERVICE_ASSIGN_PERSON_AREA, SERVICE_QUERY_OCCUPANCY):
        hass.services.async_remove(DOMAIN, service)
    return True
