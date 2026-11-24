---
"share-space-integration": minor
"share-space-heating-integration": minor
"ha-share-space-ui": minor
"ha-share-space-planning-cards": patch
"ha-share-space-playground": patch
---

Share Space keeps its data in Home Assistant itself, and changes nothing until you save something in it.
- Installing it creates nothing: heating found in HA areas (a thermostat, or heaters and a temperature sensor) is listed, and its zone is created with the area's first saved rule. The "not managed" list is gone.
- Each person's planning is an HA Schedule helper ("Planning <name>"), created on first save; edits in HA's Schedule page show up in Share Space.
- A person's area is the `person` entity's own HA area.
- Occupied/empty actions are an HA automation per area (`share_space_<area>_occupancy`), triggered by the area's occupancy sensor; changes made to it in HA are kept. "Test ON/OFF" runs them with `execute_script`.
- Data from older versions is used as it is and moves into HA the first time it is saved in Share Space.
- "Already in Home Assistant": automations Share Space cannot show as rules (even when the heating call is nested in choose/if) are listed read only; any item can be replaced with Share Space rules or a shared strategy, and is turned off when they are saved.
- Saving Share Space rules for an area turns off the HA automations and Scheduler items that heated it (shown under Save before clicking); they are not deleted.
- Scheduler items open on the dashboard showing the Scheduler card; an admin can make HA open on Share Space for everyone.
- Removed: services `share_space.set_area_actions` and `share_space.run_area_actions`; WS `share_space_heating/manage_area` (replaced by `detected_areas`).
