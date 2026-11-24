import { describe, expect, it, vi } from "vitest";
import { areaActionsConfig, getAreaActions, patchAreaActions, readAreaActions, runAreaActions, setAreaActions } from "./area-actions";
import type { HomeAssistant } from "./hass";

const on = [{ action: "light.turn_on", target: { entity_id: "light.desk" } }];
const off = [{ action: "light.turn_off", target: { entity_id: "light.desk" } }];

function fakeHass(opts: { automation?: Record<string, unknown>; enabled?: boolean; legacy?: unknown; admin?: boolean }) {
  const calls: Array<[string, ...unknown[]]> = [];
  let config = opts.automation ?? null;
  const states: HomeAssistant["states"] = {};
  if (config) states["automation.bureau"] = { entity_id: "automation.bureau", state: opts.enabled === false ? "off" : "on", attributes: { id: "share_space_bureau_occupancy" } };
  const hass = {
    states,
    areas: { bureau: { area_id: "bureau", name: "Bureau" } },
    user: { id: "u", name: "U", is_admin: opts.admin ?? true },
    callWS: vi.fn(async (msg: Record<string, unknown>) => {
      calls.push(["ws", msg]);
      if (msg.type === "automation/config") return { config };
      if (msg.type === "share_space/get_area_actions") return opts.legacy ?? null;
      return {};
    }),
    callService: vi.fn(async (...args: unknown[]) => void calls.push(["service", ...args])),
    callApi: vi.fn(async (method: string, path: string, data?: Record<string, unknown>) => {
      calls.push(["api", method, path, data]);
      if (method === "POST") {
        config = data!;
        states["automation.bureau"] = { entity_id: "automation.bureau", state: "on", attributes: { id: "share_space_bureau_occupancy" } };
      }
      return method === "GET" ? config : { result: "ok" };
    }),
  } as unknown as HomeAssistant;
  return { hass, calls };
}

describe("area actions automation", () => {
  it("is a plain HA automation triggered by the occupancy sensor", () => {
    const config = areaActionsConfig("bureau", "Bureau", on, off);
    expect(config.triggers).toEqual([
      { trigger: "state", entity_id: "binary_sensor.share_space_bureau", from: "off", to: "on", id: "on" },
      { trigger: "state", entity_id: "binary_sensor.share_space_bureau", from: "on", to: "off", id: "off" },
    ]);
    expect(readAreaActions(config)).toEqual({ on_actions: on, off_actions: off });
  });

  it("keeps what was added in HA when the actions change", () => {
    const config = { ...areaActionsConfig("bureau", "Bureau", on, []), conditions: [{ condition: "state", entity_id: "input_boolean.holiday", state: "off" }] };
    const patched = patchAreaActions(config, [], off);
    expect(patched.conditions).toEqual(config.conditions);
    expect(readAreaActions(patched)).toEqual({ on_actions: [], off_actions: off });
    expect(() => patchAreaActions({ actions: [{ action: "light.turn_on" }] }, on, off)).toThrow(/Home Assistant/);
  });

  it("reads actions and on/off from the automation", async () => {
    const { hass } = fakeHass({ automation: areaActionsConfig("bureau", "Bureau", on, off), enabled: false });
    expect(await getAreaActions(hass, "bureau")).toEqual({ on_actions: on, off_actions: off, enabled: false });
  });

  it("moves actions Share Space kept into an automation, then forgets them", async () => {
    const { hass, calls } = fakeHass({ legacy: { on_actions: on, off_actions: [], enabled: true } });
    expect(await getAreaActions(hass, "bureau")).toEqual({ on_actions: on, off_actions: [], enabled: true });
    expect(calls.find((c) => c[0] === "api")?.slice(1, 3)).toEqual(["POST", "config/automation/config/share_space_bureau_occupancy"]);
    expect(calls.at(-1)).toEqual(["ws", { type: "share_space/forget_area_actions", area: "bureau" }]);
  });

  it("does not move kept actions for a non-admin", async () => {
    const { hass, calls } = fakeHass({ legacy: { on_actions: on, off_actions: [], enabled: true }, admin: false });
    await getAreaActions(hass, "bureau");
    expect(calls.some((c) => c[0] === "api")).toBe(false);
  });

  it("creates the automation on the first action, turns it off, deletes it with the last", async () => {
    const { hass, calls } = fakeHass({});
    await setAreaActions(hass, "bureau", { on_actions: on });
    expect(calls.filter((c) => c[0] === "api").map((c) => c[1])).toEqual(["POST"]);
    await setAreaActions(hass, "bureau", { enabled: false });
    expect(calls.at(-1)).toEqual(["service", "automation", "turn_off", { entity_id: "automation.bureau" }]);
    await setAreaActions(hass, "bureau", { on_actions: [] });
    expect(calls.at(-1)).toEqual(["api", "DELETE", "config/automation/config/share_space_bureau_occupancy", undefined]);
  });

  it("runs the actions now with execute_script", async () => {
    const { hass, calls } = fakeHass({ automation: areaActionsConfig("bureau", "Bureau", on, off) });
    await runAreaActions(hass, "bureau", "off");
    expect(calls.at(-1)).toEqual(["ws", { type: "execute_script", sequence: off, variables: { area: "bureau", state: "off" } }]);
  });
});
