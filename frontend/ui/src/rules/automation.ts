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
  return stampManaged({
    alias: `Share Space · ${zone.name} · Custom rules`,
    use_blueprint: { path: RULES_BLUEPRINT_PATH, input: { zone: zone.entity_id, area, rules, previous_rules: previous } },
  });
}

export const MANAGED_MARKER = "Managed by Share Space";
export const DETACHED_MARKER = "Detached from Share Space";

/** How a rules automation relates to Share Space after loading it from HA. */
export type ManagedState = "managed" | "edited" | "detached" | "unmanaged";

/** FNV-1a 32-bit hash as 8 hex chars. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Stable short hash of what Share Space wrote: alias and use_blueprint, keys sorted. */
export const rulesFingerprint = (cfg: { alias?: unknown; use_blueprint?: unknown }): string =>
  fnv1a(JSON.stringify(canonical({ alias: cfg.alias ?? null, use_blueprint: cfg.use_blueprint ?? null })));

/** Same config with the "Managed by Share Space · <fingerprint>" description. */
export const stampManaged = (cfg: Omit<StrategyAutomationConfig, "description">): StrategyAutomationConfig => ({
  ...cfg,
  description: `${MANAGED_MARKER} · ${rulesFingerprint(cfg)}`,
});

/** managed, edited (changed or taken control of in HA), detached, or unmanaged (no marker). */
export function managedState(cfg: { alias?: unknown; description?: unknown; use_blueprint?: { path?: unknown; input?: unknown } | null }): ManagedState {
  const desc = typeof cfg.description === "string" ? cfg.description.trim() : "";
  if (desc.startsWith(DETACHED_MARKER)) return "detached";
  const legacy = desc === "" || desc === MANAGED_MARKER;
  if (!legacy && !desc.startsWith(`${MANAGED_MARKER} · `)) return "unmanaged";
  if (cfg.use_blueprint?.path !== RULES_BLUEPRINT_PATH) return "edited";
  if (legacy) return "managed";
  return desc.slice(MANAGED_MARKER.length + 3) === rulesFingerprint(cfg) ? "managed" : "edited";
}

/** Same config with only the description changed to the detached marker. */
export const detachedConfig = <T extends { description?: string }>(cfg: T): T => ({ ...cfg, description: DETACHED_MARKER });

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
