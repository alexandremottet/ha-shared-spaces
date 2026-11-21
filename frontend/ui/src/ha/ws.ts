import type { Calendar, WeekDay } from "../types";
import type { HomeAssistant } from "./hass";
import type { SharePrefs } from "./roles";
import type { ScheduleRanges, StrategyInputs, StrategyPreset } from "../heating/strategy-sim";
import { STRATEGY_LABELS } from "../heating/strategy-sim";
import type { RuleStrategy } from "../rules/types";
import { detachedConfig, managedState, rulesAutomationConfig } from "../rules/automation";
import type { ManagedState } from "../rules/automation";
import { validateStrategy } from "../rules/validate";

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
  target_template?: string | null;
  template_result?: string | null;
  template_error?: string | null;
}

export interface HeatingZoneAttributes {
  mode: "schedule" | "override" | "manual_only" | "automation" | "template";
  target_template?: string | null;
  template_result?: string | null;
  template_error?: string | null;
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
  target_template?: string | null;
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

export interface TemplatePreview {
  result?: string;
  error?: string;
}

// HA core websocket_api/commands.py handle_render_template: events are {result, listeners} or {error, level}.
export async function subscribeTemplatePreview(
  hass: HomeAssistant,
  template: string,
  variables: Record<string, unknown>,
  cb: (preview: TemplatePreview) => void
): Promise<() => void> {
  const conn = hass.connection;
  if (!conn?.subscribeMessage) throw { code: "unknown_command", message: "Unknown command." };
  try {
    return await conn.subscribeMessage<{ result?: unknown; error?: string }>(
      (ev) => {
        if (typeof ev.error === "string") cb({ error: ev.error });
        else cb({ result: ev.result === null || ev.result === undefined ? "" : String(ev.result) });
      },
      { type: "render_template", template, variables, strict: true, report_errors: true, timeout: 3 }
    );
  } catch (err) {
    if (isBackendMissing(err)) throw err;
    cb({ error: String((err as { message?: string })?.message ?? err) });
    return () => undefined;
  }
}

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
const KIND_RE = /_(office_saver|lunch_room|rules)(?:_(\d+))?$/;

export const strategyAutomationId = (zoneEntity: string, kind: StrategyKind): string =>
  `share_space_${zoneEntity.slice(zoneEntity.indexOf(".") + 1)}_${kind}`;

/** Suffix of a rules automation id: 1 for the base id, n for `_rules_n`, null when not one of the zone's. */
export function rulesIdIndex(zoneEntity: string, id: string): number | null {
  const base = strategyAutomationId(zoneEntity, "rules");
  if (id === base) return 1;
  const m = id.startsWith(`${base}_`) ? /^(\d+)$/.exec(id.slice(base.length + 1)) : null;
  return m && Number(m[1]) >= 2 ? Number(m[1]) : null;
}

/** Next free rules id for a zone: `_rules_2`, `_rules_3`... */
export function nextRulesId(zoneEntity: string, ids: string[]): string {
  const max = Math.max(1, ...ids.map((id) => rulesIdIndex(zoneEntity, id) ?? 0));
  return `${strategyAutomationId(zoneEntity, "rules")}_${max + 1}`;
}

export const strategyBlueprintPath = (kind: StrategyKind): string => `share_space/${kind}.yaml`;

export function listStrategyAutomations(hass: HomeAssistant): StrategyAutomation[] {
  const out: StrategyAutomation[] = [];
  for (const [entityId, ent] of Object.entries(hass.states)) {
    const id = ent.attributes.id;
    if (!entityId.startsWith("automation.") || typeof id !== "string" || !id.startsWith("share_space_")) continue;
    const m = KIND_RE.exec(id);
    const kind = m ? STRATEGY_KINDS.find((k) => k === m[1]) : undefined;
    if (!m || !kind || (m[2] !== undefined && kind !== "rules")) continue;
    out.push({ entityId, id, name: String(ent.attributes.friendly_name ?? id), enabled: ent.state === "on", kind });
  }
  return out;
}

export const findZoneStrategies = (hass: HomeAssistant, zoneEntity: string): StrategyAutomation[] =>
  listStrategyAutomations(hass).filter((a) =>
    a.kind === "rules" ? rulesIdIndex(zoneEntity, a.id) !== null : a.id === strategyAutomationId(zoneEntity, a.kind),
  );

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
  const { zone: _z, area, rules, previous_rules: _p, ...inputs } = (cfg.use_blueprint?.input ?? {}) as Record<string, unknown>;
  const isRules = automation.kind === "rules";
  return {
    automation,
    area: String(area ?? ""),
    inputs: isRules ? null : (inputs as unknown as StrategyInputs),
    rules: isRules ? ((rules as RuleStrategy | undefined) ?? null) : null,
  };
}

/** A zone's rules automation (enabled or not), its last valid rules, the undo version and its managed state. */
export interface ZoneRules {
  id: string;
  enabled: boolean;
  area: string;
  rules: RuleStrategy | null;
  previous: RuleStrategy | null;
  state: ManagedState;
}

const validRules = (v: unknown): RuleStrategy | null => {
  if (!v) return null;
  const r = validateStrategy(v);
  return r.ok ? r.strategy : null;
};

const isNotFound = (err: unknown): boolean => {
  const e = err as { status_code?: number; code?: string; message?: string };
  return e?.status_code === 404 || e?.code === "not_found" || /not found/i.test(e?.message ?? "");
};

/** One rules automation by id; null when HA has no such automation. */
export async function loadRulesAutomation(hass: HomeAssistant, zoneEntity: string, id: string): Promise<ZoneRules | null> {
  let cfg: StrategyAutomationConfig;
  try {
    cfg = await getAutomationConfig(hass, id);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
  const input = (cfg.use_blueprint?.input ?? {}) as Record<string, unknown>;
  return {
    id,
    enabled: findZoneStrategies(hass, zoneEntity).find((a) => a.id === id)?.enabled ?? false,
    area: String(input.area ?? ""),
    rules: validRules(input.rules),
    previous: validRules(input.previous_rules),
    state: managedState(cfg),
  };
}

/** Ids of the zone's rules automations known to HA, oldest first. */
export const zoneRulesIds = (hass: HomeAssistant, zoneEntity: string): string[] =>
  findZoneStrategies(hass, zoneEntity)
    .filter((a) => a.kind === "rules")
    .map((a) => a.id)
    .sort((a, b) => (rulesIdIndex(zoneEntity, a) ?? 0) - (rulesIdIndex(zoneEntity, b) ?? 0));

/** The zone's latest rules automation (highest `_rules_n`), or null when it has none. */
export async function loadZoneRules(hass: HomeAssistant, zoneEntity: string): Promise<ZoneRules | null> {
  const ids = zoneRulesIds(hass, zoneEntity);
  return loadRulesAutomation(hass, zoneEntity, ids[ids.length - 1] ?? strategyAutomationId(zoneEntity, "rules"));
}

export const saveZoneRules = (
  hass: HomeAssistant,
  zone: { entity_id: string; name: string },
  area: string,
  rules: RuleStrategy,
  previous: RuleStrategy | null,
  id = strategyAutomationId(zone.entity_id, "rules"),
) => saveStrategyAutomation(hass, id, rulesAutomationConfig(zone, area, rules, previous));

/** Detach: rewrite only the description, the automation becomes a normal HA one. */
export async function detachAutomation(hass: HomeAssistant, id: string): Promise<void> {
  await saveStrategyAutomation(hass, id, detachedConfig(await getAutomationConfig(hass, id)));
}

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
