import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { HassProvider, useHassContext } from "./hass-context";
import { LogicPage } from "./pages/LogicPage";
import { ComponentsPage } from "./pages/ComponentsPage";
import { CardsPage } from "./pages/CardsPage";
import { PanelPage } from "./pages/PanelPage";
import { THEMES, applyTheme, initialTheme } from "./stubs";
import type { ThemeName } from "./stubs";

interface Route {
  path: string;
  label: string;
  Page: ComponentType;
}

export const routes: Route[] = [
  { path: "logic", label: "Logic", Page: LogicPage },
  { path: "components", label: "Components", Page: ComponentsPage },
  { path: "cards", label: "Cards", Page: CardsPage },
  { path: "panel", label: "Panel", Page: PanelPage },
];

const currentPath = () => window.location.hash.replace(/^#\/?/, "") || routes[0].path;

function useHashRoute(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onChange = () => setPath(currentPath());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return path;
}

function Nav({ path }: { path: string }) {
  const { mode, setMode, liveStatus } = useHassContext();
  const [theme, setTheme] = useState<ThemeName>(initialTheme);
  return (
    <nav className="nav">
      <strong className="brand">Share Space Playground</strong>
      {routes.map((r) => (
        <a key={r.path} href={`#/${r.path}`} className={r.path === path ? "active" : ""}>
          {r.label}
        </a>
      ))}
      <span className="spacer" />
      <label>
        Data
        <select value={mode} onChange={(e) => setMode(e.target.value as "mock" | "live")}>
          <option value="mock">Mock</option>
          <option value="live">Live HA</option>
        </select>
      </label>
      {mode === "live" && <span className="badge">{liveStatus.state}</span>}
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
    </nav>
  );
}

function Shell() {
  const path = useHashRoute();
  const route = routes.find((r) => r.path === path) ?? routes[0];
  return (
    <>
      <Nav path={route.path} />
      <main className="main">
        <route.Page />
      </main>
    </>
  );
}

export function App() {
  return (
    <HassProvider>
      <Shell />
    </HassProvider>
  );
}
