# Heating rule strategies — contract

A rule strategy is plain JSON (stored later as a blueprint input, evaluated in Jinja by HA).
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
| `occupied_within` | `hours` ≥ 0 | `next_on` exists and `now >= next_on - hours` (`next_on` is the next run, also while occupied) |
| `between_days` | `gap_hours` ≥ 0 | `previous_off` exists, `now - previous_off <= gap`, `next_on` exists, `next_on - now <= gap` |
| `weekday` | `days`: weekday names | today's weekday is listed |
| `time` | `start`, `end` "HH:MM" (`end` may be "24:00") | `start <= now < end`; wraps past midnight when `start > end`; `start != end` |
| `planned` | `windows: [{start, end}]` (`start < end`), `match`: `all`/`any` | `share_space.query_occupancy` for today: an ON slot starts in every / some window |

| Action | Result (`set_base_target`) |
|---|---|
| `{type: "comfort"}` / `{type: "eco"}` | `preset: comfort / eco` (preview uses the zone's comfort / eco temps) |
| `{type: "off"}` | `off: true` |
| `{type: "temperature", value}` (5–35) | `temperature: value` |

`next_on` / `previous_off` follow `STRATEGY.md` (8-day search window).

## Templates

`officeSaverRules(inputs)` and `lunchRoomRules(inputs)` produce the same result and reason as the
`office_saver` / `lunch_room` blueprints for every case in `strategy_cases.json`.

## Fixture format (`rules_cases.json`)

```
[{ name, tz, schedule: {<weekday>: [["HH:MM","HH:MM"]...]}, strategy: {...},
   temps?: {comfort, eco},                               // zone presets, default {21, 17}
   checks: [{ now: ISO with offset, expected: {target, preset?} | {off: true}, reason }] }]
```
