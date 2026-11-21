import { describe, expect, it } from "vitest";
import { DETACHED_MARKER, detachedConfig, fnv1a, managedState, rulesAutomationConfig, rulesFingerprint, stampManaged } from "./automation";
import { officeSaverRules } from "./templates";

const cfg = rulesAutomationConfig({ entity_id: "sensor.z", name: "Z" }, "office", officeSaverRules(), null);

describe("managed by Share Space marker", () => {
  it("fnv1a matches the reference vectors", () => {
    expect(fnv1a("")).toBe("811c9dc5");
    expect(fnv1a("a")).toBe("e40c292c");
    expect(fnv1a("foobar")).toBe("bf9cf968");
  });

  it("fingerprint ignores key order and the description", () => {
    const reordered = { use_blueprint: JSON.parse(JSON.stringify(cfg.use_blueprint)), alias: cfg.alias, description: "x" };
    expect(rulesFingerprint(reordered)).toBe(rulesFingerprint(cfg));
    expect(rulesFingerprint({ ...cfg, alias: "other" })).not.toBe(rulesFingerprint(cfg));
  });

  it("saved configs carry the marker with the fingerprint", () => {
    expect(cfg.description).toBe(`Managed by Share Space · ${rulesFingerprint(cfg)}`);
    expect(stampManaged({ alias: cfg.alias, use_blueprint: cfg.use_blueprint })).toEqual(cfg);
    expect(managedState(cfg)).toBe("managed");
  });

  it("detects edits made in HA", () => {
    expect(managedState({ ...cfg, alias: "Renamed" })).toBe("edited");
    const input = { ...cfg.use_blueprint.input, area: "kitchen" };
    expect(managedState({ ...cfg, use_blueprint: { ...cfg.use_blueprint, input } })).toBe("edited");
    const { use_blueprint: _bp, ...taken } = cfg;
    expect(managedState({ ...taken, triggers: [] } as never)).toBe("edited");
    expect(managedState({ ...cfg, use_blueprint: { path: "other/x.yaml", input: {} } })).toBe("edited");
  });

  it("treats legacy rules automations as managed", () => {
    expect(managedState({ ...cfg, description: "" })).toBe("managed");
    expect(managedState({ ...cfg, description: undefined })).toBe("managed");
    expect(managedState({ ...cfg, description: "Managed by Share Space" })).toBe("managed");
    expect(managedState({ alias: "x", description: "" })).toBe("edited");
  });

  it("detached and unmanaged", () => {
    expect(managedState({ ...cfg, description: DETACHED_MARKER })).toBe("detached");
    expect(managedState({ ...cfg, description: "My own notes" })).toBe("unmanaged");
    const d = detachedConfig({ ...cfg, triggers: [1] } as never) as Record<string, unknown>;
    expect(d).toEqual({ ...cfg, triggers: [1], description: DETACHED_MARKER });
  });
});
