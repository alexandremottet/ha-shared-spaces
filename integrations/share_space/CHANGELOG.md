# share-space-integration

## 0.4.0

### Minor Changes

- 6a95268: Rules can look at one person's planning: the "planned" condition takes "one person's planning", which holds when a same person's own planning matches, whatever area they work in. The Lunch room strategy now heats the kitchen from 11:00 to 14:00 when someone is here both in the morning and in the afternoon, or is planned between 12:00 and 14:00 (someone planned 8:00–18:00 counts). An unedited Lunch room gets the new rules. An area nobody works in, such as a kitchen, runs its rules and shows its computed week instead of "No planning for this area yet". Share Space adds an "Everyone" sensor carrying each person's planning for this.

## 0.3.0

### Minor Changes

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

## 0.2.0

### Minor Changes

- 3bbac3b: Now just the HA Area are kept for ease of use.
