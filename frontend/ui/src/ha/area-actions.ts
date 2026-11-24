import type { HomeAssistant } from "./hass";
import type { AreaActions, PlanningAction } from "./ws";

type Config = Record<string, unknown>;

/** Id of the HA automation that runs an area's actions when it becomes occupied or empty. */
export const areaActionsAutomationId = (area: string) => `share_space_${area}_occupancy`;

export const occupancySensor = (area: string) => `binary_sensor.share_space_${area}`;

const isObj = (v: unknown): v is Config => typeof v === "object" && v !== null && !Array.isArray(v);

const branch = (side: "on" | "off", sequence: PlanningAction[]) => ({
  conditions: [{ condition: "trigger", id: side }],
  sequence,
});

/** The HA automation holding an area's occupied/empty actions. */
export function areaActionsConfig(area: string, areaName: string, on: PlanningAction[], off: PlanningAction[]): Config {
  const sensor = occupancySensor(area);
  return {
    alias: `${areaName} occupied or empty`,
    description: "Share Space: runs when the area's planning says it becomes occupied or empty. Edit it here or in Share Space.",
    mode: "queued",
    triggers: [
      { trigger: "state", entity_id: sensor, from: "off", to: "on", id: "on" },
      { trigger: "state", entity_id: sensor, from: "on", to: "off", id: "off" },
    ],
    conditions: [],
    variables: { area, state: "{{ trigger.id }}" },
    actions: [{ choose: [branch("on", on), branch("off", off)] }],
  };
}

function chooseOf(config: Config): Config[] | null {
  const actions = Array.isArray(config.actions) ? config.actions : [];
  const step = actions.find((a) => isObj(a) && Array.isArray(a.choose));
  return step ? ((step as Config).choose as Config[]) : null;
}

const sideOf = (option: Config): string | null => {
  const conds = Array.isArray(option.conditions) ? option.conditions : [];
  const t = conds.find((c) => isObj(c) && c.condition === "trigger");
  return t ? String(asArray((t as Config).id)[0]) : null;
};

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

/** On/off actions of an area actions automation; null when it was reshaped in HA beyond them. */
export function readAreaActions(config: Config): Pick<AreaActions, "on_actions" | "off_actions"> | null {
  const options = chooseOf(config);
  if (!options) return null;
  const seq = (side: string) => {
    const o = options.find((x) => isObj(x) && sideOf(x) === side);
    return o ? (asArray(o.sequence) as PlanningAction[]) : [];
  };
  return { on_actions: seq("on"), off_actions: seq("off") };
}

/** Writes new on/off actions into an existing automation, leaving the rest as HA holds it. */
export function patchAreaActions(config: Config, on: PlanningAction[], off: PlanningAction[]): Config {
  const options = chooseOf(config);
  if (!options) throw new Error("This automation was changed in Home Assistant: edit its actions there.");
  const choose = [...options];
  for (const [side, sequence] of [["on", on], ["off", off]] as const) {
    const i = choose.findIndex((x) => isObj(x) && sideOf(x) === side);
    if (i >= 0) choose[i] = { ...choose[i], sequence };
    else choose.push(branch(side, sequence));
  }
  const actions = (config.actions as unknown[]).map((a) => (isObj(a) && Array.isArray(a.choose) ? { ...a, choose } : a));
  return { ...config, actions };
}

function automationEntity(hass: HomeAssistant, area: string): string | null {
  const id = areaActionsAutomationId(area);
  const hit = Object.entries(hass.states).find(([e, s]) => e.startsWith("automation.") && s.attributes.id === id);
  return hit ? hit[0] : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForEntity(hass: HomeAssistant | (() => HomeAssistant), area: string): Promise<string | null> {
  const get = typeof hass === "function" ? hass : () => hass;
  for (let i = 0; i < 20; i++) {
    const e = automationEntity(get(), area);
    if (e) return e;
    await sleep(250);
  }
  return null;
}

const legacyActions = (hass: HomeAssistant, area: string) =>
  hass.callWS<AreaActions | null>({ type: "share_space/get_area_actions", area }).catch(() => null);

const empty = (a: Pick<AreaActions, "on_actions" | "off_actions">) => !a.on_actions.length && !a.off_actions.length;

async function writeAutomation(hass: HomeAssistant, area: string, actions: AreaActions, existing: Config | null): Promise<void> {
  const id = areaActionsAutomationId(area);
  const name = hass.areas?.[area]?.name ?? area;
  const config = existing
    ? patchAreaActions(existing, actions.on_actions, actions.off_actions)
    : areaActionsConfig(area, name, actions.on_actions, actions.off_actions);
  await hass.callApi("POST", `config/automation/config/${id}`, config);
  if (!actions.enabled) {
    const entity = await waitForEntity(hass, area);
    if (entity) await hass.callService("automation", "turn_off", { entity_id: entity });
  }
}

/**
 * An area's occupied/empty actions, read from its HA automation. Actions Share Space kept itself before
 * are moved into that automation the first time an admin opens them.
 */
export async function getAreaActions(hass: HomeAssistant, area: string): Promise<AreaActions> {
  const entity = automationEntity(hass, area);
  if (entity) {
    const { config } = await hass.callWS<{ config: Config }>({ type: "automation/config", entity_id: entity });
    const read = readAreaActions(config) ?? { on_actions: [], off_actions: [] };
    return { ...read, enabled: hass.states[entity]?.state === "on" };
  }
  const legacy = await legacyActions(hass, area);
  if (!legacy) return { on_actions: [], off_actions: [], enabled: true };
  if (hass.user?.is_admin) {
    if (!empty(legacy)) await writeAutomation(hass, area, legacy, null);
    await hass.callWS({ type: "share_space/forget_area_actions", area });
  }
  return legacy;
}

/** Saves an area's actions into its HA automation (created on the first action, removed with the last). */
export async function setAreaActions(hass: HomeAssistant, area: string, partial: Partial<AreaActions>): Promise<void> {
  const current = await getAreaActions(hass, area);
  const next = { ...current, ...partial };
  const id = areaActionsAutomationId(area);
  const entity = automationEntity(hass, area);
  if (!entity) {
    if (!empty(next)) await writeAutomation(hass, area, next, null);
    return;
  }
  if (empty(next)) {
    await hass.callApi("DELETE", `config/automation/config/${id}`);
    return;
  }
  if ("on_actions" in partial || "off_actions" in partial) {
    const existing = await hass.callApi<Config>("GET", `config/automation/config/${id}`);
    await hass.callApi("POST", `config/automation/config/${id}`, patchAreaActions(existing, next.on_actions, next.off_actions));
  }
  if (next.enabled !== current.enabled) {
    await hass.callService("automation", next.enabled ? "turn_on" : "turn_off", { entity_id: entity });
  }
}

/** Runs an area's occupied or empty actions now, as its automation would. */
export async function runAreaActions(hass: HomeAssistant, area: string, state: "on" | "off"): Promise<void> {
  const actions = await getAreaActions(hass, area);
  const sequence = state === "on" ? actions.on_actions : actions.off_actions;
  if (sequence.length) await hass.callWS({ type: "execute_script", sequence, variables: { area, state } });
}
