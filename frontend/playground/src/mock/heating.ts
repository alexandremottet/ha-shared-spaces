export type ZoneMode = "schedule" | "override" | "manual_only" | "automation";
export type OffMode = "frost" | "hvac_off";

export interface BaseTarget {
  kind: "temperature" | "preset" | "off";
  value: number | "comfort" | "eco" | null;
  reason: string | null;
}
export type SetpointOrigin = "own" | "external";

export interface ZoneConfig {
  entry_id: string;
  name: string;
  climate_entity: string;
  presence_entity: string | null;
  comfort_temp: number;
  eco_temp: number;
  default_override_hours: number;
  max_override_hours: number;
  frost_temp?: number;
  off_mode?: OffMode;
}

export interface ClimateInfo {
  setpoint: number | null;
  min: number;
  max: number;
  step: number;
  current_temperature: number | null;
}

export interface ZoneEnv {
  now(): number;
  presenceOf(entityId: string): boolean | null;
  climate(entityId: string): ClimateInfo | null;
  setClimate(entityId: string, temperature: number): void;
  setHvac(entityId: string, on: boolean): void;
}

const HOUR = 3600000;

export class HeatingZoneSim {
  config: ZoneConfig;
  overrideTemp: number | null = null;
  overrideUntil: number | null = null;
  previousTemp: number | null = null;
  baseTarget: BaseTarget | null = null;
  private _hvacOff = false;
  private _lastApplied: number | null = null;
  private _lastPresence: boolean | null = null;
  private _pending: number | null = null;

  constructor(config: ZoneConfig, private env: ZoneEnv) {
    this.config = config;
    this.start();
  }

  get presence(): boolean | null {
    return this._lastPresence;
  }

  get overrideActive(): boolean {
    return this.overrideTemp !== null && this.overrideUntil !== null;
  }

  get mode(): ZoneMode {
    if (this.overrideActive) return "override";
    if (this.baseTarget) return "automation";
    return this.config.presence_entity ? "schedule" : "manual_only";
  }

  private get scheduleTargetOrNull(): number | null {
    if (!this.config.presence_entity) return this.config.comfort_temp;
    if (this._lastPresence === null) return null;
    return this._lastPresence ? this.config.comfort_temp : this.config.eco_temp;
  }

  get frostTemp(): number {
    return this.config.frost_temp ?? 7;
  }

  get activeRule(): string | null {
    return this.baseTarget?.reason ?? null;
  }

  private get desired(): number | "off" | null {
    if (this.overrideActive) return this.overrideTemp;
    const b = this.baseTarget;
    if (b) {
      if (b.kind === "off") return "off";
      if (b.kind === "preset") return b.value === "comfort" ? this.config.comfort_temp : this.config.eco_temp;
      return b.value as number;
    }
    return this.scheduleTargetOrNull;
  }

  get target(): number {
    const d = this.desired;
    return d === "off" ? this.frostTemp : d ?? this._lastApplied ?? this.config.comfort_temp;
  }

  get currentTemperature(): number | null {
    return this.env.climate(this.config.climate_entity)?.current_temperature ?? null;
  }

  patchConfig(patch: Partial<ZoneConfig>): void {
    this.config = { ...this.config, ...patch };
    this.refreshPresence();
    this.apply(true);
  }

  private refreshPresence(): void {
    const id = this.config.presence_entity;
    if (!id) {
      this._lastPresence = null;
      return;
    }
    const p = this.env.presenceOf(id);
    if (p !== null) this._lastPresence = p;
  }

  private start(): void {
    this.refreshPresence();
    this.apply();
  }

  private apply(force = false): void {
    if (this.mode === "manual_only") return;
    const desired = this.desired;
    if (desired === null) return;
    if (desired === "off" && this.config.off_mode === "hvac_off") {
      if (!force && this._hvacOff) return;
      this.env.setHvac(this.config.climate_entity, false);
      this._hvacOff = true;
      return;
    }
    const target = desired === "off" ? this.frostTemp : desired;
    if (!force && !this._hvacOff && target === this._lastApplied) return;
    this.setClimate(target);
  }

  private setClimate(temp: number): void {
    if (this._hvacOff) {
      this.env.setHvac(this.config.climate_entity, true);
      this._hvacOff = false;
    }
    this._pending = temp;
    try {
      this.env.setClimate(this.config.climate_entity, temp);
    } finally {
      this._pending = null;
    }
    this._lastApplied = temp;
  }

  private matches(temp: number, info: ClimateInfo, ref: number | null): boolean {
    if (ref === null) return false;
    const tol = Math.max(info.step || 0.5, 0.1);
    const clamped = Math.min(Math.max(ref, info.min), info.max);
    return [ref, clamped].some((c) => Math.abs(temp - c) <= tol);
  }

  private isEcho(temp: number, info: ClimateInfo): boolean {
    return this.matches(temp, info, this._pending) || this.matches(temp, info, this._lastApplied);
  }

  onPresenceChanged(): void {
    this.refreshPresence();
    this.apply();
  }

  onExternalSetpoint(oldTemp: number | null, newTemp: number | null): void {
    const info = this.env.climate(this.config.climate_entity);
    if (!info || oldTemp === null || newTemp === null || oldTemp === newTemp) return;
    if (this.isEcho(newTemp, info)) return;
    this.startOverride(newTemp, this.config.default_override_hours, false, oldTemp);
  }

  tick(): void {
    if (this.overrideActive && (this.overrideUntil as number) <= this.env.now()) this.clearOverride();
  }

  private clamp(hours: number): number {
    return Math.min(Math.max(hours, 0), this.config.max_override_hours);
  }

  private startOverride(temp: number, hours: number, apply = true, previous: number | null = null): void {
    const until = this.env.now() + this.clamp(hours) * HOUR;
    if (this.overrideActive) previous = this.previousTemp;
    else if (previous === null) previous = this.env.climate(this.config.climate_entity)?.setpoint ?? null;
    if (apply) this.setClimate(temp);
    else this._lastApplied = temp;
    this.overrideTemp = temp;
    this.overrideUntil = until;
    this.previousTemp = previous;
  }

  setBase(base: BaseTarget | null): void {
    this.baseTarget = base;
    this.apply(true);
  }

  setOverride(temp: number, hours?: number): void {
    this.startOverride(temp, hours ?? this.config.default_override_hours);
  }

  extendOverride(hours: number): void {
    if (!this.overrideActive) {
      this.startOverride(this.target, hours);
      return;
    }
    const now = this.env.now();
    const current = this.overrideUntil as number;
    this.overrideUntil = Math.max(current, Math.min(current + hours * HOUR, now + this.config.max_override_hours * HOUR));
  }

  clearOverride(): void {
    const had = this.overrideActive;
    const previous = this.previousTemp;
    this.overrideTemp = null;
    this.overrideUntil = null;
    this.previousTemp = null;
    if (!had) return;
    if (this.mode === "manual_only") {
      if (previous !== null) this.setClimate(previous);
    } else {
      this.apply(true);
    }
  }
}
