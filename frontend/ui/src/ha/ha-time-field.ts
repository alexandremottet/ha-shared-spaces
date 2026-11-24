import { safeCustomElement } from "../define";
import { LitElement, css, html } from "lit";
import { property } from "lit/decorators.js";
import { t } from "../i18n";
import type { TimeOfDay } from "../types";

/** Time of day field drawn like Share Space's other fields (same box as its selects). */
@safeCustomElement("ha-time-field")
export class HaTimeField extends LitElement {
  @property() value: TimeOfDay = "00:00";
  @property() label = "";

  static styles = css`
    :host {
      display: block;
    }
    label {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--secondary-text-color);
    }
    span {
      min-width: 48px;
    }
    input {
      min-height: 36px;
      padding: 0 10px;
      border-radius: 8px;
      border: 1px solid var(--divider-color);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font: inherit;
      color-scheme: light dark;
    }
    input:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
  `;

  protected render() {
    return html`<label
      ><span>${this.label}</span><input
        type="time"
        aria-label=${this.label || t("Time")}
        .value=${this.value}
        @change=${(e: Event) => {
          e.stopPropagation();
          this.value = (e.target as HTMLInputElement).value || this.value;
          this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        }}
    /></label>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-time-field": HaTimeField;
  }
}
