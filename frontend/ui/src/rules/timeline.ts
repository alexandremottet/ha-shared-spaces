import type { ScheduleRanges, Timeline } from "../heating/strategy-sim";
import { occupancyTrack, toMinutes } from "../heating/strategy-sim";
import { fromWall, wallTime } from "../heating/tz";
import { evaluateFacts } from "./evaluate";
import { once } from "./once";
import type { OutdoorTemps } from "./outdoor";
import { leadHours } from "./outdoor";
import type { PresetTemps, RuleStrategy } from "./types";
import { DEFAULT_PRESET_TEMPS } from "./types";

const HOUR = 3600000;
const DAY = 24 * HOUR;
// Extra cuts around wall edges catch repeated / skipped local times on DST nights.
const SHIFTS = [0, -HOUR, HOUR, -HOUR / 2, HOUR / 2];

function wallEdges(tz: string, start: number, end: number, minutes: Set<number>): number[] {
  const w = wallTime(start, tz);
  const out: number[] = [];
  for (let i = -1; i <= Math.ceil((end - start) / DAY) + 1; i++) {
    const d = new Date(Date.UTC(w.year, w.month - 1, w.day + i));
    for (const m of minutes) {
      const t = fromWall(tz, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), Math.floor(m / 60), m % 60);
      for (const s of SHIFTS) out.push(t + s);
    }
  }
  return out;
}

/** Cuts from the conditions: slot edges, flip offsets, wall-clock edges and midnights. */
export function ruleTimeline(
  strategy: RuleStrategy,
  schedule: ScheduleRanges,
  start: number,
  end: number,
  tz: string,
  temps: PresetTemps = DEFAULT_PRESET_TEMPS,
  outdoor?: OutdoorTemps,
): Timeline {
  const track = occupancyTrack(schedule, start, end, tz);
  const cuts = [...track.slots];
  const minutes = new Set([0]);
  for (const rule of strategy.rules) {
    for (const c of rule.when) {
      if (c.type === "occupied_within") {
        const lead = leadHours(c.hours, outdoor) * HOUR;
        for (const f of track.flips) if (f.on) cuts.push(f.t - lead);
      }
      if (c.type === "between_days") for (const f of track.flips) cuts.push(f.on ? f.t - c.gap_hours * HOUR : f.t + c.gap_hours * HOUR);
      if (c.type === "time") for (const hm of [c.start, c.end]) minutes.add(toMinutes(hm) % 1440);
    }
  }
  cuts.push(...wallEdges(tz, start, end, minutes));
  return {
    cuts,
    at(t) {
      const f = track.at(t);
      return evaluateFacts(
        strategy,
        { now: t, schedule, tz, outdoor, occupied: () => f.occupied, nextOn: once(f.nextOn), previousOff: once(f.previousOff), wall: once(() => wallTime(t, tz)) },
        temps,
      );
    },
  };
}
