import type { ScheduleRanges, StrategySegment } from "./strategy-sim";
import { buildSegments } from "./strategy-sim";
import { ruleTimeline } from "../rules/timeline";
import type { EntityStates, SensorReadings } from "../rules/value";
import type { PersonPlannings, PresetTemps, RuleStrategy } from "../rules/types";

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
  plannings?: PersonPlannings,
): StrategySegment[] {
  return buildSegments(ruleTimeline(strategy, schedule, start, end, tz, temps, readings, states, plannings), start, end);
}
