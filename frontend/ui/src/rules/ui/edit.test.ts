import { describe, expect, it } from "vitest";
import { WEEK_DAYS } from "../../types";
import { lunchRoomRules } from "../starters.fixture";
import { validateStrategy } from "../validate";
import type { ConditionType } from "../types";
import { blankRule, changeActionType, changeConditionType, defaultAction, defaultCondition, defaultCurve, describeAction, describeCondition, fixedOf, moveItem, parseNumber, removeAt, replaceAt, scopeErrors, toggleDay } from "./edit";

describe("list helpers", () => {
  it("moves, clamps and no-ops", () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 1, 9)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 1, -4)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 5, 0)).toEqual([1, 2, 3]);
  });
  it("replaces and removes without mutating", () => {
    const a = [1, 2, 3];
    expect(replaceAt(a, 1, 9)).toEqual([1, 9, 3]);
    expect(removeAt(a, 0)).toEqual([2, 3]);
    expect(a).toEqual([1, 2, 3]);
  });
  it("toggles days keeping week order", () => {
    expect(toggleDay(["monday", "friday"], "wednesday", WEEK_DAYS)).toEqual(["monday", "wednesday", "friday"]);
    expect(toggleDay(["monday", "friday"], "monday", WEEK_DAYS)).toEqual(["friday"]);
  });
});

describe("defaults", () => {
  it("default curves read the Settings outdoor sensor and validate; a blank sensor does not", () => {
    const rule = (hours: unknown, value: unknown) => ({ version: 1, rules: [{ label: "x", when: [{ type: "occupied_within", hours }], then: { type: "temperature", value } }], fallback: { label: "y", then: { type: "off" } } });
    const h = defaultCurve("h", 3);
    const t = defaultCurve("°C", 20);
    expect(validateStrategy(rule({ ...h, entity: "sensor.out" }, { ...t, entity: "sensor.out" })).ok).toBe(true);
    expect(h.entity).toBe("outdoor");
    expect(validateStrategy(rule(h, t)).ok).toBe(true);
    expect(validateStrategy(rule({ ...h, entity: "" }, t)).ok).toBe(false);
    expect(fixedOf(t)).toBe(20);
    expect(fixedOf(4)).toBe(4);
    const sensor = defaultCondition("sensor");
    expect(validateStrategy(rule(1, 20)).ok).toBe(true);
    expect(validateStrategy({ ...rule(1, 20), rules: [{ label: "s", when: [{ ...sensor, entity: "sensor.out" }], then: { type: "off" } }] }).ok).toBe(true);
  });
  it("every default condition and action validates", () => {
    // "sensor" starts without an entity on purpose: the user must pick one
    const types: ConditionType[] = ["occupied", "occupied_within", "between_days", "weekday", "time", "planned"];
    const strategy = {
      version: 1,
      rules: [{ label: "x", when: types.map(defaultCondition), then: defaultAction("temperature") }],
      fallback: { label: "y", then: defaultAction("off") },
    };
    expect(validateStrategy(strategy).ok).toBe(true);
    expect(validateStrategy({ version: 1, rules: [blankRule()], fallback: strategy.fallback }).ok).toBe(true);
  });
  it("changing type keeps negate, same type keeps fields", () => {
    const c = { type: "occupied_within", hours: 5, negate: true } as const;
    expect(changeConditionType(c, "occupied_within")).toBe(c);
    expect(changeConditionType(c, "time")).toMatchObject({ type: "time", negate: true });
    expect(changeConditionType({ type: "occupied" }, "time")).not.toHaveProperty("negate");
    const a = { type: "temperature", value: 18 } as const;
    expect(changeActionType(a, "temperature")).toBe(a);
    expect(changeActionType(a, "eco")).toEqual({ type: "eco" });
  });
});

describe("parseNumber", () => {
  it("handles empty, comma and garbage", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("20,5")).toBe(20.5);
    expect(parseNumber("0")).toBe(0);
  });
});

describe("scopeErrors", () => {
  it("rebases paths under a prefix", () => {
    const s = lunchRoomRules();
    s.rules[0].label = "";
    s.rules[1].when = [{ type: "time", start: "bad", end: "13:00" }];
    const r = validateStrategy(s);
    if (r.ok) throw new Error("expected errors");
    expect(scopeErrors(r.errors, "$.rules[0]").map((e) => e.path)).toEqual([".label"]);
    expect(scopeErrors(scopeErrors(r.errors, "$.rules[1]"), ".when[0]").map((e) => e.path)).toEqual([".start"]);
    expect(scopeErrors(r.errors, "$.rules[10]")).toEqual([]);
  });
});

describe("graph node summaries", () => {
  const curve = { type: "curve" as const, entity: "sensor.outdoor_temp", default: 0, points: [{ at: -10, value: 9 }, { at: 18, value: 1 }] };
  it("describes conditions and actions", () => {
    expect(describeCondition({ type: "occupied_within", hours: 2 })).toBe("occupied within 2 h");
    expect(describeCondition({ type: "occupied_within", hours: curve })).toBe("occupied within 9 → 1 h (outdoor temp)");
    expect(describeCondition({ type: "sensor", entity: "weather.home", op: "below", than: 0, negate: true })).toBe("not home < 0");
    expect(describeCondition({ type: "weekday", days: ["monday", "friday"] })).toBe("mon, fri");
    expect(describeAction({ type: "temperature", value: 20.5 })).toBe("20.5 °C");
    expect(describeAction({ type: "eco" })).toBe("Eco");
  });
});
