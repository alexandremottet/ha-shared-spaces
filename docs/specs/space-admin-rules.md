# Space Admin, rules and extension points

Status: draft for review · 2026-11-21

## Goal

Let the person who runs a shared space configure it (heating behaviour, what runs when an area is
occupied or empty) from the Share Space panel, without going through Home Assistant's own admin UI.
The Technical Admin keeps full HA access and can go further with Jinja templates.

Non-goals (for now): one-off exceptions (holidays, closures), translations (English only), a
security boundary between Space Admin and Technical Admin.

## Principles

- **Reuse HA first.** Anything HA already stores or runs (automations, blueprints, templates,
  permissions, backups) stays in HA. Share Space adds a simpler UI on top, not a parallel engine.
- **Roles simplify, they don't restrict.** Space Admin and Technical Admin are both HA admins
  (`is_admin`). A Space Admin can always fall back to HA's own UI if needed.
- **Small, props-driven components**, each visible in the playground.

## Roles

| Role | HA | Sees in the Share Space panel |
|---|---|---|
| User | non-admin | Space tab: own planning, cards |
| Space Admin | `is_admin` | + Rules tab, + Settings tab |
| Technical Admin | `is_admin` with HA **Advanced mode** on | + advanced parts of Settings (extension points) |

- **Technical Admin is HA's own Advanced mode** (user profile setting), not a list stored by Share
  Space. Nothing to store, no hand-over needed: if the Technical Admin leaves, any Space Admin turns
  Advanced mode on and gets everything.
- Settings shows a "Turn on advanced tools" link to the user's HA profile when Advanced mode is off.
- To verify before coding: the panel can read the user's Advanced mode flag (`showAdvanced` in HA
  frontend user data). Fallback if not: a Technical Admin list stored by `share_space`, where any HA
  admin can add themselves (with a confirmation and a logbook entry saying who did it).
- The backend still enforces HA admin for every write (`async_register_admin_service`,
  `websocket_api.require_admin`). The Space/Technical split is UI only.

## Heating: what drives a zone

Priority, highest first:

1. **Manual override** (+/−, presets Comfort/Eco/Frost, +2h default): wins while active.
2. **The zone's mode**, exactly one of:
   - **Simple**: follow the area's occupancy (comfort when occupied, eco when empty);
   - **Strategy**: an HA automation from a Share Space blueprint (Office saver, Lunch room, or a
     block-built strategy).

Simple and Strategy are exclusive. Choosing one disables the other: enabling a strategy drops the
presence link; choosing Simple disables the zone's strategy automations and clears the base target
they set. The decision shown on the card always names its source (`active_rule` / reason).

## Block editor (Space Admin)

Purpose: tune a strategy to how each space actually works, without code.

- A strategy is a list of **rules**, evaluated top to bottom; the first match wins. Each rule:
  `when <conditions> then <action>`, with a label used as the reason shown on the card.
- Conditions (initial set): area occupied / empty; occupied later today within N hours (preheat);
  day of week; time window.
- Actions: comfort, eco, frost/off, fixed temperature.
- A fallback rule ("otherwise") is always present.
- **Templates:** Office saver and Lunch room become pre-filled rule lists. "Reset to template"
  restores one.
- **Undo:** keep the previous version of each strategy; "Undo last change" restores it.
- **Preview:** the existing week timeline (`strategyTimeline`) evaluates the rule list.

### Storage and execution

- Rules compile to an **HA automation** using a Share Space blueprint; the rule list is stored as a
  blueprint input. HA runs it, so traces, history and backups come for free.
- Rule semantics are shared by the TS preview and the HA execution, and checked by shared fixtures
  (same pattern as `fixtures/heating/strategy_cases.json`).
- Generated automations are marked "managed by Share Space". If someone edits one in HA's editor,
  the panel shows "Edited outside Share Space" with two choices: **Take back** (overwrite from the
  rules) or **Detach** (it becomes a normal HA automation and leaves the Rules tab).
- Existing Office saver / Lunch room automations are migrated to the rule format.

## Extension points (Technical Admin)

Named hooks where a Jinja template replaces a default behaviour, e.g.:

| Hook | Returns | Default |
|---|---|---|
| Zone target | temperature, `comfort`, `eco` or `off` | the zone's mode |
| Area occupied | true / false | planning occupancy |
| Working day | true / false | Monday–Friday |

- Templates are rendered by HA (sandboxed). If a template errors or returns an invalid value, the
  default is used and the error is shown in the panel; a zone is never left without a target.
- Editor: HA's `ha-code-editor` (Jinja mode) when available, plain textarea otherwise.
- Beginner help per hook: what it must return, insertable snippets (`is_state(...)`,
  `now().weekday() < 5`, `states('sensor.x') | float(0)`), and an entity picker that inserts ids.
- In HA: live result under the editor via HA's template rendering (`render_template` subscription).
  In the playground: help and snippets only, labelled "evaluated in Home Assistant only".
- Stored by the integration that owns the hook (heating hooks in `share_space_heating`).

## Ownership

| What | Owner |
|---|---|
| Roles | HA (`is_admin`, Advanced mode); fallback list in `share_space` |
| Area actions (what runs on occupied / empty) | `share_space` (admin-only services) |
| Zone mode, presets, overrides, heating hooks | `share_space_heating` |
| Rules → blueprint automations | `share_space_heating` (blueprints), HA (automations) |
| Panel (tabs, display only) | `share_space_space` |

## Frontend packaging

| Piece | Location | Playground |
|---|---|---|
| Rule model: types, validation, evaluation for preview | `ui/src/rules/` (pure TS, unit tests) | parity tests |
| Rule blocks: condition, action, rule row, rule list (Lit, props in, events out) | `ui/src/rules/` | Components page |
| Template editor with help panel | `ui/src/template-editor.ts` | Components page |
| Panel tabs: Space, Rules, Settings | `space-panel` | Panel page (User / Admin view switch) |

## Plan (each step shippable and visible in the playground)

1. **Done in this branch:** admin-only area action services; Simple/Strategy exclusivity; presets
   and +2h default on the heating control.
2. Roles: Settings tab, Advanced mode detection (or the fallback list), User / Space Admin /
   Technical Admin switch in the playground.
3. Rule model + preview: `ui/src/rules` with templates equivalent to Office saver / Lunch room,
   parity fixtures, `strategyTimeline` driven by rules.
4. Block editor components + Rules tab; save as blueprint automation; undo and reset to template.
5. Migration of existing strategy automations; "edited outside Share Space" handling.
6. Extension points: hooks in `share_space_heating`, template editor with help, live evaluation.

## Decisions

- Rule list stored as a blueprint input, shown as raw YAML in HA's automation editor: accepted,
  with the "managed by Share Space" marker.
- Space Admin sees the Settings tab; advanced parts need Advanced mode.
