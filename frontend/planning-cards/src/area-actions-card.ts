import "./i18n-fr";
import { css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { t } from "ha-share-space-ui";
import {
  ShareSpaceCardBase,
  getAreaActions,
  haTheme,
  isBackendMissing,
  registerCustomCard,
  renderBackendMissing,
  runAreaActions,
  setAreaActions,
} from "ha-share-space-ui/ha";
import type { HomeAssistant, LovelaceConfigForm, PlanningAction } from "ha-share-space-ui/ha";

interface CardConfig {
  type: string;
  area: string;
  title?: string;
}

type Side = "on" | "off";

let selectorPromise: Promise<boolean> | undefined;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

function ensureHaSelector(): Promise<boolean> {
  if (customElements.get("ha-selector")) {
    return Promise.resolve(true);
  }
  selectorPromise ??= (async () => {
    const force = (async () => {
      try {
        const helpers = await (window as any).loadCardHelpers?.();
        const card = await helpers?.createCardElement?.({ type: "entities", entities: [] });
        await card?.constructor?.getConfigElement?.();
      } catch {
        // fall through to whenDefined / textarea fallback
      }
    })();
    const defined = customElements.whenDefined("ha-selector");
    await withTimeout(Promise.race([defined, force.then(() => defined)]), 3000);
    return !!customElements.get("ha-selector");
  })();
  return selectorPromise;
}

@customElement("share-space-area-actions-card")
export class ShareSpaceAreaActionsCard extends ShareSpaceCardBase<CardConfig> {
  @property({ attribute: false }) declare hass?: HomeAssistant;
  @state() private _on: PlanningAction[] = [];
  @state() private _off: PlanningAction[] = [];
  @state() private _enabled = true;
  @state() private _dirty = false;
  @state() private _loaded = false;
  @state() private _busy = false;
  @state() private _missing = false;
  @state() private _error = "";
  @state() private _selectorReady = false;
  @state() private _areaName = "";
  @state() private _text: Record<Side, string> = { on: "[]", off: "[]" };
  @state() private _textError: Record<Side, string> = { on: "", off: "" };
  private _loadedArea = "";
  private _selectorTried = false;

  static styles = [
    haTheme,
    css`
      ha-card { background: none; box-shadow: none; border: none; }
      .wrap { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
      .head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      .title { font-size: 1.2em; font-weight: 500; flex: 1; min-width: 0; color: var(--primary-text-color); }
      .badge { padding: 2px 10px; border-radius: 12px; font-size: 0.85em; background: var(--divider-color); color: var(--primary-text-color); }
      .badge.on { background: var(--success-color, var(--primary-color)); color: var(--text-primary-color, #fff); }
      .row { display: flex; align-items: center; gap: 8px; color: var(--primary-text-color); }
      .section h3 { margin: 0 0 8px; font-size: 1em; font-weight: 500; color: var(--primary-text-color); }
      textarea { width: 100%; box-sizing: border-box; min-height: 120px; font-family: var(--code-font-family, monospace); background: var(--card-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 4px; padding: 8px; }
      .err { color: var(--error-color); font-size: 0.9em; }
      .muted { color: var(--secondary-text-color); }
      .buttons { display: flex; gap: 8px; flex-wrap: wrap; }
      button { cursor: pointer; padding: 8px 16px; border-radius: 18px; border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color); font: inherit; }
      button.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: transparent; }
      button:disabled { opacity: 0.5; cursor: default; }
      ul { margin: 0; padding-left: 20px; color: var(--primary-text-color); }
    `,
  ];

  setConfig(config: CardConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = config;
  }

  static getStubConfig(): CardConfig {
    return { type: "custom:share-space-area-actions-card", area: "" };
  }

  static getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        { name: "area", required: true, selector: { area: {} } },
        { name: "title", selector: { text: {} } },
      ],
    };
  }

  protected updated(): void {
    const area = this._config?.area;
    if (this.hass && area && area !== this._loadedArea) {
      this._loadedArea = area;
      void this._load(area);
    }
    if (this.hass && area && !this._selectorTried) {
      this._selectorTried = true;
      void ensureHaSelector().then((ok) => (this._selectorReady = ok));
    }
  }

  private async _load(area: string): Promise<void> {
    const hass = this.hass!;
    this._loaded = false;
    this._error = "";
    try {
      const res = await getAreaActions(hass, area);
      this._on = res.on_actions ?? [];
      this._off = res.off_actions ?? [];
      this._enabled = res.enabled;
      this._syncText();
      this._dirty = false;
      this._missing = false;
      this._loaded = true;
    } catch (err) {
      if (isBackendMissing(err)) {
        this._missing = true;
      } else {
        this._error = (err as Error)?.message ?? String(err);
      }
    }
    this._areaName = await this._resolveAreaName(area);
  }

  private async _resolveAreaName(area: string): Promise<string> {
    const hass = this.hass as (HomeAssistant & { areas?: Record<string, { name?: string }> }) | undefined;
    const known = hass?.areas?.[area]?.name;
    if (known) {
      return known;
    }
    try {
      const list = await hass!.callWS<Array<{ area_id: string; name: string }>>({ type: "config/area_registry/list" });
      return list.find((a) => a.area_id === area)?.name ?? area;
    } catch {
      return area;
    }
  }

  private _syncText(): void {
    this._text = { on: JSON.stringify(this._on, null, 2), off: JSON.stringify(this._off, null, 2) };
    this._textError = { on: "", off: "" };
  }

  private _setActions(side: Side, value: unknown): void {
    const list = Array.isArray(value) ? (value as PlanningAction[]) : [];
    if (side === "on") {
      this._on = list;
    } else {
      this._off = list;
    }
    this._dirty = true;
  }

  private _onTextInput(side: Side, text: string): void {
    this._text = { ...this._text, [side]: text };
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error(t("Must be a JSON list of actions"));
      }
      this._textError = { ...this._textError, [side]: "" };
      this._setActions(side, parsed);
    } catch (err) {
      this._textError = { ...this._textError, [side]: (err as Error).message };
    }
  }

  private async _run<T>(fn: () => Promise<T>): Promise<boolean> {
    this._busy = true;
    this._error = "";
    try {
      await fn();
      return true;
    } catch (err) {
      if (isBackendMissing(err)) {
        this._missing = true;
      } else {
        this._error = (err as Error)?.message ?? String(err);
      }
      return false;
    } finally {
      this._busy = false;
    }
  }

  private async _save(): Promise<void> {
    const ok = await this._run(() =>
      setAreaActions(this.hass!, this._config!.area, {
        on_actions: this._on,
        off_actions: this._off,
        enabled: this._enabled,
      }),
    );
    if (ok) {
      this._dirty = false;
      this.dispatchEvent(new CustomEvent("actions-saved", { bubbles: true, composed: true }));
    }
  }

  private _test(side: Side): void {
    void this._run(() => runAreaActions(this.hass!, this._config!.area, side));
  }

  private _toggleEnabled(value: boolean): void {
    this._enabled = value;
    this._dirty = true;
  }

  private _renderToggle() {
    const label = html`<span>${t("Enabled")}</span>`;
    if (customElements.get("ha-switch")) {
      return html`<div class="row">${label}<ha-switch .checked=${this._enabled} @change=${(e: Event) => this._toggleEnabled((e.target as HTMLInputElement).checked)}></ha-switch></div>`;
    }
    return html`<label class="row"><input type="checkbox" .checked=${this._enabled} @change=${(e: Event) => this._toggleEnabled((e.target as HTMLInputElement).checked)} />${label}</label>`;
  }

  private _renderEditor(side: Side) {
    const value = side === "on" ? this._on : this._off;
    if (this._selectorReady) {
      return html`<ha-selector
        .hass=${this.hass}
        .selector=${{ action: {} }}
        .value=${value}
        @value-changed=${(e: CustomEvent) => {
          e.stopPropagation();
          this._setActions(side, e.detail.value);
        }}
      ></ha-selector>`;
    }
    return html`
      <textarea .value=${this._text[side]} @input=${(e: Event) => this._onTextInput(side, (e.target as HTMLTextAreaElement).value)}></textarea>
      ${this._textError[side] ? html`<div class="err">${this._textError[side]}</div>` : nothing}
    `;
  }

  private _summary(list: PlanningAction[]) {
    if (!list.length) {
      return html`<div class="muted">${t("No actions")}</div>`;
    }
    return html`<div class="muted">${list.length > 1 ? t("{count} actions", { count: list.length }) : t("{count} action", { count: list.length })}</div>
      <ul>${list.map((a) => html`<li>${String(a.action ?? a.service ?? a.type ?? "action")}</li>`)}</ul>`;
  }

  protected render() {
    if (this._missing) {
      return renderBackendMissing("Share Space");
    }
    const area = this._config?.area;
    if (!area) {
      return html`<ha-card><div class="wrap muted">${t("Select an area in the card settings.")}</div></ha-card>`;
    }
    const isAdmin = !!this.hass?.user?.is_admin;
    const sensor = this.hass?.states[`binary_sensor.share_space_${area}`];
    const stateLabel = sensor ? (sensor.state === "on" ? t("Occupied") : sensor.state === "off" ? t("Empty") : sensor.state) : t("Unknown");
    const sections: Array<[Side, string]> = [
      ["on", t("When occupied (ON)")],
      ["off", t("When empty (OFF)")],
    ];
    return html`
      <ha-card>
        <div class="wrap">
          <div class="head">
            <div class="title">${this._config?.title || this._areaName || area}</div>
            <span class="badge ${sensor?.state === "on" ? "on" : ""}">${stateLabel}</span>
          </div>
          ${this._error ? html`<div class="err">${this._error}</div>` : nothing}
          ${!this._loaded
            ? html`<div class="muted">${t("Loading…")}</div>`
            : isAdmin
              ? html`
                  ${this._renderToggle()}
                  ${sections.map(([side, label]) => html`<div class="section"><h3>${label}</h3>${this._renderEditor(side)}</div>`)}
                  <div class="buttons">
                    <button class="primary" ?disabled=${!this._dirty || this._busy || !!this._textError.on || !!this._textError.off} @click=${() => this._save()}>${t("Save")}</button>
                    <button ?disabled=${this._busy || this._dirty} @click=${() => this._test("on")}>${t("Test ON")}</button>
                    <button ?disabled=${this._busy || this._dirty} @click=${() => this._test("off")}>${t("Test OFF")}</button>
                  </div>
                `
              : html`
                  <div class="muted">${this._enabled ? t("Enabled") : t("Disabled")}</div>
                  ${sections.map(([side, label]) => html`<div class="section"><h3>${label}</h3>${this._summary(side === "on" ? this._on : this._off)}</div>`)}
                `}
        </div>
      </ha-card>
    `;
  }
}

registerCustomCard({
  type: "share-space-area-actions-card",
  name: "Share Space – Area actions",
  description: "Edit and test the actions run when an area becomes occupied or empty.",
});

declare global {
  interface HTMLElementTagNameMap {
    "share-space-area-actions-card": ShareSpaceAreaActionsCard;
  }
}
