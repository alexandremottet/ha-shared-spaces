import { describe, expect, it } from "vitest";
import { findZoneStrategiesByConfig } from "./ws";

const hass = (cfg: Record<string, unknown>) =>
  ({
    states: {
      "automation.old": { state: "on", attributes: { id: "share_space_old_zone_office_saver", friendly_name: "Old" } },
    },
    callApi: async (_m: string, path: string) => cfg[path.split("/").pop()!],
  }) as never;

describe("renamed zone discovery", () => {
  const cfg = { share_space_old_zone_office_saver: { alias: "x", use_blueprint: { path: "share_space/office_saver.yaml", input: { zone: "climate.new_zone" } } } };
  it("matches by blueprint zone input", async () => {
    expect((await findZoneStrategiesByConfig(hass(cfg), "climate.new_zone", "office_saver"))?.id).toBe("share_space_old_zone_office_saver");
    expect(await findZoneStrategiesByConfig(hass(cfg), "climate.other", "office_saver")).toBeUndefined();
    expect(await findZoneStrategiesByConfig(hass(cfg), "climate.new_zone", "lunch_room")).toBeUndefined();
  });
});
