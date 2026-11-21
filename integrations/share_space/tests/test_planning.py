"""Planning entities, helpers and query_occupancy service."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.share_space.calendar_types import WeekDay
from custom_components.share_space.const import DOMAIN
from custom_components.share_space.occupancy import (
    compact_schedule,
    next_off,
    next_on,
    occupied_today,
    occupied_tomorrow,
    previous_off,
    window_matches,
)

PARIS = ZoneInfo("Europe/Paris")
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
OFFICE = {
    d: [{"start": "09:00", "end": "12:00"}, {"start": "13:00", "end": "18:00"}] for d in DAYS[:5]
}


def _slots(*ranges):
    out = []
    for a, b in ranges:
        m = int(a[:2]) * 60 + int(a[3:])
        end = int(b[:2]) * 60 + int(b[3:])
        while m < end:
            out.append(f"{m // 60:02d}:{m % 60:02d}")
            m += 30
    return out


OFFICE_SCHED = {WeekDay(d): _slots(("09:00", "12:00"), ("13:00", "18:00")) for d in DAYS[:5]}


def test_compact_schedule():
    c = compact_schedule({WeekDay.MONDAY: _slots(("09:00", "12:00"), ("23:00", "24:00"))})
    assert c["monday"] == [["09:00", "12:00"], ["23:00", "24:00"]]
    assert set(c) == set(DAYS) and c["tuesday"] == []


def test_next_on_off_previous_off_basic():
    now = datetime(2026, 11, 17, 10, 0, tzinfo=PARIS)  # Tuesday, occupied
    assert next_off(OFFICE_SCHED, now) == datetime(2026, 11, 17, 12, 0, tzinfo=PARIS)
    assert next_on(OFFICE_SCHED, now) == datetime(2026, 11, 17, 13, 0, tzinfo=PARIS)
    assert previous_off(OFFICE_SCHED, now) == datetime(2026, 11, 16, 18, 0, tzinfo=PARIS)


def test_week_wrap():
    now = datetime(2026, 11, 20, 19, 0, tzinfo=PARIS)  # Friday evening
    assert next_on(OFFICE_SCHED, now) == datetime(2026, 11, 23, 9, 0, tzinfo=PARIS)
    assert previous_off(OFFICE_SCHED, now) == datetime(2026, 11, 20, 18, 0, tzinfo=PARIS)
    assert next_off(OFFICE_SCHED, now) == datetime(2026, 11, 23, 12, 0, tzinfo=PARIS)


def test_none_when_empty():
    now = datetime(2026, 11, 20, 19, 0, tzinfo=PARIS)
    assert next_on({}, now) is None and next_off({}, now) is None and previous_off({}, now) is None
    assert not occupied_today({}, now) and not occupied_tomorrow({}, now)


def test_dst_fall_back_elapsed_time():
    sched = {WeekDay.SUNDAY: _slots(("00:00", "01:00")), WeekDay.MONDAY: _slots(("09:00", "10:00"))}
    now = datetime(2026, 10, 24, 23, 0, tzinfo=PARIS)  # Saturday
    result = next_on(sched, now)
    assert result.astimezone(timezone.utc) == datetime(2026, 10, 24, 22, 0, tzinfo=timezone.utc)
    now = datetime(2026, 10, 25, 12, 0, tzinfo=PARIS)
    got = next_on(sched, now)
    assert got.astimezone(timezone.utc) == datetime(2026, 10, 26, 8, 0, tzinfo=timezone.utc)
    assert got.hour == 9
    off = previous_off(sched, now)
    assert off.astimezone(timezone.utc) == datetime(2026, 10, 24, 23, 0, tzinfo=timezone.utc)


def test_dst_day_with_25_hours_occupied_today():
    sched = {WeekDay.SUNDAY: ["23:30"]}
    now = datetime(2026, 10, 25, 3, 0, tzinfo=PARIS)
    assert occupied_today(sched, now)


def test_occupied_today_tomorrow_window():
    now = datetime(2026, 11, 17, 19, 0, tzinfo=PARIS)
    assert not occupied_today(OFFICE_SCHED, now)
    assert occupied_tomorrow(OFFICE_SCHED, now)
    assert not occupied_tomorrow(OFFICE_SCHED, datetime(2026, 11, 20, 19, 0, tzinfo=PARIS))
    assert occupied_tomorrow(OFFICE_SCHED, datetime(2026, 11, 22, 19, 0, tzinfo=PARIS))  # Sunday -> Monday wrap
    assert occupied_today(OFFICE_SCHED, datetime(2026, 11, 17, 17, 30, tzinfo=PARIS))
    assert window_matches(OFFICE_SCHED, WeekDay.MONDAY, "11:00", "12:00")
    assert not window_matches(OFFICE_SCHED, WeekDay.MONDAY, "12:00", "13:00")
    assert not window_matches(OFFICE_SCHED, WeekDay.SATURDAY, "00:00", "24:00")


async def _setup(hass, tz="Europe/Paris"):
    await hass.config.async_set_time_zone(tz)
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def _office(hass, area="open_space"):
    await hass.services.async_call(DOMAIN, "set_calendar", {"person": "person.a", "calendar": OFFICE}, blocking=True)
    await hass.services.async_call(DOMAIN, "assign_person_area", {"person": "person.a", "area": area}, blocking=True)
    await hass.async_block_till_done()


async def test_entities_office(hass, freezer):
    freezer.move_to("2026-11-17 10:00:00+01:00")
    await _setup(hass)
    await _office(hass)
    main = hass.states.get("binary_sensor.share_space_open_space")
    assert main.state == "on"
    assert main.attributes["schedule"]["monday"] == [["09:00", "12:00"], ["13:00", "18:00"]]
    assert main.attributes["schedule"]["sunday"] == []
    assert hass.states.get("sensor.share_space_open_space_next_off").state == "2026-11-17T11:00:00+00:00"
    assert hass.states.get("sensor.share_space_open_space_next_on").state == "2026-11-17T12:00:00+00:00"
    assert hass.states.get("sensor.share_space_open_space_previous_off").state == "2026-11-16T17:00:00+00:00"
    assert hass.states.get("sensor.share_space_open_space_next_on").attributes["device_class"] == "timestamp"
    assert hass.states.get("binary_sensor.share_space_open_space_occupied_today").state == "on"
    assert hass.states.get("binary_sensor.share_space_open_space_occupied_tomorrow").state == "on"

    freezer.move_to("2026-11-20 19:00:00+01:00")
    from pytest_homeassistant_custom_component.common import async_fire_time_changed

    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get("binary_sensor.share_space_open_space").state == "off"
    assert hass.states.get("sensor.share_space_open_space_next_on").state == "2026-11-23T08:00:00+00:00"
    assert hass.states.get("binary_sensor.share_space_open_space_occupied_today").state == "off"
    assert hass.states.get("binary_sensor.share_space_open_space_occupied_tomorrow").state == "off"


async def test_entities_unknown_when_empty(hass, freezer):
    freezer.move_to("2026-11-17 10:00:00+01:00")
    await _setup(hass)
    await hass.services.async_call(DOMAIN, "assign_person_area", {"person": "person.a", "area": "lab"}, blocking=True)
    await hass.async_block_till_done()
    assert hass.states.get("sensor.share_space_lab_next_on").state == "unknown"
    assert hass.states.get("binary_sensor.share_space_lab_occupied_today").state == "off"


async def test_entities_appear_with_first_person(hass, freezer):
    freezer.move_to("2026-11-17 10:00:00+01:00")
    await _setup(hass)
    ids = [
        "sensor.share_space_lab_next_on",
        "sensor.share_space_lab_next_off",
        "sensor.share_space_lab_previous_off",
        "binary_sensor.share_space_lab_occupied_today",
        "binary_sensor.share_space_lab_occupied_tomorrow",
    ]
    assert all(hass.states.get(i) is None for i in ids)
    await hass.services.async_call(DOMAIN, "assign_person_area", {"person": "person.a", "area": "lab"}, blocking=True)
    await hass.async_block_till_done()
    assert all(hass.states.get(i) is not None for i in ids)


async def _query(hass, **data):
    return await hass.services.async_call(DOMAIN, "query_occupancy", data, blocking=True, return_response=True)


async def test_query_occupancy(hass, freezer):
    freezer.move_to("2026-11-17 10:00:00+01:00")  # Tuesday
    await _setup(hass)
    await _office(hass)
    morning = {"start": "11:00", "end": "12:00"}
    lunch = {"start": "12:00", "end": "13:00"}
    afternoon = {"start": "13:00", "end": "14:00"}
    r = await _query(hass, area="open_space", windows=[morning, afternoon])
    assert r == {"occupied": True, "matches": [True, True]}
    r = await _query(hass, area="open_space", windows=[morning, lunch])
    assert r == {"occupied": False, "matches": [True, False]}
    r = await _query(hass, area="open_space", windows=[morning, lunch], match="any")
    assert r["occupied"] is True
    r = await _query(hass, area="open_space", windows=[lunch], match="any")
    assert r == {"occupied": False, "matches": [False]}
    r = await _query(hass, area="open_space", windows=[morning], day="saturday")
    assert r["occupied"] is False
    r = await _query(hass, area="open_space", windows=[morning], day="monday")
    assert r["occupied"] is True


async def test_query_occupancy_tomorrow(hass, freezer):
    freezer.move_to("2026-11-20 10:00:00+01:00")  # Friday
    await _setup(hass)
    await _office(hass)
    w = [{"start": "09:00", "end": "10:00"}]
    assert (await _query(hass, area="open_space", windows=w))["occupied"] is True
    assert (await _query(hass, area="open_space", windows=w, day="tomorrow"))["occupied"] is False


async def test_query_occupancy_invalid(hass, freezer):
    freezer.move_to("2026-11-20 10:00:00+01:00")
    await _setup(hass)
    import voluptuous as vol

    with pytest.raises(vol.Invalid):
        await _query(hass, area="x", windows=[], match="all")
    with pytest.raises(vol.Invalid):
        await _query(hass, area="x", windows=[{"start": "09:00", "end": "10:00"}], day="funday")
