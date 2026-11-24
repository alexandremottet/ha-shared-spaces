import type { Action, Condition, Rule, WeekdayCondition } from "../rules/types";
import { RULES_BLUEPRINT_PATH } from "../rules/automation";
import { describeAction, describeCondition } from "../rules/ui/edit";
import type { WeekDay } from "../types/calendar";
import { entityAreaId } from "./area-heating";
import { t } from "../i18n";
import type { HomeAssistant } from "./hass";

/** Heating logic that already lives in HA (an automation or a Scheduler item), shown read only and copied into rules on migration. */
export interface ExistingHeating {
  kind: "automation" | "scheduler";
  /** Automation config id, or Scheduler schedule_id. */
  id: string;
  entityId: string;
  name: string;
  enabled: boolean;
  rules: Rule[];
  /** What Share Space cannot express, described as HA shows it; not copied on migration. */
  unmapped: string[];
  /** Each HA trigger, condition, action or timeslot, in HA's order, and the rule block it becomes (null: not copied). */
  mapping: MappedLine[];
  /** Where to edit it in HA. */
  haPath: string;
  /** Share Space can copy all of it into rules. */
  compatible: boolean;
}

type Obj = Record<string, unknown>;

export interface MappedLine {
  ha: string;
  rules: string | null;
}

const areaNames = (hass: HomeAssistant): Record<string, string> =>
  Object.fromEntries(Object.values(hass.areas ?? {}).map((a) => [a.area_id, a.name]));

/** What a heating area is made of, to recognize actions on it. */
export interface HeatingTarget {
  area: string;
  entities: string[];
}

const HA_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAYS: WeekDay[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const asArray = (v: unknown): unknown[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

const whenText = (v: unknown, hass?: HomeAssistant): string => t("When {what}", { what: describe(v, hass) });
const ifText = (v: unknown, hass?: HomeAssistant): string => t("If {what}", { what: describe(v, hass) });
const thenText = (v: unknown, hass?: HomeAssistant): string => t("Then {what}", { what: describe(v, hass) });

const hhmm = (s: string): string => s.slice(0, 5);
const minutes = (s: string): number => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const fromMinutes = (m: number): string => {
  const x = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

function haDays(v: unknown): WeekDay[] | null {
  const days = asArray(v).map(String);
  if (days.includes("daily")) return [...DAYS];
  if (days.includes("workday")) return DAYS.slice(0, 5);
  if (days.includes("weekend")) return DAYS.slice(5);
  const out = days.map((d) => DAYS[HA_DAYS.indexOf(d as (typeof HA_DAYS)[number])]).filter(Boolean);
  return out.length ? out : null;
}

/** Seconds of an HA duration: "01:40:00", {hours, minutes, seconds} or a number of seconds. */
function durationSeconds(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^\d+:\d{2}(:\d{2})?$/.test(v)) {
    const [h, m, s = "0"] = v.split(":");
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  }
  if (isObj(v)) return Number(v.hours ?? 0) * 3600 + Number(v.minutes ?? 0) * 60 + Number(v.seconds ?? 0);
  return null;
}

const COMFORT_PRESETS = ["comfort", "confort", "home"];
const ECO_PRESETS = ["eco", "away", "sleep"];

interface HeatingCall {
  service: string;
  entities: string[];
  areas: string[];
  devices?: string[];
  data: Obj;
}

/** An action or Scheduler action as {service, targets, data}; null when it is not a service call. */
function callOf(a: unknown): HeatingCall | null {
  if (!isObj(a)) return null;
  const service = str(a.action) ?? str(a.service);
  if (!service) return null;
  const target = isObj(a.target) ? a.target : {};
  const data = { ...(isObj(a.data) ? a.data : {}), ...(isObj(a.service_data) ? a.service_data : {}) };
  const entities = [...asArray(target.entity_id), ...asArray(a.entity_id), ...asArray(data.entity_id)].map(String);
  delete data.entity_id;
  return { service, entities, areas: asArray(target.area_id).map(String), devices: asArray(target.device_id).map(String), data };
}

function hitsArea(hass: HomeAssistant, call: HeatingCall, target: HeatingTarget): boolean {
  const ofDevices = Object.values(hass.entities ?? {}).filter((e) => e.device_id && call.devices?.includes(e.device_id)).map((e) => e.entity_id);
  return (
    call.areas.includes(target.area) ||
    (call.devices ?? []).some((d) => hass.devices?.[d]?.area_id === target.area) ||
    [...call.entities, ...ofDevices].some((e) => target.entities.includes(e) || entityAreaId(hass, e) === target.area)
  );
}

const HEATING_DOMAINS = ["climate", "switch", "homeassistant", "input_boolean", "script", "scene"];

/** A call anywhere in the actions (inside choose, if, sequence...) that acts on the area's heating. */
function heatingCallIn(hass: HomeAssistant, v: unknown, target: HeatingTarget): boolean {
  if (Array.isArray(v)) return v.some((x) => heatingCallIn(hass, x, target));
  if (!isObj(v)) return false;
  const call = callOf(v);
  if (call && HEATING_DOMAINS.includes(call.service.split(".")[0]) && hitsArea(hass, call, target)) return true;
  return Object.values(v).some((x) => typeof x === "object" && heatingCallIn(hass, x, target));
}

/** Shown as it is in HA: Share Space cannot express it as rules. */
function readOnlyAutomation(hass: HomeAssistant, entityId: string, config: Obj, triggers: unknown[], conditions: unknown[], actions: unknown[]): ExistingHeating {
  const id = String(config.id ?? hass.states[entityId]?.attributes.id ?? "");
  const unmapped = [...triggers.map((x) => whenText(x, hass)), ...conditions.map((c) => ifText(c, hass)), ...actions.map((a) => thenText(a, hass))];
  return {
    kind: "automation",
    id,
    entityId,
    name: String(config.alias ?? entityId),
    enabled: hass.states[entityId]?.state !== "off",
    rules: [],
    unmapped,
    mapping: unmapped.map((ha) => ({ ha, rules: null })),
    haPath: `/config/automation/edit/${id}`,
    compatible: false,
  };
}

/** The Share Space action a heating service call means; null when it means something else. */
export function actionOf(call: HeatingCall): Action | null {
  const [domain, service] = call.service.split(".");
  if (domain === "climate" && service === "set_temperature" && typeof call.data.temperature === "number") {
    return { type: "temperature", value: call.data.temperature };
  }
  if (domain === "climate" && service === "set_preset_mode") {
    const preset = String(call.data.preset_mode ?? "").toLowerCase();
    if (COMFORT_PRESETS.includes(preset)) return { type: "comfort" };
    if (ECO_PRESETS.includes(preset)) return { type: "eco" };
    return null;
  }
  if (domain === "climate" && (service === "turn_off" || (service === "set_hvac_mode" && call.data.hvac_mode === "off"))) return { type: "off" };
  if (domain === "climate" && (service === "turn_on" || (service === "set_hvac_mode" && call.data.hvac_mode === "heat"))) return { type: "comfort" };
  if ((domain === "switch" || domain === "homeassistant") && service === "turn_on") return { type: "comfort" };
  if ((domain === "switch" || domain === "homeassistant") && service === "turn_off") return { type: "off" };
  return null;
}

/** The preset HA really sets when it is not the action's own name (sleep shown as Eco): kept visible in the label. */
const presetNote = (call: HeatingCall, action: Action): string => {
  if (call.service !== "climate.set_preset_mode") return "";
  const preset = String(call.data.preset_mode ?? "");
  return preset.toLowerCase() === action.type ? "" : ` (${preset})`;
};

const deviceName = (hass: HomeAssistant | undefined, id: unknown): string => {
  const d = hass?.devices?.[String(id)];
  return d?.name_by_user || d?.name || t("device {id}", { id: String(id) });
};

const entityName = (hass: HomeAssistant | undefined, id: string): string => String(hass?.states[id]?.attributes.friendly_name ?? id);

/** One trigger, condition or action in words, with names as HA shows them. */
const describe = (v: unknown, hass?: HomeAssistant): string => {
  const d = (x: unknown) => describe(x, hass);
  if (!isObj(v)) return String(v);
  if (Array.isArray(v.choose)) {
    const calls = (v.choose as unknown[]).flatMap((o) => (isObj(o) ? asArray(o.sequence) : [])).map(d);
    return t("choose: {actions}", { actions: calls.join(" · ") });
  }
  if (v.if !== undefined || v.then !== undefined) return t("if/then: {actions}", { actions: [...asArray(v.then), ...asArray(v.else)].map(d).join(" · ") });
  if (Array.isArray(v.sequence)) return v.sequence.map(d).join(" · ");
  const nested = asArray(v.conditions);
  if ((v.condition === "or" || v.condition === "and") && nested.length) {
    return t(v.condition === "or" ? "any of: {items}" : "all of: {items}", { items: nested.map(d).join(" · ") });
  }
  if (v.delay !== undefined) {
    const s = durationSeconds(v.delay);
    return t("wait {duration}", { duration: s === null ? JSON.stringify(v.delay) : `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` });
  }
  if ((v.condition === "device" || v.trigger === "device" || v.platform === "device") && v.device_id) {
    return `${deviceName(hass, v.device_id)} ${String(v.type ?? "").replace(/_/g, " ")}`.trim();
  }
  const call = callOf(v);
  if (call) {
    const data = Object.entries(call.data).map(([k, x]) => `${k} ${String(x)}`);
    const targets = [...call.entities.map((e) => entityName(hass, e)), ...(call.devices ?? []).map((x) => deviceName(hass, x)), ...call.areas];
    return [call.service, targets.join(", "), ...data].filter(Boolean).join(" ");
  }
  const kind = str(v.trigger) ?? str(v.platform) ?? str(v.condition);
  const entity = asArray(v.entity_id).map((e) => entityName(hass, String(e))).join(", ");
  const attr = v.attribute ? ` ${String(v.attribute)}` : "";
  const parts = [kind === "state" ? null : kind, entity + attr, v.state !== undefined ? t("is {state}", { state: asArray(v.state).join(` ${t("or")} `) }) : null, v.at ? t("at {time}", { time: String(v.at) }) : null];
  return parts.filter(Boolean).join(" ") || JSON.stringify(v);
};

// One HA condition saying "this area is heated": its heater switch on, or its thermostat on comfort.
function heatedAreaOf(hass: HomeAssistant, c: unknown): string | null {
  if (!isObj(c) || c.for) return null;
  const kind = kindOf(c);
  if (kind === "device" && c.type === "is_on" && (c.domain === "switch" || c.domain === "climate")) {
    return hass.devices?.[String(c.device_id)]?.area_id ?? null;
  }
  const entity = str(c.entity_id);
  if (kind !== "state" || !entity) return null;
  const state = String(c.state ?? "").toLowerCase();
  const [domain] = entity.split(".");
  const on =
    (domain === "switch" && !c.attribute && state === "on") ||
    (domain === "climate" && c.attribute === "preset_mode" && COMFORT_PRESETS.includes(state)) ||
    (domain === "climate" && !c.attribute && state === "heat");
  return on ? entityAreaId(hass, entity) ?? null : null;
}

/** Areas of an "any of these is heated" condition (a single one, or an "or" of them); null when it says more. */
function heatedAreasOf(hass: HomeAssistant, c: Obj): string[] | null {
  const parts = kindOf(c) === "or" ? asArray(c.conditions) : [c];
  const areas = parts.map((p) => heatedAreaOf(hass, p));
  if (!areas.length || areas.some((a) => !a)) return null;
  return [...new Set(areas as string[])];
}

// ---------------------------------------------------------------- automations

export interface ScheduleHelper {
  id: string;
  name: string;
  [day: string]: unknown;
}

/** Schedule helper whose ON blocks are an automation's time windows. */
type ScheduleRef = { entity: string; helper: ScheduleHelper } | null;

const kindOf = (v: Obj): string | null => str(v.trigger) ?? str(v.platform) ?? str(v.condition);

function scheduleWindows(helper: ScheduleHelper): { days: WeekDay[]; start: string; end: string }[] {
  const out: { days: WeekDay[]; start: string; end: string }[] = [];
  for (const [i, day] of DAYS.entries()) {
    for (const block of asArray(helper[day])) {
      if (!isObj(block)) continue;
      const start = hhmm(String(block.from));
      const end = String(block.to).startsWith("24") ? "24:00" : hhmm(String(block.to));
      const same = out.find((w) => w.start === start && w.end === end);
      if (same) same.days.push(DAYS[i]);
      else out.push({ days: [DAYS[i]], start, end });
    }
  }
  return out;
}

/** An automation acting on the area's heating, as rules; null when it does not drive that heating. */
export function automationAsHeating(
  hass: HomeAssistant,
  entityId: string,
  config: Obj,
  target: HeatingTarget,
  helpers: Record<string, ScheduleHelper> = {},
): ExistingHeating | null {
  const blueprint = isObj(config.use_blueprint) ? config.use_blueprint : null;
  if (blueprint?.path === RULES_BLUEPRINT_PATH) return null;
  const triggers = asArray(config.triggers ?? config.trigger);
  const conditions = asArray(config.conditions ?? config.condition);
  const actions = asArray(config.actions ?? config.action);
  const action = actions.findIndex((a) => {
    const call = callOf(a);
    return !!call && hitsArea(hass, call, target) && actionOf(call) !== null;
  });
  if (action < 0) return heatingCallIn(hass, actions, target) ? readOnlyAutomation(hass, entityId, config, triggers, conditions, actions) : null;
  const call = callOf(actions[action])!;
  const unmapped: string[] = [];
  const when: Condition[] = [];
  let trigger: number | null = null;
  let weekdayCondition: number | null = null;
  let schedule: ScheduleRef = null;
  let triggerDays: WeekDay[] | null = null;
  const names = areaNames(hass);
  // what each HA line became, filled once the window is known; undefined until then, null when not copied
  const trigMap: (string | null)[] = triggers.map(() => null);
  const condMap: (string | null)[] = conditions.map(() => null);
  const actMap: (string | null)[] = actions.map(() => null);

  triggers.forEach((tg, i) => {
    if (!isObj(tg)) return;
    const kind = kindOf(tg);
    const scheduleEntity = asArray(tg.entity_id).map(String).find((e) => e.startsWith("schedule."));
    if (kind === "time" && typeof tg.at === "string" && /^\d{2}:\d{2}/.test(tg.at) && trigger === null) {
      trigger = i;
      triggerDays = tg.weekday ? haDays(tg.weekday) : null;
    } else if (kind === "state" && scheduleEntity && helpers[scheduleEntity] && String(tg.to ?? "on") === "on" && !schedule) {
      schedule = { entity: scheduleEntity, helper: helpers[scheduleEntity] };
      trigMap[i] = "";
    } else unmapped.push(whenText(tg, hass));
  });

  const stateConds: Condition[] = [];
  conditions.forEach((c, i) => {
    if (!isObj(c)) return;
    const kind = kindOf(c);
    const entity = str(c.entity_id);
    if (kind === "time" && c.weekday && !c.after && !c.before && weekdayCondition === null) {
      weekdayCondition = i;
      triggerDays ??= haDays(c.weekday);
      condMap[i] = triggerDays ? describeCondition({ type: "weekday", days: triggerDays }) : t("every day");
    } else if (kind === "state" && entity?.startsWith("schedule.") && helpers[entity] && String(c.state) === "on" && !schedule) {
      schedule = { entity, helper: helpers[entity] };
      condMap[i] = "";
    } else if ((kind === "or" || kind === "state" || kind === "device") && heatedAreasOf(hass, c)) {
      stateConds.push({ type: "heated", areas: heatedAreasOf(hass, c)! });
      condMap[i] = describeCondition(stateConds[stateConds.length - 1], names);
    } else if (kind === "state" && entity && typeof c.state === "string" && !c.attribute && !c.for) {
      stateConds.push({ type: "state", entity, is: c.state });
      condMap[i] = describeCondition(stateConds[stateConds.length - 1], names);
    } else unmapped.push(ifText(c, hass));
  });

  const next = actions[action + 1];
  const delaySeconds = isObj(next) && next.delay !== undefined ? durationSeconds(next.delay) : null;
  const delay = delaySeconds !== null ? action + 1 : null;
  // after the window, the area goes back to what the rules say otherwise
  const after = delay !== null ? callOf(actions[delay + 1]) : null;
  const end = after && hitsArea(hass, after, target) && actionOf(after) !== null ? delay! + 1 : null;
  actions.forEach((a, i) => {
    if (i !== action && i !== delay && i !== end) unmapped.push(thenText(a, hass));
  });

  const then = actionOf(call)!;
  const days = (d: WeekDay[] | null): WeekdayCondition[] => (d && d.length < 7 ? [{ type: "weekday", days: d }] : []);
  const rules: Rule[] = [];
  const label = String(config.alias ?? entityId);
  const resolved = schedule as ScheduleRef;
  let windowEnd = "";
  if (resolved) {
    const windows = scheduleWindows(resolved.helper);
    for (const w of windows) {
      rules.push({ label, when: [...days(w.days), { type: "time", start: w.start, end: w.end }, ...stateConds], then });
    }
    const text = t("one rule per window of {name}: {windows}", { name: resolved.helper.name, windows: windows.map((w) => `${describeCondition({ type: "weekday", days: w.days })} ${w.start}–${w.end}`).join(" · ") });
    trigMap.forEach((v, i) => v === "" && (trigMap[i] = text));
    condMap.forEach((v, i) => v === "" && (condMap[i] = text));
  } else {
    const trg = trigger === null ? null : (triggers[trigger] as Obj);
    if (trg) {
      const start = hhmm(String(trg.at));
      windowEnd = delaySeconds !== null ? fromMinutes(minutes(start) + Math.round(delaySeconds / 60)) : fromMinutes(minutes(start) + 1);
      when.push({ type: "time", start, end: windowEnd });
      const d = trg.weekday ? haDays(trg.weekday) : null;
      trigMap[trigger!] = `${start}–${windowEnd}${d && d.length < 7 ? ` ${t("and {days}", { days: describeCondition({ type: "weekday", days: d }) })}` : ""}${delaySeconds === null ? ` ${t("(a one-minute window: nothing ends it)")}` : ""}`;
    }
    rules.push({ label, when: [...days(triggerDays), ...when, ...stateConds], then });
  }
  actMap[action] = t("then {action}", { action: `${describeAction(then)}${presetNote(call, then)}` });
  if (delay !== null) actMap[delay] = windowEnd ? t("the window ends at {time}", { time: windowEnd }) : t("the window end");
  if (end !== null) actMap[end] = t("after the window, the area's other rules apply");
  const mapping: MappedLine[] = [
    ...triggers.map((x, i) => ({ ha: whenText(x, hass), rules: trigMap[i] })),
    ...conditions.map((c, i) => ({ ha: ifText(c, hass), rules: condMap[i] })),
    ...actions.map((a, i) => ({ ha: thenText(a, hass), rules: actMap[i] })),
  ];
  const id = String(config.id ?? hass.states[entityId]?.attributes.id ?? "");
  return {
    kind: "automation",
    id,
    entityId,
    name: label,
    enabled: hass.states[entityId]?.state !== "off",
    rules,
    unmapped,
    mapping,
    haPath: `/config/automation/edit/${id}`,
    compatible: unmapped.length === 0,
  };
}

// ---------------------------------------------------------------- Scheduler component

export interface SchedulerItem {
  schedule_id: string;
  entity_id?: string;
  name?: string | null;
  weekdays: string[];
  timeslots: { start: string; stop?: string | null; actions: Obj[]; conditions?: unknown[] }[];
  enabled?: boolean;
  [key: string]: unknown;
}

/** A Scheduler item acting on the area's heating; one rule per timeslot doing a heating action. */
export function schedulerAsHeating(hass: HomeAssistant, item: SchedulerItem, target: HeatingTarget): ExistingHeating | null {
  const days = haDays(item.weekdays);
  const rules: Rule[] = [];
  const unmapped: string[] = [];
  const starts = item.timeslots.map((slot) => hhmm(slot.start));
  const mapping: MappedLine[] = [{ ha: t("Days: {days}", { days: asArray(item.weekdays).join(", ") }), rules: days && days.length < 7 ? describeCondition({ type: "weekday", days }) : t("every day") }];
  item.timeslots.forEach((slot, i) => {
    const call = slot.actions.map(callOf).find((c) => c && hitsArea(hass, c, target));
    const action = call ? actionOf(call) : null;
    const ha = `${hhmm(slot.start)}${slot.stop ? `–${hhmm(slot.stop)}` : ""}: ${slot.actions.map((a) => describe(a, hass)).join(" · ")}`;
    if (!call) {
      mapping.push({ ha, rules: null });
      return;
    }
    if (!action) {
      unmapped.push(`${hhmm(slot.start)}: ${call.service}`);
      mapping.push({ ha, rules: null });
      return;
    }
    const end = slot.stop ? hhmm(slot.stop) : starts[(i + 1) % starts.length] === starts[i] ? fromMinutes(minutes(starts[i]) + 1) : starts[(i + 1) % starts.length];
    rules.push({
      label: `${item.name || "Schedule"} ${hhmm(slot.start)}${presetNote(call, action)}`,
      when: [...(days && days.length < 7 ? [{ type: "weekday", days } as WeekdayCondition] : []), { type: "time", start: hhmm(slot.start), end: end === "00:00" ? "24:00" : end }],
      then: action,
    });
    const r = rules[rules.length - 1];
    mapping.push({ ha, rules: `${describeCondition(r.when[r.when.length - 1])}, ${t("then {action}", { action: `${describeAction(action)}${presetNote(call, action)}` })}${slot.stop ? "" : ` ${t("(until the next timeslot)")}`}` });
    if (asArray(slot.conditions).length) {
      const only = t("{time}: only if {conditions}", { time: hhmm(slot.start), conditions: asArray(slot.conditions).map((c) => describe(c, hass)).join(" · ") });
      mapping.push({ ha: only, rules: null });
      unmapped.push(only);
    }
  });
  if (!rules.length && !unmapped.length) return null;
  const entityId = item.entity_id ?? `switch.schedule_${item.schedule_id}`;
  return {
    kind: "scheduler",
    id: item.schedule_id,
    entityId,
    name: item.name || t("Schedule {id}", { id: item.schedule_id }),
    enabled: item.enabled ?? hass.states[entityId]?.state !== "off",
    rules,
    unmapped,
    mapping,
    haPath: `/config/entities?search=${encodeURIComponent(entityId)}`,
    compatible: unmapped.length === 0 && rules.length > 0,
  };
}

// ---------------------------------------------------------------- loading

const RULES_ID_RE = /^share_space_.+_rules(?:_\d+)?$/;

/** Everything in HA already driving the area's heating: automations (Schedule helpers expanded) and Scheduler items. */
export async function loadExistingHeating(hass: HomeAssistant, target: HeatingTarget): Promise<ExistingHeating[]> {
  const related = await hass
    .callWS<Record<string, string[]>>({ type: "search/related", item_type: "area", item_id: target.area })
    .catch(() => ({}) as Record<string, string[]>);
  const extra = target.entities.length
    ? await Promise.all(
        target.entities.map((e) =>
          hass.callWS<Record<string, string[]>>({ type: "search/related", item_type: "entity", item_id: e }).catch(() => ({}) as Record<string, string[]>),
        ),
      )
    : [];
  const automations = [...new Set([related, ...extra].flatMap((r) => r.automation ?? []))].filter((e) => {
    const id = hass.states[e]?.attributes.id;
    return typeof id === "string" && !RULES_ID_RE.test(id);
  });
  const configs = await Promise.all(
    automations.map(async (entityId) => {
      const id = String(hass.states[entityId].attributes.id);
      const config = await hass.callApi<Obj>("GET", `config/automation/config/${id}`).catch(() => null);
      return config ? { entityId, config: { id, ...config } } : null;
    }),
  );
  const scheduleEntities = new Set(
    configs.flatMap((c) =>
      c ? JSON.stringify(c.config).match(/schedule\.[a-z0-9_]+/g) ?? [] : [],
    ),
  );
  const helpers: Record<string, ScheduleHelper> = {};
  if (scheduleEntities.size) {
    const list = await hass.callWS<ScheduleHelper[]>({ type: "schedule/list" }).catch(() => []);
    for (const entity of scheduleEntities) {
      const name = hass.states[entity]?.attributes.friendly_name;
      const helper = list.find((h) => `schedule.${h.id}` === entity) ?? list.find((h) => h.name === name);
      if (helper) helpers[entity] = helper;
    }
  }
  const out: ExistingHeating[] = [];
  for (const c of configs) {
    const item = c && automationAsHeating(hass, c.entityId, c.config, target, helpers);
    if (item) out.push(item);
  }
  const scheduler = await hass.callWS<SchedulerItem[]>({ type: "scheduler" }).catch(() => [] as SchedulerItem[]);
  for (const s of scheduler) {
    const item = schedulerAsHeating(hass, s, target);
    if (item) out.push(item);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export const setExistingEnabled = (hass: HomeAssistant, item: ExistingHeating, on: boolean) =>
  hass.callService(item.kind === "automation" ? "automation" : "switch", on ? "turn_on" : "turn_off", { entity_id: item.entityId });
