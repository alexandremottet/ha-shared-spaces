import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LUNCH_ROOM, evaluate } from "../heating/strategy-sim";
import type { LunchRoomInputs, StrategyEvaluation } from "../heating/strategy-sim";
import { strategyTimeline } from "../heating/strategy-timeline";
import { evaluateRules } from "./evaluate";
import { lunchRoomRules, presetRules } from "./templates";
import { validateStrategy } from "./validate";

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, "../../../../fixtures/heating", name), "utf8"));
const presetCases = fixture("strategy_cases.json");
const ruleCases = fixture("rules_cases.json");
const flat = (e: StrategyEvaluation) => ({ ...e.result, reason: e.reason });

describe("templates match presets", () => {
  for (const c of presetCases) {
    it(c.name, () => {
      const rules = presetRules(c.preset, c.inputs);
      expect(validateStrategy(rules)).toEqual({ ok: true, strategy: rules });
      for (const check of c.checks) {
        const now = Date.parse(check.now);
        const got = flat(evaluateRules(rules, c.schedule, now, c.tz));
        expect(got, check.now).toEqual(flat(evaluate(c.preset, c.inputs, c.schedule, now, c.tz)));
        expect(got, check.now).toEqual({ ...check.expected, reason: check.reason });
      }
    });
  }

  const lunch = presetCases.find((c: { preset: string }) => c.preset === "lunch_room");
  const variants: Array<[string, Partial<LunchRoomInputs>]> = [
    ["match any", { match: "any" }],
    ["empty heat window", { heat_start: "14:00", heat_end: "11:00" }],
    ["empty morning window, all", { morning_start: "12:00", morning_end: "11:00" }],
    ["empty morning window, any", { morning_start: "12:00", morning_end: "11:00", match: "any" }],
    ["both windows empty, any", { morning_start: "12:00", morning_end: "12:00", afternoon_end: "13:00", match: "any" }],
  ];
  for (const [name, patch] of variants) {
    it(`lunch room ${name} gives identical week timelines`, () => {
      const inputs = { ...DEFAULT_LUNCH_ROOM, ...patch };
      const start = Date.parse("2026-11-16T00:00:00+01:00");
      const end = start + 7 * 86400000;
      const preset = strategyTimeline("lunch_room", inputs, lunch.schedule, start, end, lunch.tz);
      expect(strategyTimeline(lunchRoomRules(inputs), lunch.schedule, start, end, lunch.tz)).toEqual(preset);
    });
  }
});

describe("rule cases", () => {
  for (const c of ruleCases) {
    it(c.name, () => {
      expect(validateStrategy(c.strategy).ok).toBe(true);
      for (const check of c.checks) {
        const got = evaluateRules(c.strategy, c.schedule, Date.parse(check.now), c.tz, c.temps, check.outdoor);
        expect(flat(got), check.now).toEqual({ ...check.expected, reason: check.reason });
      }
    });
  }
});

describe("rule timeline matches evaluateRules", () => {
  type Case = { name: string; tz: string; schedule: never; strategy: never; temps?: never; start: number };
  const novStart = Date.parse("2026-11-20T00:07:00Z");
  const office = presetCases[0];
  const lunch = presetCases.find((c: { preset: string }) => c.preset === "lunch_room");
  const all: Case[] = [
    ...presetCases.map((c: { preset: never; inputs: never }) => ({ ...c, strategy: presetRules(c.preset, c.inputs), start: novStart })),
    ...[office, lunch].flatMap((c) => [
      { ...c, name: `${c.preset} empty schedule`, schedule: {}, strategy: presetRules(c.preset, c.inputs), start: novStart },
      { ...c, name: `${c.preset} sparse schedule`, schedule: { monday: [["09:30", "12:30"]] }, strategy: presetRules(c.preset, c.inputs), start: novStart },
    ]),
    ...ruleCases.map((c: { checks: Array<{ now: string }> }) => ({ ...c, start: Date.parse(c.checks[0].now) - 2 * 86400000 + 7 * 60000 })),
  ];
  for (const c of all) {
    it(c.name, () => {
      const end = c.start + 7 * 86400000;
      const t = performance.now();
      const segs = strategyTimeline(c.strategy, c.schedule, c.start, end, c.tz, c.temps);
      expect(performance.now() - t).toBeLessThan(200);
      expect(segs[0].start).toBe(c.start);
      expect(segs[segs.length - 1].end).toBe(end);
      for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBe(segs[i - 1].end);
      for (let now = c.start; now < end; now += 41 * 60000) {
        const seg = segs.find((s) => s.start <= now && now < s.end)!;
        if (seg.start === now) continue;
        expect({ ...seg.result, reason: seg.reason }, new Date(now).toISOString()).toEqual(flat(evaluateRules(c.strategy, c.schedule, now, c.tz, c.temps)));
      }
    });
  }

  it("rule timeline equals preset timeline for templates", () => {
    for (const c of presetCases) {
      const preset = strategyTimeline(c.preset, c.inputs, c.schedule, novStart, novStart + 7 * 86400000, c.tz);
      expect(strategyTimeline(presetRules(c.preset, c.inputs), c.schedule, novStart, novStart + 7 * 86400000, c.tz), c.name).toEqual(preset);
    }
  });
});
