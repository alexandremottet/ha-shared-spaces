"""Shared helpers for the heating tests."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import entity_registry as er
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


def place_climate(hass, area_name: str, climate: str):
    """Put a thermostat in an area the way the HA UI does, creating both as needed."""
    area = ar.async_get(hass).async_get_or_create(area_name)
    reg = er.async_get(hass)
    if reg.async_get(climate) is None:
        # the registry would rename it climate.x_2 while a state holds the id
        state = hass.states.get(climate)
        hass.states.async_remove(climate)
        object_id = climate.split(".", 1)[1]
        reg.async_get_or_create("climate", "test", object_id, suggested_object_id=object_id)
        if state:
            hass.states.async_set(climate, state.state, state.attributes)
    reg.async_update_entity(climate, area_id=area.id)
    return area


def zone_entry(hass, name: str, climate: str, **data) -> MockConfigEntry:
    """A zone the way HA holds it: an area, the thermostat placed in it, the zone pointing at the area."""
    area = place_climate(hass, name, climate)
    entry = MockConfigEntry(domain=DOMAIN, data={"area_id": area.id, **data}, unique_id=area.id, title=name, version=2)
    entry.add_to_hass(hass)
    return entry


async def setup_zone(hass, **extra):
    hass.states.async_set(CLIMATE, "heat", {"temperature": 20.0})
    calls = async_mock_service(hass, "climate", "set_temperature")
    entry = zone_entry(hass, "Office", CLIMATE, **extra)
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
