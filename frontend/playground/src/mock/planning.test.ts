import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isOccupied, mergeCalendars, nextChange } from "./planning";

const dir = resolve(__dirname, "../../../../fixtures/planning");
const load = (name: string) => JSON.parse(readFileSync(resolve(dir, name), "utf8"));

describe("mergeCalendars parity", () => {
  for (const c of load("merge_cases.json")) {
    it(c.name, () => {
      expect(mergeCalendars(c.calendars, c.events)).toEqual(c.expected);
    });
  }
});

describe("occupancy parity", () => {
  for (const c of load("occupancy_cases.json")) {
    it(c.name, () => {
      for (const check of c.checks) {
        const now = Date.parse(check.now);
        expect(isOccupied(c.schedule, now, c.tz)).toBe(check.occupied);
        const next = nextChange(c.schedule, now, c.tz);
        expect(next === null ? null : new Date(next).toISOString().replace(".000Z", "Z")).toBe(check.next_change);
      }
    });
  }
});
