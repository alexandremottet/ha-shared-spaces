import { describe, expect, it, vi } from "vitest";
import {
  detachAutomation,
  findZoneStrategies,
  listStrategyAutomations,
  deleteStrategy,
  listStrategies,
  loadRulesAutomation,
  loadStrategyUses,
  loadZoneRules,
  nameTaken,
  saveStrategy,
  strategyUsers,
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
import { officeSaverRules } from "../rules/starters.fixture";

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
  it("builds the id", () => expect(strategyAutomationId("sensor.zone_a")).toBe("share_space_zone_a_rules"));

  it("recognises rules automations only", () => {
    const { hass } = fake(ents({ "automation.r": ["share_space_zone_a_rules", "on"], "automation.o": ["share_space_zone_a_office_saver", "off"], "automation.x": ["other", "on"] }));
    expect(listStrategyAutomations(hass).map((a) => [a.id, a.enabled])).toEqual([["share_space_zone_a_rules", true]]);
    expect(findZoneStrategies(hass, "sensor.zone_a")).toHaveLength(1);
    expect(findZoneStrategies(hass, "sensor.zone_b")).toHaveLength(0);
  });

  it("loads the active rules strategy and the saved rules", async () => {
    const cfg = { share_space_zone_a_rules: { alias: "x", use_blueprint: { path: "share_space/rules.yaml", input: { zone: "sensor.zone_a", area: "office", rules, previous_rules: null } } } };
    const { hass } = fake(ents({ "automation.r": ["share_space_zone_a_rules", "on"] }), cfg);
    const s = await loadZoneStrategy(hass, "sensor.zone_a");
    expect(s).toMatchObject({ id: "share_space_zone_a_rules", rules, strategy: null });
    expect(await loadZoneRules(hass, "sensor.zone_a")).toMatchObject({ area: "office", enabled: true, previous: null });
    expect(await loadZoneRules(hass, "sensor.zone_b")).toBeNull();
  });

  it("saves the config with previous_rules", async () => {
    const { hass, calls } = fake({});
    await saveZoneRules(hass, { entity_id: "sensor.zone_a", name: "Zone A" }, "office", { rules, previous: null });
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
      ents({ "automation.r": ["share_space_zone_a_rules", "off"], "automation.o": ["share_space_zone_a_rules_2", "on"], "automation.z": ["share_space_zone_b_rules", "on"] }),
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
  const managedCfg = rulesAutomationConfig({ entity_id: Z, name: "Zone A" }, "office", { rules, previous: null });

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
    await saveZoneRules(hass, { entity_id: Z, name: "Zone A" }, "office", { rules, previous: null }, "share_space_zone_a_rules_2");
    expect(calls[0]).toEqual(["api", "POST", "share_space_zone_a_rules_2", managedCfg]);
  });
});

describe("shared strategies", () => {
  const Z = "sensor.zone_a";
  const shared = (zone: string, name: string, sid: string) => rulesAutomationConfig({ entity_id: zone, name }, "office", { strategy: sid, name: "Old building" });

  it("reads the strategy input, empty or missing as null", async () => {
    const custom = rulesAutomationConfig({ entity_id: Z, name: "Zone A" }, "office", { rules, previous: null });
    const blank = { ...custom, use_blueprint: { ...custom.use_blueprint, input: { ...custom.use_blueprint.input, strategy: "" } } };
    const { hass } = fake(ents({ "automation.r": ["share_space_zone_a_rules", "on"] }), {
      share_space_zone_a_rules: shared(Z, "Zone A", "s1"),
      share_space_zone_a_rules_2: custom,
      share_space_zone_a_rules_3: blank,
    });
    expect(await loadRulesAutomation(hass, Z, "share_space_zone_a_rules")).toMatchObject({ strategy: "s1", rules: null, state: "managed", area: "office" });
    expect(await loadRulesAutomation(hass, Z, "share_space_zone_a_rules_2")).toMatchObject({ strategy: null, rules });
    expect(await loadRulesAutomation(hass, Z, "share_space_zone_a_rules_3")).toMatchObject({ strategy: null, rules });
    expect(await loadZoneStrategy(hass, Z)).toMatchObject({ area: "office", rules: null });
  });

  it("saves the zone automation pointing at a strategy", async () => {
    const { hass, calls } = fake({});
    await saveZoneRules(hass, { entity_id: Z, name: "Zone A" }, "office", { strategy: "s1", name: "Old building" });
    expect(calls[0]).toEqual(["api", "POST", "share_space_zone_a_rules", shared(Z, "Zone A", "s1")]);
  });

  it("sends the strategy WS commands with strategy_id", async () => {
    const { hass, calls } = fake({});
    await listStrategies(hass);
    await saveStrategy(hass, { name: "Old building", rules });
    await saveStrategy(hass, { id: "s1", name: "Old", rules, previous: null });
    await deleteStrategy(hass, "s1");
    expect(calls).toEqual([
      ["ws", { type: "share_space_heating/list_strategies" }],
      ["ws", { type: "share_space_heating/save_strategy", name: "Old building", rules }],
      ["ws", { type: "share_space_heating/save_strategy", strategy_id: "s1", name: "Old", rules, previous: null }],
      ["ws", { type: "share_space_heating/delete_strategy", strategy_id: "s1" }],
    ]);
  });

  it("lists the zones using a strategy from their managed rules automations", async () => {
    const zones = [
      { entity_id: "sensor.zone_a", name: "Zone A" },
      { entity_id: "sensor.zone_b", name: "Zone B" },
      { entity_id: "sensor.zone_c", name: "Zone C" },
      { entity_id: "sensor.zone_d", name: "Zone D" },
    ];
    const { hass } = fake(
      ents({
        "automation.a": ["share_space_zone_a_rules", "on"],
        "automation.b": ["share_space_zone_b_rules", "off"],
        "automation.c": ["share_space_zone_c_rules", "on"],
        "automation.d": ["share_space_zone_d_rules", "on"],
      }),
      {
        share_space_zone_a_rules: shared("sensor.zone_a", "Zone A", "s1"),
        share_space_zone_b_rules: shared("sensor.zone_b", "Zone B", "s1"),
        share_space_zone_c_rules: { ...shared("sensor.zone_c", "Zone C", "s1"), alias: "Renamed in HA" },
        share_space_zone_d_rules: rulesAutomationConfig({ entity_id: "sensor.zone_d", name: "Zone D" }, "office", { rules, previous: null }),
      },
    );
    const uses = await loadStrategyUses(hass, zones);
    expect(uses.map((u) => [u.zoneName, u.automationId, u.strategy, u.enabled])).toEqual([
      ["Zone A", "share_space_zone_a_rules", "s1", true],
      ["Zone B", "share_space_zone_b_rules", "s1", false],
    ]);
    expect(strategyUsers(uses, "s1")).toEqual(["Zone A", "Zone B"]);
    expect(strategyUsers(uses, "s1", "sensor.zone_a")).toEqual(["Zone B"]);
    expect(strategyUsers(uses, "s2")).toEqual([]);
  });

  it("names compare case-insensitively, ignoring the renamed one", () => {
    const list = [{ id: "s1", name: "Old building" }];
    expect(nameTaken(list, " old BUILDING ")).toBe(true);
    expect(nameTaken(list, "Old building", "s1")).toBe(false);
    expect(nameTaken(list, "New")).toBe(false);
  });
});
