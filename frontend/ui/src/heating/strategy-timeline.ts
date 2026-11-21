import type { ScheduleRanges, StrategyInputs, StrategyPreset, StrategySegment } from "./strategy-sim";
import { buildSegments, presetTimeline } from "./strategy-sim";
import { ruleTimeline } from "../rules/timeline";
import type { PresetTemps, RuleStrategy } from "../rules/types";

/** Exact strategy segments over [start, end) for a preset or a rule strategy. */
export function strategyTimeline(
  preset: StrategyPreset,
  inputs: StrategyInputs,
  schedule: ScheduleRanges,
  start: number,
  end: number,
  tz: string,
): StrategySegment[];
export function strategyTimeline(
  strategy: RuleStrategy,
  schedule: ScheduleRanges,
  start: number,
  end: number,
  tz: string,
  temps?: PresetTemps,
): StrategySegment[];
export function strategyTimeline(
  ...args:
    | [StrategyPreset, StrategyInputs, ScheduleRanges, number, number, string]
    | [RuleStrategy, ScheduleRanges, number, number, string, PresetTemps?]
): StrategySegment[] {
  if (typeof args[0] === "string") {
    const [preset, inputs, schedule, start, end, tz] = args as [StrategyPreset, StrategyInputs, ScheduleRanges, number, number, string];
    return buildSegments(presetTimeline(preset, inputs, schedule, start, end, tz), start, end);
  }
  const [strategy, schedule, start, end, tz, temps] = args as [RuleStrategy, ScheduleRanges, number, number, string, PresetTemps?];
  return buildSegments(ruleTimeline(strategy, schedule, start, end, tz, temps), start, end);
}
