# ha-share-space-planning-cards

## 0.3.0

### Minor Changes

- ee4787a: Plannings show each block's start and end times on its edges. When times would touch (a phone, short blocks), they alternate between a top and a bottom row, and a time with no room on either is left out; a block being dragged shows its new times beside it. A `times` option (`bar` or `below`) on `week-schedule`, `day-schedule`, `area-roster-view` and `person-lane-track`, and on the My planning card, lists the times as text under each day instead.

### Patch Changes

- Updated dependencies [ee4787a]
  - ha-share-space-ui@1.3.0

## 0.2.2

### Patch Changes

- Updated dependencies [6a95268]
- Updated dependencies [75f8e30]
  - ha-share-space-ui@1.2.0

## 0.2.1

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
- Updated dependencies [9d6072d]
- Updated dependencies [bc9e63e]
  - ha-share-space-ui@1.1.0

## 0.2.0

### Minor Changes

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
