import type { Calendar, WeekDay } from "../types";
import type { HomeAssistant } from "./hass";
import type { SharePrefs } from "./roles";
import type { ScheduleRanges } from "../heating/strategy-sim";
import type { RuleStrategy } from "../rules/types";
import { detachedConfig, managedState, rulesAutomationConfig } from "../rules/automation";
import type { ManagedState, RulesSource } from "../rules/automation";
import { validateStrategy } from "../rules/validate";

export { getAreaActions, runAreaActions, setAreaActions } from "./area-actions";

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
  /** HA area of the climate entity (entity registry, else device); the provisioning area only when HA has none. */
  area_id?: string | null;
  /** Another heating zone resolves to the same area: rules for that area fail until fixed in HA. */
  area_conflict?: boolean;
  /** Read live from the HA helpers Share Space built (heater switches + a sensor). */
  heaters?: string[] | null;
  heater_switch?: string | null;
  temperature_sensor?: string | null;
  managed?: boolean;
  /** Not created yet: what HA holds, created with the area's first rule. */
  pending?: AreaZoneInput;
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
  outdoor_entity?: string | null;
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

/** The HA Schedule helper holding a person's planning, once they have one. */
export const getPlanningEntity = async (hass: HomeAssistant, person: string): Promise<string | null> =>
  (await hass.callWS<{ schedule_entity?: string | null }>({ type: "share_space/get_calendar", person })).schedule_entity ?? null;

export const getPersonArea = async (hass: HomeAssistant, person: string): Promise<string | null> =>
  (await hass.callWS<{ area: string | null }>({ type: "share_space/get_person_area", person })).area;

export const getAreaSchedule = async (hass: HomeAssistant, area: string): Promise<Schedule> =>
  (await hass.callWS<{ schedule: Schedule }>({ type: "share_space/get_area_schedule", area })).schedule;

export const getAreaCalendars = async (hass: HomeAssistant, area: string): Promise<Record<string, Calendar>> =>
  (await hass.callWS<{ persons: Record<string, Calendar> }>({ type: "share_space/get_area_calendars", area })).persons;

export const listAreas = (hass: HomeAssistant) =>
  hass.callWS<AreaInfo[]>({ type: "share_space/list_areas" });

export const setCalendar = (hass: HomeAssistant, person: string, calendar: Calendar) =>
  hass.callService("share_space", "set_calendar", { person, calendar });

export const assignPersonArea = (hass: HomeAssistant, person: string, area: string) =>
  hass.callService("share_space", "assign_person_area", { person, area });

export const listZones = (hass: HomeAssistant) =>
  hass.callWS<HeatingZone[]>({ type: "share_space_heating/list_zones" });

/** Zone for an area: an existing thermostat, or heater switches + a temperature sensor (Share Space builds the thermostat). */
export type AreaZoneInput = { area_id: string } & (
  | { climate_entity: string }
  | { heaters: string[]; temperature_sensor: string }
);

export const createAreaZone = (hass: HomeAssistant, input: AreaZoneInput) =>
  hass.callWS<{ entry_id: string; entity_id: string }>({ type: "share_space_heating/create_area_zone", ...input });

/** Removes the zone and the helpers Share Space built for it; the area is not set up again on its own. */
export const deleteZone = (hass: HomeAssistant, entryId: string) =>
  hass.callWS<Record<string, never>>({ type: "share_space_heating/delete_zone", entry_id: entryId });

export interface HaUser {
  id: string;
  name: string;
  username?: string | null;
  is_owner: boolean;
  is_active: boolean;
  system_generated: boolean;
  group_ids: string[];
}

export const ADMIN_GROUP = "system-admin";

export const listUsers = (hass: HomeAssistant) => hass.callWS<HaUser[]>({ type: "config/auth/list" });

/** Space Admin = HA administrator. */
export const setSpaceAdmin = (hass: HomeAssistant, userId: string, admin: boolean) =>
  hass.callWS<{ user: HaUser }>({ type: "config/auth/update", user_id: userId, group_ids: [admin ? ADMIN_GROUP : "system-users"] });

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

export interface StrategyAutomation {
  entityId: string;
  id: string;
  name: string;
  enabled: boolean;
}

const RULES_ID_RE = /^share_space_.+_rules(?:_\d+)?$/;

export const strategyAutomationId = (zoneEntity: string): string => `share_space_${zoneEntity.slice(zoneEntity.indexOf(".") + 1)}_rules`;

/** Suffix of a rules automation id: 1 for the base id, n for `_rules_n`, null when not one of the zone's. */
export function rulesIdIndex(zoneEntity: string, id: string): number | null {
  const base = strategyAutomationId(zoneEntity);
  if (id === base) return 1;
  const m = id.startsWith(`${base}_`) ? /^(\d+)$/.exec(id.slice(base.length + 1)) : null;
  return m && Number(m[1]) >= 2 ? Number(m[1]) : null;
}

/** Next free rules id for a zone: `_rules_2`, `_rules_3`... */
export function nextRulesId(zoneEntity: string, ids: string[]): string {
  const max = Math.max(1, ...ids.map((id) => rulesIdIndex(zoneEntity, id) ?? 0));
  return `${strategyAutomationId(zoneEntity)}_${max + 1}`;
}

export function listStrategyAutomations(hass: HomeAssistant): StrategyAutomation[] {
  const out: StrategyAutomation[] = [];
  for (const [entityId, ent] of Object.entries(hass.states)) {
    const id = ent.attributes.id;
    if (!entityId.startsWith("automation.") || typeof id !== "string" || !RULES_ID_RE.test(id)) continue;
    out.push({ entityId, id, name: String(ent.attributes.friendly_name ?? id), enabled: ent.state === "on" });
  }
  return out;
}

export const findZoneStrategies = (hass: HomeAssistant, zoneEntity: string): StrategyAutomation[] =>
  listStrategyAutomations(hass).filter((a) => rulesIdIndex(zoneEntity, a.id) !== null);

export const getAutomationConfig = (hass: HomeAssistant, id: string) =>
  hass.callApi<StrategyAutomationConfig>("GET", `config/automation/config/${id}`);

export const saveStrategyAutomation = (hass: HomeAssistant, id: string, config: StrategyAutomationConfig) =>
  hass.callApi<{ result: string }>("POST", `config/automation/config/${id}`, config as unknown as Record<string, unknown>);

export const deleteStrategyAutomation = (hass: HomeAssistant, id: string) =>
  hass.callApi<{ result: string }>("DELETE", `config/automation/config/${id}`);

export const setAutomationEnabled = (hass: HomeAssistant, entityId: string, on: boolean) =>
  hass.callService("automation", on ? "turn_on" : "turn_off", { entity_id: entityId });

/** A zone's rules automation (enabled or not), its last valid rules, the undo version and its managed state. */
export interface ZoneRules {
  id: string;
  enabled: boolean;
  area: string;
  rules: RuleStrategy | null;
  previous: RuleStrategy | null;
  /** Shared strategy id when the automation points at one, null for inline rules. */
  strategy: string | null;
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
    strategy: typeof input.strategy === "string" && input.strategy.trim() !== "" ? input.strategy : null,
    state: managedState(cfg),
  };
}

/** Ids of the zone's rules automations known to HA, oldest first. */
export const zoneRulesIds = (hass: HomeAssistant, zoneEntity: string): string[] =>
  findZoneStrategies(hass, zoneEntity)
    .map((a) => a.id)
    .sort((a, b) => (rulesIdIndex(zoneEntity, a) ?? 0) - (rulesIdIndex(zoneEntity, b) ?? 0));

/** The zone's latest rules automation (highest `_rules_n`), or null when it has none. */
export async function loadZoneRules(hass: HomeAssistant, zoneEntity: string): Promise<ZoneRules | null> {
  const ids = zoneRulesIds(hass, zoneEntity);
  return loadRulesAutomation(hass, zoneEntity, ids[ids.length - 1] ?? strategyAutomationId(zoneEntity));
}

/** A zone's running strategy: its rules automation plus the effective rules and name (shared strategy resolved). */
export interface ZoneStrategy extends ZoneRules {
  name: string;
  effective: RuleStrategy | null;
}

/** The zone's enabled rules automation, or null when no strategy is active. */
export async function loadZoneStrategy(hass: HomeAssistant, zoneEntity: string): Promise<ZoneStrategy | null> {
  const active = findZoneStrategies(hass, zoneEntity).find((a) => a.enabled);
  const r = active ? await loadRulesAutomation(hass, zoneEntity, active.id) : null;
  if (!r) return null;
  if (!r.strategy) return { ...r, name: "Custom rules", effective: r.rules };
  const s = ((await listStrategies(hass).catch(() => null)) ?? []).find((x) => x.id === r.strategy);
  return { ...r, name: s?.name ?? "Missing shared strategy", effective: s?.rules ?? null };
}

export const saveZoneRules = (
  hass: HomeAssistant,
  zone: { entity_id: string; name: string },
  area: string,
  source: RulesSource,
  id = strategyAutomationId(zone.entity_id),
) => saveStrategyAutomation(hass, id, rulesAutomationConfig(zone, area, source));

/** A rules strategy stored once by the integration and used by several zones. */
export interface SharedStrategy {
  id: string;
  name: string;
  rules: RuleStrategy;
  previous: RuleStrategy | null;
}

/** True when another shared strategy already has this name (case-insensitive, trimmed). */
export const nameTaken = (shared: Array<{ id: string; name: string }>, name: string, exceptId = ""): boolean =>
  shared.some((s) => s.id !== exceptId && s.name.trim().toLowerCase() === name.trim().toLowerCase());

export interface HeatingSettings {
  outdoor_entity: string | null;
}

export const getHeatingSettings = (hass: HomeAssistant) =>
  hass.callWS<HeatingSettings>({ type: "share_space_heating/get_settings" });

/** Admin only; `null` clears the outdoor sensor. */
export const saveHeatingSettings = (hass: HomeAssistant, settings: HeatingSettings) =>
  hass.callWS<HeatingSettings>({ type: "share_space_heating/save_settings", outdoor_entity: settings.outdoor_entity });

/** Heating HA already holds in an area without a zone; Share Space creates the zone with the area's first rule. */
export type DetectedArea = AreaZoneInput & { name: string };

export const listDetectedAreas = (hass: HomeAssistant) =>
  hass.callWS<DetectedArea[]>({ type: "share_space_heating/detected_areas" });

export const PENDING_ZONE_PREFIX = "pending:";

/** A zone not created yet, standing for heating found in HA, until the area's first rule is saved. */
export function detectedZone(d: DetectedArea): HeatingZone {
  const { name, ...input } = d;
  return {
    entry_id: "",
    name,
    entity_id: `${PENDING_ZONE_PREFIX}${d.area_id}`,
    climate_entity: "climate_entity" in d ? d.climate_entity : "",
    presence_entity: null,
    mode: "manual_only",
    target: 0,
    override_until: null,
    area_id: d.area_id,
    heaters: "heaters" in d ? d.heaters : null,
    temperature_sensor: "temperature_sensor" in d ? d.temperature_sensor : null,
    pending: input,
  };
}

export const listStrategies = (hass: HomeAssistant) =>
  hass.callWS<SharedStrategy[]>({ type: "share_space_heating/list_strategies" });

/** Create (no id) or update a shared strategy; rejects a taken name with code name_taken. */
export const saveStrategy = (hass: HomeAssistant, s: { id?: string; name: string; rules: RuleStrategy; previous?: RuleStrategy | null }) =>
  hass.callWS<{ id: string }>({
    type: "share_space_heating/save_strategy",
    ...(s.id ? { strategy_id: s.id } : {}),
    name: s.name,
    rules: s.rules,
    ...(s.previous === undefined ? {} : { previous: s.previous }),
  });

export const deleteStrategy = (hass: HomeAssistant, id: string) =>
  hass.callWS<Record<string, never>>({ type: "share_space_heating/delete_strategy", strategy_id: id });

/** A zone rules automation managed by Share Space that points at a shared strategy. */
export interface StrategyUse {
  zone: string;
  zoneName: string;
  automationId: string;
  area: string;
  strategy: string;
  enabled: boolean;
}

/** Every managed rules automation of these zones that points at a shared strategy (one config GET each). */
export async function loadStrategyUses(hass: HomeAssistant, zones: Array<{ entity_id: string; name: string }>): Promise<StrategyUse[]> {
  const jobs = zones.flatMap((z) => zoneRulesIds(hass, z.entity_id).map((id) => ({ z, id })));
  const loaded = await Promise.all(jobs.map(({ z, id }) => loadRulesAutomation(hass, z.entity_id, id).catch(() => null)));
  const out: StrategyUse[] = [];
  loaded.forEach((r, i) => {
    const { z } = jobs[i];
    if (r?.state === "managed" && r.strategy)
      out.push({ zone: z.entity_id, zoneName: z.name, automationId: r.id, area: r.area, strategy: r.strategy, enabled: r.enabled });
  });
  return out;
}

/** Zone names using a shared strategy, sorted, each once. */
export const strategyUsers = (uses: StrategyUse[], strategyId: string, exceptZone?: string): string[] =>
  [...new Set(uses.filter((u) => u.strategy === strategyId && u.zone !== exceptZone).map((u) => u.zoneName))].sort((a, b) => a.localeCompare(b));

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

export const SHARE_SPACE_PANEL = "share-space";

type CoreData = Record<string, unknown> & { default_panel?: string };

const getCoreData = async (hass: HomeAssistant, scope: "user" | "system"): Promise<CoreData> =>
  (await hass.callWS<{ value: CoreData | null }>({ type: `frontend/get_${scope}_data`, key: "core" })).value ?? {};

// Panel HA opens after login: the user's own choice, else the system-wide one.
export async function getDefaultPanel(hass: HomeAssistant): Promise<string | undefined> {
  const [user, system] = await Promise.all([getCoreData(hass, "user"), getCoreData(hass, "system")]);
  return user.default_panel ?? system.default_panel;
}

/** Whether HA opens on Share Space for everyone who did not choose otherwise (HA's own system default). */
export async function opensShareSpaceForEveryone(hass: HomeAssistant): Promise<boolean> {
  return (await getCoreData(hass, "system")).default_panel === SHARE_SPACE_PANEL;
}

/** Admin only: sets or clears HA's system default panel; each person's own choice still wins. */
export async function setOpensShareSpaceForEveryone(hass: HomeAssistant, on: boolean): Promise<void> {
  const { default_panel: _, ...core } = await getCoreData(hass, "system");
  await hass.callWS<void>({ type: "frontend/set_system_data", key: "core", value: on ? { ...core, default_panel: SHARE_SPACE_PANEL } : core });
}

export async function setMyDefaultPanel(hass: HomeAssistant, panel: string): Promise<void> {
  const core = await getCoreData(hass, "user");
  await hass.callWS<void>({ type: "frontend/set_user_data", key: "core", value: { ...core, default_panel: panel } });
}

export interface SpaceDashboard {
  url_path: string | null;
  title: string;
}

export interface LovelaceView {
  [key: string]: unknown;
  title?: string;
  path?: string;
  type?: string;
  subview?: boolean;
  visible?: boolean | Array<{ user?: string }>;
  cards?: unknown[];
  sections?: Array<{ cards?: unknown[]; strategy?: unknown }>;
  strategy?: unknown;
}

export interface LovelaceConfig {
  [key: string]: unknown;
  views?: LovelaceView[];
  strategy?: unknown;
  title?: string;
}

const DASHBOARDS_KEY = "share_space_dashboards";

// HA dashboards shown as extra tabs, for everyone (system data, admin-writable).
export const getSpaceDashboards = async (hass: HomeAssistant): Promise<SpaceDashboard[]> =>
  (await hass.callWS<{ value: { dashboards?: SpaceDashboard[] } | null }>({ type: "frontend/get_system_data", key: DASHBOARDS_KEY })).value
    ?.dashboards ?? [];

export const setSpaceDashboards = (hass: HomeAssistant, dashboards: SpaceDashboard[]): Promise<void> =>
  hass.callWS<void>({ type: "frontend/set_system_data", key: DASHBOARDS_KEY, value: { dashboards } });

export interface HaDashboard extends SpaceDashboard {
  mode?: "storage" | "yaml";
}

export const listHaDashboards = async (hass: HomeAssistant): Promise<HaDashboard[]> =>
  (await hass.callWS<HaDashboard[]>({ type: "lovelace/dashboards/list" })).map((d) => ({
    url_path: d.url_path,
    title: d.title,
    mode: d.mode,
  }));

export const saveLovelaceConfig = (hass: HomeAssistant, urlPath: string | null, config: LovelaceConfig): Promise<void> =>
  hass.callWS<void>({ type: "lovelace/config/save", url_path: urlPath, config });

export const getLovelaceConfig = (hass: HomeAssistant, urlPath: string | null): Promise<LovelaceConfig> =>
  hass.callWS<LovelaceConfig>({ type: "lovelace/config", url_path: urlPath });

/**
 * Path of the first dashboard view holding a card of `cardType` (e.g. the Scheduler card, where Scheduler items
 * are edited in HA); null when no dashboard shows one.
 */
export async function findCardView(hass: HomeAssistant, cardType: string): Promise<string | null> {
  const dashboards = [{ url_path: null as string | null }, ...(await listHaDashboards(hass).catch(() => []))];
  for (const d of dashboards) {
    const config = await getLovelaceConfig(hass, d.url_path).catch(() => null);
    const views = config?.views ?? [];
    const i = views.findIndex((v) => JSON.stringify(v).includes(`"${cardType}"`));
    if (i >= 0) return `/${d.url_path ?? "lovelace"}/${views[i].path ?? i}`;
  }
  return null;
}

// Views shown to this user, following HA's per-view visibility.
export const visibleViews = (config: LovelaceConfig | null, userId: string | undefined): LovelaceView[] =>
  (config?.views ?? []).filter(
    (v) => !v.subview && (v.visible === undefined || v.visible === true || (Array.isArray(v.visible) && v.visible.some((s) => s.user === userId))),
  );

// Dashboards with at least one view visible to this user; unreadable ones stay so the tab shows the error.
export async function dashboardsForUser(hass: HomeAssistant, dashboards: SpaceDashboard[]): Promise<SpaceDashboard[]> {
  const shown = await Promise.all(
    dashboards.map((d) =>
      getLovelaceConfig(hass, d.url_path).then(
        (c) => !c.views || visibleViews(c, hass.user?.id).length > 0,
        () => true,
      ),
    ),
  );
  return dashboards.filter((_, i) => shown[i]);
}
