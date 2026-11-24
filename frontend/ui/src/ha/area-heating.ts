import type { HomeAssistant } from "./hass";

/** The entity's own area, else its device's: how HA itself places an entity. */
export function entityAreaId(hass: HomeAssistant, entityId: string): string | null {
  const e = hass.entities?.[entityId];
  return e?.area_id ?? (e?.device_id ? hass.devices?.[e.device_id]?.area_id ?? null : null);
}
