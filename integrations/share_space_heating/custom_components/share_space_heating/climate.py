"""Drives one climate entity and tells its own changes from external (manual) ones."""
from __future__ import annotations

import math
import time
from collections import deque

from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import Context, HomeAssistant, State

from .target import as_float

BAD_STATES = (STATE_UNAVAILABLE, STATE_UNKNOWN)
_ECHO_TOL = 0.05
_ECHO_WINDOW = 60.0


def matches_requested(temp: float, state: State, ref: float | None) -> bool:
    """True if `temp` equals `ref` after the device's clamping / step rounding (tolerance 0.05)."""
    if ref is None:
        return False
    candidates = {ref}
    lo, hi = as_float(state.attributes.get("min_temp")), as_float(state.attributes.get("max_temp"))
    clamped = ref
    if lo is not None:
        clamped = max(clamped, lo)
    if hi is not None:
        clamped = min(clamped, hi)
    candidates.add(clamped)
    step = as_float(state.attributes.get("target_temp_step"))
    if step:
        for value in list(candidates):
            ratio = value / step
            candidates.update({round(ratio) * step, math.floor(ratio + 1e-9) * step, math.ceil(ratio - 1e-9) * step})
    return any(abs(temp - c) <= _ECHO_TOL for c in candidates)


class ClimateDriver:
    def __init__(self, hass: HomeAssistant, entity_id: str) -> None:
        self.hass = hass
        self.entity_id = entity_id
        self.last_applied: float | None = None
        # True only when this driver turned the thermostat off
        self.hvac_off_applied = False
        self._applied: deque[tuple[float, float]] = deque(maxlen=5)
        self._own_contexts: deque[str] = deque(maxlen=50)

    def state(self) -> State | None:
        state = self.hass.states.get(self.entity_id)
        return None if state is None or state.state in BAD_STATES else state

    def setpoint(self) -> float | None:
        state = self.state()
        return as_float(state.attributes.get("temperature")) if state else None

    def is_external(self, temp: float, state: State) -> bool:
        """A setpoint change that is neither a recent echo of ours nor made with our context."""
        now = time.monotonic()
        echo = any(now - at <= _ECHO_WINDOW and matches_requested(temp, state, v) for v, at in self._applied)
        ctx = state.context
        return not echo and ctx.id not in self._own_contexts and ctx.parent_id not in self._own_contexts

    def _context(self) -> Context:
        context = Context()
        self._own_contexts.append(context.id)
        return context

    async def _call(self, service: str, data: dict, context: Context) -> None:
        await self.hass.services.async_call(
            "climate", service, {"entity_id": self.entity_id, **data}, blocking=True, context=context
        )

    async def async_off(self, force: bool = False) -> bool:
        """Turn the thermostat off; False when already off by us and not forced."""
        if self.hvac_off_applied and not force:
            return False
        await self._call("set_hvac_mode", {"hvac_mode": "off"}, self._context())
        self.hvac_off_applied = True
        return True

    async def async_set(self, temperature: float) -> None:
        """Set the setpoint, switching back to heat first only if this driver turned it off."""
        context = self._context()
        state = self.state()
        if state is not None and state.state == "off" and self.hvac_off_applied:
            await self._call("set_hvac_mode", {"hvac_mode": "heat"}, context)
        self.hvac_off_applied = False
        self._applied.append((temperature, time.monotonic()))
        await self._call("set_temperature", {"temperature": temperature}, context)
        self.last_applied = temperature
