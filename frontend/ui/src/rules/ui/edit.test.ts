import { describe, expect, it } from "vitest";
import { WEEK_DAYS } from "../../types";
import { lunchRoomRules } from "../templates";
import { validateStrategy } from "../validate";
import type { ConditionType } from "../types";
import { blankRule, changeActionType, changeConditionType, defaultAction, defaultCondition, defaultOutdoorHours, moveItem, parseNumber, removeAt, replaceAt, scopeErrors, toggleDay } from "./edit";

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
  it("default outdoor lead time validates once a sensor is set", () => {
    const rule = (sensor: string) => ({ version: 1, rules: [{ label: "x", when: [{ type: "occupied_within", hours: defaultOutdoorHours(sensor) }], then: { type: "off" } }], fallback: { label: "y", then: { type: "off" } } });
    expect(validateStrategy(rule("sensor.out")).ok).toBe(true);
    expect(validateStrategy(rule("")).ok).toBe(false);
  });
  it("every default condition and action validates", () => {
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
