import { useEffect, useMemo, useRef, useState } from "react";
import "ha-share-space-planning-cards";
import type { RosterViewMode } from "ha-share-space-ui";
import { runAreaActions } from "ha-share-space-ui/ha";
import type { HomeAssistant } from "ha-share-space-ui/ha";
import type { MockHassController } from "../../mock/mock-hass";
import { CardHost } from "../cards/CardHost";
import { describeError, fmtTime } from "./hooks";

function AreaCard({ hass, areaId, controller }: { hass: HomeAssistant; areaId: string; controller: MockHassController | null }) {
  const [mode, setMode] = useState<RosterViewMode>("merged");
  const [error, setError] = useState("");
  const [planningRev, setPlanningRev] = useState(0);
  const [actionsRev, setActionsRev] = useState(0);
  const planningBox = useRef<HTMLDivElement>(null);
  const actionsBox = useRef<HTMLDivElement>(null);
  const sensor = hass.states[`binary_sensor.share_space_${areaId}`];
  const planningConfig = useMemo(() => ({ type: "custom:share-space-area-planning-card", area: areaId, view_mode: mode }), [areaId, mode]);
  const actionsConfig = useMemo(() => ({ type: "custom:share-space-area-actions-card", area: areaId }), [areaId]);

  useEffect(() => {
    const p = planningBox.current;
    const a = actionsBox.current;
    const onLinks = () => setActionsRev((r) => r + 1);
    const onSaved = () => setPlanningRev((r) => r + 1);
    p?.addEventListener("links-changed", onLinks);
    a?.addEventListener("actions-saved", onSaved);
    return () => {
      p?.removeEventListener("links-changed", onLinks);
      a?.removeEventListener("actions-saved", onSaved);
    };
  }, [!!sensor]);

  const on = sensor?.state === "on";
  const nextChange = sensor?.attributes.next_change ? Date.parse(String(sensor.attributes.next_change)) : null;
  const log = controller?.state.actionsLog.filter((l) => l.area === areaId) ?? [];
  return (
    <div className="panel stack">
      <div className="row">
        <h3>{hass.areas?.[areaId]?.name ?? areaId}</h3>
        {sensor ? <span className={`pill ${on ? "on" : ""}`}>{on ? "occupied" : "empty"}</span> : <span className="pill">no sensor</span>}
        <span className="muted">
          {sensor ? `next change: ${nextChange ? fmtTime(nextChange, controller?.tz) : "none"}` : "assign a person to create binary_sensor.share_space_" + areaId}
        </span>
      </div>
      {sensor && (
        <div className="row">
          {(["merged", "lanes", "overlap"] as const).map((m) => (
            <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
          <span className="muted">test actions:</span>
          {(["on", "off"] as const).map((s) => (
            <button key={s} onClick={() => runAreaActions(hass, areaId, s).catch((err) => setError(describeError(err)))}>
              {s}
            </button>
          ))}
        </div>
      )}
      {error && <div className="notice error">{error}</div>}
      {sensor && (
        <div ref={planningBox}>
          <div className="real"><CardHost key={`p${planningRev}`} tag="share-space-area-planning-card" config={planningConfig} hass={hass} /></div>
        </div>
      )}
      {sensor && (
        <details>
          <summary>Actions</summary>
          <div ref={actionsBox}>
            <div className="real"><CardHost key={`a${actionsRev}`} tag="share-space-area-actions-card" config={actionsConfig} hass={hass} /></div>
          </div>
        </details>
      )}
      {controller && (
        <div className="log">
          {log.length === 0 && <span className="muted">no actions yet</span>}
          {log.map((l) => (
            <div key={l.id}>
              {fmtTime(l.t, controller.tz)} {l.source === "manual" ? "test" : "transition"} {l.state}:{" "}
              {l.ran ? l.steps.map((s) => `${s.service}(${s.entities.join(",")})${s.ok ? "" : " FAILED " + s.error}`).join("; ") : "no actions"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AreaPanels({ hass, controller }: { hass: HomeAssistant; controller: MockHassController | null }) {
  const ids = Object.keys(hass.areas ?? {});
  return (
    <div className="stack">
      {ids.map((id) => (
        <AreaCard key={id} hass={hass} areaId={id} controller={controller} />
      ))}
      {ids.length === 0 && <div className="notice">No areas.</div>}
    </div>
  );
}
