import { describe, expect, it } from "vitest";
import { leadHours, outdoorReading, outdoorSensors, outdoorTemps } from "./outdoor";
import { strategyTimeline } from "../heating/strategy-timeline";
import { evaluateRules } from "./evaluate";
import type { RuleStrategy } from "./types";

const lead = { sensor: "sensor.out", cold: { temp: 10, hours: 6 }, warm: { temp: 20, hours: 1 } };
const strategy: RuleStrategy = {
  version: 1,
  rules: [{ label: "Preheat", when: [{ type: "occupied_within", hours: lead }], then: { type: "temperature", value: 20 } }],
  fallback: { label: "Away", then: { type: "off" } },
};

describe("outdoor lead time", () => {
  it("interpolates, clamps and falls back to cold hours", () => {
    expect(leadHours(3)).toBe(3);
    expect(leadHours(lead, { "sensor.out": 15 })).toBe(3.5);
    expect(leadHours(lead, { "sensor.out": -5 })).toBe(6);
    expect(leadHours(lead, { "sensor.out": 30 })).toBe(1);
    expect(leadHours(lead, {})).toBe(6);
  });

  it("reads sensor states and weather attributes", () => {
    expect(outdoorReading("sensor.out", { state: "12.5" })).toBe(12.5);
    expect(outdoorReading("sensor.out", { state: "unavailable" })).toBeUndefined();
    expect(outdoorReading("weather.home", { state: "sunny", attributes: { temperature: 4 } })).toBe(4);
    expect(outdoorReading("sensor.out")).toBeUndefined();
    expect(outdoorSensors(strategy)).toEqual(["sensor.out"]);
    expect(outdoorTemps(strategy, { "sensor.out": { state: "15" }, "sensor.other": { state: "1" } })).toEqual({ "sensor.out": 15 });
  });

  it("timeline starts preheat at the interpolated lead", () => {
    const schedule = { tuesday: [["09:00", "18:00"]] } as never;
    const start = Date.parse("2026-11-17T00:00:00Z");
    const segs = strategyTimeline(strategy, schedule, start, start + 86400000, "UTC", undefined, { "sensor.out": 15 });
    expect(segs.find((s) => s.reason === "Preheat")?.start).toBe(Date.parse("2026-11-17T05:30:00Z"));
    expect(evaluateRules(strategy, schedule, Date.parse("2026-11-17T05:29:00Z"), "UTC", undefined, { "sensor.out": 15 }).reason).toBe("Away");
  });
});
