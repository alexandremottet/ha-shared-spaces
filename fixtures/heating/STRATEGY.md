# Heating strategies — contract

Strategies are real Home Assistant automations created from Share Space blueprints. Python
(the blueprints running in HA) is the source of truth; the TypeScript simulator used for the
7-day preview must produce the same result for every case in `strategy_cases.json`.

## Planning entities (integration `share_space`, per area with ≥1 person)

| Entity | Type | Value |
|---|---|---|
| `binary_sensor.share_space_<area>` | occupancy | on when the current 30-min slot is in the merged schedule. New attribute `schedule`: `{monday: [["09:00","12:00"], ...], ...}` (merged slots compacted into `[start, end)` ranges, end may be `"24:00"`, every weekday key present) |
| `sensor.share_space_<area>_next_on` | timestamp | earliest instant `t > now` where the area flips off→on (when currently on: the start of the next run after the current one). `None` if none within 8 days |
| `sensor.share_space_<area>_next_off` | timestamp | earliest instant `t > now` where it flips on→off. `None` if none within 8 days |
| `sensor.share_space_<area>_previous_off` | timestamp | latest instant `t <= now` where it flipped on→off. `None` if none within the last 8 days |
| `binary_sensor.share_space_<area>_occupied_today` | — | on if any slot from the current slot until end of today is on |
| `binary_sensor.share_space_<area>_occupied_tomorrow` | — | on if any slot of tomorrow's weekday is on |

Flip instants are computed by stepping 30-min slots in UTC and converting each to local time
(same approach as `occupancy.next_change`), so DST is handled in real elapsed time. Timestamp
states are ISO 8601 UTC.

### Service `share_space.query_occupancy` (SupportsResponse.ONLY)

Request: `{area, windows: [{start: "HH:MM", end: "HH:MM"}], match: "all" | "any" (default "all"), day: "today" | "tomorrow" | <weekday> (default "today")}`

A window matches when at least one ON slot start `t` satisfies `start <= t < end` on that day.

Response: `{occupied: bool, matches: [bool per window]}` — `occupied` is all/any of `matches`.

## Zone input (integration `share_space_heating`)

### Service `share_space_heating.set_base_target`

`{entity_id: zone sensor, temperature?: float, preset?: "comfort" | "eco", off?: true, reason?: str}` — exactly one of temperature / preset / off, or none to clear the base target (zone returns to presence / manual-only).

- Stores the zone's base target (persisted) and `reason`. Zone `mode` becomes `"automation"`, sensor attribute `active_rule` = reason.
- Manual override still wins and expires back to the base target.
- `off`: if zone option `off_mode` is `"frost"` (default) → set `frost_temp` (option, default 7); if `"hvac_off"` → `climate.set_hvac_mode off`; a later non-off target sets `hvac_mode heat` first when the climate is off.
- The climate is called only when the base (temperature / preset / off) actually changed; a reason-only change just updates attributes. The base is persisted before any climate call.
- A thermostat the user turned off manually is never switched back on; `hvac_mode heat` is only sent when the zone itself turned it off.
- External-change detection: a device setpoint equal (tolerance 0.05, after clamping / rounding to the device step) to a value the zone applied within the last 60 s is an echo; any other value is a manual override.
- Applying the base target uses the zone's own context (never treated as an external override).

New zone options (also accepted by WS `share_space_heating/update_zone`): `frost_temp` (5–15), `off_mode` (`frost` | `hvac_off`).

### Zone target template (hook)

Zone option `target_template` (str or null; `""` = no hook), set via admin-only WS `update_zone` (or `create_zone`). Syntax is checked on save: invalid → error `invalid_format`, nothing stored.

- Rendered by HA (`async_track_template_result`, strict: undefined variables are errors); re-rendered when a referenced entity changes, every minute when it uses `now()`, and when `base` changes.
- Variables: `zone` (zone sensor entity id), `comfort`, `eco` (zone temps), `base` (target the zone mode would set: presence / base target; number or null).
- Results: a number in 5–35 (or equal to `frost_temp`), `comfort`, `eco`, `off` (follows `off_mode`, like `set_base_target off: true`), or `none` / empty = no opinion.
- Priority: manual override > template > zone mode. Render error or invalid result → zone mode, warning logged once per distinct error.
- Sensor attributes: `target_template`, `template_result` (raw rendered string or null), `template_error` (string or null). While the template drives the target: `mode` = `"template"`, `active_rule` = `"Template"`.

## Blueprints (`blueprints/automation/share_space/`)

All blueprints call `share_space_heating.run_rules` (evaluation in Python, `rules.py`; presets are turned into rules by `presets.py`), use `mode: queued`, `max: 5`, `max_exceeded: silent`, ship a `# share_space_blueprint_version: N` header (the installer overwrites an installed copy only when it has this header with a lower N), and set the zone base target with the result below (the result equal to the current base target and reason is skipped).
Results: `{target: number}` or `{off: true}`, plus `reason`.

### `office_saver.yaml`

Inputs: `zone` (zone sensor), `area` (share_space area id), `comfort_temp` (21), `setback_temp` (16), `preheat_hours` (6), `max_gap_hours` (24).

Evaluated in order, first match wins:
1. area occupied now → `comfort_temp`, reason `"Occupied"`
2. `next_on` exists and `now >= next_on - preheat_hours` → `comfort_temp`, reason `"Preheat"`
3. `previous_off` exists and `now - previous_off <= max_gap_hours` and `next_on` exists and `next_on - now <= max_gap_hours` → `setback_temp`, reason `"Between working days"`
4. otherwise → off, reason `"Away"`

Triggers: main / `next_on` / `previous_off` state changes, time pattern every minute (preheat starts within 1 minute of `next_on - preheat_hours`), `homeassistant` start.

Guard: the run is skipped when the main sensor is `unknown`/`unavailable` or the `next_on` / `previous_off` entities are missing or `unavailable` (planning not loaded). A `next_on` / `previous_off` state of `unknown` means none within 8 days.

### `lunch_room.yaml`

Inputs: `zone`, `area`, `morning_start` ("11:00"), `morning_end` ("12:00"), `afternoon_start` ("13:00"), `afternoon_end` ("14:00"), `heat_start` ("11:00"), `heat_end` ("14:00"), `temperature` (20), `match` ("all").

1. now (local) not in `[heat_start, heat_end)` → off, reason `"Outside lunch hours"`
2. a planned slot of today (main sensor attribute `schedule`) starts in the morning and afternoon windows (`match`: all / any; same rule as `query_occupancy`) → `temperature`, reason `"Lunch"`. An empty window (`start >= end`) never matches.
3. otherwise → off, reason `"No lunch today"`

Triggers: same as `office_saver`. Guard: same planning-not-loaded guard.

### `rules.yaml`

Inputs: `zone`, `area`, `rules` (object: a rule strategy, see `RULES.md`), `previous_rules` (object, default `null`; kept for undo, never read when running).

The blueprint only triggers; it calls `share_space_heating.run_rules {entity_id: zone, area, rules}`, which evaluates in Python (`rules.py`): first rule whose `when` all hold wins, else `fallback`; `reason` = the label. Condition sources:
- `occupied`: main sensor state `on`.
- `occupied_within` / `between_days`: `next_on` / `previous_off` sensor timestamps vs now (same formulas as `office_saver`). An outdoor `occupied_within` lead reads its sensor at run time (see `RULES.md`).
- `weekday` / `time`: local weekday and minute (`time` wraps past midnight when `start > end`).
- `planned`: main sensor attribute `schedule` for today's weekday, expanded to 30-min slot starts; a window matches when a slot start `t` has `start <= t < end` (same rule as `query_occupancy`). Missing attribute = empty planning.
- `negate` inverts the condition.

Action: `comfort` / `eco` → `preset`, `temperature` → `temperature: value`, `off` → `off: true`. A decision equal to the zone's current base target (and reason) is skipped, so the store is not rewritten every minute.

Triggers: main / `next_on` / `previous_off` state changes (attribute changes included), time pattern every minute (time conditions, preheat leads and outdoor readings apply within a minute), `homeassistant` start.

Guard: same "planning not loaded" guard as `office_saver` (the run is skipped). Malformed rules (unknown condition / action, missing field) raise a service validation error; nothing is set.

Parity: `tests/test_rules_blueprint.py` runs the blueprint (and so `rules.py`) for every check of `rules_cases.json`, and for the Office saver / Lunch room templates over `strategy_cases.json` (`presets.py` is the Python twin of `frontend/ui/src/rules/templates.ts`; both are checked against the same fixture, the TS one in `rules.test.ts`, so they stay in sync through it). `tests/test_blueprint_parity.py` runs `office_saver.yaml` / `lunch_room.yaml` over `strategy_cases.json`.

## Automation ids created by the card

`share_space_<zone object id>_<preset>` (e.g. `share_space_share_space_heating_open_space_office_saver`), alias `Share Space · <zone name> · <Preset label>`.

## Fixture format (`strategy_cases.json`)

```
[{ name, tz, area, schedule: {<weekday>: [["HH:MM","HH:MM"]...]}, preset: "office_saver"|"lunch_room",
   inputs: {...blueprint inputs except zone/area...},
   checks: [{ now: ISO with offset, expected: {target: number} | {off: true}, reason }] }]
```
