import { useEffect, useMemo, useState } from "react";
import "ha-share-space-planning-cards";
import "ha-share-space-heating-card";
import { LiveGate, useHassContext } from "../hass-context";
import { MockBar } from "./logic/ClockBar";
import { CardHost } from "./cards/CardHost";
import type { CardEl } from "./cards/CardHost";
import { CARDS, staticOf } from "./cards/catalog";
import "./cards/cards.css";
import { WidthFrame } from "./cards/WidthFrame";

function CardGallery() {
  const { hass } = useHassContext();
  const [tag, setTag] = useState(CARDS[0].tag);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, unknown>>({});
  const [parseError, setParseError] = useState("");
  const [cardError, setCardError] = useState("");
  const [grid, setGrid] = useState<unknown>(null);

  const def = CARDS.find((c) => c.tag === tag) ?? CARDS[0];
  const text = texts[tag];

  useEffect(() => {
    if (!hass || texts[tag] !== undefined) return;
    const seed = def.seedConfig(hass);
    setTexts((t) => ({ ...t, [tag]: JSON.stringify(seed, null, 2) }));
    setApplied((a) => ({ ...a, [tag]: seed }));
  }, [hass, tag]);

  const edit = (value: string) => {
    setTexts((t) => ({ ...t, [tag]: value }));
    try {
      setApplied((a) => ({ ...a, [tag]: JSON.parse(value) }));
      setParseError("");
    } catch (err) {
      setParseError((err as Error).message);
    }
  };

  const form = useMemo(() => staticOf(tag)?.getConfigForm?.() ?? null, [tag]);
  const config = applied[tag];

  if (!hass) return null;
  return (
    <div className="logic">
      <div className="row">
        {CARDS.map((c) => (
          <button key={c.tag} className={c.tag === tag ? "on" : ""} onClick={() => setTag(c.tag)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="card-layout">
        <WidthFrame footer={cardError && <div className="notice error">setConfig error: {cardError}</div>}>
          {config !== undefined && (
            <CardHost
              key={tag}
              tag={tag}
              config={config}
              hass={hass}
              onElement={(el: CardEl) => setGrid(el.getGridOptions?.() ?? null)}
              onError={setCardError}
            />
          )}
        </WidthFrame>
        <div className="panel stack">
          <h4>Config (JSON)</h4>
          <textarea className="json-edit" spellCheck={false} value={text ?? ""} onChange={(e) => edit(e.target.value)} />
          {parseError && <div className="notice error">{parseError}</div>}
          <h4>getConfigForm()</h4>
          <pre className="json">{JSON.stringify(form, null, 2)}</pre>
          <h4>getGridOptions()</h4>
          <pre className="json">{JSON.stringify(grid, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

export function CardsPage() {
  const { controller } = useHassContext();
  return (
    <div className="logic">
      {controller && <MockBar controller={controller} />}
      <LiveGate>{() => <CardGallery />}</LiveGate>
    </div>
  );
}
