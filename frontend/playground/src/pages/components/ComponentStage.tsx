import { createElement, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentDef, PropDef } from "./registry";

interface LogEntry {
  n: number;
  time: string;
  type: string;
  detail: string;
}

const initialRaw = (def: ComponentDef): Record<string, unknown> =>
  Object.fromEntries(def.props.map((p) => [p.name, p.kind === "json" ? JSON.stringify(p.value, null, 2) : p.value]));

function convert(p: PropDef, raw: unknown): { ok: true; value: unknown } | { ok: false } {
  if (p.kind === "json") {
    try {
      return { ok: true, value: JSON.parse(String(raw)) };
    } catch {
      return { ok: false };
    }
  }
  const value = p.parse ? p.parse(raw) : raw;
  return { ok: true, value };
}

function PropControl({ p, raw, onChange }: { p: PropDef; raw: unknown; onChange: (v: unknown) => void }) {
  if (p.kind === "boolean") {
    return <input type="checkbox" checked={Boolean(raw)} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (p.kind === "select") {
    return (
      <select value={String(raw)} onChange={(e) => onChange(e.target.value)}>
        {p.options?.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  }
  if (p.kind === "number") {
    return <input type="number" step="any" value={raw === null || raw === undefined ? "" : String(raw)} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
  }
  if (p.kind === "json") {
    const bad = !convert(p, raw).ok;
    return <textarea className={bad ? "invalid" : ""} rows={6} spellCheck={false} value={String(raw)} onChange={(e) => onChange(e.target.value)} />;
  }
  return <input type="text" value={String(raw ?? "")} onChange={(e) => onChange(e.target.value)} />;
}

export function ComponentStage({ def }: { def: ComponentDef }) {
  const ref = useRef<HTMLElement | null>(null);
  const [raw, setRaw] = useState(() => initialRaw(def));
  const [log, setLog] = useState<LogEntry[]>([]);
  const counter = useRef(0);

  const applied = useMemo(() => {
    const out: Record<string, unknown> = { ...def.fixed };
    for (const p of def.props) {
      const r = convert(p, raw[p.name]);
      if (r.ok) out[p.name] = r.value;
    }
    return out;
  }, [def, raw]);

  useEffect(() => {
    if (ref.current) Object.assign(ref.current, applied);
  }, [applied]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const entry = { n: ++counter.current, time: new Date().toLocaleTimeString(), type: e.type, detail: detail === undefined || detail === null ? "" : JSON.stringify(detail) };
      setLog((l) => [entry, ...l].slice(0, 100));
    };
    def.events.forEach((n) => el.addEventListener(n, handler));
    return () => def.events.forEach((n) => el.removeEventListener(n, handler));
  }, [def]);

  return (
    <div className="cmp-detail">
      <header>
        <h3>
          <code>&lt;{def.tag}&gt;</code>
        </h3>
        <p className="muted">{def.description}</p>
      </header>
      <section className="panel cmp-live">
        <h4>Live</h4>
        <div className="cmp-stage" style={def.stage}>
          {createElement(def.tag, { ref })}
        </div>
        {def.actions && (
          <div className="row">
            {def.actions.map((a) => (
              <button key={a.label} onClick={() => ref.current && a.run(ref.current)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </section>
      <div className="cmp-lower">
        <section className="panel">
          <h4>Props</h4>
          {def.props.length === 0 && <p className="muted">No properties.</p>}
          <div className="cmp-props">
            {def.props.map((p) => (
              <label key={p.name} className={p.kind === "json" ? "wide" : ""}>
                <span>{p.name}</span>
                <PropControl p={p} raw={raw[p.name]} onChange={(v) => setRaw((r) => ({ ...r, [p.name]: v }))} />
              </label>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="row">
            <h4>Events</h4>
            <span className="muted">{def.events.join(", ") || "none emitted"}</span>
            <span className="spacer" />
            <button onClick={() => setLog([])}>Clear</button>
          </div>
          <div className="cmp-log">
            {log.length === 0 && <span className="muted">No events yet.</span>}
            {log.map((e) => (
              <div key={e.n}>
                <span className="muted">{e.time}</span> <strong>{e.type}</strong> <code>{e.detail}</code>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
