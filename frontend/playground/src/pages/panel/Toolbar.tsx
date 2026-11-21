import { useState } from "react";
import { THEMES, applyTheme, initialTheme } from "../../stubs";
import type { ThemeName } from "../../stubs";
import type { MockHassController } from "../../mock/mock-hass";

export type Viewport = "full" | "phone" | "tablet";

export const VIEWPORTS: Record<Viewport, { label: string; size: [number, number] | null }> = {
  full: { label: "Full window", size: null },
  phone: { label: "Phone 390x844", size: [390, 844] },
  tablet: { label: "Tablet 820x1180", size: [820, 1180] },
};

interface Props {
  controller: MockHassController | null;
  edit: boolean;
  setEdit(v: boolean): void;
  narrow: boolean;
  setNarrow(v: boolean): void;
  viewport: Viewport;
  setViewport(v: Viewport): void;
}

export function Toolbar({ controller, edit, setEdit, narrow, setNarrow, viewport, setViewport }: Props) {
  const [theme, setTheme] = useState<ThemeName>(initialTheme);
  const userId = controller?.state.currentUserId;
  const isAdmin = controller?.state.persons.find((p) => p.userId === userId)?.isAdmin ?? true;
  return (
    <div className="panel-toolbar">
      <a href="#/logic">Back to playground</a>
      {controller && (
        <label>
          User
          <select value={userId} onChange={(e) => controller.setUser(e.target.value)}>
            {controller.state.persons.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
                {p.isAdmin ? " (admin)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <label title={isAdmin ? "" : "Edit mode needs an admin user"}>
        <input type="checkbox" checked={edit} disabled={!isAdmin} onChange={(e) => setEdit(e.target.checked)} />
        edit mode
      </label>
      <label>
        <input type="checkbox" checked={narrow} onChange={(e) => setNarrow(e.target.checked)} />
        narrow
      </label>
      <label>
        Viewport
        <select value={viewport} onChange={(e) => setViewport(e.target.value as Viewport)}>
          {Object.entries(VIEWPORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Theme
        <select
          value={theme}
          onChange={(e) => {
            const t = e.target.value as ThemeName;
            setTheme(t);
            applyTheme(t);
          }}
        >
          {THEMES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
