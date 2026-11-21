export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  context?: { id: string; parent_id?: string | null; user_id?: string | null };
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  areas?: Record<string, { area_id: string; name: string }>;
  user?: { id: string; name: string; is_admin: boolean } | null;
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  callService(domain: string, service: string, serviceData?: Record<string, unknown>): Promise<unknown>;
  callApi<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, data?: Record<string, unknown>): Promise<T>;
  now?(): number;
  connection?: {
    subscribeEvents<T>(callback: (event: T) => void, eventType?: string): Promise<() => void>;
  };
  themes?: Record<string, unknown>;
  language?: string;
  config?: { unit_system?: { temperature?: string }; time_zone?: string };
}

export const hassNow = (hass: HomeAssistant): number => hass.now?.() ?? Date.now();

export const hassTimeZone = (hass: HomeAssistant): string =>
  hass.config?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
