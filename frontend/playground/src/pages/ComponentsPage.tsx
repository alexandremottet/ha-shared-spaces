import { useState } from "react";
import { ComponentStage } from "./components/ComponentStage";
import { COMPONENTS } from "./components/registry";
import "./components/components.css";

const GROUPS = ["Schedule", "Roster", "Heating", "HA"] as const;

export function ComponentsPage() {
  const [id, setId] = useState(COMPONENTS[0].id);
  const def = COMPONENTS.find((c) => c.id === id) ?? COMPONENTS[0];
  return (
    <div className="cmp">
      <nav className="cmp-list">
        {GROUPS.map((g) => (
          <div key={g} className="stack" style={{ gap: 2 }}>
            <h5>{g}</h5>
            {COMPONENTS.filter((c) => c.group === g).map((c) => (
              <button key={c.id} className={c.id === id ? "on" : ""} onClick={() => setId(c.id)}>
                {c.id}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <ComponentStage key={def.id} def={def} />
    </div>
  );
}
