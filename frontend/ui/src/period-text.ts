import type { TimeOfDay, TimeRange } from "./types";

const short = (t: TimeOfDay): string => t.replace(/^0(\d)/, "$1");

/** "9:00–12:30 · 13:30–18:00", in time order. */
export function periodsText(periods: TimeRange[]): string {
  return [...periods]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((p) => `${short(p.start)}–${short(p.end)}`)
    .join(" · ");
}

/** Where a planning shows its times: on the blocks' edges (beside a block too short to hold them), or as text under the day. */
export type TimesPlacement = "bar" | "below";
