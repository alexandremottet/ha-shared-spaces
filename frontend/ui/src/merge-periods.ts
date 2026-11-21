import type { TimeRange } from "./types";

/** Merge overlapping or touching (adjacent) periods into one, sorted by start. */
export function mergeAdjacentPeriods(periods: TimeRange[]): TimeRange[] {
  const sorted = [...periods].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const merged: TimeRange[] = [];

  for (const period of sorted) {
    const last = merged[merged.length - 1];
    if (last && period.start <= last.end) {
      if (period.end > last.end) {
        last.end = period.end;
      }
    } else {
      merged.push({ ...period });
    }
  }

  return merged;
}
