import { useEffect, useRef, useState } from "react";
import { clearOverride, extendOverride, setOverride } from "ha-share-space-ui/ha";
import type { HomeAssistant } from "ha-share-space-ui/ha";
import { zoneViewModel } from "ha-share-space-heating-card/view-model";
import type { MockHassController } from "../../mock/mock-hass";
import { describeError, fmtTime } from "./hooks";

type Handlers = {
  onOverride(d: { temperature: number; hours: number }): void;
  onExtend(d: { hours: number }): void;
  onClear(): void;
  onTarget(d: { temperature: number }): void;
};

function Control({ props, handlers }: { props: Record<string, unknown>; handlers: Handlers }) {
  const el = useRef<HTMLElement>(null);
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (el.current) Object.assign(el.current, props);
  });
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const on = (name: string, fn: (d: any) => void) => {
      const listener = (e: Event) => fn((e as CustomEvent).detail);
      node.addEventListener(name, listener);
      return () => node.removeEventListener(name, listener);
    };
    const offs = [
      on("override-requested", (d) => ref.current.onOverride(d)),
      on("override-extended", (d) => ref.current.onExtend(d)),
      on("override-cleared", () => ref.current.onClear()),
      on("target-set", (d) => ref.current.onTarget(d)),
    ];
    return () => offs.forEach((o) => o());
  }, []);
  return <share-space-heating-control ref={el}></share-space-heating-control>;
}

function StrategyPanel({ hass, zone }: { hass: HomeAssistant; zone: string }) {
  const el = useRef<HTMLElement>(null);
  const [nav, setNav] = useState("");
  useEffect(() => {
    if (el.current) Object.assign(el.current, { hass, zone });
  });
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const listener = (e: Event) => {
      e.preventDefault();
      setNav(String((e as CustomEvent<{ path: string }>).detail.path));
    };
    node.addEventListener("navigate-requested", listener);
    return () => node.removeEventListener("navigate-requested", listener);
  }, []);
  return (
    <details className="strategy" open>
      <summary>Strategy</summary>
      <share-space-strategy-editor ref={el}></share-space-strategy-editor>
      {nav && <div className="muted">HA would navigate to {nav}</div>}
    </details>
  );
}

function Zone({ hass, entityId, controller }: { hass: HomeAssistant; entityId: string; controller: MockHassController | null }) {
  const [error, setError] = useState("");
  const vm = zoneViewModel(hass, entityId);
  if (!vm) return null;
  const run = (p: Promise<unknown>) => p.then(() => setError(""), (err) => setError(describeError(err)));
  const climate = vm.climateEntity;
  const setpoint = Number(hass.states[climate ?? ""]?.attributes.temperature ?? vm.target);
  const presenceEntity = String(hass.states[entityId].attributes.presence_entity ?? "");
  const sim = controller?.zones.find((z) => z.config.climate_entity === climate);
  const linked = sim?.config.presence_entity ?? null;
  const area = linked?.startsWith("binary_sensor.share_space_") ? linked.slice("binary_sensor.share_space_".length) : null;
  const forced = area ? controller?.state.forcedPresence[area] : undefined;
  const firstSensor = Object.keys(hass.states).find((id) => id.startsWith("binary_sensor.share_space_"));
  void presenceEntity;
  return (
    <div className="panel zone stack">
      <Control
        handlers={{
          onOverride: (d) => run(setOverride(hass, entityId, d.temperature, d.hours)),
          onExtend: (d) => run(extendOverride(hass, entityId, d.hours)),
          onClear: () => run(clearOverride(hass, entityId)),
          onTarget: (d) => climate && run(hass.callService("climate", "set_temperature", { entity_id: climate, temperature: d.temperature })),
        }}
        props={{
          name: vm.name,
          currentTemperature: vm.currentTemperature,
          target: vm.target,
          min: vm.min,
          max: vm.max,
          step: vm.step,
          unit: vm.unit,
          mode: vm.mode,
          overrideUntil: vm.overrideUntil,
          presence: vm.presence,
          reason: vm.activeRule,
        }}
      />
      {error && <div className="notice error">{error}</div>}
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
      <StrategyPanel hass={hass} zone={entityId} />
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
      <h2>Heating simulation</h2>
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
