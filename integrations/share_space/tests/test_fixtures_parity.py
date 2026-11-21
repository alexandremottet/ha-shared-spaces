"""Shared planning fixtures: the TS playground port runs the same files."""
import json
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from custom_components.share_space.calendar_merge import CalendarEvent, merge_calendars
from custom_components.share_space.calendar_types import TimeRange, WeekDay
from custom_components.share_space.occupancy import is_occupied, next_change

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures" / "planning"


def _load(name: str) -> list[dict]:
    return json.loads((FIXTURES / name).read_text())


def _calendar(raw: dict) -> dict:
    return {WeekDay(day): [TimeRange(r["start"], r["end"]) for r in ranges] for day, ranges in raw.items()}


@pytest.mark.parametrize("case", _load("merge_cases.json"), ids=lambda c: c["name"])
def test_merge_matches_fixture(case):
    events = [
        CalendarEvent(WeekDay(e["day"]), [TimeRange(r["start"], r["end"]) for r in e["presence"]])
        for e in case.get("events", [])
    ]
    result = merge_calendars([_calendar(c) for c in case["calendars"]], events or None)
    assert {day.value: slots for day, slots in result.items()} == case["expected"]


@pytest.mark.parametrize("case", _load("occupancy_cases.json"), ids=lambda c: c["name"])
def test_occupancy_matches_fixture(case):
    schedule = {WeekDay(day): slots for day, slots in case["schedule"].items()}
    tz = ZoneInfo(case["tz"])
    for check in case["checks"]:
        now = datetime.fromisoformat(check["now"]).astimezone(tz)
        assert is_occupied(schedule, now) is check["occupied"]
        following = next_change(schedule, now)
        expected = check["next_change"]
        if expected is None:
            assert following is None
        else:
            assert following.astimezone(timezone.utc) == datetime.fromisoformat(expected.replace("Z", "+00:00"))
