import { fromWall, wallTime } from "./tz";
import { describe, expect, it } from "vitest";
import { nextOn, occupiedAt, previousOff } from "./strategy-sim";

const day: Array<[string, string]> = [["09:00", "12:00"], ["13:00", "18:00"]];
const week = { monday: day, tuesday: day, wednesday: day, thursday: day, friday: day, saturday: [], sunday: [] };

describe("helpers", () => {
  it("flip instants", () => {
    const tz = "Europe/Paris";
    const now = Date.parse("2026-11-20T19:00:00+01:00");
    expect(occupiedAt(week, now, tz)).toBe(false);
    expect(new Date(nextOn(week, now, tz)!).toISOString()).toBe("2026-11-23T08:00:00.000Z");
    expect(new Date(previousOff(week, now, tz)!).toISOString()).toBe("2026-11-20T17:00:00.000Z");
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
