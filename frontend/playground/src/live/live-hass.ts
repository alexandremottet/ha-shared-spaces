import {
  callService,
  createConnection,
  createLongLivedTokenAuth,
  getConfig,
  getUser,
  subscribeEntities,
} from "home-assistant-js-websocket";
import type { Connection, HassEntities } from "home-assistant-js-websocket";
import type { HassEntity, HomeAssistant } from "ha-share-space-ui/ha";

export interface LiveEnv {
  url?: string;
  token?: string;
}

export interface LiveHass {
  readonly hass: HomeAssistant;
  subscribe(listener: (hass: HomeAssistant) => void): () => void;
  dispose(): void;
}

export const liveEnv = (): LiveEnv => ({
  url: import.meta.env.VITE_HA_URL as string | undefined,
  token: import.meta.env.VITE_HA_TOKEN as string | undefined,
});

export async function connectLive(url: string, token: string): Promise<LiveHass> {
  const auth = createLongLivedTokenAuth(url.replace(/\/$/, ""), token);
  const conn: Connection = await createConnection({ auth });
  const [user, config, areaList] = await Promise.all([
    getUser(conn),
    getConfig(conn),
    conn.sendMessagePromise<Array<{ area_id: string; name: string }>>({ type: "config/area_registry/list" }),
  ]);
  const areas = Object.fromEntries(areaList.map((a) => [a.area_id, { area_id: a.area_id, name: a.name }]));
  const listeners = new Set<(hass: HomeAssistant) => void>();
  let states: Record<string, HassEntity> = {};
  let hass = build();

  function build(): HomeAssistant {
    return {
      states,
      areas,
      user: { id: user.id, name: user.name, is_admin: user.is_admin },
      callWS: <T,>(msg: Record<string, unknown>) => conn.sendMessagePromise<T>(msg as never),
      callService: async (domain, service, data) => {
        await callService(conn, domain, service, data);
      },
      callApi: async <T,>(method: string, path: string, data?: Record<string, unknown>) => {
        const res = await fetch(`${url.replace(/\/$/, "")}/api/${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: data === undefined ? undefined : JSON.stringify(data),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw { code: String(res.status), message: (body as { message?: string }).message ?? res.statusText };
        return body as T;
      },
      connection: {
        subscribeEvents: <T,>(cb: (e: T) => void, type?: string) => conn.subscribeEvents<T>(cb, type),
      },
      themes: {},
      language: "en",
      config: { unit_system: { temperature: (config.unit_system as { temperature?: string }).temperature }, time_zone: config.time_zone },
    };
  }

  const unsub = subscribeEntities(conn, (entities: HassEntities) => {
    states = entities as unknown as Record<string, HassEntity>;
    hass = build();
    for (const l of [...listeners]) l(hass);
  });

  return {
    get hass() {
      return hass;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      unsub();
      conn.close();
      listeners.clear();
    },
  };
}
