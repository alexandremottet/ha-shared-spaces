"""WebSocket commands letting the frontend read calendars, area assignments, and area schedules."""
from __future__ import annotations

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import entity_registry as er

from .area_schedule import compute_area_schedule, serialize_area_person_calendars
from .const import (
    ATTR_AREA,
    ATTR_CALENDAR,
    ATTR_PERSON,
    DATA_AREA_ACTIONS_STORE,
    DATA_PERSON_AREA_STORE,
    DATA_PERSON_CALENDAR_STORE,
    DOMAIN,
    WS_TYPE_FORGET_AREA_ACTIONS,
    WS_TYPE_GET_AREA_ACTIONS,
    WS_TYPE_GET_AREA_CALENDARS,
    WS_TYPE_LIST_AREAS,
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
    plannings = _entry_data(hass)[DATA_PERSON_CALENDAR_STORE]
    person = msg[ATTR_PERSON]
    connection.send_result(
        msg["id"], {ATTR_CALENDAR: plannings.get(person) or {}, "schedule_entity": plannings.schedule_entity(person)}
    )


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


@websocket_api.websocket_command({vol.Required("type"): WS_TYPE_GET_AREA_ACTIONS, vol.Required(ATTR_AREA): str})
@websocket_api.async_response
async def handle_get_area_actions(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Actions Share Space still keeps for an area (before they move into an HA automation), or None."""
    store = _entry_data(hass)[DATA_AREA_ACTIONS_STORE]
    area = msg[ATTR_AREA]
    connection.send_result(msg["id"], store.get_actions(area) if store.has(area) else None)


@websocket_api.websocket_command({vol.Required("type"): WS_TYPE_FORGET_AREA_ACTIONS, vol.Required(ATTR_AREA): str})
@websocket_api.require_admin
@websocket_api.async_response
async def handle_forget_area_actions(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Drop an area's kept actions once the panel has written them into an HA automation."""
    await _entry_data(hass)[DATA_AREA_ACTIONS_STORE].async_forget(msg[ATTR_AREA])
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command({vol.Required("type"): WS_TYPE_LIST_AREAS})
@websocket_api.async_response
async def handle_list_areas(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    entry_id, entry_data = next(iter(hass.data[DOMAIN].items()))
    person_area_store = entry_data[DATA_PERSON_AREA_STORE]
    entity_registry = er.async_get(hass)
    area_registry = ar.async_get(hass)
    result = []
    for area_id in sorted(person_area_store.areas()):
        area = area_registry.async_get_area(area_id)
        result.append(
            {
                "area_id": area_id,
                "name": area.name if area else area_id,
                "persons": person_area_store.persons_in_area(area_id),
                "entity_id": entity_registry.async_get_entity_id("binary_sensor", DOMAIN, f"{entry_id}_{area_id}"),
            }
        )
    connection.send_result(msg["id"], result)


def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register this integration's WebSocket commands."""
    websocket_api.async_register_command(hass, handle_get_calendar)
    websocket_api.async_register_command(hass, handle_get_person_area)
    websocket_api.async_register_command(hass, handle_get_area_schedule)
    websocket_api.async_register_command(hass, handle_get_area_calendars)
    websocket_api.async_register_command(hass, handle_get_area_actions)
    websocket_api.async_register_command(hass, handle_forget_area_actions)
    websocket_api.async_register_command(hass, handle_list_areas)
