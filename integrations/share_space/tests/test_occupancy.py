"""DST behaviour of next_change."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from custom_components.share_space.occupancy import next_change

PARIS = ZoneInfo("Europe/Paris")


def test_next_change_never_in_past_across_fall_back():
    from custom_components.share_space.calendar_types import WeekDay

    schedule = {WeekDay.SUNDAY: [f"{h:02d}:{m:02d}" for h in range(12, 24) for m in (0, 30)]}
    start = datetime(2026, 10, 24, 0, 0, tzinfo=timezone.utc)
    for i in range(0, 4 * 24 * 2):
        now = (start + timedelta(minutes=30 * i, seconds=7)).astimezone(PARIS)
        following = next_change(schedule, now)
        assert following is not None
        assert following.astimezone(timezone.utc) > now.astimezone(timezone.utc)


def test_next_change_in_repeated_hour_is_not_in_past():
    from custom_components.share_space.calendar_types import WeekDay

    schedule = {WeekDay.SUNDAY: ["02:00"]}
    now = datetime(2026, 10, 25, 1, 10, tzinfo=timezone.utc).astimezone(PARIS)
    assert now.hour == 2 and now.fold == 1
    following = next_change(schedule, now)
    assert following.astimezone(timezone.utc) == datetime(2026, 10, 25, 1, 30, tzinfo=timezone.utc)
