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
  entities?: Record<string, { entity_id: string; area_id?: string | null; device_id?: string | null }>;
  devices?: Record<string, { id: string; area_id?: string | null }>;
  user?: { id: string; name: string; is_admin: boolean } | null;
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  callService(domain: string, service: string, serviceData?: Record<string, unknown>): Promise<unknown>;
  callApi<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, data?: Record<string, unknown>): Promise<T>;
  now?(): number;
  connection?: {
    subscribeEvents<T>(callback: (event: T) => void, eventType?: string): Promise<() => void>;
    subscribeMessage?<T>(callback: (message: T) => void, subscribeMessage: Record<string, unknown>): Promise<() => void>;
  };
  themes?: Record<string, unknown> & { themes?: Record<string, { modes?: unknown }>; default_theme?: string };
  selectedTheme?: { theme?: string; dark?: boolean } | null;
  language?: string;
  config?: { location_name?: string; unit_system?: { temperature?: string }; time_zone?: string };
}

export const hassNow = (hass: HomeAssistant): number => hass.now?.() ?? Date.now();

export const hassTimeZone = (hass: HomeAssistant): string =>
  hass.config?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Readable text of a thrown value: Error, HA WS error ({message}) or REST error ({body: {message}}). */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  const e = err as { message?: string; body?: { message?: string } } | null;
  return e?.body?.message ?? e?.message ?? String(err);
}
