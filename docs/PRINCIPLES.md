# Share Space principles

What Share Space is, and the rules every change is checked against.

1. **An easy face for Home Assistant.** A theme and a panel that hide the classic HA UI's complexity for the people who use the space every day.
2. **Easy settings.** Areas, rules, heating and how they belong together are created, managed and edited from the Share Space panel, more simply than in HA's own pages.
3. **Vanilla HA compatible.** Everything Share Space writes is a plain HA object (areas, entities, helpers, automations, blueprints). An admin can switch between HA's own pages and Share Space and see the same thing. Cards also work on a basic HA dashboard.
4. **Works with what is already installed.** Integrations such as Scheduler, Schedule helpers and existing automations are read, shown and edited in place, not replaced or duplicated.
5. **A rule engine that grows, inside HA automations.** Share Space rules run as HA automations (the `share_space/rules.yaml` blueprint); new rule features keep that, so rules stay visible, switchable and editable in HA.
6. **No new technical concept when HA has one.** If HA can hold it, even less conveniently, Share Space uses HA's way and only makes it easier. Share Space's own storage is kept for what HA cannot express.
7. **Planning is the one thing Share Space adds.** It is a custom integration that merges people's plannings into area occupancy, and lets that drive the space.

## What follows from them

- Share Space never asks someone to re-declare what an HA area already holds (its thermostat, heaters, temperature sensor, occupancy): it finds it.
- Taking over existing heating is never silent: a zone Share Space sets up on its own leaves the radiators alone until its first rule runs.
- What Share Space cannot express in an existing HA object is shown and kept untouched on save, with a link to edit it in HA.

## Decisions

- **Person plannings** are HA Schedule helpers, one per person; Share Space merges them into area occupancy.
- **Which area a person belongs to** is the `person` entity's own HA area.
- **Actions when an area becomes occupied or empty** are HA automations triggered by the area's occupancy sensor.
- **Areas Share Space stops managing** carry an HA label.
- **Rules** are stored in HA automations; Share Space keeps only reusable rule templates (shared strategies) and which areas use them.
- **Rules evaluated by Share Space's Python code** inside the blueprint automation are fine.
- **Building a thermostat** for heater switches is fine: it creates HA's own Generic thermostat and Switch group helpers.
- **Comfort/eco temperatures per zone** (open): they duplicate thermostat presets where a thermostat has them.
