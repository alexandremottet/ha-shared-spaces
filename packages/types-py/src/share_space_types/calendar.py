"""Week calendar and period data structures: weekday-only, no month or date."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

class WeekDay(str, Enum):
    """Day of the week, independent of any date or month."""

    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


WEEK_DAYS: tuple[WeekDay, ...] = tuple(WeekDay)

Period = str

WORK_WEEK: Period = "work_week"
HOLIDAYS: Period = "holidays"

WeekSchedule = dict[WeekDay, Period]

# 24h "HH:MM", zero-padded, no date.
TimeOfDay = str


@dataclass(frozen=True)
class TimeRange:
    """A presence interval within a single day: from `start` (inclusive) to `end` (exclusive)."""

    start: TimeOfDay
    end: TimeOfDay


# Presence intervals for one day; empty list means absent all day.
DailyPresence = list[TimeRange]

# One person's/area's weekly presence: which hours they're present, per day.
Calendar = dict[WeekDay, DailyPresence]

# Granularity of a Schedule slot, in minutes.
SLOT_MINUTES = 30

# Resolved heating decision: start ("HH:MM") of each active slot, per day.
Schedule = dict[WeekDay, list[TimeOfDay]]
