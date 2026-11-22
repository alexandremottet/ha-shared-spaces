"""Office saver / Lunch room presets as rule strategies; mirrors frontend/ui/src/rules/templates.ts."""
from __future__ import annotations

OFFICE_SAVER_DEFAULTS = {"comfort_temp": 21, "setback_temp": 16, "preheat_hours": 6, "max_gap_hours": 24}
LUNCH_ROOM_DEFAULTS = {
    "morning_start": "11:00",
    "morning_end": "12:00",
    "afternoon_start": "13:00",
    "afternoon_end": "14:00",
    "heat_start": "11:00",
    "heat_end": "14:00",
    "temperature": 20,
    "match": "all",
}


def _minutes(hhmm: str) -> int:
    h, m = str(hhmm).split(":")[:2]
    return int(h) * 60 + int(m)


def office_saver_rules(inputs: dict) -> dict:
    i = {**OFFICE_SAVER_DEFAULTS, **inputs}
    comfort = {"type": "temperature", "value": float(i["comfort_temp"])}
    return {
        "version": 1,
        "rules": [
            {"label": "Occupied", "when": [{"type": "occupied"}], "then": comfort},
            {"label": "Preheat", "when": [{"type": "occupied_within", "hours": float(i["preheat_hours"])}], "then": comfort},
            {
                "label": "Between working days",
                "when": [{"type": "between_days", "gap_hours": float(i["max_gap_hours"])}],
                "then": {"type": "temperature", "value": float(i["setback_temp"])},
            },
        ],
        "fallback": {"label": "Away", "then": {"type": "off"}},
    }


def lunch_room_rules(inputs: dict) -> dict:
    i = {**LUNCH_ROOM_DEFAULTS, **inputs}
    fallback = {"label": "Outside lunch hours", "then": {"type": "off"}}
    # empty heat window: always outside lunch hours
    if _minutes(i["heat_start"]) >= _minutes(i["heat_end"]):
        return {"version": 1, "rules": [], "fallback": fallback}
    lunch_hours = {"type": "time", "start": i["heat_start"], "end": i["heat_end"]}
    every = [
        {"start": i["morning_start"], "end": i["morning_end"]},
        {"start": i["afternoon_start"], "end": i["afternoon_end"]},
    ]
    # an empty window never matches: dropped for "any", blocks the Lunch rule for "all"
    windows = [w for w in every if _minutes(w["start"]) < _minutes(w["end"])]
    can_lunch = len(windows) > 0 if i["match"] == "any" else len(windows) == len(every)
    rules = []
    if can_lunch:
        rules.append(
            {
                "label": "Lunch",
                "when": [lunch_hours, {"type": "planned", "windows": windows, "match": i["match"]}],
                "then": {"type": "temperature", "value": float(i["temperature"])},
            }
        )
    rules.append({"label": "No lunch today", "when": [lunch_hours], "then": {"type": "off"}})
    return {"version": 1, "rules": rules, "fallback": fallback}


PRESETS = {"office_saver": office_saver_rules, "lunch_room": lunch_room_rules}
