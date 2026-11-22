import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { HomeAssistant } from "ha-share-space-ui/ha";
import { connectLive, liveEnv } from "./live/live-hass";
import type { LiveHass } from "./live/live-hass";
import { createMockHass } from "./mock/mock-hass";
import type { MockHassController } from "./mock/mock-hass";
import type { MockOptions } from "./mock/types";

export type HassMode = "mock" | "live";
export type LiveStatus =
  | { state: "idle" }
  | { state: "missing-env" }
  | { state: "connecting" }
  | { state: "ready" }
  | { state: "error"; message: string };

export interface HassContextValue {
  mode: HassMode;
  setMode(mode: HassMode): void;
  hass: HomeAssistant | null;
  controller: MockHassController | null;
  liveStatus: LiveStatus;
}

const Ctx = createContext<HassContextValue | null>(null);

const storedMode = (): HassMode => {
  try {
    return localStorage.getItem("playground-mode") === "live" ? "live" : "mock";
  } catch {
    return "mock";
  }
};

export function HassProvider({ children, mockOptions }: { children: ReactNode; mockOptions?: MockOptions }) {
  const controller = useMemo(() => createMockHass({ demoRules: true, ...mockOptions }), []);
  const [mode, setModeState] = useState<HassMode>(storedMode);
  const [mockHass, setMockHass] = useState(controller.hass);
  const [live, setLive] = useState<LiveHass | null>(null);
  const [liveHass, setLiveHass] = useState<HomeAssistant | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>({ state: "idle" });

  useEffect(() => controller.subscribe(setMockHass), [controller]);

  useEffect(() => {
    if (mode !== "live") return;
    const { url, token } = liveEnv();
    if (!url || !token) {
      setLiveStatus({ state: "missing-env" });
      return;
    }
    let cancelled = false;
    let conn: LiveHass | null = null;
    setLiveStatus({ state: "connecting" });
    connectLive(url, token).then(
      (c) => {
        if (cancelled) {
          c.dispose();
          return;
        }
        conn = c;
        setLive(c);
        setLiveHass(c.hass);
        c.subscribe(setLiveHass);
        setLiveStatus({ state: "ready" });
      },
      (err) => {
        if (!cancelled) setLiveStatus({ state: "error", message: describeError(err) });
      }
    );
    return () => {
      cancelled = true;
      conn?.dispose();
      setLive(null);
      setLiveHass(null);
    };
  }, [mode]);

  const value: HassContextValue = {
    mode,
    setMode(next) {
      try {
        localStorage.setItem("playground-mode", next);
      } catch {}
      setModeState(next);
    },
    hass: mode === "mock" ? mockHass : live ? liveHass : null,
    controller: mode === "mock" ? controller : null,
    liveStatus,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function describeError(err: unknown): string {
  if (typeof err === "number") {
    return err === 2 ? "Invalid auth (check VITE_HA_TOKEN)" : err === 1 ? "Cannot connect (check VITE_HA_URL and CORS)" : `Connection error ${err}`;
  }
  return err instanceof Error ? err.message : String(err);
}

export function useHassContext(): HassContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("HassProvider missing");
  return v;
}

export const useHass = (): HomeAssistant | null => useHassContext().hass;
export const useMockController = (): MockHassController | null => useHassContext().controller;

export function LiveGate({ children }: { children: (hass: HomeAssistant) => ReactNode }) {
  const { hass, mode, liveStatus } = useHassContext();
  if (hass) return <>{children(hass)}</>;
  if (mode === "live") {
    if (liveStatus.state === "missing-env") {
      return (
        <div className="notice">
          <h3>Live mode not configured</h3>
          <p>
            Copy <code>frontend/playground/.env.example</code> to <code>frontend/playground/.env.local</code>, set{" "}
            <code>VITE_HA_URL</code> and <code>VITE_HA_TOKEN</code> (long-lived access token), then restart the dev server.
          </p>
        </div>
      );
    }
    if (liveStatus.state === "error") {
      return <div className="notice error">Live connection failed: {liveStatus.message}</div>;
    }
    return <div className="notice">Connecting to Home Assistant...</div>;
  }
  return null;
}
