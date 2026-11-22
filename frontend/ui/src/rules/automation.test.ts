import { describe, expect, it } from "vitest";
import { afterSave, isDirty, isSharedSource, managedState, rulesAutomationConfig, rulesFingerprint, sameRules, stampManaged, undoRules } from "./automation";
import { lunchRoomRules, officeSaverRules } from "./starters.fixture";

const a = officeSaverRules();
const b = lunchRoomRules();

describe("rules automation helpers", () => {
  it("builds the config", () => {
    expect(rulesAutomationConfig({ entity_id: "sensor.z", name: "Z" }, "office", { rules: a, previous: b }).use_blueprint).toEqual({
      path: "share_space/rules.yaml",
      input: { zone: "sensor.z", area: "office", rules: a, previous_rules: b },
    });
  });
  it("undo swaps rules and previous", () => {
    expect(undoRules({ rules: a, previous: b })).toEqual({ rules: b, previous: a });
    expect(undoRules({ rules: a, previous: null })).toBeNull();
  });
  it("save keeps the last saved rules as previous", () => {
    expect(afterSave(b, { rules: a, previous: null })).toEqual({ rules: b, previous: a });
    expect(afterSave(a, null)).toEqual({ rules: a, previous: null });
  });
  it("dirty compares by value, ignoring key order", () => {
    expect(isDirty(null, null)).toBe(false);
    expect(isDirty(a, null)).toBe(true);
    expect(isDirty(JSON.parse(JSON.stringify(a)), { rules: a, previous: null })).toBe(false);
    expect(isDirty(b, { rules: a, previous: null })).toBe(true);
    expect(sameRules({ version: 1, fallback: a.fallback, rules: a.rules }, a)).toBe(true);
  });
});

describe("rules automation sources", () => {
  const zone = { entity_id: "sensor.z", name: "Z" };

  it("custom config is unchanged: same alias, inputs and fingerprint as before shared strategies", () => {
    const legacy = stampManaged({
      alias: "Share Space · Z · Custom rules",
      use_blueprint: { path: "share_space/rules.yaml", input: { zone: "sensor.z", area: "office", rules: a, previous_rules: b } },
    });
    const cfg = rulesAutomationConfig(zone, "office", { rules: a, previous: b });
    expect(cfg).toEqual(legacy);
    expect("strategy" in cfg.use_blueprint.input).toBe(false);
    expect(rulesFingerprint(cfg)).toBe(rulesFingerprint(legacy));
    expect(managedState(cfg)).toBe("managed");
  });

  it("shared config points at the strategy id without inline rules", () => {
    const cfg = rulesAutomationConfig(zone, "office", { strategy: "abc123", name: "Old building" });
    expect(cfg.alias).toBe("Share Space · Z · Old building");
    expect(cfg.use_blueprint).toEqual({ path: "share_space/rules.yaml", input: { zone: "sensor.z", area: "office", strategy: "abc123" } });
    expect(managedState(cfg)).toBe("managed");
    expect(managedState({ ...cfg, use_blueprint: { ...cfg.use_blueprint, input: { ...cfg.use_blueprint.input, strategy: "other" } } })).toBe("edited");
  });

  it("tells sources apart", () => {
    expect(isSharedSource({ strategy: "x", name: "X" })).toBe(true);
    expect(isSharedSource({ rules: a, previous: null })).toBe(false);
  });
});
