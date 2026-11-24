# ha-share-space-ui

## 1.0.0

### Major Changes

- 9407fa6: Rework to make easy to use Shared Space Automated System.
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

### Minor Changes

- 3bbac3b: Now just the HA Area are kept for ease of use.
- 98a3698: now a Space Admin can choose an existing HA board and display it as a Tab in the simplify view.
- b238da6: Add an easy to use interface
  Hiding all complicated HA stuff.
- 35ae35a: Update BLock Editor UI

### Patch Changes

- 1ca6f86: Heating zones now follow the Home Assistant area instead of keeping their own copy of its devices.
  - a zone stores only its area: the thermostat, heaters, temperature sensor and presence sensor are read live from HA (area, device and helper settings).
  - moving, adding or replacing a thermostat in the HA area, renaming the area or adding its Share Space occupancy sensor reloads the zone; deleting the area removes its zone.
  - the config flow picks an area instead of a name and thermostat; the `create_zone` WebSocket command is removed (use `create_area_zone`).
  - breaking: zone config entries are now version 2 with no migration; delete existing zones and recreate them (the dev fixtures do this on a fresh `.ha-dev`).
