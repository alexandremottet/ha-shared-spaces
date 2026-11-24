import type { ScheduleRanges, StrategySegment } from "./strategy-sim";
import { buildSegments } from "./strategy-sim";
import { ruleTimeline } from "../rules/timeline";
import type { EntityStates, SensorReadings } from "../rules/value";
import type { PresetTemps, RuleStrategy } from "../rules/types";

/** Exact strategy segments over [start, end) for a rule strategy. */
export function strategyTimeline(
  strategy: RuleStrategy,
  schedule: ScheduleRanges,
  start: number,
  end: number,
  tz: string,
  temps?: PresetTemps,
  readings?: SensorReadings,
  states?: EntityStates,
): StrategySegment[] {
  return buildSegments(ruleTimeline(strategy, schedule, start, end, tz, temps, readings, states), start, end);
}
