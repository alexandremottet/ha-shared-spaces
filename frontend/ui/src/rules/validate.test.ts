import { describe, expect, it } from "vitest";
import { officeSaverRules } from "./templates";
import { validateStrategy } from "./validate";
import type { RuleError } from "./validate";

const codes = (json: unknown) => {
  const r = validateStrategy(json);
  return r.ok ? [] : r.errors.map((e: RuleError) => `${e.path} ${e.code}`);
};
const withRule = (rule: unknown) => ({ version: 1, rules: [rule], fallback: { label: "Away", then: { type: "off" } } });

describe("validateStrategy", () => {
  it("accepts a template", () => {
    expect(validateStrategy(officeSaverRules()).ok).toBe(true);
  });

  it("rejects bad top level", () => {
    expect(codes(null)).toEqual(["$ type"]);
    expect(codes({ version: 2, rules: {}, extra: 1 })).toEqual(["$.extra unknown_field", "$.version unknown_kind", "$.rules type", "$.fallback required"]);
  });

  it("rejects bad rules", () => {
    expect(codes(withRule({ label: " ", when: [{ type: "nope" }], then: { type: "boost" } }))).toEqual([
      "$.rules[0].label empty",
      "$.rules[0].when[0].type unknown_kind",
      "$.rules[0].then.type unknown_kind",
    ]);
    expect(codes(withRule({ label: "x", when: [{ type: "occupied_within" }], then: { type: "temperature", value: 50 } }))).toEqual([
      "$.rules[0].when[0].hours required",
      "$.rules[0].then.value range",
    ]);
  });

  it("checks condition fields", () => {
    const rule = (c: unknown) => withRule({ label: "x", when: [c], then: { type: "off" } });
    expect(codes(rule({ type: "time", start: "7:00", end: "24:00" }))).toEqual(["$.rules[0].when[0].start time_format"]);
    expect(codes(rule({ type: "time", start: "22:00", end: "06:00" }))).toEqual([]);
    expect(codes(rule({ type: "time", start: "06:00", end: "06:00" }))).toEqual(["$.rules[0].when[0].end time_order"]);
    expect(codes(rule({ type: "weekday", days: ["monday", "monday", "funday"] }))).toEqual([
      "$.rules[0].when[0].days[1] duplicate",
      "$.rules[0].when[0].days[2] unknown_kind",
    ]);
    expect(codes(rule({ type: "planned", windows: [{ start: "13:00", end: "12:00" }], match: "some" }))).toEqual([
      "$.rules[0].when[0].match unknown_kind",
      "$.rules[0].when[0].windows[0].end time_order",
    ]);
    expect(codes(rule({ type: "between_days", gap_hours: -1, negate: "yes" }))).toEqual([
      "$.rules[0].when[0].negate type",
      "$.rules[0].when[0].gap_hours range",
    ]);
  });
});
