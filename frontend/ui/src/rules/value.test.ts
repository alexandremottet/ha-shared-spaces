import { describe, expect, it } from "vitest";
import { strategyTimeline } from "../heating/strategy-timeline";
import { evaluateRules } from "./evaluate";
import type { CurveValue, RuleStrategy } from "./types";
import { evalValue, readingOf, sensorReadings, strategySensors, temperatureOf } from "./value";

const curve: CurveValue = { type: "curve", entity: "sensor.out", default: 0, points: [{ at: -10, value: 9 }, { at: 0, value: 5 }, { at: 10, value: 2 }, { at: 18, value: 1 }] };
const strategy: RuleStrategy = {
  version: 1,
  rules: [
    { label: "Cold", when: [{ type: "sensor", entity: "weather.home", op: "below", than: 0 }], then: { type: "eco" } },
    { label: "Preheat", when: [{ type: "occupied_within", hours: curve }], then: { type: "temperature", value: 20 } },
  ],
  fallback: { label: "Away", then: { type: "off" } },
};

describe("curve values", () => {
  it("is linear between points, flat outside, default without a reading", () => {
    expect(evalValue(3)).toBe(3);
    expect(evalValue(curve, { "sensor.out": 5 })).toBe(3.5);
    expect(evalValue(curve, { "sensor.out": -5 })).toBe(7);
    expect(evalValue(curve, { "sensor.out": -30 })).toBe(9);
    expect(evalValue(curve, { "sensor.out": 40 })).toBe(1);
    expect(evalValue(curve, {})).toBe(5);
  });

  it("limits and rounds temperatures", () => {
    expect(temperatureOf(19.74)).toBe(19.5);
    expect(temperatureOf(19.75)).toBe(20);
    expect(temperatureOf(50)).toBe(35);
    expect(temperatureOf(1)).toBe(5);
  });

  it("reads sensor states and weather attributes", () => {
    expect(readingOf("sensor.out", { state: "12.5" })).toBe(12.5);
    expect(readingOf("sensor.out", { state: "unavailable" })).toBeUndefined();
    expect(readingOf("weather.home", { state: "sunny", attributes: { temperature: 4 } })).toBe(4);
    expect(readingOf("sensor.out")).toBeUndefined();
    expect(strategySensors(strategy).sort()).toEqual(["sensor.out", "weather.home"]);
    expect(sensorReadings(strategy, { "sensor.out": { state: "15" }, "sensor.other": { state: "1" } })).toEqual({ "sensor.out": 15 });
  });

  it("timeline starts preheat at the curve lead", () => {
    const schedule = { tuesday: [["09:00", "18:00"]] } as never;
    const start = Date.parse("2026-11-17T00:00:00Z");
    const readings = { "sensor.out": 5 };
    const segs = strategyTimeline(strategy, schedule, start, start + 86400000, "UTC", undefined, readings);
    expect(segs.find((s) => s.reason === "Preheat")?.start).toBe(Date.parse("2026-11-17T05:30:00Z"));
    expect(evaluateRules(strategy, schedule, Date.parse("2026-11-17T05:29:00Z"), "UTC", undefined, readings).reason).toBe("Away");
  });
});

describe("planned spans", () => {
  it("maps each shown day's schedule to instants", async () => {
    const { plannedSpans } = await import("../heating/week-preview");
    const mon = Date.parse("2026-11-23T00:00:00+01:00");
    const spans = plannedSpans({ monday: [["09:00", "12:30"]], tuesday: [["14:00", "24:00"]] }, [mon, mon + 86400000, mon + 2 * 86400000], "Europe/Paris");
    expect(spans).toEqual([
      { start: Date.parse("2026-11-23T09:00:00+01:00"), end: Date.parse("2026-11-23T12:30:00+01:00") },
      { start: Date.parse("2026-11-24T14:00:00+01:00"), end: Date.parse("2026-11-25T00:00:00+01:00") },
    ]);
  });
});

describe("preview bands", () => {
  it("splits heating into planned, preheat and setback", async () => {
    const { previewBands } = await import("../heating/week-preview");
    const seg = (start: number, end: number, result: object, reason = "r") => ({ start, end, result, reason }) as never;
    const bands = previewBands(
      [seg(0, 3, { target: 17 }), seg(3, 10, { target: 20 }), seg(10, 12, { off: true })],
      [{ start: 5, end: 8 }],
    );
    expect(bands.map((b) => [b.start, b.end, b.kind])).toEqual([
      [0, 3, "setback"],
      [3, 5, "preheat"],
      [5, 8, "planned"],
      [8, 10, "preheat"],
      [10, 12, "off"],
    ]);
  });
});
