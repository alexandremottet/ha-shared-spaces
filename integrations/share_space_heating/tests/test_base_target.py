"""set_base_target, off modes, blueprint install."""
from datetime import timedelta
from pathlib import Path

import pytest
import voluptuous as vol
from homeassistant.core import Context
from pytest_homeassistant_custom_component.common import async_fire_time_changed, async_mock_service

from custom_components.share_space_heating import _install_blueprints
from custom_components.share_space_heating.const import DOMAIN

from .test_zone import CLIMATE, PRESENCE, SENSOR, _climate, _setup, _temps


@pytest.fixture
def calls(hass):
    _climate(hass, 20.0)
    return async_mock_service(hass, "climate", "set_temperature")


async def _base(hass, **data):
    await hass.services.async_call(DOMAIN, "set_base_target", {"entity_id": SENSOR, **data}, blocking=True)
    await hass.async_block_till_done()


async def test_temperature_sets_automation_mode(hass, calls):
    await _setup(hass, presence=None)
    await _base(hass, temperature=19.5, reason="Because")
    state = hass.states.get(SENSOR)
    assert state.state == "19.5"
    assert state.attributes["mode"] == "automation"
    assert state.attributes["active_rule"] == "Because"
    assert _temps(calls) == [19.5]


async def test_preset_follows_zone_temps(hass, calls):
    await _setup(hass, presence=None)
    await _base(hass, preset="eco")
    assert hass.states.get(SENSOR).state == "17.0"
    await _base(hass, preset="comfort", reason="x")
    assert hass.states.get(SENSOR).state == "21.0"
    assert hass.states.get(SENSOR).attributes["active_rule"] == "x"


async def test_exactly_one_selector(hass, calls):
    await _setup(hass, presence=None)
    with pytest.raises(vol.Invalid):
        await _base(hass, temperature=20, preset="eco")


async def test_clear_returns_to_presence(hass, calls):
    hass.states.async_set(PRESENCE, "off")
    await _setup(hass)
    await _base(hass, temperature=23, reason="r")
    assert hass.states.get(SENSOR).state == "23.0"
    await _base(hass)
    state = hass.states.get(SENSOR)
    assert state.state == "17.0"
    assert state.attributes["mode"] == "schedule"
    assert state.attributes["active_rule"] is None


async def test_base_beats_presence(hass, calls):
    hass.states.async_set(PRESENCE, "on")
    await _setup(hass)
    await _base(hass, temperature=18)
    hass.states.async_set(PRESENCE, "off")
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).state == "18.0"


async def test_override_over_base_then_expiry(hass, calls, freezer):
    await _setup(hass, presence=None)
    await _base(hass, temperature=19, reason="r")
    await hass.services.async_call(
        DOMAIN, "set_override", {"entity_id": SENSOR, "temperature": 24, "hours": 1}, blocking=True
    )
    state = hass.states.get(SENSOR)
    assert state.state == "24.0"
    assert state.attributes["mode"] == "override"
    await _base(hass, temperature=18, reason="r2")
    assert hass.states.get(SENSOR).state == "24.0"
    freezer.tick(timedelta(hours=1, seconds=5))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    state = hass.states.get(SENSOR)
    assert state.state == "18.0"
    assert state.attributes["mode"] == "automation"
    assert state.attributes["active_rule"] == "r2"
    assert _temps(calls)[-1] == 18.0


async def test_off_frost_default(hass, calls):
    await _setup(hass, presence=None)
    await _base(hass, off=True, reason="Away")
    state = hass.states.get(SENSOR)
    assert state.state == "7.0"
    assert state.attributes["active_rule"] == "Away"
    assert _temps(calls) == [7.0]


async def test_off_frost_custom_temp(hass, calls):
    await _setup(hass, presence=None, frost_temp=9.0)
    await _base(hass, off=True)
    assert hass.states.get(SENSOR).state == "9.0"


async def test_off_hvac_off_then_heat(hass, calls):
    modes = async_mock_service(hass, "climate", "set_hvac_mode")
    await _setup(hass, presence=None, off_mode="hvac_off")
    await _base(hass, off=True, reason="Away")
    assert [c.data["hvac_mode"] for c in modes] == ["off"]
    assert _temps(calls) == []
    hass.states.async_set(CLIMATE, "off", {"temperature": 20.0})
    await hass.async_block_till_done()
    await _base(hass, temperature=21, reason="Occupied")
    assert [c.data["hvac_mode"] for c in modes] == ["off", "heat"]
    assert _temps(calls) == [21.0]
    assert hass.states.get(SENSOR).state == "21.0"


async def test_hvac_off_repeat_is_idempotent_and_same_temp_restores_heat(hass, calls):
    modes = async_mock_service(hass, "climate", "set_hvac_mode")
    await _setup(hass, presence=None, off_mode="hvac_off")
    await _base(hass, temperature=21)
    await _base(hass, off=True)
    await _base(hass, off=True)
    assert [c.data["hvac_mode"] for c in modes] == ["off"]
    hass.states.async_set(CLIMATE, "off", {"temperature": 21.0})
    await _base(hass, temperature=21)
    assert [c.data["hvac_mode"] for c in modes][-1] == "heat"
    assert _temps(calls) == [21.0, 21.0]


async def test_unchanged_base_does_not_call_climate(hass, calls):
    await _setup(hass, presence=None)
    await _base(hass, temperature=21, reason="Occupied")
    await _base(hass, temperature=21, reason="Preheat")
    assert _temps(calls) == [21.0]
    assert hass.states.get(SENSOR).attributes["active_rule"] == "Preheat"
    await _base(hass, temperature=19, reason="Preheat")
    assert _temps(calls) == [21.0, 19.0]


async def test_manual_hvac_off_not_reverted(hass, calls):
    modes = async_mock_service(hass, "climate", "set_hvac_mode")
    await _setup(hass, presence=None)
    await _base(hass, temperature=21)
    hass.states.async_set(CLIMATE, "off", {"temperature": 21.0})
    await hass.async_block_till_done()
    await _base(hass, temperature=22)
    assert modes == []


async def test_base_persisted_before_climate_call(hass, calls, hass_storage):
    await _setup(hass, presence=None)
    seen = {}

    async def spy(call):
        seen.update(next(iter(hass_storage["share_space_heating.overrides"]["data"].values())))

    hass.services.async_remove("climate", "set_temperature")
    hass.services.async_register("climate", "set_temperature", spy)
    await _base(hass, temperature=19, reason="R")
    assert seen["base"]["temp"] == 19.0


async def test_clear_base_with_no_selector(hass, calls):
    await _setup(hass, presence=None)
    await _base(hass, temperature=19, reason="R")
    await _base(hass)
    assert hass.states.get(SENSOR).attributes["mode"] == "manual_only"


async def test_own_changes_not_external(hass, calls):
    modes = async_mock_service(hass, "climate", "set_hvac_mode")
    await _setup(hass, presence=None, off_mode="hvac_off")
    await _base(hass, temperature=21)
    hass.states.async_set(CLIMATE, "heat", {"temperature": 21.0})
    await hass.async_block_till_done()
    await _base(hass, off=True)
    ctx = Context(parent_id=None)
    hass.states.async_set(CLIMATE, "off", {"temperature": None}, context=ctx)
    await hass.async_block_till_done()
    await _base(hass, temperature=22)
    hass.states.async_set(CLIMATE, "heat", {"temperature": 22.0})
    await hass.async_block_till_done()
    state = hass.states.get(SENSOR)
    assert state.attributes["mode"] == "automation"
    assert state.state == "22.0"
    assert state.attributes["override_temp"] is None


async def test_frost_own_change_not_external(hass, calls):
    await _setup(hass, presence=None)
    await _base(hass, off=True)
    hass.states.async_set(CLIMATE, "heat", {"temperature": 7.0})
    await hass.async_block_till_done()
    assert hass.states.get(SENSOR).attributes["mode"] == "automation"


async def test_external_change_still_overrides_base(hass, calls):
    await _setup(hass, presence=None)
    await _base(hass, temperature=19)
    hass.states.async_set(CLIMATE, "heat", {"temperature": 25.0})
    await hass.async_block_till_done()
    state = hass.states.get(SENSOR)
    assert state.attributes["mode"] == "override"
    assert state.state == "25.0"


async def test_base_persists_across_reload(hass, calls):
    entry = await _setup(hass, presence=None)
    await _base(hass, preset="eco", reason="keep")
    _climate(hass, 17.0)
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    state = hass.states.get(SENSOR)
    assert state.attributes["mode"] == "automation"
    assert state.attributes["active_rule"] == "keep"
    assert state.state == "17.0"


async def test_no_base_by_default(hass, calls):
    await _setup(hass, presence=None)
    assert hass.states.get(SENSOR).attributes["active_rule"] is None
    assert hass.states.get(SENSOR).attributes["mode"] == "manual_only"


async def test_ws_update_zone_options(hass, calls, hass_ws_client):
    entry = await _setup(hass, presence=None)
    client = await hass_ws_client(hass)
    await client.send_json(
        {"id": 1, "type": f"{DOMAIN}/update_zone", "entry_id": entry.entry_id, "frost_temp": 10, "off_mode": "hvac_off"}
    )
    msg = await client.receive_json()
    assert msg["success"]
    assert "active_rule" in msg["result"]
    assert entry.options["frost_temp"] == 10
    assert entry.options["off_mode"] == "hvac_off"
    await client.send_json({"id": 2, "type": f"{DOMAIN}/update_zone", "entry_id": entry.entry_id, "frost_temp": 20})
    assert not (await client.receive_json())["success"]
    await client.send_json({"id": 3, "type": f"{DOMAIN}/update_zone", "entry_id": entry.entry_id, "off_mode": "x"})
    assert not (await client.receive_json())["success"]


async def test_options_flow_accepts_new_options(hass, calls):
    entry = await _setup(hass, presence=None)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            "comfort_temp": 21,
            "eco_temp": 17,
            "default_override_hours": 3,
            "max_override_hours": 12,
            "frost_temp": 8,
            "off_mode": "hvac_off",
        },
    )
    assert result["type"] == "create_entry"
    assert entry.options["off_mode"] == "hvac_off"


async def test_blueprints_installed_not_overwritten(hass, calls):
    await _setup(hass, presence=None)
    dest = hass.config.path("blueprints/automation/share_space")
    assert (Path(dest) / "rules.yaml").exists()
    assert not (Path(dest) / "office_saver.yaml").exists()
    custom = Path(dest) / "rules.yaml"
    custom.write_text("user edit")
    await hass.async_add_executor_job(_install_blueprints, Path(dest))
    assert custom.read_text() == "user edit"

    custom.write_text("# share_space_blueprint_version: 0\nstale-copy")
    await hass.async_add_executor_job(_install_blueprints, Path(dest))
    assert "share_space_blueprint_version: 4" in custom.read_text()
    assert "stale-copy" not in custom.read_text()

    custom.write_text("# share_space_blueprint_version: 9\nnewer")
    await hass.async_add_executor_job(_install_blueprints, Path(dest))
    assert custom.read_text().endswith("newer")
