"""Zone target template: rendered by HA, parsed to a number or comfort / eco / off / none."""
from __future__ import annotations

import logging
import math
from collections.abc import Awaitable, Callable

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import TrackTemplate, async_track_template_result
from homeassistant.helpers.template import Template

from .target import as_float

_WORDS = ("comfort", "eco", "off")
_LOGGER = logging.getLogger(__name__)


def parse_result(raw: str, frost_temp: float) -> float | str | None:
    text = raw.strip()
    word = text.lower()
    if word in ("", "none"):
        return None
    if word in _WORDS:
        return word
    value = as_float(text)
    if value is not None and math.isfinite(value) and (5 <= value <= 35 or value == frost_temp):
        return value
    raise ValueError(f"Invalid result {raw!r}: expected 5-35, comfort, eco, off or none")


class TargetTemplate:
    """Tracks the template; `on_update(changed)` runs when HA re-renders it."""

    def __init__(
        self,
        hass: HomeAssistant,
        source: str,
        zone_name: str,
        variables: dict,
        frost_temp: float,
        base: Callable[[], float | None],
        on_update: Callable[[bool], Awaitable[None]],
    ) -> None:
        self._template = Template(source, hass)
        self._hass = hass
        self._zone_name = zone_name
        self._vars = {**variables, "base": base()}
        self._frost = frost_temp
        self._base = base
        self._on_update = on_update
        self._tracker = None
        self._logged: set[str] = set()
        self.value: float | str | None = None
        self.result: str | None = None
        self.error: str | None = None

    def start(self) -> None:
        # tracker re-renders on referenced entity changes and every minute when now() is used
        self._tracker = async_track_template_result(
            self._hass,
            [TrackTemplate(self._template, self._vars)],
            self._handle_update,
            strict=True,
            log_fn=lambda _level, _msg: None,
        )
        self.evaluate()

    def stop(self) -> None:
        if self._tracker is not None:
            self._tracker.async_remove()
            self._tracker = None

    @callback
    def evaluate(self) -> bool:
        """Render with the current base; True if the effective value changed."""
        before = self.value
        self._vars["base"] = self._base()
        self.result = None
        self.value = None
        try:
            self.result = str(self._template.async_render(self._vars, parse_result=False, strict=True))
            self.value = parse_result(self.result, self._frost)
            self.error = None
        except Exception as err:  # noqa: BLE001
            self.error = str(err) or type(err).__name__
            if self.error not in self._logged:
                self._logged.add(self.error)
                _LOGGER.warning("Zone %s target template failed, using the zone mode: %s", self._zone_name, self.error)
        return self.value != before

    @callback
    def sync_base(self) -> None:
        """Re-render after the zone mode target changed."""
        if self._tracker is not None and self._vars.get("base") != self._base():
            self._vars["base"] = self._base()
            self._tracker.async_refresh()
        self.evaluate()

    async def _handle_update(self, _event, _updates) -> None:
        await self._on_update(self.evaluate())
