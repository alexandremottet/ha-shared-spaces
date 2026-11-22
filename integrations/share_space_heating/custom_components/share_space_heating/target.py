"""Base target set by automations, and the pure target priority below a manual override."""
from __future__ import annotations

from dataclasses import dataclass


def as_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


@dataclass(frozen=True)
class BaseTarget:
    """What `set_base_target` stored: at most one of temp / preset / off, plus the reason shown."""

    temp: float | None = None
    preset: str | None = None
    off: bool = False
    reason: str | None = None

    @property
    def active(self) -> bool:
        return self.off or self.temp is not None or self.preset is not None

    def record(self) -> dict:
        return {"temp": self.temp, "preset": self.preset, "off": self.off, "reason": self.reason}

    @classmethod
    def from_record(cls, data: dict | None) -> BaseTarget:
        data = data or {}
        return cls(as_float(data.get("temp")), data.get("preset"), bool(data.get("off")), data.get("reason"))


@dataclass(frozen=True)
class Temps:
    comfort: float
    eco: float
    frost: float


def mode_target(base: BaseTarget, has_presence: bool, presence: bool | None, temps: Temps) -> float | None:
    """Base target, else presence (comfort / eco), else comfort without a presence sensor; None if unknown."""
    if base.off:
        return temps.frost
    if base.temp is not None:
        return base.temp
    if base.preset is not None:
        return temps.comfort if base.preset == "comfort" else temps.eco
    if not has_presence:
        return temps.comfort
    if presence is None:
        return None
    return temps.comfort if presence else temps.eco


def schedule_target(template_value: float | str | None, mode: float | None, temps: Temps) -> float | None:
    """Template result wins over the zone mode; words map to the zone temps."""
    if template_value is None:
        return mode
    if template_value == "off":
        return temps.frost
    if template_value == "comfort":
        return temps.comfort
    if template_value == "eco":
        return temps.eco
    return template_value
