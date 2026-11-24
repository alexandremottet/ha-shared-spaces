# Heating rule strategies — contract

A rule strategy is plain JSON (stored as a `rules.yaml` blueprint input, evaluated in Python by `rules.py` in HA).
The TypeScript model lives in `frontend/ui/src/rules/`; every case in `rules_cases.json` must give
the same result in TS and in HA.

## Shape

```
{ version: 1,
  rules: [{ label, when: [Condition...], then: Action }...],   // top to bottom, first match wins
  fallback: { label, then: Action } }                          // used when no rule matches
```

- A rule matches when **all** its conditions hold (an empty `when` always matches).
- The matched `label` is the reason shown on the card (`active_rule`).
- Every condition accepts `negate: true` (e.g. `occupied` + `negate` = area empty).

| Condition | Fields | Holds when (now, local time of the zone's area) |
|---|---|---|
| `occupied` | — | the current 30-min slot is on (main sensor) |
| `occupied_within` | `hours`: value (number ≥ 0 or curve) | `next_on` exists and `now >= next_on - hours` (`next_on` is the next run, also while occupied) |
| `between_days` | `gap_hours` ≥ 0 | area empty now, `previous_off` and `next_on` exist, and the whole empty gap `next_on - previous_off <= gap` (a night before a morning, not a weekend) |
| `weekday` | `days`: weekday names | today's weekday is listed |
| `time` | `start`, `end` "HH:MM" (`end` may be "24:00") | `start <= now < end`; wraps past midnight when `start > end`; `start != end` |
| `planned` | `windows: [{start, end}]` (`start < end`), `match`: `all`/`any` | `share_space.query_occupancy` for today: an ON slot starts in every / some window |
| `sensor` | `entity`, `op`: `below`/`above`, `than` | numeric reading `< than` / `> than`; no reading → does not hold (before `negate`) |
| `state` | `entity` (any HA entity, not `outdoor`), `is`: string | entity state equals `is`; missing entity → does not hold (before `negate`). Use HA helpers for cross-area logic, e.g. a binary_sensor group of other areas' `binary_sensor.share_space_<area>`. The preview uses the current state for the whole week |

| Action | Result (`set_base_target`) |
|---|---|
| `{type: "comfort"}` / `{type: "eco"}` | `preset: comfort / eco` (preview uses the zone's comfort / eco temps) |
| `{type: "off"}` | `off: true` |
| `{type: "temperature", value}` (value: number 5–35 or curve) | `temperature`: value limited to 5–35, rounded to 0.5 |

`next_on` / `previous_off` use an 8-day search window.

### Values ("Follow a sensor")

A value is a number or `{type: "curve", entity, default, points: [{at, value}, ...]}`:
2–5 points with strictly increasing `at`; the reading is mapped linearly between points and flat
before the first / after the last. The reading is the `entity` state, or attribute `temperature` for a
`weather.*` entity; no numeric reading → `default` is used as the reading. Point values follow the
field's range (hours ≥ 0, temperature 5–35). The preview uses the current readings for the whole week.

## Starters

The strategy store is seeded once, on its first load, with two shared strategies from
`starters.json`: `office_saver` ("Office saver") and `lunch_room` ("Lunch room"). They are ordinary
shared strategies: editable, renamable, deletable, and never re-seeded (even after a delete; an
existing store, empty or not, is left alone). `rules_cases.json` runs their rule lists
(cases named `starter ...`) through Python and TypeScript.

## Shared strategies

A strategy can be saved once by name and used by several zones. The integration keeps them in a
`Store` (`share_space_heating.strategies`, `{id: {name, rules, previous}}`). WebSocket commands:
`share_space_heating/list_strategies` (any user), `save_strategy` and `delete_strategy` (admin; the
strategy id field is `strategy_id`, since `id` is the message id). `save_strategy` rejects a duplicate
name (`name_taken`, case-insensitive) and a malformed strategy (`invalid_format`). `run_rules` accepts
`strategy: <id>` as an alternative to `rules` (exactly one non-empty; empty `{}` / `""`
count as absent). A missing id raises an error and leaves the zone untouched. The `rules.yaml`
blueprint (version 4) has a `strategy` input (default empty = use `rules`). Its `area` input (HA area
picker) is the only required target: `run_rules` drives the one heating zone whose climate entity HA
places in that area (entity registry, else its device; the provisioning area only when HA has none),
and errors when the area has no zone or several. The legacy `zone` input / `entity_id` still wins
when set, so version 3 automations keep running. Edits apply to every
zone at its next minute trigger.

## Fixture format (`rules_cases.json`)

```
[{ name, tz, schedule: {<weekday>: [["HH:MM","HH:MM"]...]}, strategy: {...},
   temps?: {comfort, eco},                               // zone presets, default {21, 17}
   checks: [{ now: ISO with offset, readings?: {<entity>: number}, states?: {<entity>: string}, expected: {target, preset?} | {off: true}, reason }] }]
```
