import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { StrategyEvaluation } from "../heating/strategy-sim";
import { strategyTimeline } from "../heating/strategy-timeline";
import { evaluateRules } from "./evaluate";
import { validateStrategy } from "./validate";
import { climateHeated, heatedKey } from "./value";

const fixture = (name: string) => JSON.parse(readFileSync(resolve(__dirname, "../../../../fixtures/heating", name), "utf8"));
const ruleCases = fixture("rules_cases.json");
const flat = (e: StrategyEvaluation) => ({ ...e.result, reason: e.reason });

describe("rule cases", () => {
  for (const c of ruleCases) {
    it(c.name, () => {
      expect(validateStrategy(c.strategy).ok).toBe(true);
      for (const check of c.checks) {
        const heated = Object.fromEntries(
          Object.entries((check.climates ?? {}) as Record<string, { state: string; preset_mode?: string }>).map(([area, s]) => [
            heatedKey(area),
            climateHeated({ state: s.state, attributes: { preset_mode: s.preset_mode } }) ? "on" : "off",
          ]),
        );
        const got = evaluateRules(c.strategy, c.schedule, Date.parse(check.now), c.tz, c.temps, check.readings, { ...check.states, ...heated });
        expect(flat(got), check.now).toEqual({ ...check.expected, reason: check.reason });
      }
    });
  }
});

describe("rule timeline matches evaluateRules", () => {
  type Case = { name: string; tz: string; schedule: never; strategy: never; temps?: never; start: number };
  const novStart = Date.parse("2026-11-20T00:07:00Z");
  const office = ruleCases.find((c: { name: string }) => c.name.startsWith("starter Office saver"));
  const all: Case[] = [
    { ...office, name: "office saver sparse schedule", schedule: { monday: [["09:30", "12:30"]] }, start: novStart },
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
});
