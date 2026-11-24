import { describe, expect, it } from "vitest";
import { detectAreaHeating } from "./area-heating";
import type { HomeAssistant } from "./hass";
import type { HeatingZone } from "./ws";

type Ent = { area?: string; device?: string; attrs?: Record<string, unknown> };

function hass(entities: Record<string, Ent>, devices: Record<string, string> = {}, temperatureSensor?: string): HomeAssistant {
  return {
    states: Object.fromEntries(Object.entries(entities).map(([id, e]) => [id, { entity_id: id, state: "off", attributes: e.attrs ?? {} }])),
    entities: Object.fromEntries(Object.entries(entities).map(([id, e]) => [id, { entity_id: id, area_id: e.area ?? null, device_id: e.device ?? null }])),
    devices: Object.fromEntries(Object.entries(devices).map(([id, area]) => [id, { id, area_id: area }])),
    areas: { bureau: { area_id: "bureau", name: "Bureau", temperature_entity_id: temperatureSensor ?? null } },
  } as unknown as HomeAssistant;
}

const temp = { device_class: "temperature" };

describe("detectAreaHeating", () => {
  it("keeps a group switch and drops the physical switches it drives", () => {
    const h = hass({
      "switch.radiateurs": { area: "bureau", attrs: { entity_id: ["switch.rad_1", "switch.rad_2"] } },
      "switch.rad_1": { device: "d1" },
      "switch.rad_2": { device: "d2" },
      "sensor.bureau_temp": { area: "bureau", attrs: temp },
    }, { d1: "bureau", d2: "bureau" });
    expect(detectAreaHeating(h, "bureau")).toEqual({ source: "heaters", thermostat: "", heaters: ["switch.radiateurs"], sensor: "sensor.bureau_temp" });
  });

  it("finds a group switch outside the area when its members are in it", () => {
    const h = hass({
      "switch.radiateurs": { attrs: { entity_id: ["switch.rad_1", "switch.rad_2"] } },
      "switch.rad_1": { area: "bureau" },
      "switch.rad_2": { area: "bureau" },
    });
    expect(detectAreaHeating(h, "bureau")?.heaters).toEqual(["switch.radiateurs"]);
  });

  it("prefers the area's temperature sensor setting", () => {
    const h = hass({
      "switch.rad": { area: "bureau" },
      "sensor.a": { area: "bureau", attrs: temp },
      "sensor.b": { attrs: temp },
    }, {}, "sensor.b");
    expect(detectAreaHeating(h, "bureau")?.sensor).toBe("sensor.b");
  });

  it("uses an existing thermostat first", () => {
    const h = hass({ "climate.bureau": { area: "bureau" }, "switch.rad": { area: "bureau" } });
    expect(detectAreaHeating(h, "bureau")).toMatchObject({ source: "thermostat", thermostat: "climate.bureau" });
  });

  it("skips devices other zones and Share Space already use", () => {
    const h = hass({
      "climate.used": { area: "bureau" },
      "switch.share_space_x": { area: "bureau" },
      "switch.rad": { area: "bureau" },
    });
    const zones = [{ climate_entity: "climate.used", heaters: ["switch.rad"] }] as HeatingZone[];
    expect(detectAreaHeating(h, "bureau", zones)).toBeNull();
  });

  it("returns null for an area without heating", () => {
    expect(detectAreaHeating(hass({ "sensor.a": { area: "bureau", attrs: temp } }), "bureau")).toBeNull();
  });
});
