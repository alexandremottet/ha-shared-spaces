---
"share-space-integration": minor
"share-space-heating-integration": minor
"ha-share-space-ui": minor
"ha-share-space-space-panel": patch
---

Rules can look at one person's planning: the "planned" condition takes "one person's planning", which holds when a same person's own planning matches, whatever area they work in. The Lunch room strategy now heats the kitchen from 11:00 to 14:00 when someone is here both in the morning and in the afternoon, or is planned between 12:00 and 14:00 (someone planned 8:00–18:00 counts). An unedited Lunch room gets the new rules. An area nobody works in, such as a kitchen, runs its rules and shows its computed week instead of "No planning for this area yet". Share Space adds an "Everyone" sensor carrying each person's planning for this.
