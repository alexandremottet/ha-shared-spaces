"""Areas and person entities the tests assign plannings to, as HA would hold them."""
import pytest
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import entity_registry as er

AREAS = ("office", "bureau", "living_room", "lab", "open_space")
PERSONS = ("a", "alice", "bob", "alex")


@pytest.fixture(autouse=True)
def ha_people(hass):
    areas = ar.async_get(hass)
    for area in AREAS:
        areas.async_create(area)
    entities = er.async_get(hass)
    for person in PERSONS:
        entities.async_get_or_create("person", "person", person, suggested_object_id=person)
