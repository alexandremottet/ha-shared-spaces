import type { OutdoorHours, RuleStrategy } from "./types";

/** Outdoor temperature by entity id; a missing entry means no reading. */
export type OutdoorTemps = Record<string, number>;

/** Hours for a fixed lead time or one interpolated from the outdoor temperature. */
export function leadHours(hours: number | OutdoorHours, outdoor: OutdoorTemps = {}): number {
  if (typeof hours === "number") return hours;
  const t = outdoor[hours.sensor];
  if (t === undefined || !Number.isFinite(t)) return hours.cold.hours;
  const { cold, warm } = hours;
  const f = Math.min(1, Math.max(0, (t - cold.temp) / (warm.temp - cold.temp)));
  return cold.hours + f * (warm.hours - cold.hours);
}

/** Entity ids read by outdoor-based lead times. */
export function outdoorSensors(strategy: RuleStrategy): string[] {
  const out = new Set<string>();
  for (const r of strategy.rules) for (const c of r.when) if (c.type === "occupied_within" && typeof c.hours === "object" && c.hours) out.add(c.hours.sensor);
  return [...out];
}

/** Temperature of an HA state: weather.* attribute temperature, else the numeric state. */
export function outdoorReading(entityId: string, state?: { state: string; attributes?: Record<string, unknown> }): number | undefined {
  if (!state) return undefined;
  const raw = entityId.startsWith("weather.") ? state.attributes?.temperature : state.state;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Current readings for every sensor the strategy uses. */
export function outdoorTemps(strategy: RuleStrategy, states: Record<string, { state: string; attributes?: Record<string, unknown> }>): OutdoorTemps {
  const out: OutdoorTemps = {};
  for (const id of outdoorSensors(strategy)) {
    const t = outdoorReading(id, states[id]);
    if (t !== undefined) out[id] = t;
  }
  return out;
}
