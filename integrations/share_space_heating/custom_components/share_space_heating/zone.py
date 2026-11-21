"""Heating zone controller: effective target, timed overrides, external-change detection."""
from __future__ import annotations

import math
import time
from collections import deque
from collections.abc import Callable
from datetime import datetime, timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_OFF, STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import Context, Event, HomeAssistant, callback
from homeassistant.helpers.event import (
    async_track_point_in_utc_time,
    async_track_state_change_event,
)
from homeassistant.util import dt as dt_util

from .const import (
    CONF_CLIMATE_ENTITY,
    CONF_COMFORT_TEMP,
    CONF_DEFAULT_OVERRIDE_HOURS,
    CONF_ECO_TEMP,
    CONF_FROST_TEMP,
    CONF_OFF_MODE,
    CONF_MAX_OVERRIDE_HOURS,
    CONF_PRESENCE_ENTITY,
    DEFAULT_COMFORT_TEMP,
    DEFAULT_ECO_TEMP,
    DEFAULT_FROST_TEMP,
    DEFAULT_OFF_MODE,
    DEFAULT_MAX_OVERRIDE_HOURS,
    DEFAULT_OVERRIDE_HOURS,
    MODE_AUTOMATION,
    MODE_MANUAL_ONLY,
    OFF_MODE_HVAC_OFF,
    MODE_OVERRIDE,
    MODE_SCHEDULE,
)
from .store import OverrideStore

_BAD_STATES = (STATE_UNAVAILABLE, STATE_UNKNOWN)
_ECHO_TOL = 0.05
_ECHO_WINDOW = 60.0


def _as_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class Zone:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, store: OverrideStore) -> None:
        self.hass = hass
        self.entry = entry
        self._store = store
        self.override_temp: float | None = None
        self.override_until: datetime | None = None
        self.previous_temp: float | None = None
        self._last_applied: float | None = None
        self._last_presence: bool | None = None
        self.base_temp: float | None = None
        self.base_preset: str | None = None
        self.base_off = False
        self.base_reason: str | None = None
        self._hvac_off_applied = False
        self._applied: deque[tuple[float, float]] = deque(maxlen=5)
        self._ready = False
        self._own_contexts: deque[str] = deque(maxlen=50)
        self._unsubs: list[Callable[[], None]] = []
        self._expiry_unsub: Callable[[], None] | None = None
        self._listeners: list[Callable[[], None]] = []

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
    def base_active(self) -> bool:
        return self.base_off or self.base_temp is not None or self.base_preset is not None

    @property
    def active_rule(self) -> str | None:
        return self.base_reason if self.base_active else None

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
        return _as_float(state.attributes.get("current_temperature")) if state else None

    @property
    def override_active(self) -> bool:
        return self.override_temp is not None and self.override_until is not None

    @property
    def mode(self) -> str:
        if self.override_active:
            return MODE_OVERRIDE
        if self.base_active:
            return MODE_AUTOMATION
        return MODE_MANUAL_ONLY if self.presence_entity is None else MODE_SCHEDULE

    @property
    def _schedule_target(self) -> float | None:
        if self.base_off:
            return self.frost_temp
        if self.base_temp is not None:
            return self.base_temp
        if self.base_preset is not None:
            return self.comfort_temp if self.base_preset == "comfort" else self.eco_temp
        if self.presence_entity is None:
            return self.comfort_temp
        if self.presence is None:
            return None
        return self.comfort_temp if self.presence else self.eco_temp

    @property
    def schedule_target(self) -> float:
        target = self._schedule_target
        if target is None:
            return self._last_applied if self._last_applied is not None else self.comfort_temp
        return target

    @property
    def target(self) -> float:
        return self.override_temp if self.override_active else self.schedule_target

    @callback
    def async_add_listener(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    @callback
    def _notify(self) -> None:
        for listener in list(self._listeners):
            listener()

    def _record(self) -> dict:
        record: dict = {"last_applied": self._last_applied}
        if self._hvac_off_applied:
            record["hvac_off"] = True
        if self.base_active:
            record["base"] = {
                "temp": self.base_temp,
                "preset": self.base_preset,
                "off": self.base_off,
                "reason": self.base_reason,
            }
        if self.override_active:
            record.update(
                temp=self.override_temp,
                until=self.override_until.isoformat(),
                previous_temp=self.previous_temp,
            )
        return record

    async def _async_persist(self) -> None:
        await self._store.async_set(self.entry.entry_id, self._record())

    def _device_state(self):
        state = self.hass.states.get(self.climate_entity)
        if state is None or state.state in _BAD_STATES:
            return None
        return state

    def _device_setpoint(self) -> float | None:
        state = self._device_state()
        return _as_float(state.attributes.get("temperature")) if state else None

    def _matches_requested(self, temp: float, state, ref: float | None) -> bool:
        if ref is None:
            return False
        candidates = {ref}
        lo, hi = _as_float(state.attributes.get("min_temp")), _as_float(state.attributes.get("max_temp"))
        clamped = ref
        if lo is not None:
            clamped = max(clamped, lo)
        if hi is not None:
            clamped = min(clamped, hi)
        candidates.add(clamped)
        step = _as_float(state.attributes.get("target_temp_step"))
        if step:
            for value in list(candidates):
                ratio = value / step
                candidates.update(
                    {round(ratio) * step, math.floor(ratio + 1e-9) * step, math.ceil(ratio - 1e-9) * step}
                )
        return any(abs(temp - c) <= _ECHO_TOL for c in candidates)

    def _is_echo(self, temp: float, state) -> bool:
        now = time.monotonic()
        return any(
            now - at <= _ECHO_WINDOW and self._matches_requested(temp, state, value)
            for value, at in self._applied
        )

    async def async_start(self) -> None:
        self._ready = False
        self._refresh_presence()
        watched = [self.climate_entity]
        if self.presence_entity:
            watched.append(self.presence_entity)
        self._unsubs.append(
            async_track_state_change_event(self.hass, watched, self._handle_state_event)
        )
        saved = self._store.get(self.entry.entry_id) or {}
        self._last_applied = _as_float(saved.get("last_applied"))
        self._hvac_off_applied = bool(saved.get("hvac_off"))
        base = saved.get("base") or {}
        self.base_temp = _as_float(base.get("temp"))
        self.base_preset = base.get("preset")
        self.base_off = bool(base.get("off"))
        self.base_reason = base.get("reason")
        previous = _as_float(saved.get("previous_temp"))
        until = dt_util.parse_datetime(saved["until"]) if saved.get("until") else None
        temp = _as_float(saved.get("temp"))
        now = dt_util.utcnow()
        if until and temp is not None and until > now:
            self.override_temp = temp
            self.override_until = min(until, now + timedelta(hours=self.max_hours))
            self.previous_temp = previous
            self._schedule_expiry()
            await self._async_set_climate(temp)
            await self._async_persist()
        else:
            expired = until is not None and temp is not None
            self.previous_temp = None
            state = self._device_state()
            device_temp = _as_float(state.attributes.get("temperature")) if state else None
            if expired and self.mode == MODE_MANUAL_ONLY:
                if previous is not None:
                    await self._async_set_climate(previous)
                else:
                    self._last_applied = None
            elif (
                self._last_applied is not None
                and not self._hvac_off_applied
                and device_temp is not None
                and not self._matches_requested(device_temp, state, self._last_applied)
            ):
                await self._async_start_override(
                    device_temp, self.default_hours, apply=False, previous=self._last_applied
                )
            else:
                await self._async_apply()
            await self._async_persist()
        self._ready = True
        self._notify()

    @callback
    def async_stop(self) -> None:
        self._ready = False
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._expiry_unsub:
            self._expiry_unsub()
            self._expiry_unsub = None

    def _schedule_expiry(self) -> None:
        if self._expiry_unsub:
            self._expiry_unsub()
            self._expiry_unsub = None
        if self.override_until:
            self._expiry_unsub = async_track_point_in_utc_time(
                self.hass, self._handle_expiry, self.override_until
            )

    async def _handle_expiry(self, _now: datetime) -> None:
        self._expiry_unsub = None
        await self.async_clear_override()

    async def _async_apply(self, force: bool = False) -> None:
        if self.mode == MODE_MANUAL_ONLY:
            return
        if not self.override_active and self.base_off and self.off_mode == OFF_MODE_HVAC_OFF:
            await self._async_hvac_off(force)
            return
        target = self.override_temp if self.override_active else self._schedule_target
        if target is None:
            return
        if not force and target == self._last_applied and not self._hvac_off_applied:
            return
        await self._async_set_climate(target)
        await self._async_persist()

    async def _async_hvac_off(self, force: bool) -> None:
        if self._hvac_off_applied and not force:
            return
        context = Context()
        self._own_contexts.append(context.id)
        await self.hass.services.async_call(
            "climate",
            "set_hvac_mode",
            {"entity_id": self.climate_entity, "hvac_mode": "off"},
            blocking=True,
            context=context,
        )
        self._hvac_off_applied = True
        await self._async_persist()

    async def _async_set_climate(self, temperature: float) -> None:
        context = Context()
        self._own_contexts.append(context.id)
        state = self._device_state()
        if state is not None and state.state == "off" and self._hvac_off_applied:
            await self.hass.services.async_call(
                "climate",
                "set_hvac_mode",
                {"entity_id": self.climate_entity, "hvac_mode": "heat"},
                blocking=True,
                context=context,
            )
        self._hvac_off_applied = False
        self._applied.append((temperature, time.monotonic()))
        await self.hass.services.async_call(
            "climate",
            "set_temperature",
            {"entity_id": self.climate_entity, "temperature": temperature},
            blocking=True,
            context=context,
        )
        self._last_applied = temperature

    async def _handle_state_event(self, event: Event) -> None:
        if not self._ready:
            return
        entity_id = event.data["entity_id"]
        if entity_id == self.presence_entity:
            self._refresh_presence()
            await self._async_apply()
            self._notify()
            return
        old, new = event.data["old_state"], event.data["new_state"]
        if old is None or new is None or old.state in _BAD_STATES or new.state in _BAD_STATES:
            self._notify()
            return
        new_temp = _as_float(new.attributes.get("temperature"))
        old_temp = _as_float(old.attributes.get("temperature"))
        if (
            new_temp is not None
            and old_temp is not None
            and new_temp != old_temp
            and not self._is_echo(new_temp, new)
            and new.context.id not in self._own_contexts
            and new.context.parent_id not in self._own_contexts
        ):
            await self._async_start_override(
                new_temp, self.default_hours, apply=False, previous=old_temp
            )
        self._notify()

    def _clamp(self, hours: float) -> float:
        return min(max(hours, 0.0), self.max_hours)

    async def _async_start_override(
        self, temp: float, hours: float, apply: bool = True, previous: float | None = None
    ) -> None:
        until = dt_util.utcnow() + timedelta(hours=self._clamp(hours))
        if self.override_active:
            previous = self.previous_temp
        elif previous is None:
            previous = self._device_setpoint()
        if apply:
            await self._async_set_climate(temp)
        else:
            self._last_applied = temp
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
        self.override_until = max(
            current, min(current + timedelta(hours=hours), now + timedelta(hours=self.max_hours))
        )
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
        if had_override:
            if self.mode == MODE_MANUAL_ONLY:
                if previous is not None:
                    await self._async_set_climate(previous)
                else:
                    self._last_applied = None
                await self._async_persist()
            else:
                await self._async_apply(force=True)

    async def async_set_base_target(
        self,
        temperature: float | None = None,
        preset: str | None = None,
        off: bool = False,
        reason: str | None = None,
    ) -> None:
        changed = (self.base_temp, self.base_preset, self.base_off) != (temperature, preset, off)
        self.base_temp = temperature
        self.base_preset = preset
        self.base_off = off
        self.base_reason = reason if self.base_active else None
        await self._async_persist()
        self._notify()
        if not self.override_active:
            await self._async_apply(force=changed)
        self._notify()
