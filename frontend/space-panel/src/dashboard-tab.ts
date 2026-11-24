import { LitElement, html, css, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { t } from "ha-share-space-ui";
import { getLovelaceConfig, loadCardHelpers, visibleViews } from "ha-share-space-ui/ha";
import type { CardElement, HomeAssistant, LovelaceConfig, LovelaceView } from "ha-share-space-ui/ha";


const AUTO_MSG =
  "This dashboard is auto-generated. In Home Assistant, open it, then ⋮ > Edit dashboard > Take control, to show it here.";

// A Home Assistant dashboard rendered as a tab.
@customElement("share-space-dashboard")
export class ShareSpaceDashboard extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) urlPath: string | null = null;

  @state() private _config: LovelaceConfig | null = null;
  @state() private _loading = true;
  @state() private _error = "";
  @state() private _view = 0;

  private _els: CardElement[] = [];
  private _loadKey = 0;
  private _mountKey = "";

  static styles = css`
    :host {
      display: block;
      padding: 8px 16px 16px;
      color: var(--primary-text-color);
    }
    .tabs {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      margin-bottom: 12px;
    }
    .btn {
      min-height: 44px;
      padding: 0 18px;
      border-radius: 22px;
      border: none;
      cursor: pointer;
      font: inherit;
      font-weight: 500;
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: var(--ha-card-box-shadow, 0 1px 4px rgba(0, 0, 0, 0.25));
      white-space: nowrap;
    }
    .btn.active {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr));
      gap: 12px;
      align-items: stretch;
    }
    .grid.panel {
      grid-template-columns: 1fr;
    }
    .grid > * {
      min-width: 0;
    }
    .msg {
      padding: 24px 0;
      color: var(--secondary-text-color);
    }
    .error {
      color: var(--error-color, #db4437);
    }
  `;

  protected willUpdate(changed: PropertyValues): void {
    if (this.hass && (changed.has("urlPath") || !this._loadKey)) void this._load();
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("hass")) for (const el of this._els) el.hass = this.hass;
    void this._mount();
  }

  private async _load(): Promise<void> {
    if (!this.hass) return;
    const key = ++this._loadKey;
    this._loading = true;
    this._error = "";
    this._view = 0;
    this._mountKey = "";
    this._els = [];
    try {
      const config = await getLovelaceConfig(this.hass, this.urlPath);
      if (key !== this._loadKey) return;
      this._config = config;
    } catch (err) {
      if (key !== this._loadKey) return;
      this._config = null;
      const e = err as { code?: string; message?: string };
      this._error = e?.code === "config_not_found" ? AUTO_MSG : (e?.message ?? String(err));
    }
    this._loading = false;
  }

  private get _views(): LovelaceView[] {
    return visibleViews(this._config, this.hass?.user?.id);
  }

  private _cards(view: LovelaceView): unknown[] {
    if (view.type === "panel") return view.cards?.slice(0, 1) ?? [];
    if (view.sections) {
      return view.sections
        .filter((s) => !s.strategy && s.cards?.length)
        .map((s) => ({ type: "vertical-stack", cards: s.cards }));
    }
    return view.cards ?? [];
  }

  // Build cards only when config/view change; hass updates just set el.hass.
  private async _mount(): Promise<void> {
    const host = this.renderRoot.querySelector<HTMLElement>(".grid");
    const view = this._views[this._view];
    if (!host || !view || !this.hass || view.strategy) return;
    const key = `${this._loadKey}:${this._view}`;
    if (key === this._mountKey) return;
    this._mountKey = key;
    try {
      const helpers = await loadCardHelpers();
      if (this._mountKey !== key) return;
      const els = this._cards(view).map((c) => {
        const el = helpers.createCardElement(c);
        el.hass = this.hass;
        return el;
      });
      this._els = els;
      host.replaceChildren(...els);
    } catch (err) {
      if (this._mountKey !== key) return;
      this._error = err instanceof Error ? err.message : t("Could not render dashboard");
    }
  }

  protected render(): TemplateResult {
    if (this._error) return html`<div class="msg ${this._error === AUTO_MSG ? "" : "error"}">${this._error === AUTO_MSG ? t(AUTO_MSG) : this._error}</div>`;
    if (this._loading) return html`<div class="msg">${t("Loading…")}</div>`;
    const views = this._views;
    if (!views.length) return html`<div class="msg">${this._config?.strategy ? t(AUTO_MSG) : this._config?.views?.length ? t("No view of this dashboard is visible to you.") : t("This dashboard has no views.")}</div>`;
    const view = views[Math.min(this._view, views.length - 1)];
    return html`
      ${views.length > 1
        ? html`<div class="tabs">
            ${views.map(
              (v, i) =>
                html`<button
                  class="btn ${i === this._view ? "active" : ""}"
                  @click=${() => {
                    this._view = i;
                  }}
                >
                  ${v.title ?? v.path ?? t("View {n}", { n: i + 1 })}
                </button>`,
            )}
          </div>`
        : nothing}
      ${view.strategy
        ? html`<div class="msg">${t(AUTO_MSG)}</div>`
        : html`<div class="grid ${view.type === "panel" ? "panel" : ""}"></div>`}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-dashboard": ShareSpaceDashboard;
  }
}
