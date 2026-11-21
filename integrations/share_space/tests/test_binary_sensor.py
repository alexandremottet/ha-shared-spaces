"""Area occupancy binary sensor."""
from datetime import timedelta

from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

from custom_components.share_space.const import DOMAIN

CAL = {"monday": [{"start": "10:00", "end": "11:00"}]}


async def _setup(hass):
    await hass.config.async_set_time_zone("UTC")
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def _assign(hass, person="person.a", area="office"):
    await hass.services.async_call(DOMAIN, "assign_person_area", {"person": person, "area": area}, blocking=True)
    await hass.async_block_till_done()


async def test_sensor_follows_schedule(hass, freezer):
    freezer.move_to("2026-01-05 09:00:00+00:00")  # Monday
    await _setup(hass)
    await hass.services.async_call(DOMAIN, "set_calendar", {"person": "person.a", "calendar": CAL}, blocking=True)
    await _assign(hass)
    state = hass.states.get("binary_sensor.share_space_office")
    assert state.state == "off"
    assert state.attributes["device_class"] == "occupancy"
    assert state.attributes["persons"] == ["person.a"]
    assert state.attributes["next_change"].startswith("2026-01-05T10:00")

    freezer.move_to("2026-01-05 10:29:00+00:00")
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    state = hass.states.get("binary_sensor.share_space_office")
    assert state.state == "on"
    assert state.attributes["next_change"].startswith("2026-01-05T11:00")

    freezer.move_to("2026-01-05 11:00:00+00:00")
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get("binary_sensor.share_space_office").state == "off"


async def test_calendar_change_updates_immediately(hass, freezer):
    freezer.move_to("2026-01-05 10:15:00+00:00")
    await _setup(hass)
    await _assign(hass)
    assert hass.states.get("binary_sensor.share_space_office").state == "off"
    await hass.services.async_call(DOMAIN, "set_calendar", {"person": "person.a", "calendar": CAL}, blocking=True)
    await hass.async_block_till_done()
    assert hass.states.get("binary_sensor.share_space_office").state == "on"


async def test_area_entity_appears_dynamically(hass, freezer):
    freezer.move_to("2026-01-05 09:00:00+00:00")
    await _setup(hass)
    assert hass.states.get("binary_sensor.share_space_lab") is None
    await _assign(hass, area="lab")
    assert hass.states.get("binary_sensor.share_space_lab") is not None
