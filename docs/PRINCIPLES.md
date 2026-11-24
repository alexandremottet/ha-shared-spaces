# What Share Space promises

Share Space makes a shared place (an office, a coworking space, a family home) easy to run on Home Assistant. These are the promises it keeps, for you and for anyone who builds on it.

## An easy face for Home Assistant

A theme and a panel for the people who use the space every day, without the weight of Home Assistant's own pages. Areas, plannings, rules and heating are created and edited in one place, in plain words.

## Nothing changes until you change it

Installing Share Space on a Home Assistant you already use leaves it as it is. Your thermostats, radiators, schedules and automations keep working exactly as before. Share Space only reads what is there and shows it. Something changes only when you save it in Share Space: the first rule of an area, a planning, an action.

## It is still your Home Assistant

What Share Space saves is plain Home Assistant:

- each person's planning is a Schedule helper;
- the area a person works in is that person's own area;
- rules are automations;
- actions when an area becomes occupied or empty are automations;
- a thermostat Share Space builds from heater switches is Home Assistant's own Generic thermostat.

Open Home Assistant's own pages and you see the same things, and can edit them there too. Share Space cards also work on a plain dashboard. Remove Share Space and what it saved keeps working.

## Works with what you already have

Share Space finds each area's thermostat, or heaters and temperature sensor, on its own: no setup step.

Heating already driven by Home Assistant shows up in Share Space as rules: automations, Schedule helpers, and the [Scheduler](https://github.com/nielsfaber/scheduler-component) integration. Edit them in Share Space and the change is saved back into them. What Share Space cannot show as rules stays read only, with a link to edit it in Home Assistant.

## One place to edit, at the end

Share Space is the easy way to create and edit the automations and schedules Home Assistant runs. What you built by hand before is the starting point: when you save Share Space rules for an area, they become that area's only heating, and the automations and schedules that heated it before are turned off, not deleted. Save shows what it will turn off before you click it. "Replace with Share Space rules" copies one of them into the rules first, so nothing it did is lost.

## Rules that grow, inside Home Assistant

Rules read like sentences ("weekdays 8:00–18:00 when someone is planned: comfort") and gain features over time, while staying Home Assistant automations you can see, turn off and edit. A set of rules can be shared by several areas as a strategy.

## One new idea: shared plannings

Home Assistant already holds areas, people, schedules and automations; Share Space does not invent a second version of them. The one thing it adds is merging everyone's planning into when each area is occupied, so heating, lights and the rest can follow the people who actually come.
