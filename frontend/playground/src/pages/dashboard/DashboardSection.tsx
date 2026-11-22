import { useEffect, useRef, useState } from "react";
import type { HomeAssistant } from "ha-share-space-ui/ha";
import { createCardElement } from "../../stubs";
import { WidthFrame } from "../cards/WidthFrame";
import "./dashboard.css";

type Json = Record<string, unknown>;
type Generator = { generate(config: Json, hass: HomeAssistant): Promise<Json> };

const generator = (tag: string) => customElements.get(tag) as unknown as Generator | undefined;

function collectCards(view: Json): Json[] {
  const sections = (view.sections as Json[] | undefined) ?? [];
  return [...((view.cards as Json[] | undefined) ?? []), ...sections.flatMap((s) => (s.cards as Json[] | undefined) ?? [])];
}

async function resolveView(view: Json, hass: HomeAssistant): Promise<Json> {
  const strategy = view.strategy as Json | undefined;
  if (!strategy) return view;
  const tag = `ll-strategy-view-${String(strategy.type).replace(/^custom:/, "")}`;
  try {
    const resolved = await generator(tag)?.generate(strategy, hass);
    return { ...view, ...(resolved ?? {}), strategy: undefined };
  } catch (err) {
    return { ...view, error: String((err as Error).message ?? err) };
  }
}

function Cards({ view, hass }: { view: Json; hass: HomeAssistant }) {
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef<Array<HTMLElement & { hass?: HomeAssistant }>>([]);
  const hassRef = useRef(hass);
  hassRef.current = hass;
  useEffect(() => {
    const root = box.current;
    if (!root) return;
    root.replaceChildren();
    cards.current = [];
    for (const cfg of collectCards(view)) {
      if (cfg.type === "heading") {
        const h = document.createElement("h4");
        h.className = "grid-heading";
        h.textContent = String(cfg.heading ?? "");
        root.appendChild(h);
        continue;
      }
      if (cfg.type === "markdown") {
        const p = document.createElement("div");
        p.className = "notice";
        p.textContent = String(cfg.content ?? "");
        root.appendChild(p);
        continue;
      }
      const el = createCardElement(cfg as { type: string }) as HTMLElement & { hass?: HomeAssistant };
      el.hass = hassRef.current;
      root.appendChild(el);
      cards.current.push(el);
    }
  }, [view]);
  // Like HA: push new hass into existing cards instead of recreating them.
  useEffect(() => {
    for (const el of cards.current) el.hass = hass;
  }, [hass]);
  return <div ref={box} className="dash-grid" />;
}

export function DashboardSection({ hass, refreshKey }: { hass: HomeAssistant; refreshKey: string }) {
  const [result, setResult] = useState<Json | null>(null);
  const [views, setViews] = useState<Json[]>([]);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const hassRef = useRef(hass);
  hassRef.current = hass;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const gen = generator("ll-strategy-dashboard-share-space");
        if (!gen) throw new Error("strategy element not defined");
        const res = await gen.generate({}, hassRef.current);
        const resolved = await Promise.all(((res.views as Json[]) ?? []).slice(0, 4).map((v) => resolveView(v, hassRef.current)));
        if (cancelled) return;
        setResult(res);
        setViews(resolved);
        setError("");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const view = views[Math.min(active, views.length - 1)];
  return (
    <div className="card-layout">
      <WidthFrame
        header={
          <>
            <h3>Generated dashboard</h3>
            <div className="muted">
              <code>ll-strategy-dashboard-share-space.generate({"{}"}, hass)</code> (regenerates on user, backend toggles or reset)
            </div>
            {error && <div className="notice error">{error}</div>}
          </>
        }
      >
        <div className="stack">
          <div className="row">
            {views.map((v, i) => (
              <button key={i} className={i === active ? "on" : ""} onClick={() => setActive(i)}>
                {String(v.title ?? `View ${i + 1}`)}
              </button>
            ))}
          </div>
          {view && (
            <>
              {typeof view.error === "string" && <div className="notice error">{view.error}</div>}
              <Cards view={view} hass={hass} />
            </>
          )}
        </div>
      </WidthFrame>
      <section className="panel stack">
        <h3>Config (JSON)</h3>
        <pre className="json">{result ? JSON.stringify(result, null, 2) : "..."}</pre>
      </section>
    </div>
  );
}
