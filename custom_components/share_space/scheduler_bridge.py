"""Drive the scheduler-component (nielsfaber/scheduler-component) integration's own schedule
entities from an area's merged calendar, rather than running our own time-based executor.

scheduler-component already has a battle-tested engine for "at these times, on these weekdays,
call this action" -- we just keep its schedule entities in sync with whatever our merged
calendar currently says, using the on/off action pair configured for that area. Best-effort:
an area with no action configured is never synced, and a missing `scheduler` integration is
logged, not fatal -- this integration must not require scheduler-component to function.
"""
from __future__ import annotations

import logging

from homeassistant.core import HomeAssistant

from .area_schedule import compute_area_schedule
from .calendar_types import SLOT_MINUTES, TimeOfDay, WeekDay, WEEK_DAYS
from .const import (
    ATTR_OFF_ACTION,
    ATTR_ON_ACTION,
    SCHEDULER_DOMAIN,
    SCHEDULER_SERVICE_ADD,
    SCHEDULER_SERVICE_EDIT,
    SCHEDULER_SERVICE_REMOVE,
)
from .store import AreaActionStore, AreaSchedulerLinkStore, PersonAreaStore, PersonCalendarStore

_LOGGER = logging.getLogger(__name__)

_WEEKDAY_ABBR: dict[WeekDay, str] = {
    WeekDay.MONDAY: "mon",
    WeekDay.TUESDAY: "tue",
    WeekDay.WEDNESDAY: "wed",
    WeekDay.THURSDAY: "thu",
    WeekDay.FRIDAY: "fri",
    WeekDay.SATURDAY: "sat",
    WeekDay.SUNDAY: "sun",
}


def _add_minutes(time_of_day: TimeOfDay, minutes: int) -> TimeOfDay:
    hour, minute = (int(part) for part in time_of_day.split(":", 1))
    total = hour * 60 + minute + minutes
    return f"{total // 60:02d}:{total % 60:02d}"


def _slots_to_ranges(slots: list[TimeOfDay]) -> list[tuple[TimeOfDay, TimeOfDay]]:
    """Contiguous SLOT_MINUTES-wide on-slot starts -> merged [start, end) ranges."""
    ranges: list[list[str]] = []
    for slot in sorted(slots):
        slot_end = _add_minutes(slot, SLOT_MINUTES)
        if ranges and ranges[-1][1] == slot:
            ranges[-1][1] = slot_end
        else:
            ranges.append([slot, slot_end])
    return [(start, end) for start, end in ranges]


def _to_scheduler_action(ha_action: dict) -> dict:
    """One HA automation-style action (as produced by the `action` selector) -> the flat
    `{service, entity_id, service_data}` shape scheduler-component's own services expect."""
    service = ha_action.get("action") or ha_action.get("service")
    target = ha_action.get("target") or {}
    entity_id = target.get("entity_id") or ha_action.get("entity_id")
    if isinstance(entity_id, list):
        entity_id = entity_id[0] if entity_id else None
    data = ha_action.get("data") or ha_action.get("service_data") or {}

    scheduler_action: dict = {"service": service}
    if entity_id:
        scheduler_action["entity_id"] = entity_id
    if data:
        scheduler_action["service_data"] = data
    return scheduler_action


def _group_weekdays_by_pattern(schedule: dict[WeekDay, list[TimeOfDay]]) -> list[tuple[list[str], list[TimeOfDay]]]:
    """Weekdays sharing the exact same on-slot pattern share one scheduler-component entity --
    a day with no on-slots at all needs no schedule, since nothing should ever turn on for it."""
    groups: dict[tuple[TimeOfDay, ...], list[str]] = {}
    order: list[tuple[TimeOfDay, ...]] = []
    for day in WEEK_DAYS:
        pattern = tuple(schedule.get(day, []))
        if not pattern:
            continue
        if pattern not in groups:
            groups[pattern] = []
            order.append(pattern)
        groups[pattern].append(_WEEKDAY_ABBR[day])
    return [(groups[pattern], list(pattern)) for pattern in order]


def _build_day_timeslots(on_ranges: list[tuple[TimeOfDay, TimeOfDay]], on_action: list[dict], off_action: list[dict]) -> list[dict]:
    """On-ranges + the configured actions -> scheduler-component `timeslots`. Without an
    off_action, gaps between on-ranges are simply left undefined (scheduler-component doesn't
    require full-day coverage); with one, every gap explicitly runs it."""
    scheduler_on_action = [_to_scheduler_action(action) for action in on_action]
    if not off_action:
        return [{"start": start, "stop": end, "actions": scheduler_on_action} for start, end in on_ranges]

    scheduler_off_action = [_to_scheduler_action(action) for action in off_action]
    timeslots: list[dict] = []
    cursor = "00:00"
    for start, end in on_ranges:
        if start > cursor:
            timeslots.append({"start": cursor, "stop": start, "actions": scheduler_off_action})
        timeslots.append({"start": start, "stop": end, "actions": scheduler_on_action})
        cursor = end
    if cursor < "24:00":
        timeslots.append({"start": cursor, "stop": "24:00", "actions": scheduler_off_action})
    return timeslots


async def _async_create_schedule(hass: HomeAssistant, payload: dict) -> str | None:
    """scheduler.add doesn't return the created entity_id -- diff switch entities before/after."""
    before = set(hass.states.async_entity_ids("switch"))
    await hass.services.async_call(SCHEDULER_DOMAIN, SCHEDULER_SERVICE_ADD, payload, blocking=True)
    created = set(hass.states.async_entity_ids("switch")) - before
    return next(iter(created), None)


async def _async_remove_schedule(hass: HomeAssistant, entity_id: str) -> None:
    if hass.states.get(entity_id) is None:
        return
    await hass.services.async_call(SCHEDULER_DOMAIN, SCHEDULER_SERVICE_REMOVE, {"entity_id": entity_id}, blocking=True)


async def async_sync_area_scheduler(
    hass: HomeAssistant,
    person_area_store: PersonAreaStore,
    person_calendar_store: PersonCalendarStore,
    area_action_store: AreaActionStore,
    area_scheduler_link_store: AreaSchedulerLinkStore,
    area: str,
) -> None:
    """Recreate/update/remove exactly the scheduler-component entities needed to realize
    `area`'s current merged calendar and configured action -- called after anything changes
    that could affect either (a calendar edit, an area assignment, or the action itself)."""
    if not hass.services.has_service(SCHEDULER_DOMAIN, SCHEDULER_SERVICE_ADD):
        _LOGGER.debug("scheduler-component not installed; skipping sync for area %s", area)
        return

    action = area_action_store.get(area) or {}
    on_action = action.get(ATTR_ON_ACTION) or []
    off_action = action.get(ATTR_OFF_ACTION) or []
    existing_entity_ids = list(area_scheduler_link_store.get(area) or [])

    if not on_action:
        for entity_id in existing_entity_ids:
            await _async_remove_schedule(hass, entity_id)
        await area_scheduler_link_store.async_set(area, [])
        return

    schedule = compute_area_schedule(person_area_store, person_calendar_store, area)
    groups = _group_weekdays_by_pattern(schedule)

    new_entity_ids: list[str] = []
    for index, (weekdays, on_slots) in enumerate(groups):
        timeslots = _build_day_timeslots(_slots_to_ranges(on_slots), on_action, off_action)
        payload = {
            "weekdays": weekdays,
            "timeslots": timeslots,
            "repeat_type": "repeat",
            "name": f"Share Space: {area} ({index + 1})",
        }
        if index < len(existing_entity_ids):
            await hass.services.async_call(
                SCHEDULER_DOMAIN,
                SCHEDULER_SERVICE_EDIT,
                {**payload, "entity_id": existing_entity_ids[index]},
                blocking=True,
            )
            new_entity_ids.append(existing_entity_ids[index])
        else:
            entity_id = await _async_create_schedule(hass, payload)
            if entity_id:
                new_entity_ids.append(entity_id)
            else:
                _LOGGER.warning("Could not determine the entity_id created for area %s", area)

    for stale_entity_id in existing_entity_ids[len(groups):]:
        await _async_remove_schedule(hass, stale_entity_id)

    await area_scheduler_link_store.async_set(area, new_entity_ids)
