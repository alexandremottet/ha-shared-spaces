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
- The Rules tab is now called Areas. On an area, its rules come first in their own card, with the Migrate / Start from scratch choice on top; "Already in Home Assistant" follows in a second card, and its buttons match the rest of the panel.
- Overview shows a Planning card: an area's week exactly as the rules editor previews it (planned presence and the heating its saved rules give), with an area picker.
- The "Show as tabs" and per-view dropdowns are solid and open above every card.
- Le Portemine is softer: pastel blues, the yellow replaced by a pale sky blue. A browser that never picked a theme starts on Le Portemine.
- On touch screens the planning editor has taller rows and wider resize handles.
