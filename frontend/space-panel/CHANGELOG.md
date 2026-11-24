# ha-share-space-space-panel

## 1.5.0

### Minor Changes

- f124479: The heating card glows while the radiator heats, and a thermometer next to the current temperature turns orange with rising mercury. In automation mode the card shows the requested target temperature instead of "Automatic". Corners are much tighter across the panel and cards, and the Share Space themes set a 6px card radius.
- 622453b: Share Space speaks French. The panel, the cards, the rules editor and the heating views follow each user's Home Assistant language: English or French, and French for any other language. The integrations get French translations too.

### Patch Changes

- Updated dependencies [f124479]
- Updated dependencies [622453b]
  - ha-share-space-ui@1.4.0
  - ha-share-space-planning-cards@0.5.0
  - ha-share-space-heating-card@1.1.0

## 1.4.2

### Patch Changes

- Updated dependencies [fc7d2f9]
  - ha-share-space-planning-cards@0.4.0

## 1.4.1

### Patch Changes

- d1ca355: Panel header: shows the signed-in user's name next to Log out. On narrow screens the tabs become one menu button (the current page, opening the list of pages), and the theme and light/dark selects become icon buttons that step to the next theme or mode on each tap, so the header keeps one row.

## 1.4.0

### Minor Changes

- 59e10c8: Plannings page: a Space Admin or Technical Admin can pick a person and edit their weekly planning for them, saved in that person's own Schedule helper.

### Patch Changes

- Updated dependencies [ee4787a]
  - ha-share-space-ui@1.3.0
  - ha-share-space-planning-cards@0.3.0
  - ha-share-space-heating-card@1.0.3

## 1.3.0

### Minor Changes

- 75f8e30: Week previews show each bar's start and end time on the bar itself (hidden when the bar is too short). The Plannings page shows the whole week as lanes: everyone merged first, then each person. The period editor's time fields and the outdoor temperature sensor menu are drawn like Share Space's other fields and dropdowns.

### Patch Changes

- 6a95268: Rules can look at one person's planning: the "planned" condition takes "one person's planning", which holds when a same person's own planning matches, whatever area they work in. The Lunch room strategy now heats the kitchen from 11:00 to 14:00 when someone is here both in the morning and in the afternoon, or is planned between 12:00 and 14:00 (someone planned 8:00–18:00 counts). An unedited Lunch room gets the new rules. An area nobody works in, such as a kitchen, runs its rules and shows its computed week instead of "No planning for this area yet". Share Space adds an "Everyone" sensor carrying each person's planning for this.
- Updated dependencies [6a95268]
- Updated dependencies [75f8e30]
  - ha-share-space-ui@1.2.0
  - ha-share-space-heating-card@1.0.2
  - ha-share-space-planning-cards@0.2.2

## 1.2.0

### Minor Changes

- 71452f5: Overview: each heating zone shows Home Assistant's temperature graph card (last 24 hours) for its area's temperature sensor. Zones are found through the heating integration's own list, so a zone whose sensor has another entity ID still shows its Comfort / Eco / Frost presets and timed overrides.

## 1.1.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [9d6072d]
- Updated dependencies [bc9e63e]
  - ha-share-space-ui@1.1.0
  - ha-share-space-planning-cards@0.2.1
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
- 98a3698: now a Space Admin can choose an existing HA board and display it as a Tab in the simplify view.
- b238da6: Add an easy to use interface
  Hiding all complicated HA stuff.

### Patch Changes

- Updated dependencies [1ca6f86]
- Updated dependencies [9407fa6]
- Updated dependencies [3bbac3b]
- Updated dependencies [98a3698]
- Updated dependencies [b238da6]
- Updated dependencies [35ae35a]
  - ha-share-space-ui@1.0.0
  - ha-share-space-heating-card@1.0.0
  - ha-share-space-planning-cards@0.2.0
