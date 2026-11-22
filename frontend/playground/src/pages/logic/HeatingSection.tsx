import { useEffect, useRef, useState } from "react";
import "ha-share-space-heating-card";
import type { HomeAssistant } from "ha-share-space-ui/ha";
import { zoneViewModel } from "ha-share-space-heating-card/view-model";
import type { MockHassController } from "../../mock/mock-hass";
import { createCardElement } from "../../stubs";
import { describeError, fmtTime } from "./hooks";

type CardEl = HTMLElement & { hass?: HomeAssistant };

// The real heating card users get, so the bench never drifts from it.
function HeatingCard({ hass, entityId }: { hass: HomeAssistant; entityId: string }) {
  const box = useRef<HTMLDivElement>(null);
  const card = useRef<CardEl | null>(null);
  const hassRef = useRef(hass);
  hassRef.current = hass;
  useEffect(() => {
    const el = createCardElement({ type: "custom:share-space-heating-card", entity: entityId } as { type: string }) as CardEl;
    el.hass = hassRef.current;
    box.current?.replaceChildren(el);
    card.current = el;
    return () => el.remove();
  }, [entityId]);
  useEffect(() => {
    if (card.current) card.current.hass = hass;
  }, [hass]);
  return <div ref={box} className="real" />;
}

function Zone({ hass, entityId, controller }: { hass: HomeAssistant; entityId: string; controller: MockHassController | null }) {
  const [error, setError] = useState("");
  const vm = zoneViewModel(hass, entityId);
  if (!vm) return null;
  const run = (p: Promise<unknown>) => p.then(() => setError(""), (err) => setError(describeError(err)));
  const climate = vm.climateEntity;
  const setpoint = Number(hass.states[climate ?? ""]?.attributes.temperature ?? vm.target);
  const sim = controller?.zones.find((z) => z.config.climate_entity === climate);
  const linked = sim?.config.presence_entity ?? null;
  const area = linked?.startsWith("binary_sensor.share_space_") ? linked.slice("binary_sensor.share_space_".length) : null;
  const forced = area ? controller?.state.forcedPresence[area] : undefined;
  const firstSensor = Object.keys(hass.states).find((id) => id.startsWith("binary_sensor.share_space_"));
  return (
    <div className="panel zone stack">
      <HeatingCard hass={hass} entityId={entityId} />
      {error && <div className="notice error">{error}</div>}
      <div className="muted">Simulate outside the UI:</div>
      <div className="row">
        <button onClick={() => climate && run(hass.callService("climate", "set_temperature", { entity_id: climate, temperature: setpoint + 1 }))}>
          Thermostat +1
        </button>
        <button onClick={() => climate && run(hass.callService("climate", "set_temperature", { entity_id: climate, temperature: setpoint - 1 }))}>
          Thermostat -1
        </button>
        <span className="muted">
          mode {vm.mode} · setpoint {setpoint}
        </span>
      </div>
      {controller && sim && (
        <div className="row">
          {area && (
            <>
              <span className="muted">presence:</span>
              {([true, false, null] as const).map((v) => (
                <button key={String(v)} className={(forced ?? null) === v ? "on" : ""} onClick={() => controller.forcePresence(area, v)}>
                  {v === null ? "auto" : v ? "on" : "off"}
                </button>
              ))}
            </>
          )}
          <button onClick={() => controller.updateZone(sim.config.entry_id, { presence_entity: linked ? null : (firstSensor ?? null) })} disabled={!linked && !firstSensor}>
            {linked ? "Unlink presence" : "Link presence"}
          </button>
        </div>
      )}
    </div>
  );
}

export function HeatingSection({ hass, controller }: { hass: HomeAssistant; controller: MockHassController | null }) {
  const ids = Object.keys(hass.states).filter((id) => id.startsWith("sensor.share_space_heating_"));
  const log = controller?.state.heatingLog ?? [];
  return (
    <div className="stack">
      <h2>Heating zones</h2>
      <div className="muted">
        The heating card for each zone, plus buttons to simulate what happens outside the UI (someone turning the thermostat,
        occupancy forced on/off). Watch the card and the event log react.
      </div>
      {controller && (
        <div className="panel row">
          <label className="row">
            Outdoor temperature
            <input type="range" min={-10} max={25} step={1} value={controller.outdoor} onChange={(e) => controller.setOutdoor(Number(e.target.value))} />
            <b>{controller.outdoor} °C</b>
          </label>
          <button onClick={() => controller.loadDemoRules()}>Load outdoor preheat demo</button>
          <span className="muted">Saves the demo as shared strategy "Old building" used by Open space: 20 °C; preheat 6 h at 10 °C outside down to 1 h at 20 °C; 15 °C setback on nights before a morning; off on weekends. See it in Panel → Rules → Open space, next to the seeded starters Office saver and Lunch room; pick any of them for Workshop or Kitchen.</span>
        </div>
      )}
      {ids.length === 0 && <div className="notice">No heating zones (Share Space Heating not installed or no zone).</div>}
      <div className="zones">
        {ids.map((id) => (
          <Zone key={id} hass={hass} entityId={id} controller={controller} />
        ))}
      </div>
      {controller && (
        <div className="panel">
          <h4>Heating events</h4>
          <div className="log">
            {log.length === 0 && <span className="muted">no events yet</span>}
            {log.map((l) => (
              <div key={l.id}>
                {fmtTime(l.t, controller.tz)} [{l.zone}] {l.event} {l.detail ?? ""}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
