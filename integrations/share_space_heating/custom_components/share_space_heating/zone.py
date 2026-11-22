"""Heating zone controller: effective target, timed overrides, external-change detection."""
from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_OFF, STATE_ON
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_point_in_utc_time, async_track_state_change_event
from homeassistant.util import dt as dt_util
from homeassistant.util import slugify

from .climate import BAD_STATES, ClimateDriver, matches_requested
from .const import (
    CONF_CLIMATE_ENTITY,
    CONF_COMFORT_TEMP,
    CONF_DEFAULT_OVERRIDE_HOURS,
    CONF_ECO_TEMP,
    CONF_FROST_TEMP,
    CONF_MAX_OVERRIDE_HOURS,
    CONF_OFF_MODE,
    CONF_PRESENCE_ENTITY,
    CONF_TARGET_TEMPLATE,
    DEFAULT_COMFORT_TEMP,
    DEFAULT_ECO_TEMP,
    DEFAULT_FROST_TEMP,
    DEFAULT_MAX_OVERRIDE_HOURS,
    DEFAULT_OFF_MODE,
    DEFAULT_OVERRIDE_HOURS,
    DOMAIN,
    MODE_AUTOMATION,
    MODE_MANUAL_ONLY,
    MODE_OVERRIDE,
    MODE_SCHEDULE,
    MODE_TEMPLATE,
    OFF_MODE_HVAC_OFF,
    TEMPLATE_RULE,
)
from .store import OverrideStore
from .target import BaseTarget, Temps, as_float, mode_target, schedule_target
from .template_hook import TargetTemplate


class Zone:
    """Priority: manual override > target template > base target / presence (zone mode)."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, store: OverrideStore) -> None:
        self.hass = hass
        self.entry = entry
        self._store = store
        self.climate = ClimateDriver(hass, self.climate_entity)
        self.base = BaseTarget()
        self.override_temp: float | None = None
        self.override_until: datetime | None = None
        self.previous_temp: float | None = None
        self._last_presence: bool | None = None
        self._hook: TargetTemplate | None = None
        self._ready = False
        self._unsubs: list[Callable[[], None]] = []
        self._expiry_unsub: Callable[[], None] | None = None
        self._listeners: list[Callable[[], None]] = []

    # --- configuration

    @property
    def _conf(self) -> dict:
        return {**self.entry.data, **self.entry.options}

    @property
    def climate_entity(self) -> str:
        return self._conf[CONF_CLIMATE_ENTITY]

    @property
    def presence_entity(self) -> str | None:
        return self._conf.get(CONF_PRESENCE_ENTITY) or None

    @property
    def comfort_temp(self) -> float:
        return float(self._conf.get(CONF_COMFORT_TEMP, DEFAULT_COMFORT_TEMP))

    @property
    def eco_temp(self) -> float:
        return float(self._conf.get(CONF_ECO_TEMP, DEFAULT_ECO_TEMP))

    @property
    def default_hours(self) -> float:
        return float(self._conf.get(CONF_DEFAULT_OVERRIDE_HOURS, DEFAULT_OVERRIDE_HOURS))

    @property
    def max_hours(self) -> float:
        return float(self._conf.get(CONF_MAX_OVERRIDE_HOURS, DEFAULT_MAX_OVERRIDE_HOURS))

    @property
    def frost_temp(self) -> float:
        return float(self._conf.get(CONF_FROST_TEMP, DEFAULT_FROST_TEMP))

    @property
    def off_mode(self) -> str:
        return self._conf.get(CONF_OFF_MODE, DEFAULT_OFF_MODE)

    @property
    def target_template(self) -> str | None:
        return self._conf.get(CONF_TARGET_TEMPLATE) or None

    @property
    def _temps(self) -> Temps:
        return Temps(self.comfort_temp, self.eco_temp, self.frost_temp)

    # --- state shown on the sensor

    @property
    def template_result(self) -> str | None:
        return self._hook.result if self._hook else None

    @property
    def template_error(self) -> str | None:
        return self._hook.error if self._hook else None

    @property
    def _template_value(self) -> float | str | None:
        return self._hook.value if self._hook else None

    @property
    def template_active(self) -> bool:
        return self._template_value is not None

    @property
    def active_rule(self) -> str | None:
        if self.template_active:
            return TEMPLATE_RULE
        return self.base.reason if self.base.active else None

    @property
    def presence(self) -> bool | None:
        return self._last_presence

    def _refresh_presence(self) -> None:
        if self.presence_entity is None:
            self._last_presence = None
            return
        state = self.hass.states.get(self.presence_entity)
        if state is None:
            return
        if state.state == STATE_ON:
            self._last_presence = True
        elif state.state == STATE_OFF:
            self._last_presence = False

    @property
    def current_temperature(self) -> float | None:
        state = self.hass.states.get(self.climate_entity)
        return as_float(state.attributes.get("current_temperature")) if state else None

    @property
    def override_active(self) -> bool:
        return self.override_temp is not None and self.override_until is not None

    @property
    def mode(self) -> str:
        if self.override_active:
            return MODE_OVERRIDE
        if self.template_active:
            return MODE_TEMPLATE
        if self.base.active:
            return MODE_AUTOMATION
        return MODE_MANUAL_ONLY if self.presence_entity is None else MODE_SCHEDULE

    # --- target resolution

    @property
    def _off_requested(self) -> bool:
        return self._template_value == "off" if self.template_active else self.base.off

    @property
    def _mode_target(self) -> float | None:
        return mode_target(self.base, self.presence_entity is not None, self.presence, self._temps)

    @property
    def _schedule_target(self) -> float | None:
        return schedule_target(self._template_value, self._mode_target, self._temps)

    @property
    def schedule_target(self) -> float:
        target = self._schedule_target
        if target is None:
            last = self.climate.last_applied
            return last if last is not None else self.comfort_temp
        return target

    @property
    def target(self) -> float:
        return self.override_temp if self.override_active else self.schedule_target

    # --- listeners and persistence

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    @callback
    def _notify(self) -> None:
        for listener in list(self._listeners):
            listener()

    def _record(self) -> dict:
        record: dict = {"last_applied": self.climate.last_applied}
        if self.climate.hvac_off_applied:
            record["hvac_off"] = True
        if self.base.active:
            record["base"] = self.base.record()
        if self.override_active:
            record.update(
                temp=self.override_temp,
                until=self.override_until.isoformat(),
                previous_temp=self.previous_temp,
            )
        return record

    async def _async_persist(self) -> None:
        await self._store.async_set(self.entry.entry_id, self._record())

    # --- template hook

    def _zone_entity_id(self) -> str:
        entity_id = er.async_get(self.hass).async_get_entity_id("sensor", DOMAIN, self.entry.entry_id)
        return entity_id or f"sensor.{DOMAIN}_{slugify(self.entry.title)}"

    def _start_template(self) -> None:
        source = self.target_template
        if source is None:
            return
        self._hook = TargetTemplate(
            self.hass,
            source,
            self.entry.title,
            {"zone": self._zone_entity_id(), "comfort": self.comfort_temp, "eco": self.eco_temp},
            self.frost_temp,
            base=lambda: self._mode_target,
            on_update=self._handle_template_update,
        )
        self._unsubs.append(self._hook.stop)
        self._hook.start()

    @callback
    def _sync_template_base(self) -> None:
        if self._hook is not None:
            self._hook.sync_base()

    async def _handle_template_update(self, changed: bool) -> None:
        if self._ready and changed and not self.override_active:
            await self._async_apply()
        self._notify()

    # --- lifecycle

    async def async_start(self) -> None:
        self._ready = False
        self._refresh_presence()
        watched = [self.climate_entity]
        if self.presence_entity:
            watched.append(self.presence_entity)
        self._unsubs.append(async_track_state_change_event(self.hass, watched, self._handle_state_event))
        saved = self._store.get(self.entry.entry_id) or {}
        self.climate.last_applied = as_float(saved.get("last_applied"))
        self.climate.hvac_off_applied = bool(saved.get("hvac_off"))
        self.base = BaseTarget.from_record(saved.get("base"))
        self._start_template()
        await self._async_restore(saved)
        self._ready = True
        self._notify()

    async def _async_restore(self, saved: dict) -> None:
        """Resume a saved override, end an expired one, or adopt a setpoint changed while HA was down."""
        until = dt_util.parse_datetime(saved["until"]) if saved.get("until") else None
        temp = as_float(saved.get("temp"))
        previous = as_float(saved.get("previous_temp"))
        now = dt_util.utcnow()
        if until and temp is not None and until > now:
            self.override_temp = temp
            self.override_until = min(until, now + timedelta(hours=self.max_hours))
            self.previous_temp = previous
            self._schedule_expiry()
            await self.climate.async_set(temp)
            await self._async_persist()
            return
        self.previous_temp = None
        expired = until is not None and temp is not None
        last = self.climate.last_applied
        state = self.climate.state()
        device_temp = as_float(state.attributes.get("temperature")) if state else None
        if expired and self.mode == MODE_MANUAL_ONLY:
            await self._async_restore_manual(previous)
        elif (
            last is not None
            and not self.climate.hvac_off_applied
            and device_temp is not None
            and not matches_requested(device_temp, state, last)
        ):
            await self._async_start_override(device_temp, self.default_hours, apply=False, previous=last)
        else:
            await self._async_apply()
        await self._async_persist()

    @callback
    def async_stop(self) -> None:
        self._ready = False
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._expiry_unsub:
            self._expiry_unsub()
            self._expiry_unsub = None
        self._hook = None

    # --- applying the target

    async def _async_apply(self, force: bool = False) -> None:
        if self.mode == MODE_MANUAL_ONLY:
            return
        if not self.override_active and self._off_requested and self.off_mode == OFF_MODE_HVAC_OFF:
            if await self.climate.async_off(force):
                await self._async_persist()
            return
        target = self.override_temp if self.override_active else self._schedule_target
        if target is None:
            return
        if not force and target == self.climate.last_applied and not self.climate.hvac_off_applied:
            return
        await self.climate.async_set(target)
        await self._async_persist()

    async def _async_restore_manual(self, previous: float | None) -> None:
        """Manual-only zones go back to the setpoint from before the override."""
        if previous is not None:
            await self.climate.async_set(previous)
        else:
            self.climate.last_applied = None

    async def _handle_state_event(self, event: Event) -> None:
        if not self._ready:
            return
        if event.data["entity_id"] == self.presence_entity:
            self._refresh_presence()
            self._sync_template_base()
            await self._async_apply()
            self._notify()
            return
        old, new = event.data["old_state"], event.data["new_state"]
        if old is None or new is None or old.state in BAD_STATES or new.state in BAD_STATES:
            self._notify()
            return
        new_temp = as_float(new.attributes.get("temperature"))
        old_temp = as_float(old.attributes.get("temperature"))
        if new_temp is not None and old_temp is not None and new_temp != old_temp and self.climate.is_external(new_temp, new):
            await self._async_start_override(new_temp, self.default_hours, apply=False, previous=old_temp)
        self._notify()

    # --- overrides

    def _schedule_expiry(self) -> None:
        if self._expiry_unsub:
            self._expiry_unsub()
            self._expiry_unsub = None
        if self.override_until:
            self._expiry_unsub = async_track_point_in_utc_time(self.hass, self._handle_expiry, self.override_until)

    async def _handle_expiry(self, _now: datetime) -> None:
        self._expiry_unsub = None
        await self.async_clear_override()

    def _clamp(self, hours: float) -> float:
        return min(max(hours, 0.0), self.max_hours)

    async def _async_start_override(
        self, temp: float, hours: float, apply: bool = True, previous: float | None = None
    ) -> None:
        until = dt_util.utcnow() + timedelta(hours=self._clamp(hours))
        if self.override_active:
            previous = self.previous_temp
        elif previous is None:
            previous = self.climate.setpoint()
        if apply:
            await self.climate.async_set(temp)
        else:
            self.climate.last_applied = temp
        self.override_temp = temp
        self.override_until = until
        self.previous_temp = previous
        self._schedule_expiry()
        await self._async_persist()
        self._notify()

    async def async_set_override(self, temp: float, hours: float | None = None) -> None:
        await self._async_start_override(temp, self.default_hours if hours is None else hours)

    async def async_extend_override(self, hours: float) -> None:
        if not self.override_active:
            await self._async_start_override(self.target, hours)
            return
        now = dt_util.utcnow()
        current = self.override_until
        self.override_until = max(current, min(current + timedelta(hours=hours), now + timedelta(hours=self.max_hours)))
        self._schedule_expiry()
        await self._async_persist()
        self._notify()

    async def async_clear_override(self) -> None:
        had_override = self.override_active
        previous = self.previous_temp
        self.override_temp = None
        self.override_until = None
        self.previous_temp = None
        if self._expiry_unsub:
            self._expiry_unsub()
            self._expiry_unsub = None
        await self._async_persist()
        self._notify()
        if not had_override:
            return
        if self.mode == MODE_MANUAL_ONLY:
            await self._async_restore_manual(previous)
            await self._async_persist()
        else:
            await self._async_apply(force=True)

    # --- base target (automations)

    async def async_set_base_target(
        self,
        temperature: float | None = None,
        preset: str | None = None,
        off: bool = False,
        reason: str | None = None,
    ) -> None:
        changed = (self.base.temp, self.base.preset, self.base.off) != (temperature, preset, off)
        base = BaseTarget(temperature, preset, off)
        self.base = BaseTarget(temperature, preset, off, reason if base.active else None)
        self._sync_template_base()
        await self._async_persist()
        self._notify()
        if not self.override_active:
            await self._async_apply(force=changed and not self.template_active)
        self._notify()
