import { describe, expect, it } from "vitest";
import {
  automationAsHeating,
  schedulerAsHeating,
  type ScheduleHelper,
  type SchedulerItem,
} from "./existing-heating";
import type { HomeAssistant } from "./hass";

const hass = {
  states: {
    "automation.pause_dej": { entity_id: "automation.pause_dej", state: "on", attributes: { id: "1763116012338" } },
    "automation.bureau_schedule": { entity_id: "automation.bureau_schedule", state: "on", attributes: { id: "42" } },
    "switch.schedule_ab12": { entity_id: "switch.schedule_ab12", state: "on", attributes: {} },
  },
  entities: {
    "climate.cuisine": { entity_id: "climate.cuisine", area_id: "cuisine" },
    "climate.rue": { entity_id: "climate.rue", area_id: "bureau_rue" },
    "switch.radiateur_rue_1": { entity_id: "switch.radiateur_rue_1", area_id: "bureau_rue" },
  },
  devices: {},
} as unknown as HomeAssistant;

const cuisine = { area: "cuisine", entities: ["climate.cuisine"] };
const rue = { area: "bureau_rue", entities: ["climate.rue"] };

const pauseDej = {
  id: "1763116012338",
  alias: "La Pause Dej",
  description: "",
  triggers: [{ trigger: "time", at: "11:30:00", weekday: ["mon", "tue", "wed", "thu", "fri"] }],
  conditions: [
    {
      condition: "or",
      conditions: [
        { condition: "state", entity_id: "switch.radiateur_rue_1", state: "on" },
        { condition: "state", entity_id: "climate.rue", attribute: "preset_mode", state: "comfort" },
      ],
    },
  ],
  actions: [
    { action: "climate.set_preset_mode", target: { entity_id: "climate.cuisine" }, data: { preset_mode: "comfort" } },
    { delay: { hours: 1, minutes: 40, seconds: 0 } },
    { action: "climate.set_preset_mode", target: { entity_id: "climate.cuisine" }, data: { preset_mode: "eco" } },
  ],
};

describe("automationAsHeating", () => {
  it("reads a timed automation as one rule and keeps what it cannot express", () => {
    const item = automationAsHeating(hass, "automation.pause_dej", pauseDej, cuisine)!;
    expect(item.rules).toEqual([
      {
        label: "La Pause Dej",
        when: [
          { type: "weekday", days: ["monday", "tuesday", "wednesday", "thursday", "friday"] },
          { type: "time", start: "11:30", end: "13:10" },
          { type: "heated", areas: ["bureau_rue"] },
        ],
        then: { type: "comfort" },
      },
    ]);
    expect(item.unmapped).toEqual([]);
    expect(item.mapping).toEqual([
      { ha: expect.stringMatching(/^When /), rules: "11:30–13:10 and mon, tue, wed, thu, fri" },
      { ha: expect.stringMatching(/^If any of: /), rules: "bureau rue heated" },
      { ha: expect.stringMatching(/^Then /), rules: "then Comfort" },
      { ha: "Then wait 1h40", rules: "the window ends at 13:10" },
      { ha: expect.stringMatching(/^Then /), rules: "after the window, the area's other rules apply" },
    ]);
    expect(item.haPath).toBe("/config/automation/edit/1763116012338");
  });

  it("keeps what it cannot express as lines not copied", () => {
    const odd = { ...pauseDej, conditions: [{ condition: "sun", after: "sunset" }] };
    const item = automationAsHeating(hass, "automation.pause_dej", odd, cuisine)!;
    expect(item.compatible).toBe(false);
    expect(item.unmapped).toEqual(["If sun"]);
    expect(automationAsHeating(hass, "automation.pause_dej", pauseDej, cuisine)!.compatible).toBe(true);
  });

  it("shows heating it cannot read as rules at all, read only", () => {
    const nested = {
      id: "9",
      alias: "Night",
      triggers: [{ trigger: "sun", event: "sunset" }],
      actions: [{ choose: [{ conditions: [], sequence: [{ action: "climate.set_hvac_mode", target: { entity_id: "climate.rue" }, data: { hvac_mode: "auto" } }] }] }],
    };
    const item = automationAsHeating(hass, "automation.pause_dej", nested, rue)!;
    expect(item.rules).toEqual([]);
    expect(item.compatible).toBe(false);
    expect(item.unmapped[0]).toBe("When sun");
    expect(automationAsHeating(hass, "automation.pause_dej", nested, cuisine)).toBeNull();
  });

  it("is not heating of an area it does not act on", () => {
    expect(automationAsHeating(hass, "automation.pause_dej", pauseDej, rue)).toBeNull();
  });

  it("expands a Schedule helper into its windows", () => {
    const helper: ScheduleHelper = {
      id: "bureau",
      name: "Bureau",
      monday: [{ from: "08:00:00", to: "18:00:00" }],
      tuesday: [{ from: "08:00:00", to: "18:00:00" }],
      saturday: [{ from: "10:00:00", to: "12:00:00" }],
    };
    const cfg = {
      alias: "Bureau schedule",
      triggers: [{ trigger: "state", entity_id: "schedule.bureau", to: "on" }],
      conditions: [{ condition: "state", entity_id: "input_boolean.vacances", state: "off" }],
      actions: [{ action: "climate.set_temperature", target: { area_id: "bureau_rue" }, data: { temperature: 20 } }],
    };
    const item = automationAsHeating(hass, "automation.bureau_schedule", cfg, rue, { "schedule.bureau": helper })!;
    expect(item.rules.map((r) => r.when.slice(0, 2))).toEqual([
      [{ type: "weekday", days: ["monday", "tuesday"] }, { type: "time", start: "08:00", end: "18:00" }],
      [{ type: "weekday", days: ["saturday"] }, { type: "time", start: "10:00", end: "12:00" }],
    ]);
    expect(item.rules[0].when[2]).toEqual({ type: "state", entity: "input_boolean.vacances", is: "off" });
  });

  it("skips Share Space's own rules automations", () => {
    const own = { alias: "x", use_blueprint: { path: "share_space/rules.yaml", input: {} } };
    expect(automationAsHeating(hass, "automation.x", own, rue)).toBeNull();
  });
});

describe("schedulerAsHeating", () => {
  const item: SchedulerItem = {
    schedule_id: "ab12",
    entity_id: "switch.schedule_ab12",
    name: "Rue",
    weekdays: ["workday"],
    timeslots: [
      { start: "07:30:00", actions: [{ service: "climate.set_preset_mode", entity_id: "climate.rue", service_data: { preset_mode: "comfort" } }] },
      { start: "18:00:00", actions: [{ service: "climate.set_preset_mode", entity_id: "climate.rue", service_data: { preset_mode: "eco" } }] },
    ],
  };

  it("reads each timeslot as a rule lasting until the next one", () => {
    const h = schedulerAsHeating(hass, item, rue)!;
    expect(h.rules.map((r) => [r.when, r.then])).toEqual([
      [[{ type: "weekday", days: ["monday", "tuesday", "wednesday", "thursday", "friday"] }, { type: "time", start: "07:30", end: "18:00" }], { type: "comfort" }],
      [[{ type: "weekday", days: ["monday", "tuesday", "wednesday", "thursday", "friday"] }, { type: "time", start: "18:00", end: "07:30" }], { type: "eco" }],
    ]);
    expect(schedulerAsHeating(hass, item, cuisine)).toBeNull();
  });

  it("keeps a sleep preset as sleep, shown in the rule's name", () => {
    const slot = (start: string, stop: string, preset_mode: string) => ({
      start,
      stop,
      conditions: [],
      actions: [{ service: "climate.set_preset_mode", entity_id: "climate.rue", service_data: { preset_mode } }],
    });
    const planning = {
      schedule_id: "00c54c",
      name: "Planning Bureau Rue",
      weekdays: ["mon", "tue", "wed", "fri", "thu"],
      enabled: true,
      timeslots: [slot("00:00:00", "08:00:00", "sleep"), slot("08:00:00", "19:00:00", "eco"), slot("21:30:00", "00:00:00", "sleep")],
    } as unknown as SchedulerItem;
    const h = schedulerAsHeating(hass, planning, rue)!;
    expect(h.rules.map((r) => r.label)).toEqual(["Planning Bureau Rue 00:00 (sleep)", "Planning Bureau Rue 08:00", "Planning Bureau Rue 21:30 (sleep)"]);
    expect(h.rules[2].when[1]).toEqual({ type: "time", start: "21:30", end: "24:00" });
  });
});
