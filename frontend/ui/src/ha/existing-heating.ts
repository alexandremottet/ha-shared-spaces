import type { Action, Condition, Rule, StateCondition, TimeCondition, WeekdayCondition } from "../rules/types";
import { RULES_BLUEPRINT_PATH } from "../rules/automation";
import type { WeekDay } from "../types/calendar";
import { entityAreaId } from "./area-heating";
import type { HomeAssistant } from "./hass";

/** Heating logic that already lives in HA (an automation or a Scheduler item), shown and edited as rules. */
export interface ExistingHeating {
  kind: "automation" | "scheduler";
  /** Automation config id, or Scheduler schedule_id. */
  id: string;
  entityId: string;
  name: string;
  enabled: boolean;
  rules: Rule[];
  /** What Share Space cannot express, described as HA shows it; kept untouched on save. */
  unmapped: string[];
  /** Where to edit it in HA. */
  haPath: string;
  /** Conditions the rules may use when edited. */
  editable: Condition["type"][];
  /** Share Space can show all of it as rules; otherwise it is read only (edit it in HA, or replace it). */
  compatible: boolean;
  source: AutomationSource | SchedulerSource;
}

type Obj = Record<string, unknown>;

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

const hhmm = (t: string): string => t.slice(0, 5);
const hhmmss = (t: string): string => (t.length === 5 ? `${t}:00` : t);
const minutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
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
const toHaDays = (days: WeekDay[]): string[] => days.map((d) => HA_DAYS[DAYS.indexOf(d)]);

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
  return { service, entities, areas: asArray(target.area_id).map(String), data };
}

function hitsArea(hass: HomeAssistant, call: HeatingCall, target: HeatingTarget): boolean {
  return call.areas.includes(target.area) || call.entities.some((e) => target.entities.includes(e) || entityAreaId(hass, e) === target.area);
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
  return {
    kind: "automation",
    id,
    entityId,
    name: String(config.alias ?? entityId),
    enabled: hass.states[entityId]?.state !== "off",
    rules: [],
    unmapped: [...triggers.map((t) => `When ${describe(t)}`), ...conditions.map((c) => `If ${describe(c)}`), ...actions.map((a) => `Then ${describe(a)}`)],
    haPath: `/config/automation/edit/${id}`,
    editable: [],
    compatible: false,
    source: { config, trigger: null, weekdayCondition: null, states: [], action: -1, delay: null, schedule: null },
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

/** The service call that does `action` on what the original call targeted, keeping its own way (preset, switch...). */
function callFor(action: Action, original: HeatingCall): { service: string; data: Obj } {
  const domain = original.service.split(".")[0];
  if (domain === "switch" || domain === "homeassistant") {
    return { service: `${domain}.${action.type === "off" ? "turn_off" : "turn_on"}`, data: {} };
  }
  if (action.type === "temperature") return { service: "climate.set_temperature", data: { temperature: action.value } };
  if (action.type === "off") return { service: "climate.set_hvac_mode", data: { hvac_mode: "off" } };
  if (original.service === "climate.set_preset_mode") {
    const preset = String(original.data.preset_mode ?? "");
    const comfort = COMFORT_PRESETS.includes(preset.toLowerCase());
    const same = (action.type === "comfort") === comfort;
    const name = same ? preset : action.type === "comfort" ? "comfort" : "eco";
    return { service: "climate.set_preset_mode", data: { preset_mode: name } };
  }
  return { service: "climate.set_preset_mode", data: { preset_mode: action.type } };
}

const describe = (v: unknown): string => {
  if (!isObj(v)) return String(v);
  if (Array.isArray(v.choose)) {
    const calls = (v.choose as unknown[]).flatMap((o) => (isObj(o) ? asArray(o.sequence) : [])).map(describe);
    return `choose: ${calls.join(" · ")}`;
  }
  if (v.if !== undefined || v.then !== undefined) return `if/then: ${[...asArray(v.then), ...asArray(v.else)].map(describe).join(" · ")}`;
  if (Array.isArray(v.sequence)) return v.sequence.map(describe).join(" · ");
  const nested = asArray(v.conditions);
  if ((v.condition === "or" || v.condition === "and") && nested.length) {
    return `${v.condition === "or" ? "any of" : "all of"}: ${nested.map(describe).join(" · ")}`;
  }
  const call = callOf(v);
  if (call) {
    const data = Object.entries(call.data).map(([k, x]) => `${k} ${String(x)}`);
    return [call.service, [...call.entities, ...call.areas].join(", "), ...data].filter(Boolean).join(" ");
  }
  const kind = str(v.trigger) ?? str(v.platform) ?? str(v.condition);
  const entity = asArray(v.entity_id).join(", ");
  const attr = v.attribute ? ` ${String(v.attribute)}` : "";
  const parts = [kind === "state" ? null : kind, entity + attr, v.state !== undefined ? `is ${asArray(v.state).join(" or ")}` : null, v.at ? `at ${String(v.at)}` : null];
  return parts.filter(Boolean).join(" ") || JSON.stringify(v);
};

// ---------------------------------------------------------------- automations

export interface ScheduleHelper {
  id: string;
  name: string;
  [day: string]: unknown;
}

export interface AutomationSource {
  config: Obj;
  /** Index of the `time` trigger the window starts at. */
  trigger: number | null;
  /** Index of the `time` condition holding the weekdays. */
  weekdayCondition: number | null;
  /** Indexes of plain `state` conditions, in rule order. */
  states: number[];
  /** Index of the heating action, and of a delay right after it that ends the window. */
  action: number;
  delay: number | null;
  /** Schedule helper whose ON blocks are the time windows (state trigger or condition on it). */
  schedule: { entity: string; helper: ScheduleHelper; ref: "trigger" | "condition"; index: number } | null;
}

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
  let schedule: AutomationSource["schedule"] = null;
  let triggerDays: WeekDay[] | null = null;

  triggers.forEach((t, i) => {
    if (!isObj(t)) return;
    const kind = kindOf(t);
    const scheduleEntity = asArray(t.entity_id).map(String).find((e) => e.startsWith("schedule."));
    if (kind === "time" && typeof t.at === "string" && /^\d{2}:\d{2}/.test(t.at) && trigger === null) {
      trigger = i;
      triggerDays = t.weekday ? haDays(t.weekday) : null;
    } else if (kind === "state" && scheduleEntity && helpers[scheduleEntity] && String(t.to ?? "on") === "on" && !schedule) {
      schedule = { entity: scheduleEntity, helper: helpers[scheduleEntity], ref: "trigger", index: i };
    } else unmapped.push(`When ${describe(t)}`);
  });

  const states: number[] = [];
  const stateConds: StateCondition[] = [];
  conditions.forEach((c, i) => {
    if (!isObj(c)) return;
    const kind = kindOf(c);
    const entity = str(c.entity_id);
    if (kind === "time" && c.weekday && !c.after && !c.before && weekdayCondition === null) {
      weekdayCondition = i;
      triggerDays ??= haDays(c.weekday);
    } else if (kind === "state" && entity?.startsWith("schedule.") && helpers[entity] && String(c.state) === "on" && !schedule) {
      schedule = { entity, helper: helpers[entity], ref: "condition", index: i };
    } else if (kind === "state" && entity && typeof c.state === "string" && !c.attribute && !c.for) {
      states.push(i);
      stateConds.push({ type: "state", entity, is: c.state });
    } else unmapped.push(`If ${describe(c)}`);
  });

  const next = actions[action + 1];
  const delaySeconds = isObj(next) && next.delay !== undefined ? durationSeconds(next.delay) : null;
  const delay = delaySeconds !== null ? action + 1 : null;
  actions.forEach((a, i) => {
    if (i !== action && i !== delay) unmapped.push(`Then ${describe(a)}`);
  });

  const then = actionOf(call)!;
  const days = (d: WeekDay[] | null): WeekdayCondition[] => (d && d.length < 7 ? [{ type: "weekday", days: d }] : []);
  const rules: Rule[] = [];
  const label = String(config.alias ?? entityId);
  const resolved = schedule as AutomationSource["schedule"];
  if (resolved) {
    for (const w of scheduleWindows(resolved.helper)) {
      rules.push({ label, when: [...days(w.days), { type: "time", start: w.start, end: w.end }, ...stateConds], then });
    }
  } else {
    const t = trigger === null ? null : (triggers[trigger] as Obj);
    if (t) {
      const start = hhmm(String(t.at));
      const end = delaySeconds !== null ? fromMinutes(minutes(start) + Math.round(delaySeconds / 60)) : fromMinutes(minutes(start) + 1);
      when.push({ type: "time", start, end });
    }
    rules.push({ label, when: [...days(triggerDays), ...when, ...stateConds], then });
  }
  const id = String(config.id ?? hass.states[entityId]?.attributes.id ?? "");
  return {
    kind: "automation",
    id,
    entityId,
    name: label,
    enabled: hass.states[entityId]?.state !== "off",
    rules,
    unmapped,
    haPath: `/config/automation/edit/${id}`,
    editable: ["weekday", "time", "state"],
    compatible: unmapped.length === 0,
    source: { config, trigger, weekdayCondition, states, action, delay, schedule: resolved },
  };
}

/** The automation config, and the schedule helper blocks when the windows come from one, after editing the rules. */
export function automationFromRules(item: ExistingHeating, rules: Rule[]): { config: Obj; schedule: ScheduleHelper | null } {
  const src = item.source as AutomationSource;
  const config = structuredClone(src.config);
  const tKey = config.triggers !== undefined || config.trigger === undefined ? "triggers" : "trigger";
  const cKey = config.conditions !== undefined || config.condition === undefined ? "conditions" : "condition";
  const aKey = config.actions !== undefined || config.action === undefined ? "actions" : "action";
  const triggers = asArray(config[tKey]) as Obj[];
  const conditions = asArray(config[cKey]) as Obj[];
  const actions = asArray(config[aKey]) as Obj[];
  const first = rules[0];
  if (!first) throw new Error("A Home Assistant automation keeps at least one rule");
  const thenKey = JSON.stringify(first.then);
  if (rules.some((r) => JSON.stringify(r.then) !== thenKey)) throw new Error("All windows of one automation do the same thing");
  for (const c of rules.flatMap((r) => r.when)) {
    if (!item.editable.includes(c.type)) throw new Error(`A Home Assistant automation cannot hold "${c.type}" here: edit it in Home Assistant`);
  }

  const drop = new Set<number>();
  let schedule: ScheduleHelper | null = null;
  if (src.schedule) {
    schedule = { id: src.schedule.helper.id, name: src.schedule.helper.name };
    for (const day of DAYS) schedule[day] = [];
    for (const r of rules) {
      const time = r.when.find((c): c is TimeCondition => c.type === "time");
      if (!time) throw new Error("Each schedule window needs a time");
      const days = r.when.find((c): c is WeekdayCondition => c.type === "weekday")?.days ?? DAYS;
      for (const d of days) (schedule[d] as Obj[]).push({ from: hhmmss(time.start), to: time.end === "24:00" ? "24:00:00" : hhmmss(time.end) });
    }
  } else {
    if (rules.length > 1) throw new Error("This automation runs at one time: add another automation in Home Assistant for another time");
    const time = first.when.find((c): c is TimeCondition => c.type === "time");
    const days = first.when.find((c): c is WeekdayCondition => c.type === "weekday")?.days ?? null;
    if (src.trigger !== null && time) {
      triggers[src.trigger] = { ...triggers[src.trigger], at: hhmmss(time.start) };
      if (src.delay !== null) {
        const length = (minutes(time.end === "24:00" ? "24:00" : time.end) - minutes(time.start) + 1440) % 1440 || 1440;
        actions[src.delay] = { ...actions[src.delay], delay: { hours: Math.floor(length / 60), minutes: length % 60, seconds: 0 } };
      }
    } else if (time) throw new Error("This automation does not start at a time: change its trigger in Home Assistant");
    const trig = src.trigger === null ? null : triggers[src.trigger];
    if (trig && trig.weekday !== undefined) {
      if (days && days.length < 7) trig.weekday = toHaDays(days);
      else delete trig.weekday;
    } else if (src.weekdayCondition !== null) {
      if (days && days.length < 7) conditions[src.weekdayCondition] = { ...conditions[src.weekdayCondition], weekday: toHaDays(days) };
      else drop.add(src.weekdayCondition);
    } else if (days && days.length < 7) conditions.push({ condition: "time", weekday: toHaDays(days) });
  }

  const wanted = first.when.filter((c): c is StateCondition => c.type === "state");
  const kept = src.states.slice(0, wanted.length);
  kept.forEach((idx, i) => (conditions[idx] = { ...conditions[idx], entity_id: wanted[i].entity, state: wanted[i].is }));
  for (const i of src.states.slice(wanted.length)) drop.add(i);
  const extra = wanted.slice(kept.length).map((s) => ({ condition: "state", entity_id: s.entity, state: s.is }));
  const nextConditions = [...conditions.filter((_, i) => !drop.has(i)), ...extra];

  const original = callOf(actions[src.action])!;
  const call = callFor(first.then, original);
  const prev = actions[src.action];
  const serviceKey = prev.action !== undefined ? "action" : "service";
  actions[src.action] = { ...prev, [serviceKey]: call.service, data: { ...call.data } };

  config[tKey] = triggers;
  config[cKey] = nextConditions;
  config[aKey] = actions;
  return { config, schedule };
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

export interface SchedulerSource {
  item: SchedulerItem;
  /** Timeslot index per rule. */
  slots: number[];
}

/** A Scheduler item acting on the area's heating; one rule per timeslot doing a heating action. */
export function schedulerAsHeating(hass: HomeAssistant, item: SchedulerItem, target: HeatingTarget): ExistingHeating | null {
  const days = haDays(item.weekdays);
  const rules: Rule[] = [];
  const slots: number[] = [];
  const unmapped: string[] = [];
  const starts = item.timeslots.map((t) => hhmm(t.start));
  item.timeslots.forEach((slot, i) => {
    const call = slot.actions.map(callOf).find((c) => c && hitsArea(hass, c, target));
    const action = call ? actionOf(call) : null;
    if (!call) return;
    if (!action) {
      unmapped.push(`${hhmm(slot.start)}: ${call.service}`);
      return;
    }
    const end = slot.stop ? hhmm(slot.stop) : starts[(i + 1) % starts.length] === starts[i] ? fromMinutes(minutes(starts[i]) + 1) : starts[(i + 1) % starts.length];
    rules.push({
      label: `${item.name || "Schedule"} ${hhmm(slot.start)}`,
      when: [...(days && days.length < 7 ? [{ type: "weekday", days } as WeekdayCondition] : []), { type: "time", start: hhmm(slot.start), end: end === "00:00" ? "24:00" : end }],
      then: action,
    });
    slots.push(i);
    if (asArray(slot.conditions).length) unmapped.push(`${hhmm(slot.start)}: only if ${asArray(slot.conditions).map(describe).join(" · ")}`);
  });
  if (!rules.length && !unmapped.length) return null;
  const entityId = item.entity_id ?? `switch.schedule_${item.schedule_id}`;
  return {
    kind: "scheduler",
    id: item.schedule_id,
    entityId,
    name: item.name || `Schedule ${item.schedule_id}`,
    enabled: item.enabled ?? hass.states[entityId]?.state !== "off",
    rules,
    unmapped,
    haPath: `/config/entities?search=${encodeURIComponent(entityId)}`,
    editable: ["weekday", "time"],
    compatible: unmapped.length === 0 && rules.length > 0,
    source: { item, slots },
  };
}

/** The `scheduler.edit` service data after editing the rules (same timeslots, new times, days and actions). */
export function schedulerFromRules(item: ExistingHeating, rules: Rule[]): Obj {
  const src = item.source as SchedulerSource;
  if (rules.length !== src.slots.length) throw new Error("Add or remove Scheduler timeslots in Home Assistant");
  const timeslots = structuredClone(src.item.timeslots);
  let days: WeekDay[] | null = null;
  rules.forEach((r, n) => {
    for (const c of r.when) {
      if (!item.editable.includes(c.type)) throw new Error(`A Scheduler timeslot cannot hold "${c.type}": edit it in Home Assistant`);
    }
    const d = r.when.find((c): c is WeekdayCondition => c.type === "weekday")?.days ?? [...DAYS];
    if (days && JSON.stringify(days) !== JSON.stringify(d)) throw new Error("All timeslots of one Scheduler item run on the same days");
    days = d;
    const slot = timeslots[src.slots[n]];
    const time = r.when.find((c): c is TimeCondition => c.type === "time");
    if (time) {
      slot.start = hhmmss(time.start);
      if (slot.stop) slot.stop = time.end === "24:00" ? "00:00:00" : hhmmss(time.end);
    }
    slot.actions = slot.actions.map((a) => {
      const call = callOf(a);
      if (!call || actionOf(call) === null) return a;
      const next = callFor(r.then, call);
      return { ...a, service: next.service, service_data: next.data };
    });
  });
  const weekdays = !days || (days as WeekDay[]).length === 7 ? ["daily"] : toHaDays(days);
  return { entity_id: item.entityId, weekdays, timeslots };
}

// ---------------------------------------------------------------- loading and saving

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

/** Write edited rules back into the same HA object. */
export async function saveExistingHeating(hass: HomeAssistant, item: ExistingHeating, rules: Rule[]): Promise<void> {
  if (!item.compatible) throw new Error("Share Space cannot express all of it: edit it in Home Assistant, or replace it with Share Space rules");
  if (item.kind === "scheduler") {
    await hass.callService("scheduler", "edit", schedulerFromRules(item, rules));
    return;
  }
  const { config, schedule } = automationFromRules(item, rules);
  if (schedule) {
    const { id, ...fields } = schedule;
    await hass.callWS({ type: "schedule/update", schedule_id: id, ...fields });
  }
  const { id: _id, ...body } = config;
  await hass.callApi("POST", `config/automation/config/${item.id}`, body);
}

export const setExistingEnabled = (hass: HomeAssistant, item: ExistingHeating, on: boolean) =>
  hass.callService(item.kind === "automation" ? "automation" : "switch", on ? "turn_on" : "turn_off", { entity_id: item.entityId });
