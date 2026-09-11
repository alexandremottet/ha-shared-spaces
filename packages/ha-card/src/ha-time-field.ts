import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import type { TimeOfDay } from "ha-share-space-types";

/**
 * Adapts HA's real `ha-time-input`
 */
@customElement("ha-time-field")
export class HaTimeField extends LitElement {
  private _seconds = "00:00:00";

  get value(): TimeOfDay {
    return this._seconds.slice(0, 5);
  }

  set value(value: TimeOfDay) {
    this._seconds = `${value}:00`;
    this.requestUpdate();
  }

  protected render() {
    return html`
      <ha-time-input
        .value=${this._seconds}
        @change=${(event: Event) => {
          this._seconds = (event.target as { value?: string }).value ?? this._seconds;
        }}
      ></ha-time-input>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-time-field": HaTimeField;
  }
}
