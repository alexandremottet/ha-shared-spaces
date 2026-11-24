# ha-share-space-playground

## 1.0.6

### Patch Changes

- Updated dependencies [fc7d2f9]
  - ha-share-space-planning-cards@0.4.0
  - ha-share-space-space-panel@1.4.2

## 1.0.5

### Patch Changes

- Updated dependencies [d1ca355]
  - ha-share-space-space-panel@1.4.1

## 1.0.4

### Patch Changes

- Updated dependencies [59e10c8]
- Updated dependencies [ee4787a]
  - ha-share-space-space-panel@1.4.0
  - ha-share-space-ui@1.3.0
  - ha-share-space-planning-cards@0.3.0
  - ha-share-space-dashboard@0.1.4
  - ha-share-space-heating-card@1.0.3

## 1.0.3

### Patch Changes

- Updated dependencies [6a95268]
- Updated dependencies [75f8e30]
  - ha-share-space-ui@1.2.0
  - ha-share-space-space-panel@1.3.0
  - ha-share-space-dashboard@0.1.3
  - ha-share-space-heating-card@1.0.2
  - ha-share-space-planning-cards@0.2.2

## 1.0.2

### Patch Changes

- Updated dependencies [71452f5]
  - ha-share-space-space-panel@1.2.0

## 1.0.1

### Patch Changes

- 9d6072d: Share Space keeps its data in Home Assistant itself, and changes nothing until you save something in it.
  - Installing it creates nothing: heating found in HA areas (a thermostat, or heaters and a temperature sensor) is listed, and its zone is created with the area's first saved rule. The "not managed" list is gone.
  - Each person's planning is an HA Schedule helper ("Planning <name>"), created on first save; edits in HA's Schedule page show up in Share Space.
  - A person's area is the `person` entity's own HA area.
  - Occupied/empty actions are an HA automation per area (`share_space_<area>_occupancy`), triggered by the area's occupancy sensor; changes made to it in HA are kept. "Test ON/OFF" runs them with `execute_script`.
  - Data from older versions is used as it is and moves into HA the first time it is saved in Share Space.
  - "Already in Home Assistant" is read only (automations whose heating call is nested in choose/if are listed too). An area with no Share Space rules offers "Migrate what is on" (its items copied into the rules, what cannot be copied listed) or "Start from scratch".
  - New rule block "Another area heated": holds when one of the chosen areas' thermostat is on and not on eco, away or sleep. HA conditions like "radiator of area X is on, or its thermostat is on comfort" migrate into it.
  - Saving Share Space rules for an area turns off the HA automations and Scheduler items that heated it (shown under Save before clicking); they are not deleted.
  - Scheduler items open on the dashboard showing the Scheduler card; an admin can make HA open on Share Space for everyone.
  - Removed: services `share_space.set_area_actions` and `share_space.run_area_actions`; WS `share_space_heating/manage_area` (replaced by `detected_areas`).
  - Overview shows the thermostats Home Assistant already has, before any rule is saved (set directly on the thermostat; timed overrides come with the area's first rule).
  - Rules opens on a list of every heated area: what drives it (a shared strategy, custom rules, or the HA automations and Scheduler items) and whether it is on. "All areas" goes back to it.
  - Each HA automation or Scheduler item shows, line by line, what it becomes in Share Space rules, and which lines are not copied.
  - Settings → Dashboards: one dropdown picks the dashboards shown as tabs, and one per view picks who sees it.
- bc9e63e: Share Space now uses the heating Home Assistant already has.
  - every HA area with a thermostat, or heater switches (a switch group is kept, its members dropped) and a temperature sensor (the area's own "Temperature sensor" setting first), gets its heating zone on its own: no setup step.
  - such a zone leaves the radiators alone until its first Share Space rule runs.
  - Settings → Heating: "Stop managing" removes a zone and Share Space does not set it up again; "Manage again" undoes it.
  - Rules tab: "Already in Home Assistant" shows the automations (Schedule helpers expanded into their time windows) and Scheduler component items that already heat the area, as rules, read only, with "Open in Home Assistant".
  - The Rules tab is now called Areas. On an area, its rules come first in their own card, with the Migrate / Start from scratch choice on top; "Already in Home Assistant" follows in a second card, and its buttons match the rest of the panel.
  - Overview shows a Planning card: an area's week exactly as the rules editor previews it (planned presence and the heating its saved rules give), with an area picker.
  - The "Show as tabs" and per-view dropdowns are solid and open above every card.
  - Le Portemine is softer: pastel blues, the yellow replaced by a pale sky blue. A browser that never picked a theme starts on Le Portemine.
  - On touch screens the planning editor has taller rows and wider resize handles.
  - Installing Share Space makes it the page Home Assistant opens after login, for everyone including admins, unless an admin already chose another page. It happens once: an admin who turns it off in Settings keeps it off.
  - The log out button shows for everyone, admins included.
  - Overview's Planning card lists every heated area, so it shows even before anyone is planned. Admins also get "Everyone's planning": each person's own planning, read only.
  - End-to-end Playwright tests (`pnpm test:e2e`) run against the dev Home Assistant on desktop and phone: landing on Share Space after login, log out, the Planning card, and the admin-only plannings.
  - Overview lists heating before the Planning card. Everyone's planning moves to its own admin page, Plannings.
  - Admin pages (Plannings, Areas, Settings) use the theme's admin colour, a soft lavender in Share Space themes (`share-space-admin-color`, falling back to the accent colour), for their tabs and buttons.
  - Settings dropdowns such as Outdoor temperature look like the Show as tabs dropdown.
  - On the Planning card, "No Share Space rules for this area yet" sits over the week on a 60% frosted veil whose edges fade into the card.
  - The tab strip no longer clips the theme's wide card shadow into a dark box behind the tabs; the Plannings page keeps its card inside the page width.
- Updated dependencies [9d6072d]
- Updated dependencies [9a998c8]
- Updated dependencies [bc9e63e]
  - ha-share-space-ui@1.1.0
  - ha-share-space-planning-cards@0.2.1
  - share-space-themes@0.3.0
  - ha-share-space-space-panel@1.1.0
  - ha-share-space-dashboard@0.1.2
  - ha-share-space-heating-card@1.0.1

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
- b238da6: Add an easy to use interface
  Hiding all complicated HA stuff.
- 35ae35a: Update BLock Editor UI
- bdf9516: extract themes

### Patch Changes

- 1ca6f86: Heating zones now follow the Home Assistant area instead of keeping their own copy of its devices.
  - a zone stores only its area: the thermostat, heaters, temperature sensor and presence sensor are read live from HA (area, device and helper settings).
  - moving, adding or replacing a thermostat in the HA area, renaming the area or adding its Share Space occupancy sensor reloads the zone; deleting the area removes its zone.
  - the config flow picks an area instead of a name and thermostat; the `create_zone` WebSocket command is removed (use `create_area_zone`).
  - breaking: zone config entries are now version 2 with no migration; delete existing zones and recreate them (the dev fixtures do this on a fresh `.ha-dev`).
- Updated dependencies [1ca6f86]
- Updated dependencies [9407fa6]
- Updated dependencies [3bbac3b]
- Updated dependencies [98a3698]
- Updated dependencies [b238da6]
- Updated dependencies [35ae35a]
- Updated dependencies [bdf9516]
  - ha-share-space-ui@1.0.0
  - ha-share-space-heating-card@1.0.0
  - ha-share-space-space-panel@1.0.0
  - ha-share-space-planning-cards@0.2.0
  - share-space-themes@0.2.0
  - ha-share-space-dashboard@0.1.1
