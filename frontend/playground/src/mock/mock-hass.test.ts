import { afterEach, describe, expect, it } from "vitest";
import { createMockHass } from "./mock-hass";
import type { MockHassController } from "./mock-hass";
import { fromWall } from "./planning";

const TZ = "Europe/Paris";
const at = (h: number, m = 0, day = 16) => fromWall(TZ, 2026, 11, day, h, m);
let c: MockHassController;

const make = (start: number, options = {}) => {
  c = createMockHass({ startTime: start, timeZone: TZ, playing: false, ...options });
  return c;
};
const zone = "sensor.share_space_heating_open_space";
const attrs = (id: string) => c.hass.states[id].attributes as Record<string, any>;

afterEach(() => c?.dispose());

describe("planning + actions", () => {
  it("area sensor follows schedule and runs actions on transition", async () => {
    make(at(8, 45));
    expect(c.hass.states["binary_sensor.share_space_open_space"].state).toBe("off");
    c.clock.set(at(9, 5));
    expect(c.hass.states["binary_sensor.share_space_open_space"].state).toBe("on");
    expect(c.hass.states["light.open_space_lights"].state).toBe("on");
    expect(c.state.actionsLog[0]).toMatchObject({ area: "open_space", state: "on", source: "transition" });
  });

  it("new hass reference on change", async () => {
    make(at(8, 45));
    const before = c.hass;
    await c.hass.callService("light", "toggle", { entity_id: "light.workshop_lights" });
    expect(c.hass).not.toBe(before);
    expect(c.hass.states["light.workshop_lights"].state).toBe("on");
  });

  it("missing backend mimics HA errors", async () => {
    make(at(8, 45), { installed: { planning: false } });
    await expect(c.hass.callWS({ type: "share_space/list_areas" })).rejects.toMatchObject({ code: "unknown_command" });
    await expect(c.hass.callService("share_space", "set_calendar", {})).rejects.toMatchObject({ code: "service_not_found" });
  });

  it("non-admin cannot save floorplan", async () => {
    make(at(8, 45), { userId: "u2" });
    await expect(c.hass.callWS({ type: "share_space_space/delete_floorplan", plan_id: "main" })).rejects.toMatchObject({ code: "unauthorized" });
  });
});

describe("heating", () => {
  it("target follows presence", () => {
    make(at(8, 45));
    expect(c.hass.states[zone].state).toBe("17");
    c.clock.set(at(9, 5));
    expect(c.hass.states[zone].state).toBe("21");
    expect(c.hass.states["climate.open_space"].attributes.temperature).toBe(21);
  });

  it("override wins, extend never shrinks, expiry restores schedule", async () => {
    make(at(9, 5));
    await c.hass.callService("share_space_heating", "set_override", { entity_id: zone, temperature: 23, hours: 2 });
    expect(attrs(zone).mode).toBe("override");
    const until = attrs(zone).override_until;
    await c.hass.callService("share_space_heating", "extend_override", { entity_id: zone, hours: 100 });
    expect(Date.parse(attrs(zone).override_until) - Date.parse(until)).toBeGreaterThan(0);
    expect(Date.parse(attrs(zone).override_until) - c.clock.now()).toBeLessThanOrEqual(12 * 3600000);
    c.clock.set(at(9, 5) + 13 * 3600000);
    expect(attrs(zone).mode).toBe("schedule");
  });

  it("external thermostat change becomes default-hours override", async () => {
    make(at(9, 5));
    await c.hass.callService("climate", "set_temperature", { entity_id: "climate.open_space", temperature: 24 });
    expect(attrs(zone).mode).toBe("override");
    expect(attrs(zone).override_temp).toBe(24);
    expect(Date.parse(attrs(zone).override_until) - c.clock.now()).toBe(3 * 3600000);
  });

  it("manual_only restores previous temp on clear", async () => {
    make(at(9, 5));
    const z = "sensor.share_space_heating_workshop";
    expect(attrs(z).mode).toBe("manual_only");
    await c.hass.callService("share_space_heating", "set_override", { entity_id: z, temperature: 25, hours: 1 });
    expect(c.hass.states["climate.workshop"].attributes.temperature).toBe(25);
    await c.hass.callService("share_space_heating", "clear_override", { entity_id: z });
    expect(c.hass.states["climate.workshop"].attributes.temperature).toBe(20);
  });

  it("update_zone links presence, switches to schedule, and unlinks to manual_only", async () => {
    make(at(9, 5));
    const z = "sensor.share_space_heating_workshop";
    const [workshop] = (await c.hass.callWS<any[]>({ type: "share_space_heating/list_zones" })).filter((x) => x.entity_id === z);
    expect(workshop.mode).toBe("manual_only");
    const res = await c.hass.callWS<any>({
      type: "share_space_heating/update_zone",
      entry_id: workshop.entry_id,
      presence_entity: "binary_sensor.share_space_open_space",
      comfort_temp: 22,
    });
    expect(res).toMatchObject({ mode: "schedule", presence_entity: "binary_sensor.share_space_open_space", target: 22 });
    expect(attrs(z).mode).toBe("schedule");
    expect(c.hass.states["climate.workshop"].attributes.temperature).toBe(22);
    c.clock.set(at(12, 30));
    expect(attrs(z).presence).toBe(false);
    const off = await c.hass.callWS<any>({ type: "share_space_heating/update_zone", entry_id: workshop.entry_id, presence_entity: null });
    expect(off.mode).toBe("manual_only");
  });

  it("update_zone is admin only", async () => {
    make(at(9, 5), { userId: "u2" });
    await expect(
      c.hass.callWS({ type: "share_space_heating/update_zone", entry_id: "zone_workshop", presence_entity: null }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
});
