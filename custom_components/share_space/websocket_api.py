"""WebSocket commands letting the frontend read calendars, area assignments, and area schedules."""
from __future__ import annotations

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .area_schedule import compute_area_schedule, serialize_area_person_calendars
from .const import (
    ATTR_AREA,
    ATTR_CALENDAR,
    ATTR_OFF_ACTION,
    ATTR_ON_ACTION,
    ATTR_PERSON,
    DATA_AREA_ACTION_STORE,
    DATA_PERSON_AREA_STORE,
    DATA_PERSON_CALENDAR_STORE,
    DOMAIN,
    WS_TYPE_GET_AREA_ACTION,
    WS_TYPE_GET_AREA_CALENDARS,
    WS_TYPE_GET_AREA_SCHEDULE,
    WS_TYPE_GET_CALENDAR,
    WS_TYPE_GET_PERSON_AREA,
)


def _entry_data(hass: HomeAssistant) -> dict:
    return next(iter(hass.data[DOMAIN].values()))


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_GET_CALENDAR,
        vol.Required(ATTR_PERSON): str,
    }
)
@websocket_api.async_response
async def handle_get_calendar(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Return one person's own stored calendar, or an empty one if never set."""
    store = _entry_data(hass)[DATA_PERSON_CALENDAR_STORE]
    connection.send_result(msg["id"], {ATTR_CALENDAR: store.get(msg[ATTR_PERSON]) or {}})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_GET_PERSON_AREA,
        vol.Required(ATTR_PERSON): str,
    }
)
@websocket_api.async_response
async def handle_get_person_area(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Return the area assigned to a person entity, or None if unassigned."""
    store = _entry_data(hass)[DATA_PERSON_AREA_STORE]
    connection.send_result(msg["id"], {ATTR_AREA: store.get(msg[ATTR_PERSON])})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_GET_AREA_SCHEDULE,
        vol.Required(ATTR_AREA): str,
    }
)
@websocket_api.async_response
async def handle_get_area_schedule(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Return the area's merged schedule: every assigned person's calendar, combined."""
    entry_data = _entry_data(hass)
    schedule = compute_area_schedule(
        entry_data[DATA_PERSON_AREA_STORE], entry_data[DATA_PERSON_CALENDAR_STORE], msg[ATTR_AREA]
    )
    connection.send_result(msg["id"], {"schedule": schedule})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_GET_AREA_CALENDARS,
        vol.Required(ATTR_AREA): str,
    }
)
@websocket_api.async_response
async def handle_get_area_calendars(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Return every person assigned to the area with their own raw calendar (unmerged) --
    for read-only per-person visualizations, unlike get_area_schedule's flattened signal."""
    entry_data = _entry_data(hass)
    calendars = serialize_area_person_calendars(
        entry_data[DATA_PERSON_AREA_STORE], entry_data[DATA_PERSON_CALENDAR_STORE], msg[ATTR_AREA]
    )
    connection.send_result(msg["id"], {"persons": calendars})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_GET_AREA_ACTION,
        vol.Required(ATTR_AREA): str,
    }
)
@websocket_api.async_response
async def handle_get_area_action(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Return the on/off action pair configured for the area, or empty lists if never set."""
    store = _entry_data(hass)[DATA_AREA_ACTION_STORE]
    action = store.get(msg[ATTR_AREA]) or {}
    connection.send_result(
        msg["id"], {ATTR_ON_ACTION: action.get(ATTR_ON_ACTION) or [], ATTR_OFF_ACTION: action.get(ATTR_OFF_ACTION) or []}
    )


def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register this integration's WebSocket commands."""
    websocket_api.async_register_command(hass, handle_get_calendar)
    websocket_api.async_register_command(hass, handle_get_person_area)
    websocket_api.async_register_command(hass, handle_get_area_schedule)
    websocket_api.async_register_command(hass, handle_get_area_calendars)
    websocket_api.async_register_command(hass, handle_get_area_action)
