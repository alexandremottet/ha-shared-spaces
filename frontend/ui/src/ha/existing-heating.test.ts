import { describe, expect, it } from "vitest";
import {
  automationAsHeating,
  automationFromRules,
  schedulerAsHeating,
  schedulerFromRules,
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
        ],
        then: { type: "comfort" },
      },
    ]);
    expect(item.unmapped).toHaveLength(2);
    expect(item.unmapped).toEqual([
      "If any of: switch.radiateur_rue_1 is on · climate.rue preset_mode is comfort",
      "Then climate.set_preset_mode climate.cuisine preset_mode eco",
    ]);
    expect(item.haPath).toBe("/config/automation/edit/1763116012338");
  });

  it("is read only when Share Space cannot express all of it", () => {
    const item = automationAsHeating(hass, "automation.pause_dej", pauseDej, cuisine)!;
    expect(item.compatible).toBe(false);
    const simple = automationAsHeating(hass, "automation.pause_dej", { ...pauseDej, conditions: [], actions: pauseDej.actions.slice(0, 2) }, cuisine)!;
    expect(simple.compatible).toBe(true);
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

  it("writes edits back into the same automation, leaving the rest untouched", () => {
    const item = automationAsHeating(hass, "automation.pause_dej", pauseDej, cuisine)!;
    const rule = item.rules[0];
    const { config, schedule } = automationFromRules(item, [
      { ...rule, when: [{ type: "weekday", days: ["monday", "friday"] }, { type: "time", start: "12:00", end: "13:00" }], then: { type: "temperature", value: 20 } },
    ]);
    expect(schedule).toBeNull();
    expect(config.triggers).toEqual([{ trigger: "time", at: "12:00:00", weekday: ["mon", "fri"] }]);
    expect(config.conditions).toEqual(pauseDej.conditions);
    const actions = config.actions as unknown[];
    expect(actions[0]).toEqual({ action: "climate.set_temperature", target: { entity_id: "climate.cuisine" }, data: { temperature: 20 } });
    expect(actions[1]).toEqual({ delay: { hours: 1, minutes: 0, seconds: 0 } });
    expect(actions[2]).toEqual(pauseDej.actions[2]);
  });

  it("round-trips unchanged rules to the same config", () => {
    const item = automationAsHeating(hass, "automation.pause_dej", pauseDej, cuisine)!;
    expect(automationFromRules(item, item.rules).config).toEqual(pauseDej);
  });

  it("expands a Schedule helper into its windows and writes them back to the helper", () => {
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
    const edited = item.rules.map((r, i) => (i === 0 ? { ...r, when: [r.when[0], { type: "time" as const, start: "07:30", end: "18:00" }, r.when[2]] } : r));
    const { schedule } = automationFromRules(item, edited);
    expect(schedule?.monday).toEqual([{ from: "07:30:00", to: "18:00:00" }]);
    expect(schedule?.saturday).toEqual([{ from: "10:00:00", to: "12:00:00" }]);
    expect(schedule?.sunday).toEqual([]);
  });

  it("refuses conditions an automation edit cannot hold", () => {
    const item = automationAsHeating(hass, "automation.pause_dej", pauseDej, cuisine)!;
    expect(() => automationFromRules(item, [{ ...item.rules[0], when: [{ type: "occupied" }] }])).toThrow(/cannot hold/);
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

  it("writes times, days and actions back as scheduler.edit data", () => {
    const h = schedulerAsHeating(hass, item, rue)!;
    const rules = h.rules.map((r, i) =>
      i === 0 ? { ...r, when: [{ type: "weekday" as const, days: ["monday" as const] }, { type: "time" as const, start: "08:00", end: "18:00" }], then: { type: "temperature" as const, value: 21 } } : { ...r, when: [{ type: "weekday" as const, days: ["monday" as const] }, r.when[1]] },
    );
    const data = schedulerFromRules(h, rules);
    expect(data.entity_id).toBe("switch.schedule_ab12");
    expect(data.weekdays).toEqual(["mon"]);
    const slots = data.timeslots as SchedulerItem["timeslots"];
    expect(slots[0].start).toBe("08:00:00");
    expect(slots[0].actions[0]).toEqual({ service: "climate.set_temperature", entity_id: "climate.rue", service_data: { temperature: 21 } });
    expect(slots[1]).toEqual(item.timeslots[1]);
  });
});
