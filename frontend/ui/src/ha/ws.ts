import type { Calendar, WeekDay } from "../types";
import type { HomeAssistant } from "./hass";
import type { SharePrefs } from "./roles";
import type { ScheduleRanges, StrategyInputs, StrategyPreset } from "../heating/strategy-sim";
import { STRATEGY_LABELS } from "../heating/strategy-sim";
import type { RuleStrategy } from "../rules/types";
import { rulesAutomationConfig } from "../rules/automation";

export type PlanningAction = Record<string, unknown>;

export interface AreaActions {
  on_actions: PlanningAction[];
  off_actions: PlanningAction[];
  enabled: boolean;
}

export interface AreaInfo {
  area_id: string;
  name: string;
  persons: string[];
  entity_id: string | null;
}

export type Schedule = Partial<Record<WeekDay, string[]>>;

export interface HeatingZone {
  entry_id: string;
  name: string;
  entity_id: string;
  climate_entity: string;
  presence_entity: string | null;
  mode: HeatingZoneAttributes["mode"];
  target: number;
  override_until: string | null;
}

export interface HeatingZoneAttributes {
  mode: "schedule" | "override" | "manual_only" | "automation";
  active_rule?: string | null;
  override_until: string | null;
  override_temp: number | null;
  presence: boolean | null;
  climate_entity: string;
  current_temperature: number | null;
  comfort_temp?: number;
  eco_temp?: number;
  frost_temp?: number;
}

export interface CreateZoneInput {
  climate_entity: string;
  name?: string;
  presence_entity?: string | null;
  comfort_temp?: number;
  eco_temp?: number;
  default_override_hours?: number;
  max_override_hours?: number;
  frost_temp?: number;
  off_mode?: "frost" | "hvac_off";
}

export interface ZoneUpdate {
  frost_temp?: number;
  off_mode?: "frost" | "hvac_off";
  presence_entity?: string | null;
  comfort_temp?: number;
  eco_temp?: number;
  default_override_hours?: number;
  max_override_hours?: number;
}

export interface HotspotShape {
  type: "rect" | "polygon";
  points: Array<[number, number]>;
}

export interface HotspotTarget {
  kind: "heating" | "area" | "entity" | "card";
  ref: string | Record<string, unknown>;
}

export interface Hotspot {
  id: string;
  label: string;
  shape: HotspotShape;
  target: HotspotTarget;
}

export interface Floorplan {
  id: string;
  name: string;
  image_url: string;
  hotspots: Hotspot[];
}

export function isBackendMissing(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null | undefined;
  if (!e) {
    return false;
  }
  if (e.code === "unknown_command" || e.code === "service_not_found") {
    return true;
  }
  return /unknown[_ ]command|service .* not found|ServiceNotFound/i.test(e.message ?? "");
}

export const getCalendar = async (hass: HomeAssistant, person: string): Promise<Calendar> =>
  (await hass.callWS<{ calendar: Calendar }>({ type: "share_space/get_calendar", person })).calendar;

export const getPersonArea = async (hass: HomeAssistant, person: string): Promise<string | null> =>
  (await hass.callWS<{ area: string | null }>({ type: "share_space/get_person_area", person })).area;

export const getAreaSchedule = async (hass: HomeAssistant, area: string): Promise<Schedule> =>
  (await hass.callWS<{ schedule: Schedule }>({ type: "share_space/get_area_schedule", area })).schedule;

export const getAreaCalendars = async (hass: HomeAssistant, area: string): Promise<Record<string, Calendar>> =>
  (await hass.callWS<{ persons: Record<string, Calendar> }>({ type: "share_space/get_area_calendars", area })).persons;

export const getAreaActions = (hass: HomeAssistant, area: string) =>
  hass.callWS<AreaActions>({ type: "share_space/get_area_actions", area });

export const listAreas = (hass: HomeAssistant) =>
  hass.callWS<AreaInfo[]>({ type: "share_space/list_areas" });

export const setCalendar = (hass: HomeAssistant, person: string, calendar: Calendar) =>
  hass.callService("share_space", "set_calendar", { person, calendar });

export const assignPersonArea = (hass: HomeAssistant, person: string, area: string) =>
  hass.callService("share_space", "assign_person_area", { person, area });

export const setAreaActions = (hass: HomeAssistant, area: string, partial: Partial<AreaActions>) =>
  hass.callService("share_space", "set_area_actions", { area, ...partial });

export const runAreaActions = (hass: HomeAssistant, area: string, state: "on" | "off") =>
  hass.callService("share_space", "run_area_actions", { area, state });

export const listZones = (hass: HomeAssistant) =>
  hass.callWS<HeatingZone[]>({ type: "share_space_heating/list_zones" });

export const createZone = (hass: HomeAssistant, input: CreateZoneInput) =>
  hass.callWS<{ entry_id: string; entity_id: string }>({ type: "share_space_heating/create_zone", ...input });

export const updateZone = (hass: HomeAssistant, entryId: string, patch: ZoneUpdate) =>
  hass.callWS<HeatingZone>({ type: "share_space_heating/update_zone", entry_id: entryId, ...patch });

export const setOverride = (hass: HomeAssistant, entityId: string, temperature: number, hours?: number) =>
  hass.callService("share_space_heating", "set_override", {
    entity_id: entityId,
    temperature,
    ...(hours === undefined ? {} : { hours }),
  });

export const extendOverride = (hass: HomeAssistant, entityId: string, hours: number) =>
  hass.callService("share_space_heating", "extend_override", { entity_id: entityId, hours });

export const clearOverride = (hass: HomeAssistant, entityId: string) =>
  hass.callService("share_space_heating", "clear_override", { entity_id: entityId });

export const getFloorplans = async (hass: HomeAssistant): Promise<Floorplan[]> => {
  const res = await hass.callWS<{ plans: Floorplan[] } | Floorplan[]>({ type: "share_space_space/get_floorplans" });
  return Array.isArray(res) ? res : res.plans;
};

export const saveFloorplan = (hass: HomeAssistant, plan: Floorplan) =>
  hass.callWS<unknown>({ type: "share_space_space/save_floorplan", plan });

export interface BaseTargetInput {
  temperature?: number;
  preset?: "comfort" | "eco";
  off?: true;
  reason?: string;
}

export const setBaseTarget = (hass: HomeAssistant, entityId: string, input: BaseTargetInput) =>
  hass.callService("share_space_heating", "set_base_target", { entity_id: entityId, ...input });

export interface OccupancyWindow {
  start: string;
  end: string;
}

export interface QueryOccupancyArgs {
  area: string;
  windows: OccupancyWindow[];
  match?: "all" | "any";
  day?: "today" | "tomorrow" | WeekDay;
}

export interface OccupancyResult {
  occupied: boolean;
  matches: boolean[];
}

export const queryOccupancy = async (hass: HomeAssistant, args: QueryOccupancyArgs): Promise<OccupancyResult> =>
  (
    await hass.callWS<{ response: OccupancyResult }>({
      type: "call_service",
      domain: "share_space",
      service: "query_occupancy",
      service_data: { ...args },
      return_response: true,
    })
  ).response;

export interface StrategyAutomationConfig {
  alias: string;
  description?: string;
  use_blueprint: { path: string; input: Record<string, unknown> };
}

export type StrategyKind = StrategyPreset | "rules";

export const STRATEGY_KIND_LABELS: Record<StrategyKind, string> = { ...STRATEGY_LABELS, rules: "Custom rules" };

export interface StrategyAutomation {
  entityId: string;
  id: string;
  name: string;
  enabled: boolean;
  kind: StrategyKind;
}

const STRATEGY_KINDS: StrategyKind[] = ["office_saver", "lunch_room", "rules"];

export const strategyAutomationId = (zoneEntity: string, kind: StrategyKind): string =>
  `share_space_${zoneEntity.slice(zoneEntity.indexOf(".") + 1)}_${kind}`;

export const strategyBlueprintPath = (kind: StrategyKind): string => `share_space/${kind}.yaml`;

export function listStrategyAutomations(hass: HomeAssistant): StrategyAutomation[] {
  const out: StrategyAutomation[] = [];
  for (const [entityId, ent] of Object.entries(hass.states)) {
    const id = ent.attributes.id;
    if (!entityId.startsWith("automation.") || typeof id !== "string" || !id.startsWith("share_space_")) continue;
    const kind = STRATEGY_KINDS.find((k) => id.endsWith(`_${k}`));
    if (!kind) continue;
    out.push({ entityId, id, name: String(ent.attributes.friendly_name ?? id), enabled: ent.state === "on", kind });
  }
  return out;
}

export const findZoneStrategies = (hass: HomeAssistant, zoneEntity: string): StrategyAutomation[] =>
  listStrategyAutomations(hass).filter((a) => a.id === strategyAutomationId(zoneEntity, a.kind));

export const getAutomationConfig = (hass: HomeAssistant, id: string) =>
  hass.callApi<StrategyAutomationConfig>("GET", `config/automation/config/${id}`);

export async function findZoneStrategiesByConfig(
  hass: HomeAssistant,
  zoneEntity: string,
  preset: StrategyPreset,
): Promise<StrategyAutomation | undefined> {
  for (const a of listStrategyAutomations(hass)) {
    if (a.kind !== preset) continue;
    try {
      const { use_blueprint: bp } = await getAutomationConfig(hass, a.id);
      if (bp?.path?.startsWith("share_space/") && bp.input?.zone === zoneEntity) return a;
    } catch {
      continue;
    }
  }
  return undefined;
}

export const saveStrategyAutomation = (hass: HomeAssistant, id: string, config: StrategyAutomationConfig) =>
  hass.callApi<{ result: string }>("POST", `config/automation/config/${id}`, config as unknown as Record<string, unknown>);

export const deleteStrategyAutomation = (hass: HomeAssistant, id: string) =>
  hass.callApi<{ result: string }>("DELETE", `config/automation/config/${id}`);

export const setAutomationEnabled = (hass: HomeAssistant, entityId: string, on: boolean) =>
  hass.callService("automation", on ? "turn_on" : "turn_off", { entity_id: entityId });

/** Active strategy of a zone: `inputs` for a preset blueprint, `rules` for a rules blueprint. */
export interface ZoneStrategy {
  automation: StrategyAutomation;
  area: string;
  inputs: StrategyInputs | null;
  rules: RuleStrategy | null;
}

export async function loadZoneStrategy(hass: HomeAssistant, zoneEntity: string): Promise<ZoneStrategy | null> {
  const automation = findZoneStrategies(hass, zoneEntity).find((a) => a.enabled);
  if (!automation) return null;
  const cfg = await getAutomationConfig(hass, automation.id);
  const { zone: _z, area, rules, previous_rules: _p, ...inputs } = cfg.use_blueprint.input as Record<string, unknown>;
  const isRules = automation.kind === "rules";
  return {
    automation,
    area: String(area ?? ""),
    inputs: isRules ? null : (inputs as unknown as StrategyInputs),
    rules: isRules ? ((rules as RuleStrategy | undefined) ?? null) : null,
  };
}

/** A zone's saved rules automation (enabled or not) and the previous version kept for undo. */
export interface ZoneRules {
  id: string;
  enabled: boolean;
  area: string;
  rules: RuleStrategy;
  previous: RuleStrategy | null;
}

export async function loadZoneRules(hass: HomeAssistant, zoneEntity: string): Promise<ZoneRules | null> {
  const id = strategyAutomationId(zoneEntity, "rules");
  let cfg: StrategyAutomationConfig;
  try {
    cfg = await getAutomationConfig(hass, id);
  } catch (err) {
    const e = err as { status_code?: number; code?: string; message?: string };
    if (e?.status_code === 404 || e?.code === "not_found" || /not found/i.test(e?.message ?? "")) return null;
    throw err;
  }
  const input = cfg.use_blueprint?.input ?? {};
  if (!input.rules) return null;
  const enabled = findZoneStrategies(hass, zoneEntity).find((a) => a.id === id)?.enabled ?? false;
  return {
    id,
    enabled,
    area: String(input.area ?? ""),
    rules: input.rules as RuleStrategy,
    previous: (input.previous_rules as RuleStrategy | null | undefined) ?? null,
  };
}

export const saveZoneRules = (
  hass: HomeAssistant,
  zone: { entity_id: string; name: string },
  area: string,
  rules: RuleStrategy,
  previous: RuleStrategy | null,
) => saveStrategyAutomation(hass, strategyAutomationId(zone.entity_id, "rules"), rulesAutomationConfig(zone, area, rules, previous));

type HassSource = HomeAssistant | (() => HomeAssistant);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A freshly saved automation reaches hass.states a moment later.
async function waitForAutomation(get: () => HomeAssistant, id: string, tries = 20): Promise<StrategyAutomation | undefined> {
  for (let i = 0; ; i++) {
    const found = listStrategyAutomations(get()).find((a) => a.id === id);
    if (found || i >= tries) return found;
    await sleep(250);
  }
}

/** Simple and Strategy are exclusive: enable this strategy, disable the zone's others, drop the presence link. */
export async function useZoneStrategy(
  source: HassSource,
  zone: Pick<HeatingZone, "entity_id" | "entry_id" | "presence_entity">,
  automationId: string,
): Promise<void> {
  const get = typeof source === "function" ? source : () => source;
  const target = await waitForAutomation(get, automationId);
  if (target && !target.enabled) await setAutomationEnabled(get(), target.entityId, true);
  for (const a of findZoneStrategies(get(), zone.entity_id)) {
    if (a.id !== automationId && a.enabled) await setAutomationEnabled(get(), a.entityId, false);
  }
  if (zone.presence_entity) await updateZone(get(), zone.entry_id, { presence_entity: null });
}

/** Choosing Simple: disable the zone's strategy automations and clear the base target they set. */
export async function stopZoneStrategies(hass: HomeAssistant, zoneEntity: string): Promise<void> {
  const active = findZoneStrategies(hass, zoneEntity).filter((a) => a.enabled);
  if (active.length === 0) return;
  for (const a of active) await setAutomationEnabled(hass, a.entityId, false);
  await setBaseTarget(hass, zoneEntity, {});
}

export function planningSchedule(hass: HomeAssistant, area: string): ScheduleRanges | null {
  const s = hass.states[`binary_sensor.share_space_${area}`]?.attributes.schedule;
  return s && typeof s === "object" ? (s as ScheduleRanges) : null;
}

// Per-user prefs in HA frontend user data under key "share_space".
export const getSharePrefs = async (hass: HomeAssistant): Promise<SharePrefs | null> =>
  (await hass.callWS<{ value: SharePrefs | null }>({ type: "frontend/get_user_data", key: "share_space" })).value;

export const setSharePrefs = (hass: HomeAssistant, prefs: SharePrefs): Promise<void> =>
  hass.callWS<void>({ type: "frontend/set_user_data", key: "share_space", value: prefs as Record<string, unknown> });
