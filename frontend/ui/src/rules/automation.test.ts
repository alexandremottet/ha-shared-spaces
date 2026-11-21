import { describe, expect, it } from "vitest";
import { afterSave, isDirty, rulesAutomationConfig, sameRules, templateRules, undoRules } from "./automation";
import { lunchRoomRules, officeSaverRules } from "./templates";

const a = officeSaverRules();
const b = lunchRoomRules();

describe("rules automation helpers", () => {
  it("builds the config", () => {
    expect(rulesAutomationConfig({ entity_id: "sensor.z", name: "Z" }, "office", a, b).use_blueprint).toEqual({
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
  it("template uses current preset inputs when kinds match", () => {
    const inputs = { comfort_temp: 22, setback_temp: 15, preheat_hours: 2, max_gap_hours: 10 };
    expect(templateRules("office_saver", { kind: "office_saver", inputs })).toEqual(officeSaverRules(inputs));
    expect(templateRules("office_saver", { kind: "lunch_room", inputs: null })).toEqual(officeSaverRules());
    expect(templateRules("lunch_room")).toEqual(lunchRoomRules());
  });
});
