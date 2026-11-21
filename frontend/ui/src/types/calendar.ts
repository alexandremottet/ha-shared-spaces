export type WeekDay =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const WEEK_DAYS: readonly WeekDay[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export type Period = string;

export const WORK_WEEK: Period = "work_week";
export const HOLIDAYS: Period = "holidays";

export type WeekPeriods = Record<WeekDay, Period>;

/** 24h "HH:MM", zero-padded, no date. */
export type TimeOfDay = string;

/** A presence interval within a single day: from `start` (inclusive) to `end` (exclusive). */
export interface TimeRange {
  start: TimeOfDay;
  end: TimeOfDay;
}

/** Presence intervals for one day; empty array means absent all day. */
export type DailyPresence = TimeRange[];

/** One person's/area's weekly presence: which hours they're present, per day. */
export type Calendar = Record<WeekDay, DailyPresence>;

/** Granularity of a Schedule slot, in minutes. */
export const SLOT_MINUTES = 30;

/** Resolved heating decision: start ("HH:MM") of each active slot, per day. */
export type Schedule = Record<WeekDay, TimeOfDay[]>;
