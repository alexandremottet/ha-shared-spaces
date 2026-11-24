import type { Calendar, RuleStrategy } from "ha-share-space-ui";
import { PLACEHOLDER_URL } from "../../../space-panel/src/placeholder";
import { wallTime } from "./planning";
import type { SeedData } from "./types";
import starters from "../../../../integrations/share_space_heating/custom_components/share_space_heating/starters.json";

/** The integration's starter shared strategies (same file the backend seeds). */
export const STARTERS = starters as unknown as Array<{ id: string; name: string; rules: RuleStrategy }>;
export const starterRules = (id: string): RuleStrategy => structuredClone(STARTERS.find((s) => s.id === id)!.rules);

const r = (start: string, end: string) => ({ start, end });

export function defaultStartTime(tz: string = Intl.DateTimeFormat().resolvedOptions().timeZone): number {
  let t = Date.now();
  for (let i = 0; i < 8; i++) {
    const w = wallTime(t, tz);
    if (w.weekday < 5 && !(w.hour >= 18)) {
      const minutesBack = w.hour * 60 + w.minute - (8 * 60 + 45);
      return t - minutesBack * 60000 - w.second * 1000;
    }
    t += 24 * 3600000;
  }
  return Date.now();
}

export function demoSeed(): SeedData {
  const alice: Partial<Calendar> = {
    monday: [r("09:00", "12:30"), r("14:00", "18:00")],
    tuesday: [r("09:00", "12:30"), r("14:00", "18:00")],
    wednesday: [r("09:00", "12:30")],
    thursday: [r("09:00", "12:30"), r("14:00", "18:00")],
    friday: [r("09:00", "12:00")],
  };
  const bob: Partial<Calendar> = {
    tuesday: [r("10:00", "16:00")],
    wednesday: [r("08:30", "12:00")],
    thursday: [r("10:00", "16:00")],
  };
  const chloe: Partial<Calendar> = {
    monday: [r("13:00", "19:00")],
    wednesday: [r("13:00", "19:00")],
    friday: [r("13:00", "19:00")],
    saturday: [r("10:00", "13:00")],
  };
  const dana: Partial<Calendar> = {
    monday: [r("09:30", "12:30")],
    tuesday: [r("09:30", "12:30"), r("13:30", "17:00")],
    wednesday: [r("09:30", "12:30"), r("13:30", "17:00")],
    thursday: [r("09:30", "12:30"), r("13:30", "17:00")],
    friday: [r("09:30", "12:30")],
  };
  return {
    persons: [
      { slug: "alice", name: "Alice", userId: "u1", isAdmin: true },
      { slug: "bob", name: "Bob", userId: "u2", isAdmin: false },
      { slug: "chloe", name: "Chloé", userId: "u3", isAdmin: false },
      { slug: "dana", name: "Dana", userId: "u4", isAdmin: true, userData: { share_space: { technical: true } } },
    ],
    areas: [
      { area_id: "open_space", name: "Open space" },
      { area_id: "meeting_room", name: "Meeting room" },
      { area_id: "workshop", name: "Workshop" },
      { area_id: "kitchen", name: "Kitchen" },
    ],
    calendars: { "person.alice": alice, "person.bob": bob, "person.chloe": chloe, "person.dana": dana },
    personAreas: { "person.alice": "open_space", "person.chloe": "open_space", "person.bob": "meeting_room", "person.dana": "kitchen" },
    areaActions: {
      open_space: {
        enabled: true,
        on_actions: [{ action: "light.turn_on", target: { entity_id: "light.open_space_lights" } }],
        off_actions: [{ action: "light.turn_off", target: { entity_id: "light.open_space_lights" } }],
      },
      meeting_room: {
        enabled: true,
        on_actions: [{ action: "switch.turn_on", target: { entity_id: "switch.meeting_room_screen" } }],
        off_actions: [{ action: "switch.turn_off", target: { entity_id: "switch.meeting_room_screen" } }],
      },
    },
    climates: [
      { entity_id: "climate.open_space", name: "Open space thermostat", setpoint: 17, current_temperature: 17.5, min: 7, max: 28, step: 0.5 },
      { entity_id: "climate.workshop", name: "Workshop thermostat", setpoint: 20, current_temperature: 19, min: 7, max: 28, step: 0.5 },
      { entity_id: "climate.kitchen", name: "Kitchen thermostat", setpoint: 17, current_temperature: 17, min: 7, max: 28, step: 0.5 },
    ],
    switches: [
      { entity_id: "light.open_space_lights", name: "Open space lights", state: "off" },
      { entity_id: "light.workshop_lights", name: "Workshop lights", state: "off" },
      { entity_id: "switch.meeting_room_screen", name: "Meeting room screen", state: "off" },
    ],
    zones: [
      {
        entry_id: "zone_open_space",
        name: "Open space",
        climate_entity: "climate.open_space",
        area_id: "open_space",
        presence_entity: "binary_sensor.share_space_open_space",
        comfort_temp: 21,
        eco_temp: 17,
        default_override_hours: 3,
        max_override_hours: 12,
      },
      {
        entry_id: "zone_workshop",
        name: "Workshop",
        climate_entity: "climate.workshop",
        area_id: "workshop",
        presence_entity: null,
        comfort_temp: 20,
        eco_temp: 16,
        default_override_hours: 3,
        max_override_hours: 12,
      },
      {
        entry_id: "zone_kitchen",
        name: "Kitchen",
        climate_entity: "climate.kitchen",
        area_id: "kitchen",
        presence_entity: null,
        comfort_temp: 20,
        eco_temp: 16,
        default_override_hours: 3,
        max_override_hours: 12,
      },
    ],
    floorplans: [
      {
        id: "main",
        name: "Main floor",
        image_url: PLACEHOLDER_URL,
        hotspots: [
          {
            id: "hs_open_space",
            label: "Open space",
            shape: { type: "rect", points: [[25, 35], [55, 60]] },
            target: { kind: "area", ref: "open_space" },
          },
          {
            id: "hs_heating",
            label: "Open space heating",
            shape: { type: "rect", points: [[58, 30], [72, 45]] },
            target: { kind: "heating", ref: "sensor.share_space_heating_open_space" },
          },
          {
            id: "hs_lights",
            label: "Workshop lights",
            shape: { type: "polygon", points: [[30, 62], [45, 70], [30, 78], [18, 70]] },
            target: { kind: "entity", ref: "light.workshop_lights" },
          },
          {
            id: "hs_card",
            label: "Workshop heating card",
            shape: { type: "rect", points: [[60, 55], [78, 72]] },
            target: { kind: "card", ref: { type: "custom:share-space-heating-card", entity: "sensor.share_space_heating_workshop" } },
          },
        ],
      },
    ],
  };
}

export const OUTDOOR_SENSOR = "sensor.outdoor_temperature";
export const DEFAULT_OUTDOOR = 4;

/**
 * Demo rules for the Open space: 20 °C when occupied; preheat always (6 h at 10 °C outside down to 1 h at 20 °C);
 * 15 °C setback only when the whole empty gap is at most 16 h (a night before a morning); off otherwise (weekends, holidays).
 */
