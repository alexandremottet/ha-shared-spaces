"""Merge multiple weekly presence calendars into a slotted schedule."""
from __future__ import annotations

from dataclasses import dataclass

from .calendar_types import SLOT_MINUTES, Calendar, DailyPresence, Schedule, TimeOfDay, TimeRange, WeekDay


@dataclass(frozen=True)
class CalendarEvent:
    """One-off override: replaces a specific weekday's presence, on top of the merged calendars."""

    day: WeekDay
    presence: DailyPresence


def merge_calendars(
    calendars: list[Calendar],
    events: list[CalendarEvent] | None = None,
) -> Schedule:
    """Merge calendars into a slotted schedule: a slot is active if anyone is present during any part of it."""
    schedule: Schedule = {day: sorted(_slots_for_day(day, calendars)) for day in WeekDay}

    for event in events or []:
        schedule[event.day] = sorted(_slots_for_ranges(event.presence))

    return schedule


def _slots_for_day(day: WeekDay, calendars: list[Calendar]) -> set[TimeOfDay]:
    slots: set[TimeOfDay] = set()
    for calendar in calendars:
        slots |= _slots_for_ranges(calendar.get(day, []))
    return slots


def _slots_for_ranges(ranges: DailyPresence) -> set[TimeOfDay]:
    slots: set[TimeOfDay] = set()
    for time_range in ranges:
        slots |= _slots_touched(time_range)
    return slots


def _slots_touched(time_range: TimeRange) -> set[TimeOfDay]:
    """Every SLOT_MINUTES-wide slot that `time_range` overlaps, at least partially."""
    start_minutes = _to_minutes(time_range.start)
    end_minutes = _to_minutes(time_range.end)

    slots: set[TimeOfDay] = set()
    slot_start = (start_minutes // SLOT_MINUTES) * SLOT_MINUTES
    while slot_start < end_minutes:
        slots.add(_to_time_of_day(slot_start))
        slot_start += SLOT_MINUTES

    return slots


def _to_minutes(time_of_day: TimeOfDay) -> int:
    hour, minute = (int(part) for part in time_of_day.split(":", 1))
    return hour * 60 + minute


def _to_time_of_day(minutes: int) -> TimeOfDay:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"
