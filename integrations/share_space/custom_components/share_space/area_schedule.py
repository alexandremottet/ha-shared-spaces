"""Compute an area's effective schedule by merging every assigned person's own calendar.

The only piece of this that touches Home Assistant storage; the actual merge algorithm
(calendar_merge.merge_calendars) stays pure and untouched, taking plain Calendar values in
and a plain Schedule out. This module's only job is: look up who's in the area, load and
parse their raw stored calendars into that pure shape, and hand them to the merge function
(or, for callers that need per-person attribution rather than a flattened on/off signal,
just hand back the raw per-person calendars themselves).
"""
from __future__ import annotations

from .calendar_merge import merge_calendars
from .const import EVERYONE
from .calendar_types import Calendar, Schedule, TimeRange, WeekDay
from .people import PersonAreas, PersonPlannings


def _parse_calendar(raw: dict) -> Calendar:
    """Raw stored/serialized JSON (plain dicts/strings) -> the typed Calendar the pure merge expects."""
    return {
        WeekDay(day): [TimeRange(start=period["start"], end=period["end"]) for period in periods]
        for day, periods in raw.items()
    }


def _serialize_calendar(calendar: Calendar) -> dict:
    """The typed Calendar -> plain JSON-friendly dict (the inverse of `_parse_calendar`)."""
    return {day.value: [{"start": r.start, "end": r.end} for r in periods] for day, periods in calendar.items()}


def list_area_person_calendars(
    person_area_store: PersonAreas,
    person_calendar_store: PersonPlannings,
    area: str,
) -> dict[str, Calendar]:
    """Every person assigned to `area`, each with their own raw (unmerged) calendar."""
    persons = person_area_store.persons_in_area(area)
    if area == EVERYONE:
        persons = sorted(set(persons) | person_calendar_store.persons())
    return {
        person: _parse_calendar(raw_calendar)
        for person in persons
        if (raw_calendar := person_calendar_store.get(person)) is not None
    }


def compute_area_schedule(
    person_area_store: PersonAreas,
    person_calendar_store: PersonPlannings,
    area: str,
) -> Schedule:
    """The merged on/off schedule for `area`: every person assigned to it, combined."""
    calendars = list(list_area_person_calendars(person_area_store, person_calendar_store, area).values())
    return merge_calendars(calendars)


def serialize_area_person_calendars(
    person_area_store: PersonAreas,
    person_calendar_store: PersonPlannings,
    area: str,
) -> dict[str, dict]:
    """`list_area_person_calendars`, JSON-serialized for sending over the WebSocket API."""
    return {
        person: _serialize_calendar(calendar)
        for person, calendar in list_area_person_calendars(person_area_store, person_calendar_store, area).items()
    }
