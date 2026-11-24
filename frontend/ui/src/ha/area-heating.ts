import type { HomeAssistant } from "./hass";
import type { HeatingZone } from "./ws";

export interface AreaHeating {
  source: "heaters" | "thermostat";
  thermostat: string;
  heaters: string[];
  sensor: string;
}

/** The entity's own area, else its device's: how HA itself places an entity. */
export function entityAreaId(hass: HomeAssistant, entityId: string): string | null {
  const e = hass.entities?.[entityId];
  return e?.area_id ?? (e?.device_id ? hass.devices?.[e.device_id]?.area_id ?? null : null);
}

const members = (hass: HomeAssistant, id: string): string[] => {
  const ids = hass.states[id]?.attributes.entity_id;
  return Array.isArray(ids) ? ids.map(String) : [];
};

/** Heating HA already holds for an area, as the Add heating form fields; null when the area has none. */
export function detectAreaHeating(hass: HomeAssistant, areaId: string, zones: HeatingZone[] = []): AreaHeating | null {
  const ids = Object.keys(hass.states);
  const inArea = (id: string) => entityAreaId(hass, id) === areaId;
  const taken = new Set(zones.flatMap((z) => [z.climate_entity, ...(z.heaters ?? []), z.heater_switch ?? ""]));
  const ours = (id: string) => id.includes(".share_space_");

  const sensor = (): string => {
    const set = hass.areas?.[areaId]?.temperature_entity_id;
    if (set && hass.states[set]) return set;
    return ids.find((id) => id.startsWith("sensor.") && !ours(id) && inArea(id) && hass.states[id].attributes.device_class === "temperature") ?? "";
  };

  const climate = ids.filter((id) => id.startsWith("climate.") && inArea(id) && !taken.has(id)).sort()[0];
  if (climate) return { source: "thermostat", thermostat: climate, heaters: [], sensor: sensor() };

  const switches = ids.filter((id) => id.startsWith("switch.") && !ours(id) && !taken.has(id));
  const local = switches.filter(inArea);
  // A group switch (switch_as_x or group helper) drives the physical switches: keep it, drop its members.
  const groups = switches.filter((id) => {
    const m = members(hass, id);
    return m.length > 0 && (inArea(id) || m.some(inArea));
  });
  const grouped = new Set(groups.flatMap((g) => members(hass, g)));
  const heaters = [...new Set([...groups, ...local])].filter((id) => !grouped.has(id)).sort();
  if (!heaters.length) return null;
  return { source: "heaters", thermostat: "", heaters, sensor: sensor() };
}
