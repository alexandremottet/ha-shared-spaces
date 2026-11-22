import type { HomeAssistant } from "./hass";

export type SpaceRole = "user" | "space_admin" | "technical_admin";

export interface SharePrefs {
  technical?: boolean;
}

// UI-only role: backend still enforces HA admin on every write.
export function spaceRole(hass: HomeAssistant | undefined | null, prefs?: SharePrefs | null): SpaceRole {
  if (!hass?.user?.is_admin) return "user";
  return prefs?.technical ? "technical_admin" : "space_admin";
}

export const isAdminRole = (role: SpaceRole): boolean => role !== "user";
