"""Tests for driving scheduler-component's own schedule entities from an area's merged calendar."""
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.share_space.const import DOMAIN


async def _setup_entry(hass):
    entry = MockConfigEntry(domain=DOMAIN)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _register_fake_scheduler(hass: HomeAssistant) -> dict:
    """A minimal stand-in for scheduler-component: records every add/edit/remove call, and
    (like the real integration) creates/deletes a `switch.schedule_*` entity on add/remove so
    our before/after entity-id diffing has something real to detect."""
    calls: dict[str, list[dict]] = {"add": [], "edit": [], "remove": []}
    counter = {"next": 0}

    async def handle_add(call):
        calls["add"].append(dict(call.data))
        counter["next"] += 1
        hass.states.async_set(f"switch.schedule_{counter['next']}", "on")

    async def handle_edit(call):
        calls["edit"].append(dict(call.data))

    async def handle_remove(call):
        calls["remove"].append(dict(call.data))
        hass.states.async_remove(call.data["entity_id"])

    hass.services.async_register("scheduler", "add", handle_add)
    hass.services.async_register("scheduler", "edit", handle_edit)
    hass.services.async_register("scheduler", "remove", handle_remove)
    return calls


async def test_set_area_action_creates_scheduler_entity_from_merged_calendar(hass):
    """The core point: configuring an on_action for an area creates a real scheduler-component
    schedule whose timeslots exactly match that area's current merged calendar."""
    calls = _register_fake_scheduler(hass)
    await _setup_entry(hass)

    await hass.services.async_call(
        DOMAIN, "assign_person_area", {"person": "person.alice", "area": "bureau"}, blocking=True
    )
    await hass.services.async_call(
        DOMAIN,
        "set_calendar",
        {"person": "person.alice", "calendar": {"monday": [{"start": "09:00", "end": "10:00"}]}},
        blocking=True,
    )

    on_action = [{"action": "light.turn_on", "target": {"entity_id": "light.bureau"}, "data": {"brightness": 200}}]
    await hass.services.async_call(
        DOMAIN, "set_area_action", {"area": "bureau", "on_action": on_action}, blocking=True
    )

    assert len(calls["add"]) == 1
    payload = calls["add"][0]
    assert payload["weekdays"] == ["mon"]
    assert payload["timeslots"] == [
        {
            "start": "09:00",
            "stop": "10:00",
            "actions": [{"service": "light.turn_on", "entity_id": "light.bureau", "service_data": {"brightness": 200}}],
        }
    ]


async def test_set_area_action_extends_existing_entity_when_pattern_grows(hass):
    """Adding a day with the *same* on-slot pattern extends the existing schedule's weekdays
    via scheduler.edit, rather than creating a redundant second schedule entity."""
    calls = _register_fake_scheduler(hass)
    await _setup_entry(hass)

    await hass.services.async_call(
        DOMAIN, "assign_person_area", {"person": "person.alice", "area": "bureau"}, blocking=True
    )
    await hass.services.async_call(
        DOMAIN,
        "set_calendar",
        {"person": "person.alice", "calendar": {"monday": [{"start": "09:00", "end": "10:00"}]}},
        blocking=True,
    )
    await hass.services.async_call(
        DOMAIN,
        "set_area_action",
        {"area": "bureau", "on_action": [{"action": "light.turn_on", "target": {"entity_id": "light.bureau"}}]},
        blocking=True,
    )
    assert len(calls["add"]) == 1
    created_entity_id = next(iter(hass.states.async_entity_ids("switch")))

    await hass.services.async_call(
        DOMAIN,
        "set_calendar",
        {
            "person": "person.alice",
            "calendar": {
                "monday": [{"start": "09:00", "end": "10:00"}],
                "tuesday": [{"start": "09:00", "end": "10:00"}],
            },
        },
        blocking=True,
    )

    assert len(calls["add"]) == 1, "no new schedule entity should have been created"
    assert len(calls["edit"]) == 1
    assert calls["edit"][0]["entity_id"] == created_entity_id
    assert sorted(calls["edit"][0]["weekdays"]) == ["mon", "tue"]


async def test_clearing_area_action_removes_scheduler_entity(hass):
    """Clearing the configured action tears down whatever schedule we previously created."""
    calls = _register_fake_scheduler(hass)
    await _setup_entry(hass)

    await hass.services.async_call(
        DOMAIN, "assign_person_area", {"person": "person.alice", "area": "bureau"}, blocking=True
    )
    await hass.services.async_call(
        DOMAIN,
        "set_calendar",
        {"person": "person.alice", "calendar": {"monday": [{"start": "09:00", "end": "10:00"}]}},
        blocking=True,
    )
    await hass.services.async_call(
        DOMAIN,
        "set_area_action",
        {"area": "bureau", "on_action": [{"action": "light.turn_on", "target": {"entity_id": "light.bureau"}}]},
        blocking=True,
    )
    created_entity_id = next(iter(hass.states.async_entity_ids("switch")))

    await hass.services.async_call(DOMAIN, "set_area_action", {"area": "bureau", "on_action": []}, blocking=True)

    assert calls["remove"] == [{"entity_id": created_entity_id}]
    assert hass.states.get(created_entity_id) is None
