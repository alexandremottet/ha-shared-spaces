import { afterEach, describe, expect, it } from "vitest";
import { createMockHass } from "./mock-hass";
import type { MockHassController } from "./mock-hass";
import { fromWall } from "./planning";

const TZ = "Europe/Paris";
const at = (day: number, h: number, m = 0) => fromWall(TZ, 2026, 11, day, h, m);
let c: MockHassController;

const make = (start: number, options = {}) => {
  c = createMockHass({ startTime: start, timeZone: TZ, playing: false, ...options });
  return c;
};
const OPEN = "sensor.share_space_heating_open_space";
const KITCHEN = "sensor.share_space_heating_kitchen";
const attrs = (id: string) => c.hass.states[id].attributes as Record<string, any>;
const officeId = `share_space_${OPEN.slice(7)}_office_saver`;
const lunchId = `share_space_${KITCHEN.slice(7)}_lunch_room`;

const weekdays = (...ranges: Array<{ start: string; end: string }>) => ({
  monday: ranges,
  tuesday: ranges,
  wednesday: ranges,
  thursday: ranges,
  friday: ranges,
});

const createOffice = () =>
  c.hass.callApi("POST", `config/automation/config/${officeId}`, {
    alias: "Share Space · Open space · Office saver",
    description: "",
    use_blueprint: { path: "share_space/office_saver.yaml", input: { zone: OPEN, area: "open_space" } },
  });

afterEach(() => c?.dispose());

describe("planning entities", () => {
  it("exposes schedule, flip sensors and day flags", () => {
    make(at(16, 8, 45));
    const main = attrs("binary_sensor.share_space_open_space");
    expect(main.schedule.monday).toEqual([["09:00", "12:30"], ["13:00", "19:00"]]);
    expect(main.schedule.sunday).toEqual([]);
    expect(c.hass.states["sensor.share_space_open_space_next_on"].state).toBe(new Date(at(16, 9)).toISOString());
    expect(c.hass.states["sensor.share_space_open_space_next_off"].state).toBe(new Date(at(16, 12, 30)).toISOString());
    expect(c.hass.states["sensor.share_space_open_space_previous_off"].state).toBe(new Date(at(14, 13)).toISOString());
    expect(c.hass.states["binary_sensor.share_space_open_space_occupied_today"].state).toBe("on");
    expect(c.hass.states["binary_sensor.share_space_kitchen_occupied_tomorrow"].state).toBe("on");
  });

  it("query_occupancy answers through call_service with a response", async () => {
    make(at(17, 9)); // Tuesday
    const call = (service_data: Record<string, unknown>) =>
      c.hass.callWS<{ response: { occupied: boolean; matches: boolean[] } }>({ type: "call_service", domain: "share_space", service: "query_occupancy", service_data, return_response: true });
    const windows = [{ start: "11:00", end: "12:00" }, { start: "13:00", end: "14:00" }];
    expect((await call({ area: "kitchen", windows })).response).toEqual({ occupied: true, matches: [true, true] });
    expect((await call({ area: "kitchen", windows, day: "monday" })).response).toEqual({ occupied: false, matches: [true, false] });
    expect((await call({ area: "kitchen", windows, day: "monday", match: "any" })).response.occupied).toBe(true);
    await expect(c.hass.callWS({ type: "call_service", domain: "share_space", service: "query_occupancy", service_data: { area: "kitchen", windows } })).rejects.toMatchObject({ code: "service_validation_error" });
  });
});

describe("set_base_target", () => {
  it("sets automation mode, frost on off, and override wins then expires", async () => {
    make(at(16, 9, 5));
    await c.hass.callService("share_space_heating", "set_base_target", { entity_id: OPEN, temperature: 19, reason: "Test" });
    expect(attrs(OPEN)).toMatchObject({ mode: "automation", active_rule: "Test" });
    expect(c.hass.states[OPEN].state).toBe("19");
    await c.hass.callService("share_space_heating", "set_override", { entity_id: OPEN, temperature: 23, hours: 1 });
    expect(attrs(OPEN).mode).toBe("override");
    c.clock.set(at(16, 11));
    expect(attrs(OPEN)).toMatchObject({ mode: "automation", active_rule: "Test" });
    expect(c.hass.states["climate.open_space"].attributes.temperature).toBe(19);
    await c.hass.callService("share_space_heating", "set_base_target", { entity_id: OPEN, off: true, reason: "Away" });
    expect(c.hass.states[OPEN].state).toBe("7");
    await expect(c.hass.callService("share_space_heating", "set_base_target", { entity_id: OPEN, off: true, temperature: 20 })).rejects.toMatchObject({ code: "service_validation_error" });
  });

  it("hvac_off mode switches the climate off and back on", async () => {
    make(at(16, 9, 5));
    await c.hass.callWS({ type: "share_space_heating/update_zone", entry_id: "zone_open_space", off_mode: "hvac_off" });
    await c.hass.callService("share_space_heating", "set_base_target", { entity_id: OPEN, off: true });
    expect(c.hass.states["climate.open_space"].state).toBe("off");
    await c.hass.callService("share_space_heating", "set_base_target", { entity_id: OPEN, temperature: 21 });
    expect(c.hass.states["climate.open_space"].state).toBe("heat");
    expect(c.hass.states["climate.open_space"].attributes.temperature).toBe(21);
  });
});

describe("automation config API and runner", () => {
  it("stores configs, exposes automation entities, and toggles", async () => {
    make(at(16, 9, 5));
    await createOffice();
    const ent = Object.values(c.hass.states).find((e) => e.attributes.id === officeId)!;
    expect(ent.entity_id).toBe("automation.share_space_open_space_office_saver");
    expect(ent.state).toBe("on");
    const cfg = await c.hass.callApi<any>("GET", `config/automation/config/${officeId}`);
    expect(cfg.use_blueprint.input.area).toBe("open_space");
    await c.hass.callService("automation", "turn_off", { entity_id: ent.entity_id });
    expect(c.hass.states[ent.entity_id].state).toBe("off");
    await c.hass.callApi("DELETE", `config/automation/config/${officeId}`);
    expect(c.hass.states[ent.entity_id]).toBeUndefined();
    await expect(c.hass.callApi("GET", `config/automation/config/${officeId}`)).rejects.toMatchObject({ code: "not_found" });
  });

  it("non-admin cannot touch automation config", async () => {
    make(at(16, 9, 5), { userId: "u2" });
    await expect(createOffice()).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("office saver: Friday 19:00 off, Monday 03:00 preheat", async () => {
    make(at(20, 17));
    for (const person of ["person.alice", "person.chloe"]) {
      await c.hass.callService("share_space", "set_calendar", {
        person,
        calendar: person === "person.alice" ? weekdays({ start: "09:00", end: "18:00" }) : {},
      });
    }
    await createOffice();
    expect(attrs(OPEN)).toMatchObject({ mode: "automation", active_rule: "Occupied" });
    expect(c.hass.states[OPEN].state).toBe("21");
    c.clock.set(at(20, 19));
    expect(attrs(OPEN).active_rule).toBe("Away");
    expect(c.hass.states[OPEN].state).toBe("7");
    expect(c.hass.states["climate.open_space"].attributes.temperature).toBe(7);
    c.clock.set(at(23, 2, 59));
    expect(attrs(OPEN).active_rule).toBe("Away");
    c.clock.set(at(23, 3));
    expect(attrs(OPEN).active_rule).toBe("Preheat");
    expect(c.hass.states[OPEN].state).toBe("21");
    expect(c.hass.states["climate.open_space"].attributes.temperature).toBe(21);
    c.clock.set(at(24, 19));
    expect(attrs(OPEN).active_rule).toBe("Between working days");
    expect(c.hass.states[OPEN].state).toBe("16");
  });

  it("disabled automation does not run", async () => {
    make(at(20, 17));
    await createOffice();
    await c.hass.callService("automation", "turn_off", { entity_id: "automation.share_space_open_space_office_saver" });
    await c.hass.callService("share_space_heating", "set_base_target", { entity_id: OPEN, temperature: 18, reason: "Manual" });
    c.clock.set(at(23, 3));
    expect(attrs(OPEN).active_rule).toBe("Manual");
  });

  it("lunch room on Kitchen follows the planning windows", async () => {
    make(at(17, 10, 30)); // Tuesday
    await c.hass.callApi("POST", `config/automation/config/${lunchId}`, {
      alias: "Share Space · Kitchen · Lunch room",
      use_blueprint: { path: "share_space/lunch_room.yaml", input: { zone: KITCHEN, area: "kitchen" } },
    });
    expect(attrs(KITCHEN).active_rule).toBe("Outside lunch hours");
    c.clock.set(at(17, 11, 30));
    expect(attrs(KITCHEN)).toMatchObject({ active_rule: "Lunch", mode: "automation" });
    expect(c.hass.states[KITCHEN].state).toBe("20");
    c.clock.set(at(17, 14));
    expect(attrs(KITCHEN).active_rule).toBe("Outside lunch hours");
    c.clock.set(at(16, 11, 30)); // Monday: morning only
    expect(attrs(KITCHEN).active_rule).toBe("No lunch today");
    expect(c.hass.states[KITCHEN].state).toBe("7");
  });
});
