import { safeCustomElement } from "../define";
import { t } from "../i18n";
import { LitElement, html, css, nothing } from "lit";
import { property, state } from "lit/decorators.js";
import type { PropertyValues } from "lit";

const AUTO_APPLY_MS = 4000;

export type HeatingMode = "schedule" | "override" | "manual_only" | "automation" | "unmanaged";

export interface OverrideRequestedDetail {
  temperature: number;
  hours: number;
}

@safeCustomElement("share-space-heating-control")
export class HeatingControl extends LitElement {
  @property() name = "";
  @property({ type: Number }) currentTemperature: number | null = null;
  @property({ type: Number }) target = 20;
  @property({ type: Number }) min = 5;
  @property({ type: Number }) max = 30;
  @property({ type: Number }) step = 0.5;
  @property() unit = "°C";
  @property() mode: HeatingMode = "schedule";
  @property({ attribute: false }) overrideUntil: Date | null = null;
  @property({ type: Boolean }) presence: boolean | null = null;
  @property() reason: string | null = null;
  @property({ attribute: false }) durations: number[] = [1, 2, 3, 6];
  /** Duration applied automatically if the user picks none; must be one of `durations`. */
  @property({ type: Number }) defaultHours = 2;
  @property({ attribute: false }) presets: Array<{ label: string; temperature: number }> = [];
  @property({ type: Boolean, reflect: true }) compact = false;
  @property({ type: Boolean, reflect: true }) heating = false;

  @state() private _pending: number | null = null;

  private _autoTimer: ReturnType<typeof setTimeout> | undefined;

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("target") || changed.has("mode")) {
      this._pending = null;
    }
  }

  protected updated(changed: PropertyValues): void {
    if (!changed.has("_pending")) return;
    clearTimeout(this._autoTimer);
    if (this._autoApplies) this._autoTimer = setTimeout(() => this._confirmHours(this.defaultHours), AUTO_APPLY_MS);
  }

  disconnectedCallback(): void {
    clearTimeout(this._autoTimer);
    super.disconnectedCallback();
  }

  private get _autoApplies(): boolean {
    return this._pending !== null && this.mode !== "unmanaged" && this.durations.includes(this.defaultHours);
  }

  static styles = css`
    :host {
      display: block;
      container-type: inline-size;
      color: var(--primary-text-color);
    }
    .wrap {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
    }
    .name {
      font-weight: 600;
      font-size: 1.1em;
    }
    .current {
      font-size: 2.2em;
      font-weight: 300;
      line-height: 1;
    }
    .current {
      display: inline-flex;
      align-items: baseline;
    }
    .thermo {
      width: 0.7em;
      height: 0.9em;
      margin-right: 4px;
      align-self: center;
      color: var(--secondary-text-color);
      transition: color 0.4s;
    }
    .thermo .bulb,
    .thermo .mercury {
      fill: currentColor;
    }
    .thermo .tube {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
    }
    .thermo .mercury {
      transform-box: fill-box;
      transform-origin: bottom;
      transform: scaleY(0.4);
    }
    :host([heating]) .thermo {
      color: var(--state-climate-heat-color, #ff8100);
    }
    :host([heating]) .thermo .mercury {
      animation: rise 2.4s ease-in-out infinite;
    }
    @keyframes rise {
      0% {
        transform: scaleY(0.3);
      }
      70%,
      100% {
        transform: scaleY(1);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host([heating]) .thermo .mercury {
        animation: none;
        transform: scaleY(0.8);
      }
    }
    .current small {
      font-size: 0.4em;
      color: var(--secondary-text-color);
      margin-left: 4px;
    }
    .setpoint {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
    }
    .value {
      font-size: 2em;
      font-weight: 500;
      min-width: 4.5em;
      text-align: center;
    }
    .value.pending {
      color: var(--accent-color, var(--primary-color));
    }
    .label {
      text-align: center;
      font-size: 0.8em;
      color: var(--secondary-text-color);
      margin-top: -8px;
    }
    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
      border: 1px solid var(--divider-color, #ccc);
      background: transparent;
      border-radius: var(--ha-card-border-radius, 6px);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
    }
    .round {
      flex: none;
      width: 56px;
      height: 56px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
    }
    .round svg {
      width: 24px;
      height: 24px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
    }
    .round:disabled {
      opacity: 0.35;
      cursor: default;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
    }
    .chip {
      min-height: 44px;
      padding: 0 18px;
      border-radius: 4px;
      border-color: var(--primary-color);
      color: var(--primary-color);
      font-weight: 500;
    }
    .presets {
      display: flex;
      justify-content: center;
      gap: 6px;
    }
    .preset {
      min-height: 32px;
      padding: 0 12px;
      border-radius: 4px;
      font-size: 0.85em;
      color: var(--secondary-text-color);
    }
    .preset.active {
      border-color: var(--primary-color);
      color: var(--primary-color);
    }
    .chip.default {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .chip.cancel {
      border-color: var(--divider-color, #ccc);
      color: var(--secondary-text-color);
    }
    .banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border-radius: var(--ha-card-border-radius, 6px);
      border: 1px solid var(--warning-color, #ffa600);
      color: var(--primary-text-color);
    }
    .banner strong {
      color: var(--warning-color, #ffa600);
    }
    .banner .actions {
      display: flex;
      gap: 8px;
    }
    .banner button {
      min-height: 40px;
      padding: 0 14px;
    }
    .status {
      text-align: center;
      color: var(--secondary-text-color);
    }
    .hint {
      text-align: center;
      font-size: 0.8em;
      color: var(--secondary-text-color);
      opacity: 0.8;
    }
    @container (max-width: 240px) {
      .wrap {
        padding: 12px;
        gap: 8px;
      }
      .value {
        font-size: 1.6em;
        min-width: 3.5em;
      }
      .round {
        width: 48px;
        height: 48px;
      }
    }
    :host([compact]) .wrap {
      padding: 8px;
      gap: 8px;
    }
    :host([compact]) .current {
      font-size: 1.6em;
    }
    :host([compact]) .value {
      font-size: 1.6em;
    }
  `;

  private get _shown(): number {
    return this._pending ?? this.target;
  }

  private _fmt(value: number): string {
    return `${Number.isInteger(value) ? value : value.toFixed(1)}${this.unit}`;
  }

  private _time(date: Date): string {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  private _bump(direction: 1 | -1): void {
    const next = Math.round((this._shown + direction * this.step) / this.step) * this.step;
    const clamped = Math.min(this.max, Math.max(this.min, next));
    this._pending = clamped === this.target ? null : clamped;
  }

  private _choose(temperature: number): void {
    const clamped = Math.min(this.max, Math.max(this.min, temperature));
    this._pending = clamped === this.target ? null : clamped;
  }

  private _emit<T>(name: string, detail?: T): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _confirmHours(hours: number): void {
    this._emit<OverrideRequestedDetail>("override-requested", { temperature: this._shown, hours });
    this._pending = null;
  }

  private _confirmTarget(): void {
    this._emit("target-set", { temperature: this._shown });
    this._pending = null;
  }

  private _renderConfirm() {
    if (this._pending === null) {
      return nothing;
    }
    if (this.mode === "unmanaged") {
      return html`<div class="chips">
        <button class="chip" @click=${this._confirmTarget}>${t("Set {value}", { value: this._fmt(this._pending) })}</button>
        <button class="chip cancel" @click=${() => (this._pending = null)}>${t("Cancel")}</button>
      </div>`;
    }
    return html`<div class="chips">
      ${this.durations.map(
        (h) => html`<button class="chip ${h === this.defaultHours ? "default" : ""}" @click=${() => this._confirmHours(h)}>${t("+{n}h", { n: h })}</button>`
      )}
      <button class="chip cancel" @click=${() => (this._pending = null)}>${t("Cancel")}</button>
    </div>`;
  }

  private _renderStatus() {
    switch (this.mode) {
      case "override":
        return html`<div class="banner" role="status">
          <span
            ><strong>${t("Manual {value}", { value: this._fmt(this.target) })}</strong>${this.overrideUntil
              ? html` ${t("until {time}", { time: this._time(this.overrideUntil) })}`
              : nothing}</span
          >
          <span class="actions">
            <button @click=${() => this._emit("override-extended", { hours: 1 })}>${t("+1h")}</button>
            <button @click=${() => this._emit("override-cleared")}>${t("Resume schedule")}</button>
          </span>
        </div>`;
      case "schedule":
        return html`<div class="status">
          ${t("Following schedule")}${this.presence === null ? nothing : html` · ${this.presence ? t("Present") : t("Away")}`}
        </div>`;
      case "automation":
        return html`<div class="status">${t("Target {value}", { value: this._fmt(this.target) })}</div>`;
      case "manual_only":
        return html`<div class="status">${t("Manual")}</div>`;
      default:
        return html`<div class="hint">${t("No auto-resume")}</div>`;
    }
  }

  render() {
    return html`<div class="wrap">
      <div class="head">
        <span class="name">${this.name}</span>
        <span class="current"
          ><svg class="thermo" viewBox="0 0 14 24" role="img" aria-label=${this.heating ? t("Heating") : t("now")}>
            <path class="tube" d="M4.5 15.5V4a2.5 2.5 0 0 1 5 0v11.5a4.5 4.5 0 1 1-5 0z" />
            <rect class="mercury" x="6" y="5" width="2" height="12" rx="1" />
            <circle class="bulb" cx="7" cy="19" r="2.8" />
          </svg>${this.currentTemperature === null ? "–" : this._fmt(this.currentTemperature)}<small>${t("now")}</small></span
        >
      </div>
      <div class="setpoint">
        <button
          class="round"
          aria-label=${t("Decrease")}
          ?disabled=${this._shown <= this.min}
          @click=${() => this._bump(-1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <div class="value ${this._pending === null ? "" : "pending"}">${this._fmt(this._shown)}</div>
        <button
          class="round"
          aria-label=${t("Increase")}
          ?disabled=${this._shown >= this.max}
          @click=${() => this._bump(1)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
        </button>
      </div>
      ${this.presets.length
        ? html`<div class="presets">
            ${this.presets.map(
              (p) => html`<button
                class="preset ${this._shown === p.temperature ? "active" : ""}"
                aria-pressed=${this._shown === p.temperature}
                @click=${() => this._choose(p.temperature)}
              >
                ${p.label} ${this._fmt(p.temperature)}
              </button>`,
            )}
          </div>`
        : nothing}
      <div class="label">
        ${this._pending === null ? t("Target") : this._autoApplies ? t("Keep for… (+{n}h applies automatically)", { n: this.defaultHours }) : t("Keep for…")}
      </div>
      ${this._renderConfirm()} ${this._renderStatus()}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-heating-control": HeatingControl;
  }
}
