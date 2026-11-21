import type { Calendar, DailyPresence, Schedule, ScheduleRanges, WeekDay } from "ha-share-space-ui";
import { fromWall, wallTime } from "ha-share-space-ui";

export const SLOT_MINUTES = 30;
export const DAYS: readonly WeekDay[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export interface CalendarEvent {
  day: WeekDay;
  presence: DailyPresence;
}

const toMinutes = (t: string): number => {
  const [h, m] = t.split(":", 2).map(Number);
  return h * 60 + m;
};

const toTimeOfDay = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function slotsForRanges(ranges: DailyPresence): Set<string> {
  const slots = new Set<string>();
  for (const range of ranges) {
    const end = toMinutes(range.end);
    for (let s = Math.floor(toMinutes(range.start) / SLOT_MINUTES) * SLOT_MINUTES; s < end; s += SLOT_MINUTES) {
      slots.add(toTimeOfDay(s));
    }
  }
  return slots;
}

export function mergeCalendars(calendars: Array<Partial<Calendar>>, events: CalendarEvent[] = []): Schedule {
  const schedule = {} as Schedule;
  for (const day of DAYS) {
    const slots = new Set<string>();
    for (const calendar of calendars) {
      for (const s of slotsForRanges(calendar[day] ?? [])) slots.add(s);
    }
    schedule[day] = [...slots].sort();
  }
  for (const event of events) {
    schedule[event.day] = [...slotsForRanges(event.presence)].sort();
  }
  return schedule;
}

export { wallTime, fromWall };
export type { WallTime } from "ha-share-space-ui";

export function floorSlot(ms: number, tz: string): number {
  const w = wallTime(ms, tz);
  const base = Math.floor(ms / 1000) * 1000;
  return base - w.second * 1000 - (w.minute % SLOT_MINUTES) * 60000;
}

export function isOccupied(schedule: Partial<Schedule>, ms: number, tz: string): boolean {
  const slot = wallTime(floorSlot(ms, tz), tz);
  const key = `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
  return (schedule[DAYS[slot.weekday]] ?? []).includes(key);
}

export function nextChange(schedule: Partial<Schedule>, ms: number, tz: string): number | null {
  const current = isOccupied(schedule, ms, tz);
  let t = floorSlot(ms, tz);
  for (let i = 0; i < (7 * 24 * 60) / SLOT_MINUTES; i++) {
    t += SLOT_MINUTES * 60000;
    if (isOccupied(schedule, t, tz) !== current) return t;
  }
  return null;
}

export function toIsoLocal(ms: number, tz: string): string {
  const w = wallTime(ms, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const offsetMin = Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${p(w.month)}-${p(w.day)}T${p(w.hour)}:${p(w.minute)}:${p(w.second)}${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

export function toDatetimeLocal(ms: number, tz: string): string {
  const w = wallTime(ms, tz);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${p(w.month)}-${p(w.day)}T${p(w.hour)}:${p(w.minute)}`;
}

export function parseDatetimeLocal(value: string, tz: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  return m ? fromWall(tz, +m[1], +m[2], +m[3], +m[4], +m[5]) : null;
}

export function scheduleToRanges(schedule: Partial<Schedule>): ScheduleRanges {
  const out = {} as ScheduleRanges;
  for (const day of DAYS) {
    const ranges: Array<[string, string]> = [];
    for (const slot of schedule[day] ?? []) {
      const start = toMinutes(slot);
      const last = ranges[ranges.length - 1];
      if (last && toMinutes(last[1]) === start) last[1] = start + SLOT_MINUTES >= 1440 ? "24:00" : toTimeOfDay(start + SLOT_MINUTES);
      else ranges.push([slot, start + SLOT_MINUTES >= 1440 ? "24:00" : toTimeOfDay(start + SLOT_MINUTES)]);
    }
    out[day] = ranges;
  }
  return out;
}
