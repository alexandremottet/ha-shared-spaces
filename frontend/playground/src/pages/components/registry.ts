import type { CSSProperties } from "react";
import { WEEK_DAYS, ZONE_TARGET_HOOK, lunchRoomRules, officeSaverRules } from "ha-share-space-ui";
import type { Calendar, Condition, ScheduleRanges, TimeRange } from "ha-share-space-ui";

export type PropKind = "text" | "number" | "boolean" | "select" | "json";

export interface PropDef {
  name: string;
  kind: PropKind;
  value: unknown;
  options?: string[];
  parse?: (value: unknown) => unknown;
}

export interface ActionDef {
  label: string;
  run: (el: HTMLElement) => void;
}

export interface ComponentDef {
  id: string;
  tag: string;
  group: "Schedule" | "Roster" | "Heating" | "Rules" | "HA";
  description: string;
  props: PropDef[];
  events: string[];
  actions?: ActionDef[];
  fixed?: Record<string, unknown>;
  stage?: CSSProperties;
}

const range = (start: string, end: string): TimeRange => ({ start, end });

const calendarOf = (byDay: Partial<Record<(typeof WEEK_DAYS)[number], TimeRange[]>>): Calendar => {
  const calendar = {} as Calendar;
  for (const day of WEEK_DAYS) calendar[day] = byDay[day] ?? [];
  return calendar;
};

const workWeek = (periods: TimeRange[]): Calendar =>
  calendarOf({ monday: periods, tuesday: periods, wednesday: periods, thursday: periods, friday: periods });

const sampleCalendar = calendarOf({
  monday: [range("07:00", "09:00"), range("18:00", "23:00")],
  tuesday: [range("07:00", "09:00"), range("18:00", "23:00")],
  wednesday: [range("07:00", "12:00")],
  friday: [range("18:00", "24:00")],
  saturday: [range("08:00", "22:00")],
  sunday: [range("09:00", "20:00")],
});

const samplePeople = [
  { id: "alice", label: "Alice", calendar: workWeek([range("06:30", "08:30"), range("18:00", "23:00")]) },
  { id: "bob", label: "Bob", calendar: workWeek([range("07:30", "09:00"), range("19:00", "24:00")]) },
  { id: "carol", label: "Carol", calendar: calendarOf({ saturday: [range("10:00", "18:00")], sunday: [range("12:00", "20:00")] }) },
];

const sampleSegments = [
  { start: "07:00", end: "08:00", personIds: ["alice"] },
  { start: "08:00", end: "09:00", personIds: ["alice", "bob"] },
  { start: "18:00", end: "20:00", personIds: ["bob"] },
  { start: "20:00", end: "23:00", personIds: ["alice", "bob", "carol"] },
];

const dialogActions: ActionDef[] = [
  { label: "Open (monday, 08:00-10:00)", run: (el) => (el as HTMLElement & { open(d: string, i: number, p: TimeRange): void }).open("monday", 0, range("08:00", "10:00")) },
];

const trackStage: CSSProperties = { position: "relative", height: 32, background: "#546e7a", borderRadius: 4, overflow: "hidden" };

const hoursFromNow = (value: unknown) => (Number(value) > 0 ? new Date(Date.now() + Number(value) * 3600e3) : null);

const heatingProps = (extra: Partial<Record<string, unknown>> = {}): PropDef[] => {
  const v = { name: "Living room", currentTemperature: 19.5, target: 21, mode: "schedule", presence: true, overrideHours: 0, compact: false, ...extra };
  return [
    { name: "name", kind: "text", value: v.name },
    { name: "currentTemperature", kind: "number", value: v.currentTemperature },
    { name: "target", kind: "number", value: v.target },
    { name: "min", kind: "number", value: 5 },
    { name: "max", kind: "number", value: 30 },
    { name: "step", kind: "number", value: 0.5 },
    { name: "unit", kind: "text", value: "°C" },
    { name: "mode", kind: "select", value: v.mode, options: ["schedule", "override", "manual_only", "unmanaged"] },
    { name: "overrideUntil", kind: "number", value: v.overrideHours, parse: hoursFromNow },
    { name: "presence", kind: "boolean", value: v.presence },
    { name: "durations", kind: "json", value: [1, 2, 3, 6] },
    { name: "compact", kind: "boolean", value: v.compact },
  ];
};

const heatingEvents = ["override-requested", "override-cleared", "override-extended", "target-set"];

const officeSchedule: ScheduleRanges = Object.fromEntries(
  ["monday", "tuesday", "wednesday", "thursday", "friday"].map((d) => [d, [["08:00", "12:00"], ["14:00", "18:00"]]]),
);

const sampleStrategy = officeSaverRules();
const sampleLunch = lunchRoomRules();
const sampleCondition: Condition = { type: "occupied_within", hours: 2 };

export const COMPONENTS: ComponentDef[] = [
  {
    id: "week-schedule",
    tag: "week-schedule",
    group: "Schedule",
    description: "Editable week of day-schedule rows with a shared edit dialog. Drag on a track to add, tap to select, drag handles to resize, tap selected to edit.",
    props: [{ name: "calendar", kind: "json", value: sampleCalendar }],
    events: ["calendar-changed", "periods-changed", "period-select-request", "period-edit-request", "period-saved", "period-deleted"],
  },
  {
    id: "day-schedule",
    tag: "day-schedule",
    group: "Schedule",
    description: "One day's editable 24h presence track.",
    props: [
      { name: "day", kind: "select", value: "monday", options: [...WEEK_DAYS] },
      { name: "periods", kind: "json", value: [range("07:00", "09:00"), range("18:00", "23:00")] },
      { name: "selectedIndex", kind: "number", value: null, parse: (v) => (v === "" || v === null ? null : Number(v)) },
    ],
    events: ["periods-changed", "period-select-request", "period-edit-request"],
  },
  {
    id: "hour-period",
    tag: "hour-period",
    group: "Schedule",
    description: "A single colored block on a timeline, positioned absolutely inside its parent.",
    props: [
      { name: "start", kind: "text", value: "08:00" },
      { name: "end", kind: "text", value: "14:00" },
      { name: "status", kind: "select", value: "present", options: ["present", "absent"] },
      { name: "selected", kind: "boolean", value: false },
      { name: "draft", kind: "boolean", value: false },
      { name: "readonly", kind: "boolean", value: false },
    ],
    events: ["period-select", "period-edit-request", "period-changed"],
    stage: trackStage,
  },
  {
    id: "period-edit-dialog",
    tag: "period-edit-dialog",
    group: "Schedule",
    description: "Native dialog editor for one period. Opened via open(day, index, period).",
    props: [],
    events: ["period-saved", "period-deleted"],
    actions: dialogActions,
  },
  {
    id: "area-roster-view-lanes",
    tag: "area-roster-view",
    group: "Roster",
    description: "Read-only area presence, one lane per person.",
    props: [
      { name: "viewMode", kind: "select", value: "lanes", options: ["lanes", "overlap", "merged"] },
      { name: "people", kind: "json", value: samplePeople },
    ],
    events: [],
  },
  {
    id: "area-roster-view-overlap",
    tag: "area-roster-view",
    group: "Roster",
    description: "Same element, overlap mode: striped bands where several people overlap.",
    props: [
      { name: "viewMode", kind: "select", value: "overlap", options: ["lanes", "overlap", "merged"] },
      { name: "people", kind: "json", value: samplePeople },
    ],
    events: [],
  },
  {
    id: "area-roster-view-merged",
    tag: "area-roster-view",
    group: "Roster",
    description: "Same element, merged mode: a single combined lane per day.",
    props: [
      { name: "viewMode", kind: "select", value: "merged", options: ["lanes", "overlap", "merged"] },
      { name: "people", kind: "json", value: samplePeople },
    ],
    events: [],
  },
  {
    id: "overlap-track",
    tag: "overlap-track",
    group: "Roster",
    description: "One 24h row showing who is present per segment; shared segments are striped.",
    props: [
      { name: "label", kind: "text", value: "Monday" },
      { name: "segments", kind: "json", value: sampleSegments },
      { name: "personOrder", kind: "json", value: ["alice", "bob", "carol"] },
    ],
    events: [],
    fixed: { colorFor: (id: string) => ({ alice: "#4caf50", bob: "#2196f3", carol: "#ff9800" })[id] ?? "#9e9e9e" },
  },
  {
    id: "person-lane-track",
    tag: "person-lane-track",
    group: "Roster",
    description: "One person's read-only 24h presence row.",
    props: [
      { name: "label", kind: "text", value: "Alice" },
      { name: "color", kind: "text", value: "#2196f3" },
      { name: "periods", kind: "json", value: [range("06:30", "08:30"), range("18:00", "23:00")] },
    ],
    events: [],
  },
  {
    id: "time-axis",
    tag: "time-axis",
    group: "Roster",
    description: "Tick overlay for a track; absolutely fills its parent.",
    props: [],
    events: [],
    stage: trackStage,
  },
  {
    id: "heating-schedule",
    tag: "share-space-heating-control",
    group: "Heating",
    description: "Heating control, schedule mode.",
    props: heatingProps(),
    events: heatingEvents,
    stage: { maxWidth: 320 },
  },
  {
    id: "heating-override",
    tag: "share-space-heating-control",
    group: "Heating",
    description: "Heating control, override mode (until +3h).",
    props: heatingProps({ mode: "override", target: 23, currentTemperature: 20, overrideHours: 3 }),
    events: heatingEvents,
    stage: { maxWidth: 320 },
  },
  {
    id: "heating-manual",
    tag: "share-space-heating-control",
    group: "Heating",
    description: "Heating control, manual-only mode.",
    props: heatingProps({ mode: "manual_only", target: 20, currentTemperature: 20.5, presence: null }),
    events: heatingEvents,
    stage: { maxWidth: 320 },
  },
  {
    id: "heating-unmanaged",
    tag: "share-space-heating-control",
    group: "Heating",
    description: "Heating control, unmanaged mode.",
    props: heatingProps({ mode: "unmanaged", currentTemperature: 18, presence: null }),
    events: heatingEvents,
    stage: { maxWidth: 320 },
  },
  {
    id: "heating-compact",
    tag: "share-space-heating-control",
    group: "Heating",
    description: "Heating control, compact layout.",
    props: heatingProps({ target: 19, currentTemperature: 18.5, presence: false, compact: true }),
    events: heatingEvents,
    stage: { maxWidth: 240 },
  },
  {
    id: "rule-condition",
    tag: "share-space-rule-condition",
    group: "Rules",
    description: "One rule condition: type, fields and a not toggle. Try Planned during or Day of week.",
    props: [
      { name: "condition", kind: "json", value: sampleCondition },
      { name: "errors", kind: "json", value: [] },
    ],
    events: ["condition-change", "condition-remove"],
    stage: { maxWidth: 480 },
  },
  {
    id: "rule-action",
    tag: "share-space-rule-action",
    group: "Rules",
    description: "What a rule does: comfort, eco, off or a fixed temperature.",
    props: [
      { name: "action", kind: "json", value: { type: "temperature", value: 18 } },
      { name: "errors", kind: "json", value: [] },
    ],
    events: ["action-change"],
    stage: { maxWidth: 480 },
  },
  {
    id: "rule-row",
    tag: "share-space-rule-row",
    group: "Rules",
    description: "A When / Then rule with name, conditions, action and move / remove buttons.",
    props: [
      { name: "rule", kind: "json", value: sampleStrategy.rules[1] },
      { name: "index", kind: "number", value: 1 },
      { name: "count", kind: "number", value: 3 },
      { name: "errors", kind: "json", value: [] },
    ],
    events: ["rule-change", "rule-remove", "rule-move"],
    stage: { maxWidth: 560 },
  },
  {
    id: "rule-list-office",
    tag: "share-space-rule-list",
    group: "Rules",
    description: "Office saver as a rule list. Edit the strategy JSON to see inline validation errors.",
    props: [{ name: "strategy", kind: "json", value: sampleStrategy }],
    events: ["strategy-change"],
    stage: { maxWidth: 560 },
  },
  {
    id: "rule-list-lunch",
    tag: "share-space-rule-list",
    group: "Rules",
    description: "Lunch room as a rule list (Planned during with several windows).",
    props: [{ name: "strategy", kind: "json", value: sampleLunch }],
    events: ["strategy-change"],
    stage: { maxWidth: 560 },
  },
  {
    id: "rule-preview",
    tag: "share-space-rule-preview",
    group: "Rules",
    description: "7-day timeline of a rule strategy for a sample office schedule.",
    props: [
      { name: "strategy", kind: "json", value: sampleStrategy },
      { name: "schedule", kind: "json", value: officeSchedule },
      { name: "now", kind: "number", value: Date.now() },
      { name: "tz", kind: "text", value: "Europe/Paris" },
      { name: "temps", kind: "json", value: { comfort: 21, eco: 17 } },
    ],
    events: [],
    stage: { maxWidth: 560 },
  },
  {
    id: "template-editor-zone-target",
    tag: "share-space-template-editor",
    group: "HA",
    description: "Jinja template editor for the Zone target hook, with help, snippets and entity picker. Live result needs Home Assistant.",
    props: [
      { name: "value", kind: "text", value: "{{ 'comfort' if is_state('binary_sensor.door', 'on') else 'eco' }}" },
      { name: "hook", kind: "json", value: ZONE_TARGET_HOOK },
      {
        name: "entities",
        kind: "json",
        value: [
          { entity_id: "binary_sensor.door", name: "Front door" },
          { entity_id: "sensor.outdoor_temperature", name: "Outdoor temperature" },
        ],
      },
      { name: "result", kind: "json", value: null },
      { name: "liveAvailable", kind: "boolean", value: false },
      { name: "busy", kind: "boolean", value: false },
      { name: "error", kind: "text", value: "" },
    ],
    events: ["value-change", "save", "clear"],
    stage: { maxWidth: 640 },
  },
  {
    id: "ha-period-edit-dialog",
    tag: "ha-period-edit-dialog",
    group: "HA",
    description: "HA-styled period editor (uses ha-dialog / ha-time-input stubs here).",
    props: [],
    events: ["period-saved", "period-deleted"],
    actions: dialogActions,
  },
  {
    id: "ha-time-field",
    tag: "ha-time-field",
    group: "HA",
    description: "Adapter around ha-time-input exposing an HH:MM value.",
    props: [{ name: "value", kind: "text", value: "08:30" }],
    events: ["change"],
  },
];
