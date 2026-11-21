"""Pure helpers: is an area occupied at a given moment, and when does that next change."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .calendar_types import SLOT_MINUTES, Schedule, WeekDay


def floor_slot(now: datetime) -> datetime:
    return now.replace(minute=now.minute - now.minute % SLOT_MINUTES, second=0, microsecond=0)


def is_occupied(schedule: Schedule, now: datetime) -> bool:
    slot = floor_slot(now)
    return slot.strftime("%H:%M") in schedule.get(list(WeekDay)[slot.weekday()], [])


def next_change(schedule: Schedule, now: datetime) -> datetime | None:
    current = is_occupied(schedule, now)
    utc = floor_slot(now).astimezone(timezone.utc)
    for _ in range(7 * 24 * 60 // SLOT_MINUTES):
        utc += timedelta(minutes=SLOT_MINUTES)
        local = utc.astimezone(now.tzinfo)
        if is_occupied(schedule, local) != current:
            return local
    return None


_HORIZON_SLOTS = 8 * 24 * 60 // SLOT_MINUTES


def _slot_utc(now: datetime) -> datetime:
    return floor_slot(now).astimezone(timezone.utc)


def _flip(schedule: Schedule, now: datetime, to_on: bool) -> datetime | None:
    previous = is_occupied(schedule, now)
    utc = _slot_utc(now)
    for _ in range(_HORIZON_SLOTS):
        utc += timedelta(minutes=SLOT_MINUTES)
        local = utc.astimezone(now.tzinfo)
        current = is_occupied(schedule, local)
        if current != previous and current == to_on:
            return local
        previous = current
    return None


def next_on(schedule: Schedule, now: datetime) -> datetime | None:
    return _flip(schedule, now, True)


def next_off(schedule: Schedule, now: datetime) -> datetime | None:
    return _flip(schedule, now, False)


def previous_off(schedule: Schedule, now: datetime) -> datetime | None:
    utc = _slot_utc(now)
    for _ in range(_HORIZON_SLOTS):
        before = utc - timedelta(minutes=SLOT_MINUTES)
        if not is_occupied(schedule, utc.astimezone(now.tzinfo)) and is_occupied(schedule, before.astimezone(now.tzinfo)):
            return utc.astimezone(now.tzinfo)
        utc = before
    return None


def occupied_today(schedule: Schedule, now: datetime) -> bool:
    utc = _slot_utc(now)
    while (local := utc.astimezone(now.tzinfo)).date() == now.date():
        if is_occupied(schedule, local):
            return True
        utc += timedelta(minutes=SLOT_MINUTES)
    return False


def occupied_tomorrow(schedule: Schedule, now: datetime) -> bool:
    return bool(schedule.get(list(WeekDay)[(now.weekday() + 1) % 7]))


def window_matches(schedule: Schedule, day: WeekDay, start: str, end: str) -> bool:
    return any(start <= slot < end for slot in schedule.get(day, []))


def compact_schedule(schedule: Schedule) -> dict[str, list[list[str]]]:
    result: dict[str, list[list[str]]] = {}
    for day in WeekDay:
        minutes = sorted(int(s[:2]) * 60 + int(s[3:]) for s in schedule.get(day, []))
        ranges: list[list[str]] = []
        for m in minutes:
            if ranges and ranges[-1][1] == m:
                ranges[-1][1] = m + SLOT_MINUTES
            else:
                ranges.append([m, m + SLOT_MINUTES])
        result[day.value] = [[f"{a // 60:02d}:{a % 60:02d}", f"{b // 60:02d}:{b % 60:02d}"] for a, b in ranges]
    return result
