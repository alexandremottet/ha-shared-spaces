import type { AreaActions, Floorplan } from "ha-share-space-ui/ha";
import type { Calendar } from "ha-share-space-ui";
import type { ZoneConfig } from "./heating";

export interface SeedPerson {
  slug: string;
  name: string;
  userId: string;
  isAdmin: boolean;
  userData?: Record<string, unknown>;
}

export interface SeedClimate {
  entity_id: string;
  name: string;
  setpoint: number;
  current_temperature: number;
  min: number;
  max: number;
  step: number;
}

export interface SeedSwitch {
  entity_id: string;
  name: string;
  state: "on" | "off";
}

export interface SeedData {
  persons: SeedPerson[];
  areas: Array<{ area_id: string; name: string }>;
  calendars: Record<string, Partial<Calendar>>;
  personAreas: Record<string, string>;
  areaActions: Record<string, AreaActions>;
  climates: SeedClimate[];
  switches: SeedSwitch[];
  zones: ZoneConfig[];
  floorplans: Floorplan[];
}

export interface InstalledBackends {
  planning: boolean;
  heating: boolean;
  space: boolean;
}

export interface MockOptions {
  installed?: Partial<InstalledBackends>;
  seed?: SeedData;
  userId?: string;
  startTime?: number;
  timeZone?: string;
  playing?: boolean;
  language?: string;
  latencyMs?: number;
  /** Seed the outdoor demo strategy on Open space at start (the app does; tests start without it). */
  demoRules?: boolean;
}

export interface ActionLogEntry {
  id: number;
  t: number;
  area: string;
  state: "on" | "off";
  source: "transition" | "manual";
  ran: boolean;
  steps: Array<{ service: string; entities: string[]; ok: boolean; error?: string }>;
}

export interface HeatingLogEntry {
  id: number;
  t: number;
  zone: string;
  event: string;
  detail?: string;
}
