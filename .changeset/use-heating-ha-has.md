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
- Installing Share Space makes it the page Home Assistant opens after login, for everyone including admins, unless an admin already chose another page. It happens once: an admin who turns it off in Settings keeps it off.
- The log out button shows for everyone, admins included.
- Overview's Planning card lists every heated area, so it shows even before anyone is planned. Admins also get "Everyone's planning": each person's own planning, read only.
- End-to-end Playwright tests (`pnpm test:e2e`) run against the dev Home Assistant on desktop and phone: landing on Share Space after login, log out, the Planning card, and the admin-only plannings.
- Overview lists heating before the Planning card. Everyone's planning moves to its own admin page, Plannings.
- Admin pages (Plannings, Areas, Settings) use the theme's admin colour, a soft lavender in Share Space themes (`share-space-admin-color`, falling back to the accent colour), for their tabs and buttons.
- Settings dropdowns such as Outdoor temperature look like the Show as tabs dropdown.
- On the Planning card, "No Share Space rules for this area yet" sits over the week on a 30% frosted veil.
