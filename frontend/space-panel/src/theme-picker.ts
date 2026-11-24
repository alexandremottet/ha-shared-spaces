import { LitElement, html, css, svg as svgPart } from "lit";
import type { SVGTemplateResult, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { t } from "ha-share-space-ui";
import type { HomeAssistant } from "ha-share-space-ui/ha";

const svg = (body: SVGTemplateResult) => html`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${body}</svg>`;
const ICON_THEME = svg(svgPart`<path fill="currentColor" d="M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />`,
);
const MODE_ICONS: Record<string, TemplateResult> = {
  auto: svg(svgPart`<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" /><path fill="currentColor" d="M12 4a8 8 0 0 1 0 16z" />`),
  light: svg(svgPart`<path fill="currentColor" d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.22 5.64l1.42-1.42 2.12 2.12-1.42 1.42zm12.02 12.02 1.42-1.42 2.12 2.12-1.42 1.42zM4.22 18.36l2.12-2.12 1.42 1.42-2.12 2.12zM16.24 6.34l2.12-2.12 1.42 1.42-2.12 2.12z" />`,
  ),
  dark: svg(svgPart`<path fill="currentColor" d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />`),
};

const modes = () => [
  { id: "auto", label: t("Auto") },
  { id: "light", label: t("Light") },
  { id: "dark", label: t("Dark") },
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
    button {
      display: none;
      width: 40px;
      height: 40px;
      flex: none;
      place-items: center;
      padding: 0;
      border-radius: 50%;
      border: 1px solid var(--divider-color);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      cursor: pointer;
    }
    /* narrow screens: one button per setting, each tap moves to the next value */
    @media (max-width: 720px) {
      select {
        display: none;
      }
      button {
        display: grid;
      }
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
    const all = ["default", ...themes];
    const name = (t: string) => (t === "default" ? "Home Assistant" : t);
    const nextTheme = all[(all.indexOf(theme) + 1) % all.length];
    const MODES = modes();
    const nextMode = MODES[(MODES.findIndex((m) => m.id === mode) + 1) % MODES.length];
    const curMode = MODES.find((m) => m.id === mode)?.label ?? "";
    const setMode = (m: string) => this._set({ dark: m === "auto" ? undefined : m === "dark" });
    return html`
      <button
        aria-label=${t("Theme: {current}, next: {next}", { current: name(theme), next: name(nextTheme) })}
        title=${t("Theme: {current}", { current: name(theme) })}
        @click=${() => this._set({ theme: nextTheme })}
      >
        ${ICON_THEME}
      </button>
      <button
        aria-label=${t("Mode: {current}, next: {next}", { current: curMode, next: nextMode.label })}
        title=${t("Mode: {current}", { current: curMode })}
        @click=${() => setMode(nextMode.id)}
      >
        ${MODE_ICONS[mode]}
      </button>
      <select aria-label=${t("Theme")} @change=${(e: Event) => this._set({ theme: (e.target as HTMLSelectElement).value })}>
        ${all.map((t) => html`<option value=${t} ?selected=${t === theme}>${name(t)}</option>`)}
      </select>
      <select aria-label=${t("Mode")} @change=${(e: Event) => setMode((e.target as HTMLSelectElement).value)}>
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
