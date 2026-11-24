---
"share-space-heating-integration": major
"ha-share-space-ui": patch
"ha-share-space-playground": patch
---

Heating zones now follow the Home Assistant area instead of keeping their own copy of its devices.
- a zone stores only its area: the thermostat, heaters, temperature sensor and presence sensor are read live from HA (area, device and helper settings).
- moving, adding or replacing a thermostat in the HA area, renaming the area or adding its Share Space occupancy sensor reloads the zone; deleting the area removes its zone.
- the config flow picks an area instead of a name and thermostat; the `create_zone` WebSocket command is removed (use `create_area_zone`).
- breaking: zone config entries are now version 2 with no migration; delete existing zones and recreate them (the dev fixtures do this on a fresh `.ha-dev`).
