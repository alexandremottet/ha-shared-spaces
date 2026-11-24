---
"share-space-heating-integration": minor
"share-space-space-integration": minor
"ha-share-space-ui": minor
"ha-share-space-space-panel": minor
"ha-share-space-playground": patch
---

Share Space now uses the heating Home Assistant already has.
- every HA area with a thermostat, or heater switches (a switch group is kept, its members dropped) and a temperature sensor (the area's own "Temperature sensor" setting first), gets its heating zone on its own: no setup step.
- such a zone leaves the radiators alone until its first Share Space rule runs.
- Settings → Heating: "Stop managing" removes a zone and Share Space does not set it up again; "Manage again" undoes it.
- Rules tab: "Already in Home Assistant" shows the automations (Schedule helpers expanded into their time windows) and Scheduler component items that already heat the area, as rules, read only, with "Open in Home Assistant".
