import { RULES_BLUEPRINT_PATH, WEEK_DAYS, evaluateRules, nextOff, rulesAutomationConfig, sensorReadings, nextOn, occupiedAt, previousOff, wallTime, windowMatches } from "ha-share-space-ui";
import type { Calendar, RuleStrategy, Schedule, ScheduleRanges } from "ha-share-space-ui";
import { areaActionsAutomationId, areaActionsConfig, readAreaActions } from "ha-share-space-ui/ha";
import type { AreaActions, Floorplan, HassEntity, HomeAssistant, SchedulerItem } from "ha-share-space-ui/ha";
import { MockClock } from "./clock";
import { HeatingZoneSim, templateSyntaxError } from "./heating";
import type { ClimateInfo, ZoneConfig } from "./heating";
import { DAYS, isOccupied, mergeCalendars, nextChange, scheduleToRanges, toIsoLocal, SLOT_MINUTES } from "./planning";
import { DEFAULT_OUTDOOR, OUTDOOR_SENSOR, STARTERS, demoSeed, defaultStartTime, starterRules } from "./seed";
import type { ActionLogEntry, HeatingLogEntry, InstalledBackends, MockOptions, SeedData } from "./types";

export type MockHassEvent = { event_type: string; data: Record<string, unknown> };

interface ClimateRec {
  entity_id: string;
  name: string;
  setpoint: number;
  current_temperature: number;
  min: number;
  max: number;
  step: number;
  hvac_off?: boolean;
}

export interface StrategyAutomationRec {
  entityId: string;
  config: {
    alias: string;
    description?: string;
    use_blueprint?: { path: string; input: Record<string, unknown> };
    [key: string]: unknown;
  };
  enabled: boolean;
  lastTriggered: number | null;
}

export interface MockState {
  installed: InstalledBackends;
  persons: Array<{ entity_id: string; name: string; userId: string; isAdmin: boolean; userData?: Record<string, unknown> }>;
  areas: Array<{ area_id: string; name: string }>;
  calendars: Record<string, Partial<Calendar>>;
  personAreas: Record<string, string>;
  forcedPresence: Record<string, boolean>;
  currentUserId: string;
  actionsLog: ActionLogEntry[];
  heatingLog: HeatingLogEntry[];
}

type WsHandler = (msg: Record<string, unknown>) => unknown;
type ServiceHandler = (data: Record<string, unknown>) => void;

const HA_ERROR = (code: string, message: string) => ({ code, message });
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const round1 = (n: number) => Math.round(n * 10) / 10;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export class MockHassController {
  readonly clock: MockClock;
  readonly installed: InstalledBackends;
  private _hass!: HomeAssistant;
  private _state: MockState;
  private _seed: SeedData;
  private _options: MockOptions;
  private _entities = new Map<string, HassEntity>();
  private _climates = new Map<string, ClimateRec>();
  private _zones = new Map<string, HeatingZoneSim>();
  private _floorplans: Floorplan[] = [];
  private _knownAreas = new Set<string>();
  private _lastOn = new Map<string, boolean>();
  private _scheduleCache = new Map<string, { version: number; schedule: Schedule }>();
  private _occCache = new Map<string, { key: string; on: boolean; next: string | null }>();
  private _rangesCache = new Map<string, { version: number; ranges: ScheduleRanges }>();
  private _extraCache = new Map<string, { key: string; attrs: Record<string, string | boolean | null> }>();
  private _automations = new Map<string, StrategyAutomationRec>();
  private _strategies = new Map<string, { id: string; name: string; rules: RuleStrategy; previous: RuleStrategy | null }>();
  // Settings outdoor sensor (rules alias "outdoor"); the demo has one.
  private _outdoorEntity: string | null = OUTDOOR_SENSOR;
  private _autoLast = new Map<string, string>();
  // Heating already in HA before Share Space: Schedule helpers and Scheduler component items.
  private _scheduleHelpers: Array<Record<string, unknown> & { id: string; name: string }> = [];
  private _schedulerItems: SchedulerItem[] = [];
  private _planningVersion = 0;
  private _dirty = true;
  private _listeners = new Set<(hass: HomeAssistant) => void>();
  private _eventListeners = new Map<string, Set<(e: MockHassEvent) => void>>();
  private _logId = 0;
  private _lastClockTick = 0;
  private _unsubClock: () => void;
  private _ws = new Map<string, { backend: keyof InstalledBackends | null; admin?: boolean; fn: WsHandler }>();
  private _services = new Map<string, { backend: keyof InstalledBackends | null; fn: ServiceHandler; admin: boolean }>();
  private _responseServices = new Map<string, { backend: keyof InstalledBackends | null; fn: (data: Record<string, unknown>) => unknown }>();

  constructor(options: MockOptions = {}) {
    this._options = options;
    this._seed = options.seed ?? demoSeed();
    this.installed = { planning: true, heating: true, space: true, ...options.installed };
    this.clock = new MockClock(options.startTime ?? defaultStartTime(), options.timeZone);
    this._state = this._initialState();
    this._loadSeed();
    this._registerHandlers();
    this._lastClockTick = this.clock.now();
    this._unsubClock = this.clock.subscribe(() => this._onClock());
    if (options.playing !== false) this.clock.play();
    this._settle(true);
  }

  get hass(): HomeAssistant {
    return this._hass;
  }

  get state(): Readonly<MockState> {
    return this._state;
  }

  get tz(): string {
    return this.clock.timeZone;
  }

  get zones(): readonly HeatingZoneSim[] {
    return [...this._zones.values()];
  }

  subscribe(listener: (hass: HomeAssistant) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  dispose(): void {
    this._unsubClock();
    this.clock.dispose();
    this._listeners.clear();
  }

  reset(): void {
    this._seed = this._options.seed ?? demoSeed();
    this._state = this._initialState();
    this._entities.clear();
    this._climates.clear();
    this._zones.clear();
    this._knownAreas.clear();
    this._lastOn.clear();
    this._scheduleCache.clear();
    this._occCache.clear();
    this._rangesCache.clear();
    this._extraCache.clear();
    this._automations.clear();
    this._strategies.clear();
    this._autoLast.clear();
    for (const id of [...this._entities.keys()]) if (id.startsWith("automation.")) this._entities.delete(id);
    this._loadSeed();
    this._settle(true);
  }

  setInstalled(patch: Partial<InstalledBackends>): void {
    Object.assign(this.installed, patch);
    this._settle(true);
  }

  setUser(userId: string): void {
    this._state = { ...this._state, currentUserId: userId };
    this._settle(true);
  }

  areaSchedule(area: string): Schedule {
    return this._schedule(area);
  }

  areaCalendars(area: string): Record<string, Partial<Calendar>> {
    const out: Record<string, Partial<Calendar>> = {};
    for (const [person, a] of Object.entries(this._state.personAreas)) {
      if (a === area && this._state.calendars[person]) out[person] = this._state.calendars[person];
    }
    return out;
  }

  areaOccupancy(area: string): { on: boolean; next_change: string | null } | null {
    return this._knownAreas.has(area) ? this._occupancy(area) : null;
  }

  nextEventTime(): number | null {
    const times: number[] = [];
    for (const area of this._knownAreas) {
      const nc = this._occupancy(area).next_change;
      if (nc) times.push(Date.parse(nc));
    }
    for (const z of this._zones.values()) if (z.overrideUntil) times.push(z.overrideUntil);
    const now = this.clock.now();
    const future = times.filter((t) => t > now);
    return future.length ? Math.min(...future) : null;
  }

  jumpToNextEvent(): boolean {
    const t = this.nextEventTime();
    if (t === null) return false;
    this.clock.set(t + 1000);
    return true;
  }

  forcePresence(area: string, value: boolean | null): void {
    const forced = { ...this._state.forcedPresence };
    if (value === null) delete forced[area];
    else forced[area] = value;
    this._state = { ...this._state, forcedPresence: forced };
    this._settle(true);
  }

  /** Outdoor reading used by "Follow outdoor temperature" rules. */
  get outdoor(): number {
    return Number(this._entities.get(OUTDOOR_SENSOR)?.state ?? DEFAULT_OUTDOOR);
  }

  setOutdoor(temp: number): void {
    this._setOutdoorEntity(temp);
    this._settle(true);
  }

  private _setOutdoorEntity(temp: number): void {
    this._setEntity(OUTDOOR_SENSOR, String(temp), { friendly_name: "Outdoor temperature", unit_of_measurement: "°C", device_class: "temperature" });
  }

  /** Dev: restore the "Old building" starter and use it for Open space. */
  loadDemoRules(): void {
    this._seedDemoRules();
    this._settle(true);
  }

  // Demo: Open space runs the shared outdoor preheat strategy (saved like the panel would).
  private _seedDemoRules(): void {
    const zone = [...this._zones.values()].find((z) => z.config.entry_id === "zone_open_space");
    if (!zone) return;
    const name = "Old building";
    const sid = "old_building";
    this._strategies.set(sid, { id: sid, name, rules: starterRules(sid), previous: null });
    const entity = this._zoneEntityId(zone.config);
    const config = rulesAutomationConfig({ entity_id: entity, name: zone.config.name }, "open_space", { strategy: sid, name });
    const id = `share_space_${entity.slice(entity.indexOf(".") + 1)}_rules`;
    const existing = this._automations.get(id);
    this._autoLast.delete(id);
    this._automations.set(id, {
      entityId: existing?.entityId ?? this._freeAutomationEntity("automation.share_space_open_space_custom_rules"),
      config: { ...config },
      enabled: true,
      lastTriggered: null,
    });
  }

  // Demo: heating the Workshop already gets from HA (an automation, a Schedule helper, a Scheduler item).
  private _seedExistingHeating(): void {
    const workdays = ["mon", "tue", "wed", "thu", "fri"];
    const add = (id: string, config: StrategyAutomationRec["config"]) =>
      this._automations.set(id, { entityId: this._freeAutomationEntity(`automation.${slugify(config.alias)}`), config, enabled: true, lastTriggered: null });
    add("lunch_preheat", {
      alias: "Lunch preheat",
      description: "",
      triggers: [{ trigger: "time", at: "11:30:00", weekday: workdays }],
      conditions: [{ condition: "or", conditions: [{ condition: "state", entity_id: "climate.open_space", attribute: "preset_mode", state: "comfort" }] }],
      actions: [
        { action: "climate.set_preset_mode", target: { entity_id: "climate.workshop" }, data: { preset_mode: "comfort" } },
        { delay: { hours: 1, minutes: 40, seconds: 0 } },
        { action: "climate.set_preset_mode", target: { entity_id: "climate.workshop" }, data: { preset_mode: "eco" } },
      ],
    });
    add("workshop_sunset", {
      alias: "Workshop at sunset",
      description: "",
      triggers: [{ trigger: "sun", event: "sunset" }],
      conditions: [],
      actions: [{ choose: [{ conditions: [], sequence: [{ action: "climate.set_hvac_mode", target: { entity_id: "climate.workshop" }, data: { hvac_mode: "auto" } }] }] }],
    });
    this._scheduleHelpers = [
      {
        id: "workshop_hours",
        name: "Workshop hours",
        ...Object.fromEntries(["monday", "tuesday", "wednesday", "thursday"].map((d) => [d, [{ from: "08:00:00", to: "17:00:00" }]])),
        friday: [{ from: "08:00:00", to: "12:00:00" }],
      },
    ];
    add("workshop_hours_heat", {
      alias: "Workshop hours heat",
      description: "",
      triggers: [{ trigger: "state", entity_id: "schedule.workshop_hours", to: "on" }],
      conditions: [],
      actions: [{ action: "climate.set_temperature", target: { area_id: "workshop" }, data: { temperature: 19 } }],
    });
    this._schedulerItems = [
      {
        schedule_id: "a1b2c3",
        entity_id: "switch.schedule_a1b2c3",
        name: "Workshop weekend",
        weekdays: ["weekend"],
        enabled: true,
        timeslots: [
          { start: "09:00:00", actions: [{ service: "climate.set_temperature", entity_id: "climate.workshop", service_data: { temperature: 16 } }] },
          { start: "18:00:00", actions: [{ service: "climate.set_hvac_mode", entity_id: "climate.workshop", service_data: { hvac_mode: "off" } }] },
        ],
      },
    ];
  }

  simulateThermostatChange(climateEntity: string, temperature: number): void {
    this._callService("climate", "set_temperature", { entity_id: climateEntity, temperature });
  }

  updateZone(entryId: string, patch: Partial<ZoneConfig>): void {
    this._zones.get(entryId)?.patchConfig(patch);
    this._settle(true);
  }

  /** Strategy automations stored in the mock (dev controls). */
  automations(): Array<{ id: string; entityId: string; alias: string; description: string; blueprint: string | null; enabled: boolean }> {
    return [...this._automations.entries()].map(([id, a]) => ({
      id,
      entityId: a.entityId,
      alias: a.config.alias,
      description: a.config.description ?? "",
      blueprint: a.config.use_blueprint?.path ?? null,
      enabled: a.enabled,
    }));
  }

  /** Dev: simulate editing an automation in HA's editor (alias changes, description untouched). */
  simulateAutomationEdit(id: string): void {
    const a = this._automations.get(id);
    if (!a) return;
    a.config = { ...a.config, alias: `${a.config.alias} (edited in HA)` };
    this._settle(true);
  }

  /** Dev: simulate HA's "Take control" (blueprint expanded, use_blueprint removed). */
  simulateTakeControl(id: string): void {
    const a = this._automations.get(id);
    if (!a?.config.use_blueprint) return;
    const { use_blueprint: _bp, ...rest } = a.config;
    a.config = { ...rest, triggers: [{ trigger: "time_pattern", minutes: "/5" }], conditions: [], actions: [] };
    this._autoLast.delete(id);
    this._settle(true);
  }

  emitEvent(event_type: string, data: Record<string, unknown> = {}): void {
    for (const l of this._eventListeners.get(event_type) ?? []) l({ event_type, data });
  }

  private _initialState(): MockState {
    const seed = this._seed;
    const persons = seed.persons.map((p) => ({
      entity_id: `person.${p.slug}`,
      name: p.name,
      userId: p.userId,
      isAdmin: p.isAdmin,
      userData: p.userData,
    }));
    return {
      installed: this.installed,
      persons,
      areas: clone(seed.areas),
      calendars: clone(seed.calendars),
      personAreas: { ...seed.personAreas },
      forcedPresence: {},
      currentUserId: this._options.userId ?? persons[0]?.userId ?? "",
      actionsLog: [],
      heatingLog: [],
    };
  }

  private _loadSeed(): void {
    for (const c of this._seed.climates) this._climates.set(c.entity_id, { ...c });
    this._floorplans = clone(this._seed.floorplans);
    for (const z of this._seed.zones) this._addZone({ ...z });
    for (const s of this._seed.switches) this._setEntity(s.entity_id, s.state, { friendly_name: s.name });
    this._setOutdoorEntity(DEFAULT_OUTDOOR);
    // Like the integration's first load: seed the starter shared strategies.
    for (const st of STARTERS) this._strategies.set(st.id, { ...clone(st), previous: null });
    // Like HA: occupied/empty actions are automations triggered by the area's occupancy sensor.
    for (const [area, a] of Object.entries(this._seed.areaActions)) {
      const name = this._state.areas.find((x) => x.area_id === area)?.name ?? area;
      const config = areaActionsConfig(area, name, a.on_actions, a.off_actions) as StrategyAutomationRec["config"];
      this._automations.set(areaActionsAutomationId(area), {
        entityId: this._freeAutomationEntity(`automation.${slugify(String(config.alias))}`),
        config,
        enabled: a.enabled,
        lastTriggered: null,
      });
    }
    if (this._options.demoRules) this._seedDemoRules();
    if (this._options.demoRules) this._seedExistingHeating();
    for (const area of new Set(Object.values(this._state.personAreas))) this._knownAreas.add(area);
  }

  private _env() {
    return {
      now: this.clock.now,
      presenceOf: (id: string) => {
        const s = this._entities.get(id)?.state;
        return s === "on" ? true : s === "off" ? false : null;
      },
      climate: (id: string): ClimateInfo | null => {
        const c = this._climates.get(id);
        return c
          ? { setpoint: c.setpoint, min: c.min, max: c.max, step: c.step, current_temperature: round1(c.current_temperature) }
          : null;
      },
      setClimate: (id: string, temp: number) => this._setSetpoint(id, temp),
      setHvac: (id: string, on: boolean) => {
        const c = this._climates.get(id);
        if (c) c.hvac_off = !on;
        this._dirty = true;
      },
    };
  }

  private _addZone(config: ZoneConfig): HeatingZoneSim {
    const zone = new HeatingZoneSim(config, this._env());
    this._zones.set(config.entry_id, zone);
    return zone;
  }

  private _setSetpoint(id: string, temp: number): void {
    const c = this._climates.get(id);
    if (!c) throw HA_ERROR("service_validation_error", `Entity ${id} not found`);
    c.setpoint = Math.min(Math.max(temp, c.min), c.max);
    this._dirty = true;
  }

  private _setEntity(id: string, state: string, attributes: Record<string, unknown>): void {
    const prev = this._entities.get(id);
    if (prev && prev.state === state && JSON.stringify(prev.attributes) === JSON.stringify(attributes)) return;
    this._entities.set(id, { entity_id: id, state, attributes, last_changed: new Date(this.clock.now()).toISOString() });
    this._dirty = true;
  }

  private _removeEntity(id: string): void {
    if (this._entities.delete(id)) this._dirty = true;
  }

  private _schedule(area: string): Schedule {
    const hit = this._scheduleCache.get(area);
    if (hit && hit.version === this._planningVersion) return hit.schedule;
    const calendars = Object.values(this.areaCalendars(area));
    const schedule = mergeCalendars(calendars);
    this._scheduleCache.set(area, { version: this._planningVersion, schedule });
    return schedule;
  }

  private _ranges(area: string): ScheduleRanges {
    const hit = this._rangesCache.get(area);
    if (hit && hit.version === this._planningVersion) return hit.ranges;
    const ranges = scheduleToRanges(this._schedule(area));
    this._rangesCache.set(area, { version: this._planningVersion, ranges });
    return ranges;
  }

  private _planningExtras(area: string): Record<string, string | boolean | null> {
    const now = this.clock.now();
    const key = `${this._planningVersion}:${Math.floor(now / (SLOT_MINUTES * 60000))}`;
    const hit = this._extraCache.get(area);
    if (hit && hit.key === key) return hit.attrs;
    const ranges = this._ranges(area);
    const tz = this.tz;
    const iso = (t: number | null) => (t === null ? null : new Date(t).toISOString());
    const on = nextOn(ranges, now, tz);
    const w = wallTime(now, tz);
    const sameDay = (t: number) => {
      const o = wallTime(t, tz);
      return o.year === w.year && o.month === w.month && o.day === w.day;
    };
    const attrs = {
      next_on: iso(on),
      next_off: iso(nextOff(ranges, now, tz)),
      previous_off: iso(previousOff(ranges, now, tz)),
      occupied_today: occupiedAt(ranges, now, tz) || (on !== null && sameDay(on)),
      occupied_tomorrow: (ranges[WEEK_DAYS[(w.weekday + 1) % 7]] ?? []).length > 0,
    };
    this._extraCache.set(area, { key, attrs });
    return attrs;
  }

  private _occupancy(area: string): { on: boolean; next_change: string | null } {
    const now = this.clock.now();
    const key = `${this._planningVersion}:${Math.floor(now / (SLOT_MINUTES * 60000))}`;
    const hit = this._occCache.get(area);
    if (hit && hit.key === key) return { on: hit.on, next_change: hit.next };
    const schedule = this._schedule(area);
    const next = nextChange(schedule, now, this.tz);
    const rec = { key, on: isOccupied(schedule, now, this.tz), next: next === null ? null : toIsoLocal(next, this.tz) };
    this._occCache.set(area, rec);
    return { on: rec.on, next_change: rec.next };
  }

  private _onClock(): void {
    const now = this.clock.now();
    const dt = now - this._lastClockTick;
    this._lastClockTick = now;
    if (dt > 0) this._driftClimates(dt);
    this._settle(false);
  }

  private _driftClimates(dtMs: number): void {
    const hours = dtMs / 3600000;
    for (const c of this._climates.values()) {
      const equilibrium = c.setpoint - 1;
      const diff = equilibrium - c.current_temperature;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), hours * 1.5);
      const before = round1(c.current_temperature);
      c.current_temperature += step;
      if (round1(c.current_temperature) !== before) this._dirty = true;
    }
  }

  private _logHeating(zone: HeatingZoneSim, event: string, detail?: string): void {
    this._state.heatingLog = [
      { id: ++this._logId, t: this.clock.now(), zone: zone.config.name, event, detail },
      ...this._state.heatingLog,
    ].slice(0, 100);
    this._dirty = true;
  }

  private _settle(force: boolean): void {
    const inst = this.installed;
    if (inst.planning) this._settlePlanning();
    else for (const id of [...this._entities.keys()]) if (/^binary_sensor\.share_space_|^sensor\.share_space_.*_(next_on|next_off|previous_off)$/.test(id)) this._removeEntity(id);

    this._runAutomations();

    for (const zone of this._zones.values()) {
      if (!inst.heating) continue;
      const wasActive = zone.overrideActive;
      zone.tick();
      if (wasActive && !zone.overrideActive) this._logHeating(zone, "override_expired", `target ${zone.target}`);
      const prevPresence = zone.presence;
      zone.onPresenceChanged();
      if (prevPresence !== null && prevPresence !== zone.presence) this._logHeating(zone, "presence", String(zone.presence));
    }

    for (const person of this._state.persons) {
      this._setEntity(person.entity_id, "home", { friendly_name: person.name, user_id: person.userId });
    }
    for (const c of this._climates.values()) {
      this._setEntity(c.entity_id, c.hvac_off ? "off" : "heat", {
        friendly_name: c.name,
        temperature: c.setpoint,
        current_temperature: round1(c.current_temperature),
        min_temp: c.min,
        max_temp: c.max,
        target_temp_step: c.step,
        hvac_modes: ["heat", "off"],
        hvac_action: !c.hvac_off && round1(c.current_temperature) < c.setpoint ? "heating" : "idle",
      });
    }
    for (const zone of this._zones.values()) {
      const id = this._zoneEntityId(zone.config);
      if (!inst.heating) {
        this._removeEntity(id);
        continue;
      }
      this._setEntity(id, String(zone.target), {
        friendly_name: zone.config.name,
        unit_of_measurement: "°C",
        device_class: "temperature",
        mode: zone.mode,
        active_rule: zone.activeRule,
        comfort_temp: zone.config.comfort_temp,
        eco_temp: zone.config.eco_temp,
        frost_temp: zone.frostTemp,
        off_mode: zone.config.off_mode ?? "frost",
        override_until: zone.overrideActive ? new Date(zone.overrideUntil as number).toISOString() : null,
        override_temp: zone.overrideTemp,
        presence: zone.presence,
        target_template: zone.config.target_template ?? null,
        template_result: null,
        template_error: null,
        climate_entity: zone.config.climate_entity,
        current_temperature: zone.currentTemperature,
        outdoor_entity: this._outdoorEntity,
      });
    }
    this._commit(force);
  }

  private _settlePlanning(): void {
    for (const area of this._knownAreas) {
      const occ = this._occupancy(area);
      const forced = this._state.forcedPresence[area];
      const on = forced ?? occ.on;
      const persons = Object.entries(this._state.personAreas)
        .filter(([, a]) => a === area)
        .map(([p]) => p);
      const name = this._state.areas.find((a) => a.area_id === area)?.name ?? area;
      this._setEntity(`binary_sensor.share_space_${area}`, on ? "on" : "off", {
        friendly_name: name,
        device_class: "occupancy",
        persons,
        next_change: occ.next_change,
        schedule: this._ranges(area),
      });
      const extra = this._planningExtras(area);
      for (const k of ["next_on", "next_off", "previous_off"] as const) {
        this._setEntity(`sensor.share_space_${area}_${k}`, (extra[k] as string | null) ?? "unknown", {
          friendly_name: `${name} ${k.replace("_", " ")}`,
          device_class: "timestamp",
        });
      }
      for (const k of ["occupied_today", "occupied_tomorrow"] as const) {
        this._setEntity(`binary_sensor.share_space_${area}_${k}`, extra[k] ? "on" : "off", {
          friendly_name: `${name} ${k.replace("_", " ")}`,
        });
      }
      const prev = this._lastOn.get(area);
      this._lastOn.set(area, on);
      if (prev !== undefined && prev !== on && this._actionsOf(area).enabled) {
        this._runActions(area, on ? "on" : "off", "transition");
      }
    }
  }

  private _runAutomations(): void {
    const now = this.clock.now();
    for (const [id, a] of this._automations) {
      this._setEntity(a.entityId, a.enabled ? "on" : "off", {
        id,
        friendly_name: a.config.alias,
        mode: "single",
        last_triggered: a.lastTriggered === null ? null : new Date(a.lastTriggered).toISOString(),
      });
      const bp = a.config.use_blueprint;
      if (bp?.path !== RULES_BLUEPRINT_PATH || !a.enabled || !this.installed.heating || !this.installed.planning) continue;
      const input = bp.input;
      const area = String(input.area);
      if (!this._knownAreas.has(area)) continue;
      const ev = this._evalRules(input, area, now);
      if (!ev) continue;
      const key = JSON.stringify(ev);
      if (this._autoLast.get(id) === key) continue;
      this._autoLast.set(id, key);
      a.lastTriggered = now;
      try {
        this._callService("share_space_heating", "set_base_target", {
          entity_id: this._zoneEntityId(this._rulesZone(input, area).config),
          ...("off" in ev.result ? { off: true } : ev.result.preset ? { preset: ev.result.preset } : { temperature: ev.result.target }),
          reason: ev.reason,
        });
      } catch {
        this._autoLast.delete(id);
      }
    }
  }

  private _evalRules(input: Record<string, unknown>, area: string, now: number) {
    const sid = typeof input.strategy === "string" ? input.strategy.trim() : "";
    const rules = sid ? this._strategies.get(sid)?.rules : (input.rules as RuleStrategy | undefined);
    if (!rules) return null;
    try {
      const cfg = this._rulesZone(input, area).config;
      return evaluateRules(rules, this._ranges(area), now, this.tz, { comfort: cfg.comfort_temp, eco: cfg.eco_temp }, sensorReadings(rules, Object.fromEntries(this._entities), this._outdoorEntity));
    } catch {
      return null;
    }
  }

  private _actionsOf(area: string): AreaActions {
    const rec = this._automations.get(areaActionsAutomationId(area));
    const read = rec ? readAreaActions(rec.config) : null;
    return { on_actions: read?.on_actions ?? [], off_actions: read?.off_actions ?? [], enabled: rec?.enabled ?? false };
  }

  private _runActions(area: string, state: "on" | "off", source: "transition" | "manual", sequence?: unknown[]): void {
    const actions = (sequence ?? this._actionsOf(area)[state === "on" ? "on_actions" : "off_actions"]) as Array<Record<string, any>>;
    const steps: ActionLogEntry["steps"] = [];
    for (const a of actions) {
      const service = String(a.action ?? a.service ?? "");
      const raw = a.target?.entity_id ?? a.data?.entity_id ?? a.entity_id ?? [];
      const entities: string[] = Array.isArray(raw) ? raw : [raw];
      try {
        const [domain, name] = service.split(".");
        if (!domain || !name) throw new Error(`unsupported action ${JSON.stringify(a)}`);
        this._callService(domain, name, { ...(a.data ?? {}), entity_id: entities });
        steps.push({ service, entities, ok: true });
      } catch (err) {
        steps.push({ service, entities, ok: false, error: (err as { message?: string })?.message ?? String(err) });
      }
    }
    this._state.actionsLog = [
      { id: ++this._logId, t: this.clock.now(), area, state, source, ran: actions.length > 0, steps },
      ...this._state.actionsLog,
    ].slice(0, 100);
    this._dirty = true;
  }

  private _commit(force: boolean): void {
    if (!this._dirty && !force && this._hass) return;
    this._dirty = false;
    const states: Record<string, HassEntity> = {};
    for (const [id, e] of this._entities) states[id] = e;
    const me = this._state.persons.find((p) => p.userId === this._state.currentUserId);
    const areas: Record<string, { area_id: string; name: string }> = {};
    for (const a of this._state.areas) areas[a.area_id] = a;
    this._state = { ...this._state };
    this._hass = {
      states,
      areas,
      user: me ? { id: me.userId, name: me.name, is_admin: me.isAdmin } : null,
      callWS: (msg) => this._callWS(msg) as Promise<never>,
      callService: (domain, service, data) => this._callServiceAsync(domain, service, data ?? {}),
      callApi: (method, path, data) => this._callApi(method, path, data) as Promise<never>,
      now: this.clock.now,
      connection: {
        subscribeMessage: async () => {
          throw HA_ERROR("unknown_command", "Unknown command.");
        },
        subscribeEvents: async <T,>(cb: (e: T) => void, type?: string) => {
          const key = type ?? "*";
          const handler = (e: MockHassEvent) => cb(e as unknown as T);
          if (!this._eventListeners.has(key)) this._eventListeners.set(key, new Set());
          this._eventListeners.get(key)!.add(handler);
          return () => this._eventListeners.get(key)?.delete(handler);
        },
      },
      themes: {},
      language: this._options.language ?? "en",
      config: { unit_system: { temperature: "°C" }, time_zone: this.tz },
    };
    for (const l of [...this._listeners]) l(this._hass);
  }

  private async _latency(): Promise<void> {
    const ms = this._options.latencyMs ?? 0;
    await new Promise((r) => setTimeout(r, ms));
  }

  private async _callWS(msg: Record<string, unknown>): Promise<unknown> {
    await this._latency();
    const type = String(msg.type);
    const h = this._ws.get(type);
    if (!h || (h.backend && !this.installed[h.backend])) throw HA_ERROR("unknown_command", "Unknown command.");
    if (h.admin && !this._currentUser()?.isAdmin) throw HA_ERROR("unauthorized", "Unauthorized");
    return clone(h.fn(msg));
  }

  private async _callApi(method: string, path: string, data?: Record<string, unknown>): Promise<unknown> {
    await this._latency();
    if (!this._currentUser()?.isAdmin) throw HA_ERROR("unauthorized", "Unauthorized");
    const m = /^config\/automation\/config\/([A-Za-z0-9_-]+)$/.exec(path);
    if (!m) throw HA_ERROR("not_found", `Unknown API path ${path}`);
    const id = m[1];
    const existing = this._automations.get(id);
    if (method === "GET") {
      if (!existing) throw HA_ERROR("not_found", "Resource not found");
      return clone(existing.config);
    }
    if (method === "DELETE") {
      if (!existing) throw HA_ERROR("not_found", "Resource not found");
      this._automations.delete(id);
      this._autoLast.delete(id);
      this._removeEntity(existing.entityId);
      this._settle(false);
      return { result: "ok" };
    }
    if (method !== "POST") throw HA_ERROR("invalid_format", `Unsupported method ${method}`);
    const config = data as StrategyAutomationRec["config"] | undefined;
    if (!config?.alias || !(config.use_blueprint?.path || Array.isArray(config.triggers)))
      throw HA_ERROR("invalid_format", "alias and use_blueprint or triggers are required");
    this._automations.set(id, {
      entityId: existing?.entityId ?? this._freeAutomationEntity(`automation.${slugify(config.alias) || id}`),
      config: clone(config),
      enabled: existing?.enabled ?? true,
      lastTriggered: existing?.lastTriggered ?? null,
    });
    this._autoLast.delete(id);
    this._settle(false);
    return { result: "ok" };
  }

  // Like HA: a taken entity id gets a _2, _3 suffix.
  private _freeAutomationEntity(base: string): string {
    const taken = new Set([...this._automations.values()].map((a) => a.entityId));
    let n = 1;
    let id = base;
    while (taken.has(id)) id = `${base}_${++n}`;
    return id;
  }

  private async _callServiceAsync(domain: string, service: string, data: Record<string, unknown>): Promise<void> {
    await this._latency();
    if (this._services.get(`${domain}.${service}`)?.admin && !this._currentUser()?.isAdmin) throw HA_ERROR("unauthorized", "Unauthorized");
    this._callService(domain, service, data);
    this._settle(false);
  }

  private _callService(domain: string, service: string, data: Record<string, unknown>): void {
    const key = `${domain}.${service}`;
    const h = this._services.get(key);
    if (!h || (h.backend && !this.installed[h.backend])) {
      throw HA_ERROR("service_not_found", `Service ${key} not found.`);
    }
    h.fn(data);
    this._dirty = true;
  }

  private _currentUser() {
    return this._state.persons.find((p) => p.userId === this._state.currentUserId);
  }

  private _ids(data: Record<string, unknown>): string[] {
    const raw = data.entity_id;
    return Array.isArray(raw) ? (raw as string[]) : raw ? [String(raw)] : [];
  }

  // Legacy automations name the zone; new ones only the area (the zone whose climate is in it).
  private _rulesZone(input: Record<string, unknown>, area: string): HeatingZoneSim {
    if (input.zone) return this._zoneByEntity(input.zone);
    const found = [...this._zones.values()].filter((z) => z.config.area_id === area);
    if (found.length !== 1) throw HA_ERROR("service_validation_error", found.length ? `Several heating zones in area ${area}` : `No Share Space Heating zone in area ${area}`);
    return found[0];
  }

  private _zoneByEntity(entityId: unknown): HeatingZoneSim {
    const zone = [...this._zones.values()].find((z) => this._zoneEntityId(z.config) === entityId);
    if (!zone) throw HA_ERROR("service_validation_error", `${String(entityId)} is not a Share Space Heating zone`);
    return zone;
  }

  private _zoneEntityId(c: ZoneConfig): string {
    return `sensor.share_space_heating_${slugify(c.name)}`;
  }

  private _validateCalendar(calendar: Record<string, unknown>): void {
    for (const [day, ranges] of Object.entries(calendar)) {
      if (!(DAYS as readonly string[]).includes(day)) throw HA_ERROR("invalid_format", `invalid day ${day}`);
      for (const r of ranges as Array<{ start: string; end: string }>) {
        if (!TIME_RE.test(r.start) || !TIME_RE.test(r.end)) throw HA_ERROR("invalid_format", "invalid time of day");
        if (r.start >= r.end) throw HA_ERROR("invalid_format", "start must be before end; ranges cannot cross midnight");
      }
    }
  }

  private _registerHandlers(): void {
    const ws = (type: string, backend: keyof InstalledBackends | null, fn: WsHandler, admin = false) =>
      this._ws.set(type, { backend, fn, admin });
    const svc = (name: string, backend: keyof InstalledBackends | null, fn: ServiceHandler, admin = false) =>
      this._services.set(name, { backend, fn, admin });
    const st = () => this._state;

    ws("config/area_registry/list", null, () =>
      st().areas.map((a) => ({ area_id: a.area_id, name: a.name, picture: null, aliases: [], labels: [] }))
    );
    ws("share_space/get_calendar", "planning", (m) => ({ calendar: st().calendars[String(m.person)] ?? {} }));
    ws("frontend/get_user_data", null, (m) => {
      const data = this._currentUser()?.userData ?? {};
      return { value: m.key === undefined ? data : (data[String(m.key)] ?? null) };
    });
    ws("frontend/set_user_data", null, (m) => {
      const me = this._currentUser();
      if (me) me.userData = { ...me.userData, [String(m.key)]: m.value };
      return null;
    });
    ws("share_space/get_person_area", "planning", (m) => ({ area: st().personAreas[String(m.person)] ?? null }));
    ws("share_space/get_area_schedule", "planning", (m) => ({ schedule: this._schedule(String(m.area)) }));
    ws("share_space/get_area_calendars", "planning", (m) => ({ persons: this.areaCalendars(String(m.area)) }));
    // Nothing kept by Share Space itself: actions are HA automations.
    ws("share_space/get_area_actions", "planning", () => null);
    ws("share_space/forget_area_actions", "planning", () => ({}), true);
    ws("automation/config", null, (m) => {
      const rec = [...this._automations.values()].find((a) => a.entityId === m.entity_id);
      if (!rec) throw HA_ERROR("not_found", "Entity not found");
      return { config: clone(rec.config) };
    });
    ws(
      "execute_script",
      null,
      (m) => {
        const vars = (m.variables ?? {}) as { area?: string; state?: string };
        this._runActions(String(vars.area ?? ""), vars.state === "off" ? "off" : "on", "manual", m.sequence as unknown[]);
        this._settle(false);
        return { context: { id: "mock" }, response: null };
      },
      true
    );
    ws("share_space/list_areas", "planning", () =>
      [...new Set(Object.values(st().personAreas))].sort().map((area_id) => ({
        area_id,
        name: st().areas.find((a) => a.area_id === area_id)?.name ?? area_id,
        persons: Object.entries(st().personAreas).filter(([, a]) => a === area_id).map(([p]) => p),
        entity_id: this._knownAreas.has(area_id) ? `binary_sensor.share_space_${area_id}` : null,
      }))
    );

    ws("call_service", null, (m) => {
      const key = `${String(m.domain)}.${String(m.service)}`;
      const data = (m.service_data as Record<string, unknown> | undefined) ?? {};
      const r = this._responseServices.get(key);
      if (r) {
        if (r.backend && !this.installed[r.backend]) throw HA_ERROR("service_not_found", `Service ${key} not found.`);
        if (!m.return_response) throw HA_ERROR("service_validation_error", "Service call requires responses but caller did not ask for responses");
        return { context: { id: "mock" }, response: r.fn(data) };
      }
      this._callService(String(m.domain), String(m.service), data);
      this._settle(false);
      return { context: { id: "mock" }, response: null };
    });
    ws("share_space_heating/list_zones", "heating", () =>
      [...this._zones.values()].map((z) => ({
        entry_id: z.config.entry_id,
        name: z.config.name,
        entity_id: this._zoneEntityId(z.config),
        climate_entity: z.config.climate_entity,
        presence_entity: z.config.presence_entity,
        mode: z.mode,
        target: z.target,
        override_until: z.overrideActive ? new Date(z.overrideUntil as number).toISOString() : null,
        target_template: z.config.target_template ?? null,
        template_result: null,
        template_error: null,
        area_id: z.config.area_id ?? null,
        area_conflict: !!z.config.area_id && [...this._zones.values()].filter((o) => o.config.area_id === z.config.area_id).length > 1,
      }))
    );
    ws(
      "share_space_heating/update_zone",
      "heating",
      (m) => {
        const zone = this._zones.get(String(m.entry_id));
        if (!zone) throw HA_ERROR("not_found", "Zone not found");
        const patch: Partial<ZoneConfig> = {};
        if ("presence_entity" in m) patch.presence_entity = (m.presence_entity as string | null) ?? null;
        for (const k of ["comfort_temp", "eco_temp", "default_override_hours", "max_override_hours", "frost_temp"] as const) {
          if (m[k] !== undefined && m[k] !== null) patch[k] = Number(m[k]);
        }
        if (patch.frost_temp !== undefined && (patch.frost_temp < 5 || patch.frost_temp > 15)) throw HA_ERROR("invalid_format", "frost_temp must be 5-15");
        if (m.off_mode !== undefined) {
          if (m.off_mode !== "frost" && m.off_mode !== "hvac_off") throw HA_ERROR("invalid_format", "invalid off_mode");
          patch.off_mode = m.off_mode;
        }
        if ("target_template" in m) {
          const tpl = typeof m.target_template === "string" && m.target_template.trim() ? m.target_template : null;
          const bad = tpl ? templateSyntaxError(tpl) : null;
          if (bad) throw HA_ERROR("invalid_format", bad);
          patch.target_template = tpl;
        }
        zone.patchConfig(patch);
        this._settle(false);
        const z = zone;
        return {
          entry_id: z.config.entry_id,
          name: z.config.name,
          entity_id: this._zoneEntityId(z.config),
          climate_entity: z.config.climate_entity,
          presence_entity: z.config.presence_entity,
          mode: z.mode,
          target: z.target,
          override_until: z.overrideActive ? new Date(z.overrideUntil as number).toISOString() : null,
          target_template: z.config.target_template ?? null,
          template_result: null,
          template_error: null,
          area_id: zone.config.area_id ?? null,
        };
      },
      true
    );

    // HA search: automations that name the area, one of its entities, or the entity asked for.
    ws("search/related", null, (m) => {
      const area = m.item_type === "area" ? String(m.item_id) : null;
      const entity = m.item_type === "entity" ? String(m.item_id) : null;
      const inArea = [...this._zones.values()].filter((z) => z.config.area_id === area).map((z) => z.config.climate_entity);
      const automation = [...this._automations.values()]
        .filter((a) => {
          const text = JSON.stringify(a.config);
          return (area && (text.includes(`"${area}"`) || inArea.some((e) => text.includes(e)))) || (entity && text.includes(entity));
        })
        .map((a) => a.entityId);
      return { automation };
    });
    ws("schedule/list", null, () => clone(this._scheduleHelpers));
    ws(
      "schedule/update",
      null,
      (m) => {
        const i = this._scheduleHelpers.findIndex((h) => h.id === m.schedule_id);
        if (i < 0) throw HA_ERROR("not_found", "Schedule not found");
        const { type: _type, id: _id, schedule_id: _sid, ...fields } = m;
        this._scheduleHelpers[i] = { ...this._scheduleHelpers[i], ...(fields as Record<string, unknown>) };
        return clone(this._scheduleHelpers[i]);
      },
      true
    );
    ws("scheduler", null, () => clone(this._schedulerItems));
    svc(
      "scheduler.edit",
      null,
      (d) => {
        const item = this._schedulerItems.find((x) => x.entity_id === d.entity_id);
        if (!item) throw HA_ERROR("service_validation_error", `Entity ${String(d.entity_id)} not found`);
        if (d.weekdays) item.weekdays = d.weekdays as string[];
        if (d.timeslots) item.timeslots = clone(d.timeslots) as SchedulerItem["timeslots"];
      },
      true
    );
    ws("share_space_heating/get_settings", "heating", () => ({ outdoor_entity: this._outdoorEntity }));
    ws("share_space_heating/detected_areas", "heating", () => []);
    ws(
      "share_space_heating/save_settings",
      "heating",
      (m) => {
        const id = typeof m.outdoor_entity === "string" && m.outdoor_entity.trim() ? m.outdoor_entity.trim() : null;
        if (id && !/^(sensor|weather|input_number)\.[a-z0-9_]+$/.test(id)) throw HA_ERROR("invalid_format", "outdoor_entity must be a sensor, weather or input_number entity");
        this._outdoorEntity = id;
        this._settle(true);
        return { outdoor_entity: id };
      },
      true
    );
    ws("share_space_heating/list_strategies", "heating", () =>
      [...this._strategies.values()].sort((a, b) => a.name.localeCompare(b.name))
    );
    ws(
      "share_space_heating/save_strategy",
      "heating",
      (m) => {
        const id = typeof m.strategy_id === "string" && m.strategy_id ? m.strategy_id : null;
        const name = typeof m.name === "string" ? m.name.trim() : "";
        const shape = (r: unknown) => {
          const x = r as { version?: unknown; rules?: unknown; fallback?: unknown } | null;
          return !!x && typeof x === "object" && x.version === 1 && Array.isArray(x.rules) && !!x.fallback && typeof x.fallback === "object";
        };
        if (!name || !shape(m.rules) || (m.previous != null && !shape(m.previous))) throw HA_ERROR("invalid_format", "name and rules are required");
        if (id && !this._strategies.has(id)) throw HA_ERROR("not_found", "Shared strategy not found");
        if ([...this._strategies.values()].some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase()))
          throw HA_ERROR("name_taken", `A shared strategy named ${name} already exists`);
        const sid = id ?? Math.random().toString(16).slice(2, 14).padEnd(12, "0");
        const prev = this._strategies.get(sid);
        const previous = "previous" in m ? ((m.previous as RuleStrategy | null) ?? null) : (prev?.previous ?? null);
        this._strategies.set(sid, { id: sid, name, rules: clone(m.rules as RuleStrategy), previous: clone(previous) });
        this._settle(false);
        return { id: sid };
      },
      true
    );
    ws(
      "share_space_heating/delete_strategy",
      "heating",
      (m) => {
        if (!this._strategies.delete(String(m.strategy_id))) throw HA_ERROR("not_found", "Shared strategy not found");
        return {};
      },
      true
    );

    ws("share_space_space/get_floorplans", "space", () => ({ plans: this._floorplans }));
    ws(
      "share_space_space/save_floorplan",
      "space",
      (m) => {
        const plan = m.plan as Floorplan;
        const i = this._floorplans.findIndex((p) => p.id === plan.id);
        if (i >= 0) this._floorplans[i] = plan;
        else this._floorplans.push(plan);
        return { plan };
      },
      true
    );
    ws(
      "share_space_space/delete_floorplan",
      "space",
      (m) => {
        const kept = this._floorplans.filter((p) => p.id !== m.plan_id);
        if (kept.length === this._floorplans.length) throw HA_ERROR("not_found", "Floor plan not found");
        this._floorplans = kept;
        return {};
      },
      true
    );

    svc("share_space.set_calendar", "planning", (d) => {
      const person = String(d.person);
      if (!person.startsWith("person.")) throw HA_ERROR("invalid_format", "expected a person entity");
      this._validateCalendar(d.calendar as Record<string, unknown>);
      st().calendars = { ...st().calendars, [person]: clone(d.calendar) as Partial<Calendar> };
      this._planningVersion++;
      this.emitEvent("share_space_calendar_updated", { person });
    });
    svc("share_space.assign_person_area", "planning", (d) => {
      const person = String(d.person);
      if (!person.startsWith("person.")) throw HA_ERROR("invalid_format", "expected a person entity");
      st().personAreas = { ...st().personAreas, [person]: String(d.area) };
      this._knownAreas.add(String(d.area));
      this._planningVersion++;
      this.emitEvent("share_space_person_area_assigned", { person, area: d.area });
    });
    svc("share_space_heating.set_override", "heating", (d) => {
      const zone = this._zoneByEntity(d.entity_id);
      zone.setOverride(Number(d.temperature), d.hours === undefined ? undefined : Number(d.hours));
      this._logHeating(zone, "override_set", `${zone.overrideTemp}° until ${new Date(zone.overrideUntil as number).toISOString()}`);
    });
    svc("share_space_heating.extend_override", "heating", (d) => {
      const zone = this._zoneByEntity(d.entity_id);
      zone.extendOverride(Number(d.hours));
      this._logHeating(zone, "override_extended", `until ${new Date(zone.overrideUntil as number).toISOString()}`);
    });
    svc("share_space_heating.clear_override", "heating", (d) => {
      const zone = this._zoneByEntity(d.entity_id);
      zone.clearOverride();
      this._logHeating(zone, "override_cleared", `target ${zone.target}`);
    });

    svc("share_space_heating.set_base_target", "heating", (d) => {
      const zone = this._zoneByEntity(d.entity_id);
      const given = ["temperature", "preset", "off"].filter((k) => d[k] !== undefined && d[k] !== null);
      if (given.length > 1) throw HA_ERROR("service_validation_error", "at most one of temperature, preset, off");
      const reason = d.reason === undefined ? null : String(d.reason);
      if (given.length === 0) zone.setBase(null);
      else if (d.temperature !== undefined) zone.setBase({ kind: "temperature", value: Number(d.temperature), reason });
      else if (d.preset !== undefined) {
        if (d.preset !== "comfort" && d.preset !== "eco") throw HA_ERROR("service_validation_error", "invalid preset");
        zone.setBase({ kind: "preset", value: d.preset, reason });
      } else zone.setBase({ kind: "off", value: null, reason });
      this._logHeating(zone, "base_target", `${zone.baseTarget?.kind === "off" ? "off" : `${zone.target}°`} · ${reason ?? ""}`);
    });

    for (const action of ["turn_on", "turn_off", "toggle"]) {
      svc(`automation.${action}`, null, (d) => {
        for (const id of this._ids(d)) {
          const rec = [...this._automations.entries()].find(([, a]) => a.entityId === id);
          if (!rec) throw HA_ERROR("service_validation_error", `Entity ${id} not found`);
          rec[1].enabled = action === "toggle" ? !rec[1].enabled : action === "turn_on";
          this._autoLast.delete(rec[0]);
        }
      });
    }

    this._responseServices.set("share_space.query_occupancy", {
      backend: "planning",
      fn: (d) => {
        const area = String(d.area);
        if (!this._knownAreas.has(area)) throw HA_ERROR("service_validation_error", `Unknown area ${area}`);
        const windows = (d.windows as Array<{ start: string; end: string }> | undefined) ?? [];
        for (const w of windows) if (!TIME_RE.test(w.start) || !TIME_RE.test(w.end)) throw HA_ERROR("invalid_format", "invalid time of day");
        const today = wallTime(this.clock.now(), this.tz).weekday;
        const dayArg = String(d.day ?? "today");
        const idx = dayArg === "today" ? today : dayArg === "tomorrow" ? (today + 1) % 7 : WEEK_DAYS.indexOf(dayArg as (typeof WEEK_DAYS)[number]);
        if (idx < 0) throw HA_ERROR("invalid_format", `invalid day ${dayArg}`);
        const ranges = this._ranges(area);
        const matches = windows.map((w) => windowMatches(ranges, WEEK_DAYS[idx], w.start, w.end));
        return { occupied: d.match === "any" ? matches.some(Boolean) : matches.every(Boolean), matches };
      },
    });

    svc("climate.set_temperature", null, (d) => {
      for (const id of this._ids(d)) {
        const c = this._climates.get(id);
        if (!c) throw HA_ERROR("service_validation_error", `Entity ${id} not found`);
        const old = c.setpoint;
        this._setSetpoint(id, Number(d.temperature));
        if (!this.installed.heating) continue;
        for (const zone of this._zones.values()) {
          if (zone.config.climate_entity !== id) continue;
          const had = zone.overrideActive;
          zone.onExternalSetpoint(old, c.setpoint);
          if (!had && zone.overrideActive) {
            this._logHeating(zone, "external_change", `${old}° -> ${c.setpoint}°, override for ${zone.config.default_override_hours}h`);
          }
        }
      }
    });

    for (const domain of ["light", "switch", "homeassistant"]) {
      for (const action of ["turn_on", "turn_off", "toggle"]) {
        svc(`${domain}.${action}`, null, (d) => {
          for (const id of this._ids(d)) {
            const e = this._entities.get(id);
            if (!e || !/^(light|switch)\./.test(id)) throw HA_ERROR("service_validation_error", `Entity ${id} not found`);
            const next = action === "toggle" ? (e.state === "on" ? "off" : "on") : action === "turn_on" ? "on" : "off";
            this._setEntity(id, next, e.attributes);
          }
        });
      }
    }
  }
}

export function createMockHass(options: MockOptions = {}): MockHassController {
  return new MockHassController(options);
}
