import type { StrategyAutomationConfig } from "../ha/ws";
import type { StrategyInputs, StrategyPreset } from "../heating/strategy-sim";
import { defaultInputs } from "../heating/strategy-sim";
import { presetRules } from "./templates";
import type { RuleStrategy } from "./types";

export const RULES_BLUEPRINT_PATH = "share_space/rules.yaml";

/** The saved rules plus the version kept for undo. */
export interface SavedRules {
  rules: RuleStrategy;
  previous: RuleStrategy | null;
}

/** HA automation config (blueprint inputs zone, area, rules, previous_rules) for a zone's rules. */
export function rulesAutomationConfig(
  zone: { entity_id: string; name: string },
  area: string,
  rules: RuleStrategy,
  previous: RuleStrategy | null,
): StrategyAutomationConfig {
  return {
    alias: `Share Space · ${zone.name} · Custom rules`,
    description: "Managed by Share Space",
    use_blueprint: { path: RULES_BLUEPRINT_PATH, input: { zone: zone.entity_id, area, rules, previous_rules: previous } },
  };
}

/** Sort object keys so equal rule lists compare equal whatever their key order. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, x]) => [k, canonical(x)]),
    );
  }
  return v;
}

export const sameRules = (a: RuleStrategy | null | undefined, b: RuleStrategy | null | undefined): boolean =>
  JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));

/** True when the draft differs from what is saved (or nothing is saved yet). */
export const isDirty = (draft: RuleStrategy | null, saved: SavedRules | null): boolean =>
  draft !== null && (saved === null || !sameRules(draft, saved.rules));

/** Saving keeps the last saved rules as the undo version. */
export const afterSave = (draft: RuleStrategy, saved: SavedRules | null): SavedRules => ({ rules: draft, previous: saved?.rules ?? null });

/** Undo swaps rules and previous (so a second undo redoes); null when nothing to undo. */
export const undoRules = (saved: SavedRules): SavedRules | null => (saved.previous ? { rules: saved.previous, previous: saved.rules } : null);

/** Template rules from the zone's current preset inputs when they match the kind, defaults otherwise. */
export function templateRules(kind: StrategyPreset, current?: { kind: string; inputs: StrategyInputs | null } | null): RuleStrategy {
  const inputs = current && current.kind === kind && current.inputs ? { ...defaultInputs(kind), ...current.inputs } : defaultInputs(kind);
  return presetRules(kind, inputs);
}
