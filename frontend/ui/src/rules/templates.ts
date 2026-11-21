import type { LunchRoomInputs, OfficeSaverInputs, StrategyInputs, StrategyPreset } from "../heating/strategy-sim";
import { DEFAULT_LUNCH_ROOM, DEFAULT_OFFICE_SAVER, toMinutes } from "../heating/strategy-sim";
import type { Rule, RuleStrategy, TimeWindow } from "./types";

/** Same decisions and reasons as the office_saver blueprint. */
export function officeSaverRules(inputs: OfficeSaverInputs = DEFAULT_OFFICE_SAVER): RuleStrategy {
  const comfort = { type: "temperature", value: inputs.comfort_temp } as const;
  return {
    version: 1,
    rules: [
      { label: "Occupied", when: [{ type: "occupied" }], then: comfort },
      { label: "Preheat", when: [{ type: "occupied_within", hours: inputs.preheat_hours }], then: comfort },
      {
        label: "Between working days",
        when: [{ type: "between_days", gap_hours: inputs.max_gap_hours }],
        then: { type: "temperature", value: inputs.setback_temp },
      },
    ],
    fallback: { label: "Away", then: { type: "off" } },
  };
}

/** Same decisions and reasons as the lunch_room blueprint. */
export function lunchRoomRules(inputs: LunchRoomInputs = DEFAULT_LUNCH_ROOM): RuleStrategy {
  const fallback = { label: "Outside lunch hours", then: { type: "off" } } as const;
  // Empty heat window: the preset is always outside lunch hours.
  if (toMinutes(inputs.heat_start) >= toMinutes(inputs.heat_end)) return { version: 1, rules: [], fallback };
  const lunchHours = { type: "time", start: inputs.heat_start, end: inputs.heat_end } as const;
  const all: TimeWindow[] = [
    { start: inputs.morning_start, end: inputs.morning_end },
    { start: inputs.afternoon_start, end: inputs.afternoon_end },
  ];
  // An empty window never matches: drop it for "any", the Lunch rule can't match for "all".
  const windows = all.filter((w) => toMinutes(w.start) < toMinutes(w.end));
  const canLunch = inputs.match === "any" ? windows.length > 0 : windows.length === all.length;
  const rules: Rule[] = [];
  if (canLunch) {
    rules.push({
      label: "Lunch",
      when: [lunchHours, { type: "planned", windows, match: inputs.match }],
      then: { type: "temperature", value: inputs.temperature },
    });
  }
  rules.push({ label: "No lunch today", when: [lunchHours], then: { type: "off" } });
  return { version: 1, rules, fallback };
}

export function presetRules(preset: StrategyPreset, inputs: StrategyInputs): RuleStrategy {
  return preset === "office_saver" ? officeSaverRules(inputs as OfficeSaverInputs) : lunchRoomRules(inputs as LunchRoomInputs);
}
