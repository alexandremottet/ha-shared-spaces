"""Shared helpers for the heating tests."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from pytest_homeassistant_custom_component.common import MockConfigEntry, async_mock_service

from custom_components.share_space_heating.const import DOMAIN

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
SLOT = timedelta(minutes=30)
CLIMATE = "climate.office"
SENSOR = "sensor.share_space_heating_office"


def _minutes(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)


def _slot_on(schedule, utc: datetime, tz: ZoneInfo, day_offset: int = 0) -> bool:
    local = utc.astimezone(tz)
    slot = (local.hour * 60 + local.minute) // 30 * 30
    return any(
        _minutes(s) <= slot < _minutes(e) for s, e in schedule[WEEKDAYS[local.weekday()]]
    )


def _floor(utc: datetime) -> datetime:
    return utc.replace(minute=utc.minute // 30 * 30, second=0, microsecond=0)


def planning_states(schedule, now: datetime, tz: ZoneInfo) -> dict:
    now = now.astimezone(ZoneInfo("UTC"))
    cur = _floor(now)
    on = lambda t: _slot_on(schedule, t, tz)  # noqa: E731
    next_on = prev_off = None
    t = cur + SLOT
    while t <= now + timedelta(days=8):
        if on(t) and not on(t - SLOT):
            next_on = t
            break
        t += SLOT
    t = cur
    while t >= now - timedelta(days=8):
        if on(t - SLOT) and not on(t):
            prev_off = t
            break
        t -= SLOT
    return {"on": on(cur), "next_on": next_on, "previous_off": prev_off}


async def setup_zone(hass, **extra):
    hass.states.async_set(CLIMATE, "heat", {"temperature": 20.0})
    calls = async_mock_service(hass, "climate", "set_temperature")
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={"name": "Office", "climate_entity": CLIMATE, "presence_entity": None, **extra},
        unique_id=CLIMATE,
        title="Office",
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry, calls


def _spy_base(hass, entry) -> list[dict]:
    """Record the zone's set_base_target calls made by run_rules."""
    zone = hass.data[DOMAIN]["zones"][entry.entry_id]
    calls, original = [], zone.async_set_base_target

    async def spy(**kwargs):
        calls.append(kwargs)
        await original(**kwargs)

    zone.async_set_base_target = spy
    return calls
