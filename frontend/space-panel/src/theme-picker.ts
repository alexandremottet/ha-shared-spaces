import { LitElement, html, css } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant } from "ha-share-space-ui/ha";

const MODES = [
  { id: "auto", label: "Auto" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

// Theme + light/dark selects; HA's root applies and stores them (same event as the profile page).
@customElement("share-space-theme-picker")
export class ShareSpaceThemePicker extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  static styles = css`
    :host {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    select {
      min-height: 36px;
      padding: 0 8px;
      border-radius: 18px;
      border: 1px solid var(--divider-color);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font: inherit;
      font-size: 0.9em;
      min-width: 0;
      flex: 0 1 auto;
    }
    /* the theme name gives way first; the short mode select stays whole */
    select:last-of-type {
      flex: none;
    }
  `;

  private _set(detail: { theme?: string; dark?: boolean }): void {
    this.dispatchEvent(new CustomEvent("settheme", { detail, bubbles: true, composed: true }));
  }

  protected render(): TemplateResult {
    const themes = Object.keys(this.hass?.themes?.themes ?? {}).sort();
    const selected = this.hass?.selectedTheme;
    const theme = selected?.theme ?? "default";
    const mode = selected?.dark === undefined ? "auto" : selected.dark ? "dark" : "light";
    return html`
      <select aria-label="Theme" @change=${(e: Event) => this._set({ theme: (e.target as HTMLSelectElement).value })}>
        ${["default", ...themes].map(
          (t) => html`<option value=${t} ?selected=${t === theme}>${t === "default" ? "Home Assistant" : t}</option>`,
        )}
      </select>
      <select
        aria-label="Mode"
        @change=${(e: Event) => {
          const m = (e.target as HTMLSelectElement).value;
          this._set({ dark: m === "auto" ? undefined : m === "dark" });
        }}
      >
        ${MODES.map((m) => html`<option value=${m.id} ?selected=${m.id === mode}>${m.label}</option>`)}
      </select>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-theme-picker": ShareSpaceThemePicker;
  }
}
