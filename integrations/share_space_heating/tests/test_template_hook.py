"""Zone target template hook."""
from datetime import timedelta

import pytest
from pytest_homeassistant_custom_component.common import async_fire_time_changed, async_mock_service

from custom_components.share_space_heating.const import DOMAIN

from .test_zone import CLIMATE, PRESENCE, SENSOR, _climate, _setup, _temps

SOURCE = "input_number.target"


@pytest.fixture
def calls(hass):
    _climate(hass, 20.0)
    hass.states.async_set(PRESENCE, "on")
    recorded = []

    async def set_temperature(call):
        recorded.append(call)
        _climate(hass, call.data["temperature"], context=call.context)

    hass.services.async_register("climate", "set_temperature", set_temperature)
    return recorded


def _attrs(hass):
    return hass.states.get(SENSOR).attributes


async def _ws_update(hass, hass_ws_client, entry_id, token=None, **payload):
    client = await (hass_ws_client(hass, token) if token else hass_ws_client(hass))
    await client.send_json({"id": 1, "type": f"{DOMAIN}/update_zone", "entry_id": entry_id, **payload})
    response = await client.receive_json()
    await hass.async_block_till_done()
    return response


async def test_number_drives_target(hass, calls):
    await _setup(hass, target_template="{{ 19.5 }}")
    state = hass.states.get(SENSOR)
    assert state.state == "19.5"
    assert state.attributes["mode"] == "template"
    assert state.attributes["active_rule"] == "Template"
    assert state.attributes["template_result"] == "19.5"
    assert state.attributes["template_error"] is None
    assert state.attributes["target_template"] == "{{ 19.5 }}"
    assert _temps(calls) == [19.5]


@pytest.mark.parametrize(("word", "expected"), [("comfort", "21.0"), ("eco", "17.0"), ("off", "7.0")])
async def test_words(hass, calls, word, expected):
    await _setup(hass, presence=None, target_template=word)
    assert hass.states.get(SENSOR).state == expected
    assert _attrs(hass)["mode"] == "template"


async def test_off_follows_hvac_off_mode(hass, calls):
    modes = async_mock_service(hass, "climate", "set_hvac_mode")
    await _setup(hass, presence=None, off_mode="hvac_off", target_template="off")
    assert [c.data["hvac_mode"] for c in modes] == ["off"]
    assert _temps(calls) == []


async def test_frost_temp_accepted_outside_range(hass, calls):
    await _setup(hass, presence=None, frost_temp=5.0, target_template="{{ 5 }}")
    assert hass.states.get(SENSOR).state == "5.0"


async def test_none_falls_back_to_mode(hass, calls):
    await _setup(hass, target_template="{{ 'none' if base == 21.0 else 30 }}")
    state = hass.states.get(SENSOR)
    assert state.state == "21.0"
    assert state.attributes["mode"] == "schedule"
    assert state.attributes["active_rule"] is None
    assert state.attributes["template_result"] == "none"
    assert state.attributes["template_error"] is None
    hass.states.async_set(PRESENCE, "off")
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).state == "30.0"
    assert _attrs(hass)["mode"] == "template"


async def test_variables(hass, calls):
    await _setup(hass, presence=None, target_template="{{ comfort - eco + base if zone.startswith('sensor.') else 0 }}")
    assert hass.states.get(SENSOR).state == "25.0"


@pytest.mark.parametrize("source", ["banana", "{{ 40 }}", "{{ 4 }}", "{{ true }}", "nan"])
async def test_invalid_result_falls_back(hass, calls, source):
    await _setup(hass, target_template=source)
    state = hass.states.get(SENSOR)
    assert state.state == "21.0"
    assert state.attributes["mode"] == "schedule"
    assert state.attributes["template_error"]
    assert state.attributes["template_result"] is not None


async def test_render_error_falls_back(hass, calls, caplog):
    await _setup(hass, target_template="{{ undefined_thing + 1 }}")
    state = hass.states.get(SENSOR)
    assert state.state == "21.0"
    assert state.attributes["mode"] == "schedule"
    assert "undefined_thing" in state.attributes["template_error"]
    assert state.attributes["template_result"] is None
    assert _temps(calls) == [21.0]
    hass.states.async_set(PRESENCE, "off")
    await hass.async_block_till_done()
    assert caplog.text.count("target template failed") == 1


async def test_rerender_on_source_change(hass, calls):
    hass.states.async_set(SOURCE, "18")
    await _setup(hass, target_template="{{ states('input_number.target') }}")
    assert hass.states.get(SENSOR).state == "18.0"
    hass.states.async_set(SOURCE, "22.5")
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).state == "22.5"
    assert _temps(calls) == [18.0, 22.5]
    hass.states.async_set(SOURCE, "unknown")
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).state == "21.0"
    assert _attrs(hass)["mode"] == "schedule"
    assert _temps(calls)[-1] == 21.0


async def test_beats_base_target(hass, calls):
    await _setup(hass, presence=None, target_template="{{ 23 }}")
    await hass.services.async_call(
        DOMAIN, "set_base_target", {"entity_id": SENSOR, "temperature": 18, "reason": "r"}, blocking=True
    )
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).state == "23.0"
    assert _attrs(hass)["active_rule"] == "Template"


async def test_manual_override_beats_template(hass, calls, freezer):
    hass.states.async_set(SOURCE, "18")
    await _setup(hass, target_template="{{ states('input_number.target') }}")
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 24, "hours": 1}, blocking=True
    )
    await hass.async_block_till_done()
    hass.states.async_set(SOURCE, "19")
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).state == "24.0"
    assert _attrs(hass)["mode"] == "override"
    assert _temps(calls)[-1] == 24.0
    freezer.tick(timedelta(hours=1, seconds=5))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).state == "19.0"
    assert _attrs(hass)["mode"] == "template"
    assert _temps(calls)[-1] == 19.0


async def test_now_refreshes_every_minute(hass, calls, freezer):
    freezer.move_to("2026-01-05 10:00:30+00:00")
    await _setup(hass, target_template="{{ 22 if now().minute >= 1 else 'none' }}")
    assert hass.states.get(SENSOR).state == "21.0"
    freezer.move_to("2026-01-05 10:01:00+00:00")
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).state == "22.0"


async def test_update_zone_sets_and_clears(hass, calls, hass_ws_client):
    entry = await _setup(hass)
    response = await _ws_update(hass, hass_ws_client, entry.entry_id, target_template="eco")
    assert response["success"], response
    assert response["result"]["mode"] == "template"
    assert response["result"]["target_template"] == "eco"
    assert hass.states.get(SENSOR).state == "17.0"
    response = await _ws_update(hass, hass_ws_client, entry.entry_id, target_template="")
    assert response["success"], response
    state = hass.states.get(SENSOR)
    assert state.state == "21.0"
    assert state.attributes["mode"] == "schedule"
    assert state.attributes["target_template"] is None
    assert state.attributes["template_result"] is None
    assert hass.config_entries.async_get_entry(entry.entry_id).options["target_template"] is None
    assert _temps(calls)[-1] == 21.0


async def test_update_zone_replaces_tracker(hass, calls, hass_ws_client):
    hass.states.async_set(SOURCE, "18")
    entry = await _setup(hass, target_template="{{ states('input_number.target') }}")
    await _ws_update(hass, hass_ws_client, entry.entry_id, target_template="{{ 25 }}")
    count = len(calls)
    hass.states.async_set(SOURCE, "19")
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).state == "25.0"
    assert len(calls) == count


async def test_unload_removes_tracker(hass, calls):
    hass.states.async_set(SOURCE, "18")
    entry = await _setup(hass, target_template="{{ states('input_number.target') }}")
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    count = len(calls)
    hass.states.async_set(SOURCE, "19")
    await hass.async_block_till_done()
    assert len(calls) == count


async def test_update_zone_rejects_bad_syntax(hass, calls, hass_ws_client):
    entry = await _setup(hass)
    response = await _ws_update(hass, hass_ws_client, entry.entry_id, target_template="{{ 1 + }}")
    assert not response["success"]
    assert response["error"]["code"] == "invalid_format"
    assert response["error"]["message"]
    assert "target_template" not in hass.config_entries.async_get_entry(entry.entry_id).options


async def test_update_zone_non_admin(hass, calls, hass_ws_client, hass_read_only_access_token):
    entry = await _setup(hass)
    response = await _ws_update(
        hass, hass_ws_client, entry.entry_id, token=hass_read_only_access_token, target_template="eco"
    )
    assert not response["success"]
    assert response["error"]["code"] == "unauthorized"
    assert "target_template" not in hass.config_entries.async_get_entry(entry.entry_id).options


async def test_options_flow_keeps_template(hass, calls):
    entry = await _setup(hass, presence=None)
    hass.config_entries.async_update_entry(entry, options={"target_template": "eco"})
    await hass.async_block_till_done()
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {"comfort_temp": 22, "eco_temp": 16, "default_override_hours": 3, "max_override_hours": 12,
         "frost_temp": 7, "off_mode": "frost"},
    )
    await hass.async_block_till_done()
    assert entry.options["target_template"] == "eco"
    assert hass.states.get(SENSOR).state == "16.0"
