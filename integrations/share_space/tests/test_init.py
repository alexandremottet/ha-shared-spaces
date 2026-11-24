"""Tests for the share_space integration setup, services, and the frontend/backend boundary."""
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.share_space.const import (
    DATA_PERSON_AREA_STORE,
    DATA_PERSON_CALENDAR_STORE,
    DOMAIN,
)


async def _setup_entry(hass):
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_frontend_set_calendar_via_websocket(hass, hass_ws_client):
    """Send the exact WebSocket message the share-space-card/panel wrapper sends on save."""
    entry = await _setup_entry(hass)

    client = await hass_ws_client(hass)
    calendar = {"monday": [{"start": "09:00", "end": "17:00"}]}

    await client.send_json(
        {
            "id": 1,
            "type": "call_service",
            "domain": DOMAIN,
            "service": "set_calendar",
            "service_data": {"person": "person.alice", "calendar": calendar},
        }
    )
    response = await client.receive_json()
    assert response["success"], response

    store = hass.data[DOMAIN][entry.entry_id][DATA_PERSON_CALENDAR_STORE]
    assert store.get("person.alice") == calendar


async def test_set_calendar_rejects_bad_time_format(hass, hass_ws_client):
    await _setup_entry(hass)
    client = await hass_ws_client(hass)

    await client.send_json(
        {
            "id": 1,
            "type": "call_service",
            "domain": DOMAIN,
            "service": "set_calendar",
            "service_data": {"person": "person.alice", "calendar": {"monday": [{"start": "9am", "end": "17:00"}]}},
        }
    )
    response = await client.receive_json()
    assert not response["success"]


async def test_set_calendar_rejects_non_person_entity(hass, hass_ws_client):
    await _setup_entry(hass)
    client = await hass_ws_client(hass)

    await client.send_json(
        {
            "id": 1,
            "type": "call_service",
            "domain": DOMAIN,
            "service": "set_calendar",
            "service_data": {"person": "sensor.not_a_person", "calendar": {}},
        }
    )
    response = await client.receive_json()
    assert not response["success"]


async def test_get_calendar_websocket_roundtrip(hass, hass_ws_client):
    """One person's own calendar read path: set via service, read back via WS command."""
    await _setup_entry(hass)
    client = await hass_ws_client(hass)
    calendar = {"monday": [{"start": "09:00", "end": "17:00"}]}

    await hass.services.async_call(
        DOMAIN, "set_calendar", {"person": "person.alice", "calendar": calendar}, blocking=True
    )

    await client.send_json({"id": 1, "type": "share_space/get_calendar", "person": "person.alice"})
    response = await client.receive_json()
    assert response["success"]
    assert response["result"]["calendar"] == calendar

    await client.send_json({"id": 2, "type": "share_space/get_calendar", "person": "person.unknown"})
    response = await client.receive_json()
    assert response["success"]
    assert response["result"]["calendar"] == {}


async def test_assign_person_area_then_get_person_area_websocket(hass, hass_ws_client):
    """The panel's person->area resolution path: assign via service, read back via WS command."""
    entry = await _setup_entry(hass)

    events = []
    hass.bus.async_listen("share_space_person_area_assigned", events.append)

    await hass.services.async_call(
        DOMAIN, "assign_person_area", {"person": "person.alex", "area": "living_room"}, blocking=True
    )
    await hass.async_block_till_done()

    assert len(events) == 1
    assert events[0].data == {"person": "person.alex", "area": "living_room"}

    person_area_store = hass.data[DOMAIN][entry.entry_id][DATA_PERSON_AREA_STORE]
    assert person_area_store.get("person.alex") == "living_room"

    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "share_space/get_person_area", "person": "person.alex"})
    response = await client.receive_json()
    assert response["success"]
    assert response["result"]["area"] == "living_room"

    await client.send_json({"id": 2, "type": "share_space/get_person_area", "person": "person.unknown"})
    response = await client.receive_json()
    assert response["success"]
    assert response["result"]["area"] is None


async def test_assign_person_area_rejects_non_person_entity(hass, hass_ws_client):
    await _setup_entry(hass)
    client = await hass_ws_client(hass)

    await client.send_json(
        {
            "id": 1,
            "type": "call_service",
            "domain": DOMAIN,
            "service": "assign_person_area",
            "service_data": {"person": "sensor.not_a_person", "area": "living_room"},
        }
    )
    response = await client.receive_json()
    assert not response["success"]


async def test_area_schedule_merges_every_assigned_person(hass, hass_ws_client):
    """The actual point of the person-keyed model: two people sharing an area, each with their
    own calendar, get merged into one effective schedule -- not clobbering each other."""
    await _setup_entry(hass)
    client = await hass_ws_client(hass)

    await hass.services.async_call(
        DOMAIN,
        "assign_person_area",
        {"person": "person.alice", "area": "bureau"},
        blocking=True,
    )
    await hass.services.async_call(
        DOMAIN,
        "assign_person_area",
        {"person": "person.bob", "area": "bureau"},
        blocking=True,
    )
    await hass.services.async_call(
        DOMAIN,
        "set_calendar",
        {"person": "person.alice", "calendar": {"monday": [{"start": "09:00", "end": "10:00"}]}},
        blocking=True,
    )
    await hass.services.async_call(
        DOMAIN,
        "set_calendar",
        {"person": "person.bob", "calendar": {"monday": [{"start": "09:30", "end": "11:00"}]}},
        blocking=True,
    )

    await client.send_json({"id": 1, "type": "share_space/get_area_schedule", "area": "bureau"})
    response = await client.receive_json()
    assert response["success"], response

    schedule = response["result"]["schedule"]
    assert schedule["monday"] == ["09:00", "09:30", "10:00", "10:30"]
    assert schedule["tuesday"] == []

    # Each person's own calendar is still independently readable, unclobbered by the other.
    await client.send_json({"id": 2, "type": "share_space/get_calendar", "person": "person.alice"})
    alice = await client.receive_json()
    assert alice["result"]["calendar"] == {"monday": [{"start": "09:00", "end": "10:00"}]}

    await client.send_json({"id": 3, "type": "share_space/get_calendar", "person": "person.bob"})
    bob = await client.receive_json()
    assert bob["result"]["calendar"] == {"monday": [{"start": "09:30", "end": "11:00"}]}


async def test_get_area_calendars_returns_each_persons_own_calendar(hass, hass_ws_client):
    """Unlike get_area_schedule (flattened on/off), get_area_calendars keeps attribution --
    the raw per-person calendars a read-only per-person view needs to render."""
    await _setup_entry(hass)
    client = await hass_ws_client(hass)

    await hass.services.async_call(
        DOMAIN, "assign_person_area", {"person": "person.alice", "area": "bureau"}, blocking=True
    )
    await hass.services.async_call(
        DOMAIN, "assign_person_area", {"person": "person.bob", "area": "bureau"}, blocking=True
    )
    await hass.services.async_call(
        DOMAIN,
        "set_calendar",
        {"person": "person.alice", "calendar": {"monday": [{"start": "09:00", "end": "10:00"}]}},
        blocking=True,
    )
    await hass.services.async_call(
        DOMAIN,
        "set_calendar",
        {"person": "person.bob", "calendar": {"monday": [{"start": "09:30", "end": "11:00"}]}},
        blocking=True,
    )

    await client.send_json({"id": 1, "type": "share_space/get_area_calendars", "area": "bureau"})
    response = await client.receive_json()
    assert response["success"], response

    persons = response["result"]["persons"]
    assert persons["person.alice"] == {"monday": [{"start": "09:00", "end": "10:00"}]}
    assert persons["person.bob"] == {"monday": [{"start": "09:30", "end": "11:00"}]}



async def test_planning_lives_in_a_schedule_helper(hass, hass_ws_client):
    """A planning is an HA Schedule helper: edits made in HA show up in Share Space."""
    from homeassistant.helpers import entity_registry as er

    await _setup_entry(hass)
    await hass.services.async_call(DOMAIN, "assign_person_area", {"person": "person.alice", "area": "bureau"}, blocking=True)
    await hass.services.async_call(
        DOMAIN,
        "set_calendar",
        {"person": "person.alice", "calendar": {"monday": [{"start": "09:00", "end": "12:00"}, {"start": "11:00", "end": "13:00"}]}},
        blocking=True,
    )
    await hass.async_block_till_done()
    assert er.async_get(hass).async_get("person.alice").area_id == "bureau"
    assert hass.states.get("schedule.planning_alice").name == "Planning Alice"

    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "schedule/list"})
    [item] = (await client.receive_json())["result"]
    assert item["monday"] == [{"from": "09:00:00", "to": "13:00:00"}]

    await client.send_json(
        {"id": 2, "type": "schedule/update", "schedule_id": item["id"], "name": "Planning Alice", "tuesday": [{"from": "08:00", "to": "24:00"}]}
    )
    assert (await client.receive_json())["success"]
    await hass.async_block_till_done()
    await client.send_json({"id": 3, "type": "share_space/get_calendar", "person": "person.alice"})
    result = (await client.receive_json())["result"]
    assert result == {"calendar": {"tuesday": [{"start": "08:00", "end": "24:00"}]}, "schedule_entity": "schedule.planning_alice"}


async def test_old_data_is_used_as_is_until_edited_in_share_space(hass, hass_storage):
    from homeassistant.helpers import entity_registry as er

    hass_storage["share_space.person_areas"] = {"version": 1, "minor_version": 1, "key": "share_space.person_areas", "data": {"person.bob": "office"}}
    hass_storage["share_space.person_calendars"] = {
        "version": 1,
        "minor_version": 1,
        "key": "share_space.person_calendars",
        "data": {"person.bob": {"friday": [{"start": "10:00", "end": "11:00"}]}},
    }
    entry = await _setup_entry(hass)
    plannings = hass.data[DOMAIN][entry.entry_id][DATA_PERSON_CALENDAR_STORE]
    assert er.async_get(hass).async_get("person.bob").area_id is None
    assert hass.states.async_entity_ids("schedule") == []
    assert plannings.get("person.bob") == {"friday": [{"start": "10:00", "end": "11:00"}]}
    assert hass.states.get("binary_sensor.share_space_office").attributes["persons"] == ["person.bob"]

    await hass.services.async_call(DOMAIN, "set_calendar", {"person": "person.bob", "calendar": {"monday": [{"start": "09:00", "end": "10:00"}]}}, blocking=True)
    await hass.services.async_call(DOMAIN, "assign_person_area", {"person": "person.bob", "area": "office"}, blocking=True)
    await hass.async_block_till_done()
    assert hass.states.get("schedule.planning_bob") is not None
    assert er.async_get(hass).async_get("person.bob").area_id == "office"
    assert hass_storage["share_space.person_calendars"]["data"] == {}
    assert hass_storage["share_space.person_areas"]["data"] == {}
