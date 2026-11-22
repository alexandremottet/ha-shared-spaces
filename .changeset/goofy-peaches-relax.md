---
"ha-share-space-heating-card": major
"ha-share-space-playground": major
"ha-share-space-space-panel": major
"ha-share-space-ui": major
"share-space-heating-integration": major
---

Rework to make easy to use Shared Space Automated System.
- add a notion of Space Admin and Technical Admin.
  - Technical Admin is a per-user "Technical tools" switch in Settings.
- make easy to use Panel for Space Admin: Space / Rules / Settings tabs.
- add Rules tab: block editor for heating rules with week preview, saved as HA automation.
  - Save, Undo last change.
  - detect automations edited in HA: Take back or Detach.
  - rules shown as a graph: conditions chained left to right into the action, rules stacked top to bottom ("else"); click a block to edit it.
  - "Follow a sensor" values (2-5 points, linear between, flat outside) for preheat hours and temperatures, and a "Sensor below / above" condition.
- add generic `rules.yaml` blueprint running the rules through the new `share_space_heating.run_rules` service (rules evaluated in Python).
- "Between working days" (rules and Office saver) now means the whole empty gap is at most N hours: weeknights get setback, weekends and holidays stay off.
- add Zone target Jinja hook for Technical Admin, with template editor and help.
- playground: User / Space Admin / Technical Admin views, rule and template editor components.
- add shared strategies: saved by name in the integration, used by several zones through the `strategy` input of `rules.yaml` / `run_rules`.
- Office saver / Lunch room are now starter shared strategies (seeded once, editable and deletable); the preset blueprints and `run_rules` `preset` / `inputs` were removed.
