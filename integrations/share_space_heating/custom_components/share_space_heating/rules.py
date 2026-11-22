"""Rule strategy evaluation (fixtures/heating/RULES.md); mirrors frontend/ui/src/rules/evaluate.ts."""
from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime

from homeassistant.const import STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
_SLOT = 30


@dataclass(frozen=True)
class Facts:
    now: datetime
    occupied: bool
    next_on: float | None
    previous_off: float | None
    schedule: dict
    outdoor: Callable[[str], float | None]


@dataclass(frozen=True)
class Decision:
    label: str
    temperature: float | None = None
    preset: str | None = None
    off: bool = False


def _number(value) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def _minutes(hhmm: str) -> int:
    h, m = str(hhmm).split(":")
    return int(h) * 60 + int(m)


def lead_hours(hours, outdoor: Callable[[str], float | None]) -> float:
    """Fixed hours, or a lerp between cold and warm clamped to [0, 1]; cold hours without a reading."""
    if not isinstance(hours, dict):
        return float(hours)
    cold, warm = hours["cold"], hours["warm"]
    temp = outdoor(hours["sensor"])
    if temp is None:
        return float(cold["hours"])
    c0, w0 = float(cold["temp"]), float(warm["temp"])
    f = min(1.0, max(0.0, (temp - c0) / (w0 - c0)))
    return float(cold["hours"]) + f * (float(warm["hours"]) - float(cold["hours"]))


def _slot_starts(schedule: dict, day: str) -> list[int]:
    out: list[int] = []
    for start, end in schedule.get(day) or []:
        a, b = _minutes(start), _minutes(end)
        out.extend(range(a // _SLOT * _SLOT, b, _SLOT))
    return out


def _holds(c: dict, f: Facts) -> bool:
    kind = c["type"]
    now_ts = f.now.timestamp()
    if kind == "occupied":
        return f.occupied
    if kind == "occupied_within":
        return f.next_on is not None and now_ts >= f.next_on - lead_hours(c["hours"], f.outdoor) * 3600
    if kind == "between_days":
        gap = float(c["gap_hours"]) * 3600
        return (
            f.previous_off is not None
            and now_ts - f.previous_off <= gap
            and f.next_on is not None
            and f.next_on - now_ts <= gap
        )
    day = WEEKDAYS[f.now.weekday()]
    if kind == "weekday":
        return day in c["days"]
    if kind == "time":
        m = f.now.hour * 60 + f.now.minute
        a, b = _minutes(c["start"]), _minutes(c["end"])
        return a <= m < b if a < b else (m >= a or m < b)
    if kind == "planned":
        slots = _slot_starts(f.schedule, day)
        hits = [any(_minutes(w["start"]) <= s < _minutes(w["end"]) for s in slots) for w in c["windows"]]
        return any(hits) if c["match"] == "any" else all(hits)
    raise ValueError(f"unknown condition {kind!r}")


def _decision(label, action: dict) -> Decision:
    kind = action["type"]
    label = str(label)
    if kind in ("comfort", "eco"):
        return Decision(label, preset=kind)
    if kind == "temperature":
        return Decision(label, temperature=float(action["value"]))
    if kind == "off":
        return Decision(label, off=True)
    raise ValueError(f"unknown action {kind!r}")


def decide(strategy: dict, facts: Facts) -> Decision:
    """First rule whose conditions all hold (negate inverts one), else the fallback."""
    for rule in strategy.get("rules") or []:
        if all(_holds(c, facts) != bool(c.get("negate")) for c in rule.get("when") or []):
            return _decision(rule["label"], rule["then"])
    fallback = strategy["fallback"]
    return _decision(fallback["label"], fallback["then"])


def outdoor_reading(hass: HomeAssistant, entity_id: str) -> float | None:
    """Sensor state, or attribute temperature for a weather entity."""
    state = hass.states.get(entity_id)
    if state is None:
        return None
    return _number(state.attributes.get("temperature") if entity_id.startswith("weather.") else state.state)


def _timestamp(hass: HomeAssistant, entity_id: str) -> float | None:
    parsed = dt_util.parse_datetime(hass.states.get(entity_id).state)
    return parsed.timestamp() if parsed else None


def planning_facts(hass: HomeAssistant, area: str) -> Facts | None:
    """Facts for now, or None while the area's planning entities are not loaded."""
    main = hass.states.get(f"binary_sensor.share_space_{area}")
    next_id, prev_id = f"sensor.share_space_{area}_next_on", f"sensor.share_space_{area}_previous_off"
    nxt, prv = hass.states.get(next_id), hass.states.get(prev_id)
    if main is None or main.state in (STATE_UNKNOWN, STATE_UNAVAILABLE):
        return None
    if nxt is None or prv is None or STATE_UNAVAILABLE in (nxt.state, prv.state):
        return None
    return Facts(
        now=dt_util.now(),
        occupied=main.state == STATE_ON,
        next_on=_timestamp(hass, next_id),
        previous_off=_timestamp(hass, prev_id),
        schedule=main.attributes.get("schedule") or {},
        outdoor=lambda entity_id: outdoor_reading(hass, entity_id),
    )
