import { useEffect, useRef, useState } from "react";
import { useHassContext } from "../../hass-context";

const EVENTS = ["share_space_calendar_updated", "share_space_person_area_assigned"];

export function usePlanningTick(): number {
  const { hass, mode } = useHassContext();
  const hassRef = useRef(hass);
  hassRef.current = hass;
  const ready = hass !== null;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const connection = hassRef.current?.connection;
    if (!connection) return;
    const unsubs = EVENTS.map((type) => connection.subscribeEvents(() => setTick((t) => t + 1), type));
    return () => {
      unsubs.forEach((p) => p.then((u) => u()).catch(() => undefined));
    };
  }, [ready, mode]);
  return tick;
}

export function describeError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  return e?.message ? `${e.code ?? "error"}: ${e.message}` : String(err);
}

export const fmtTime = (ms: number, tz?: string): string =>
  new Date(ms).toLocaleString([], { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
