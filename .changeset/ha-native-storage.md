---
"share-space-integration": minor
"share-space-heating-integration": minor
"ha-share-space-ui": minor
"ha-share-space-planning-cards": patch
"ha-share-space-playground": patch
---

Share Space keeps its data in Home Assistant itself.
- Each person's planning is an HA Schedule helper ("Planning <name>"), created on first save; edits in HA's Schedule page show up in Share Space.
- A person's area is the `person` entity's own HA area.
- Occupied/empty actions are an HA automation per area (`share_space_<area>_occupancy`), triggered by the area's occupancy sensor; changes made to it in HA are kept. "Test ON/OFF" runs them with `execute_script`.
- Areas Share Space does not manage carry the HA label "Share Space: not managed"; removing the label in HA manages the area again.
- Existing data moves over on its own: plannings and person areas when the integration starts, actions the first time an admin opens them.
- Removed services: `share_space.set_area_actions`, `share_space.run_area_actions`.
