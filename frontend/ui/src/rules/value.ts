import type { RuleStrategy, Value } from "./types";

/** Sensor alias in rules: the outdoor sensor picked in Settings. */
export const OUTDOOR = "outdoor";

/** Numeric readings by entity id; a missing entry means no reading. */
export type SensorReadings = Record<string, number>;

/** Raw entity states by entity id, for state conditions; a missing entry means no entity. */
export type EntityStates = Record<string, string>;

export const TEMP_LIMITS: [number, number] = [5, 35];

/** Fixed number, or the sensor reading mapped through the curve points (linear between, flat outside). */
export function evalValue(v: Value, readings: SensorReadings = {}): number {
  if (typeof v === "number") return v;
  const r = readings[v.entity];
  const x = r === undefined || !Number.isFinite(r) ? v.default : r;
  const pts = v.points;
  if (x <= pts[0].at) return pts[0].value;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (x <= b.at) return a.value + ((x - a.at) / (b.at - a.at)) * (b.value - a.value);
  }
  return pts[pts.length - 1].value;
}

/** Temperature result: limited to 5-35 and rounded to 0.5. */
export const temperatureOf = (v: Value, readings?: SensorReadings): number =>
  Math.round(Math.min(TEMP_LIMITS[1], Math.max(TEMP_LIMITS[0], evalValue(v, readings))) * 2) / 2;

/** Entity ids read by curves and sensor conditions. */
export function strategySensors(strategy: RuleStrategy): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (v && typeof v === "object" && "entity" in v && typeof v.entity === "string") out.add(v.entity);
  };
  const actions = [...strategy.rules.map((r) => r.then), strategy.fallback.then];
  for (const a of actions) if (a.type === "temperature") add(a.value);
  for (const r of strategy.rules)
    for (const c of r.when) {
      if (c.type === "occupied_within") add(c.hours);
      if (c.type === "sensor") out.add(c.entity);
    }
  return [...out];
}

/** Entity ids read by state conditions. */
export function strategyStateEntities(strategy: RuleStrategy): string[] {
  const out = new Set<string>();
  for (const r of strategy.rules) for (const c of r.when) if (c.type === "state") out.add(c.entity);
  return [...out];
}

/** Current raw states for every entity a state condition reads. */
export function entityStates(strategy: RuleStrategy, states: Record<string, { state: string }>): EntityStates {
  const out: EntityStates = {};
  for (const id of strategyStateEntities(strategy)) if (states[id]) out[id] = states[id].state;
  return out;
}

/** Key in EntityStates holding "on" when an area is heated (heated conditions). */
export const heatedKey = (area: string) => `heated:${area}`;

/** Presets that keep an area cool; mirrors LOW_PRESETS in share_space_heating/rules.py. */
export const LOW_PRESETS = ["eco", "away", "sleep", "frost", "frost_protection", "hors_gel"];

/** Whether a thermostat state warms its area now (the relay is not used: it is off once the room is warm). */
export const climateHeated = (state?: { state: string; attributes?: Record<string, unknown> }): boolean =>
  !!state && !["off", "unavailable", "unknown"].includes(state.state) && !LOW_PRESETS.includes(String(state.attributes?.preset_mode ?? "").toLowerCase());

/** Areas read by heated conditions. */
export function strategyHeatedAreas(strategy: RuleStrategy): string[] {
  const out = new Set<string>();
  for (const r of strategy.rules) for (const c of r.when) if (c.type === "heated") c.areas.forEach((a) => out.add(a));
  return [...out];
}

/** Number from an HA state: weather.* attribute temperature, else the numeric state. */
export function readingOf(entityId: string, state?: { state: string; attributes?: Record<string, unknown> }): number | undefined {
  if (!state) return undefined;
  const raw = entityId.startsWith("weather.") ? state.attributes?.temperature : state.state;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Current readings for every sensor the strategy uses; `outdoor` reads `outdoorEntity`. */
export function sensorReadings(
  strategy: RuleStrategy,
  states: Record<string, { state: string; attributes?: Record<string, unknown> }>,
  outdoorEntity?: string | null,
): SensorReadings {
  const out: SensorReadings = {};
  for (const id of strategySensors(strategy)) {
    const real = id === OUTDOOR ? outdoorEntity : id;
    if (!real) continue;
    const t = readingOf(real, states[real]);
    if (t !== undefined) out[id] = t;
  }
  return out;
}
