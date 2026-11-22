import type { HomeAssistant } from "./hass";

export type CardElement = HTMLElement & { hass?: HomeAssistant };
export interface CardHelpers {
  createCardElement(config: unknown): CardElement;
}

type HelpersWindow = Window & { loadCardHelpers?: () => Promise<CardHelpers> };

// HA defines window.loadCardHelpers only once Lovelace is loaded; load it if needed.
export async function loadCardHelpers(): Promise<CardHelpers> {
  const w = window as HelpersWindow;
  if (!w.loadCardHelpers) {
    type GetRoutes = (panels: Array<{ component_name: string; url_path: string }>) => { routes?: Record<string, { load?(): Promise<unknown> }> };
    const proto = customElements.get("partial-panel-resolver")?.prototype as { getRoutes?: GetRoutes; _getRoutes?: GetRoutes } | undefined;
    const getRoutes = proto?._getRoutes ?? proto?.getRoutes;
    await getRoutes?.call(document.createElement("div"), [{ component_name: "lovelace", url_path: "x" }])?.routes?.x?.load?.();
  }
  if (!w.loadCardHelpers) throw new Error("Home Assistant card helpers are unavailable");
  return w.loadCardHelpers();
}
