import { fromWall, wallTime } from "./tz";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluate, nextOn, occupiedAt, previousOff, simulateWeek } from "./strategy-sim";

const cases = JSON.parse(readFileSync(resolve(__dirname, "../../../../fixtures/heating/strategy_cases.json"), "utf8"));

describe("strategy simulator parity", () => {
  for (const c of cases) {
    it(c.name, () => {
      for (const check of c.checks) {
        const got = evaluate(c.preset, c.inputs, c.schedule, Date.parse(check.now), c.tz);
        expect({ ...got.result, reason: got.reason }, check.now).toEqual({ ...check.expected, reason: check.reason });
      }
    });
  }
});

describe("helpers", () => {
  const office = cases[0];
  it("flip instants", () => {
    const now = Date.parse("2026-11-20T19:00:00+01:00");
    expect(occupiedAt(office.schedule, now, office.tz)).toBe(false);
    expect(new Date(nextOn(office.schedule, now, office.tz)!).toISOString()).toBe("2026-11-23T08:00:00.000Z");
    expect(new Date(previousOff(office.schedule, now, office.tz)!).toISOString()).toBe("2026-11-20T17:00:00.000Z");
  });

  it("week simulation merges and covers the range", () => {
    const start = Date.parse("2026-11-20T00:00:00+01:00");
    const segs = simulateWeek("office_saver", office.inputs, office.schedule, start, office.tz);
    expect(segs[0].start).toBe(start);
    expect(segs[segs.length - 1].end).toBe(start + 7 * 86400000);
    for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBe(segs[i - 1].end);
    expect(segs.find((s) => s.reason === "Away")).toBeTruthy();
  });
});

describe("regressions", () => {
  const kathmandu = { monday: [["09:00", "17:00"]] } as never;
  it("aligns slots to local wall clock for :45 offset zones", () => {
    const tz = "Asia/Kathmandu";
    expect(occupiedAt(kathmandu, Date.parse("2026-11-23T09:10:00+05:45"), tz)).toBe(true);
    expect(occupiedAt(kathmandu, Date.parse("2026-11-23T08:59:00+05:45"), tz)).toBe(false);
    expect(new Date(nextOn(kathmandu, Date.parse("2026-11-22T20:00:00+05:45"), tz)!).toISOString()).toBe("2026-11-23T03:15:00.000Z");
  });

  it("fromWall handles nonexistent local midnight (Santiago)", () => {
    const tz = "America/Santiago";
    const ms = fromWall(tz, 2026, 9, 6, 0, 0);
    const w = wallTime(ms, tz);
    expect([w.day, w.hour]).toEqual([6, 1]);
    const prev = wallTime(fromWall(tz, 2026, 9, 5, 0, 0), tz);
    expect([prev.day, prev.hour]).toEqual([5, 0]);
  });
});
