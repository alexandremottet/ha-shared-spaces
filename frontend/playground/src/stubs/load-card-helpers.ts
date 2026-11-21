interface CardConfig {
  type: string;
  [key: string]: unknown;
}

function stubCard(config: CardConfig): HTMLElement {
  const card = document.createElement("ha-card");
  card.setAttribute("header", `Stub card: ${config.type}`);
  const pre = document.createElement("pre");
  pre.style.cssText = "margin:0;padding:0 16px 16px;font-size:12px;overflow:auto";
  pre.textContent = JSON.stringify(config, null, 2);
  card.appendChild(pre);
  return card;
}

export function createCardElement(config: CardConfig): HTMLElement {
  if (config.type.startsWith("custom:")) {
    const tag = config.type.slice("custom:".length);
    if (customElements.get(tag)) {
      const el = document.createElement(tag) as HTMLElement & { setConfig?: (c: CardConfig) => void };
      try {
        el.setConfig?.(config);
      } catch (err) {
        const box = stubCard({ ...config, error: String((err as Error).message ?? err) });
        return box;
      }
      return el;
    }
  }
  return stubCard(config);
}

export function installLoadCardHelpers(): void {
  const w = window as unknown as { loadCardHelpers?: () => Promise<unknown> };
  if (!w.loadCardHelpers) w.loadCardHelpers = async () => ({ createCardElement });
}
