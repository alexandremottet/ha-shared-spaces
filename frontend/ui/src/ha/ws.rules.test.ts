import { describe, expect, it, vi } from "vitest";
import {
  detachAutomation,
  findZoneStrategies,
  listStrategyAutomations,
  loadRulesAutomation,
  loadZoneRules,
  loadZoneStrategy,
  nextRulesId,
  rulesIdIndex,
  saveZoneRules,
  stopZoneStrategies,
  strategyAutomationId,
  useZoneStrategy,
  zoneRulesIds,
} from "./ws";
import { rulesAutomationConfig } from "../rules/automation";
import { officeSaverRules } from "../rules/templates";

const rules = officeSaverRules();
const ents = (spec: Record<string, [string, string]>) =>
  Object.fromEntries(Object.entries(spec).map(([e, [id, state]]) => [e, { state, attributes: { id, friendly_name: id } }]));

function fake(states: Record<string, unknown>, cfg: Record<string, unknown> = {}) {
  const calls: unknown[][] = [];
  const hass = {
    states,
    callApi: vi.fn(async (m: string, path: string, data?: unknown) => {
      const id = path.split("/").pop()!;
      calls.push(["api", m, id, data]);
      if (m === "GET") {
        if (!(id in cfg)) throw { status_code: 404, message: "Resource not found" };
        return cfg[id];
      }
      return { result: "ok" };
    }),
    callService: vi.fn(async (d: string, s: string, data: unknown) => void calls.push([d, s, data])),
    callWS: vi.fn(async (msg: unknown) => void calls.push(["ws", msg])),
  };
  return { hass: hass as never, calls };
}

describe("rules automations", () => {
  it("builds the id", () => expect(strategyAutomationId("sensor.zone_a", "rules")).toBe("share_space_zone_a_rules"));

  it("recognises rules automations as kind rules", () => {
    const { hass } = fake(ents({ "automation.r": ["share_space_zone_a_rules", "on"], "automation.o": ["share_space_zone_a_office_saver", "off"], "automation.x": ["other", "on"] }));
    expect(listStrategyAutomations(hass).map((a) => [a.id, a.kind, a.enabled])).toEqual([
      ["share_space_zone_a_rules", "rules", true],
      ["share_space_zone_a_office_saver", "office_saver", false],
    ]);
    expect(findZoneStrategies(hass, "sensor.zone_a")).toHaveLength(2);
    expect(findZoneStrategies(hass, "sensor.zone_b")).toHaveLength(0);
  });

  it("loads the active rules strategy and the saved rules", async () => {
    const cfg = { share_space_zone_a_rules: { alias: "x", use_blueprint: { path: "share_space/rules.yaml", input: { zone: "sensor.zone_a", area: "office", rules, previous_rules: null } } } };
    const { hass } = fake(ents({ "automation.r": ["share_space_zone_a_rules", "on"] }), cfg);
    const s = await loadZoneStrategy(hass, "sensor.zone_a");
    expect(s?.automation.kind).toBe("rules");
    expect(s?.rules).toEqual(rules);
    expect(s?.inputs).toBeNull();
    expect(await loadZoneRules(hass, "sensor.zone_a")).toMatchObject({ area: "office", enabled: true, previous: null });
    expect(await loadZoneRules(hass, "sensor.zone_b")).toBeNull();
  });

  it("saves the config with previous_rules", async () => {
    const { hass, calls } = fake({});
    await saveZoneRules(hass, { entity_id: "sensor.zone_a", name: "Zone A" }, "office", rules, null);
    expect(calls[0]).toEqual([
      "api",
      "POST",
      "share_space_zone_a_rules",
      {
        alias: "Share Space · Zone A · Custom rules",
        description: expect.stringMatching(/^Managed by Share Space · [0-9a-f]{8}$/),
        use_blueprint: { path: "share_space/rules.yaml", input: { zone: "sensor.zone_a", area: "office", rules, previous_rules: null } },
      },
    ]);
  });

  it("useZoneStrategy enables this one, disables others, clears presence", async () => {
    const { hass, calls } = fake(
      ents({ "automation.r": ["share_space_zone_a_rules", "off"], "automation.o": ["share_space_zone_a_office_saver", "on"], "automation.z": ["share_space_zone_b_rules", "on"] }),
    );
    await useZoneStrategy(hass, { entity_id: "sensor.zone_a", entry_id: "e1", presence_entity: "binary_sensor.p" }, "share_space_zone_a_rules");
    expect(calls).toEqual([
      ["automation", "turn_on", { entity_id: "automation.r" }],
      ["automation", "turn_off", { entity_id: "automation.o" }],
      ["ws", { type: "share_space_heating/update_zone", entry_id: "e1", presence_entity: null }],
    ]);
  });

  it("useZoneStrategy skips the presence update when unlinked", async () => {
    const { hass, calls } = fake(ents({ "automation.r": ["share_space_zone_a_rules", "on"] }));
    await useZoneStrategy(hass, { entity_id: "sensor.zone_a", entry_id: "e1", presence_entity: null }, "share_space_zone_a_rules");
    expect(calls).toEqual([]);
  });

  it("stopZoneStrategies disables and clears the base target", async () => {
    const { hass, calls } = fake(ents({ "automation.r": ["share_space_zone_a_rules", "on"] }));
    await stopZoneStrategies(hass, "sensor.zone_a");
    expect(calls).toEqual([
      ["automation", "turn_off", { entity_id: "automation.r" }],
      ["share_space_heating", "set_base_target", { entity_id: "sensor.zone_a" }],
    ]);
  });
});

describe("rules automations outside Share Space", () => {
  const Z = "sensor.zone_a";
  const managedCfg = rulesAutomationConfig({ entity_id: Z, name: "Zone A" }, "office", rules, null);

  it("numbers extra rules automations _rules_2, _rules_3", () => {
    expect(rulesIdIndex(Z, "share_space_zone_a_rules")).toBe(1);
    expect(rulesIdIndex(Z, "share_space_zone_a_rules_3")).toBe(3);
    expect(rulesIdIndex(Z, "share_space_zone_a_rules_x")).toBeNull();
    expect(rulesIdIndex(Z, "share_space_zone_b_rules_2")).toBeNull();
    expect(nextRulesId(Z, [])).toBe("share_space_zone_a_rules_2");
    expect(nextRulesId(Z, ["share_space_zone_a_rules", "share_space_zone_a_rules_2"])).toBe("share_space_zone_a_rules_3");
  });

  it("keeps recognising numbered rules automations for exclusivity", async () => {
    const { hass, calls } = fake(
      ents({ "automation.d": ["share_space_zone_a_rules", "on"], "automation.n": ["share_space_zone_a_rules_2", "off"], "automation.o": ["share_space_zone_a_office_saver_2", "on"] }),
    );
    expect(findZoneStrategies(hass, Z).map((a) => a.id)).toEqual(["share_space_zone_a_rules", "share_space_zone_a_rules_2"]);
    expect(zoneRulesIds(hass, Z)).toEqual(["share_space_zone_a_rules", "share_space_zone_a_rules_2"]);
    await useZoneStrategy(hass, { entity_id: Z, entry_id: "e1", presence_entity: null }, "share_space_zone_a_rules_2");
    expect(calls).toEqual([
      ["automation", "turn_on", { entity_id: "automation.n" }],
      ["automation", "turn_off", { entity_id: "automation.d" }],
    ]);
  });

  it("loads the latest rules automation with its managed state", async () => {
    const detached = { ...managedCfg, description: "Detached from Share Space" };
    const { hass } = fake(ents({ "automation.d": ["share_space_zone_a_rules", "off"], "automation.n": ["share_space_zone_a_rules_2", "on"] }), {
      share_space_zone_a_rules: detached,
      share_space_zone_a_rules_2: managedCfg,
    });
    expect(await loadZoneRules(hass, Z)).toMatchObject({ id: "share_space_zone_a_rules_2", state: "managed", enabled: true, rules });
    expect(await loadRulesAutomation(hass, Z, "share_space_zone_a_rules")).toMatchObject({ state: "detached", enabled: false });
  });

  it("reports taken-control automations as edited, without rules, and loadZoneStrategy copes", async () => {
    const { use_blueprint: _bp, ...rest } = managedCfg;
    const { hass } = fake(ents({ "automation.r": ["share_space_zone_a_rules", "on"] }), { share_space_zone_a_rules: { ...rest, triggers: [] } });
    expect(await loadZoneRules(hass, Z)).toMatchObject({ state: "edited", rules: null, previous: null, area: "" });
    expect(await loadZoneStrategy(hass, Z)).toMatchObject({ area: "", rules: null });
  });

  it("drops invalid rules but keeps a valid previous version", async () => {
    const input = { ...managedCfg.use_blueprint.input, rules: { version: 1, rules: "junk" }, previous_rules: rules };
    const { hass } = fake({}, { share_space_zone_a_rules: { ...managedCfg, alias: "Renamed", use_blueprint: { ...managedCfg.use_blueprint, input } } });
    expect(await loadZoneRules(hass, Z)).toMatchObject({ state: "edited", rules: null, previous: rules });
  });

  it("detach only rewrites the description", async () => {
    const edited = { ...managedCfg, alias: "Renamed", mode: "single" };
    const { hass, calls } = fake({}, { share_space_zone_a_rules: edited });
    await detachAutomation(hass, "share_space_zone_a_rules");
    expect(calls[1]).toEqual(["api", "POST", "share_space_zone_a_rules", { ...edited, description: "Detached from Share Space" }]);
  });

  it("saves to a given id", async () => {
    const { hass, calls } = fake({});
    await saveZoneRules(hass, { entity_id: Z, name: "Zone A" }, "office", rules, null, "share_space_zone_a_rules_2");
    expect(calls[0]).toEqual(["api", "POST", "share_space_zone_a_rules_2", managedCfg]);
  });
});
