import { safeCustomElement } from "./define";
import { LitElement, html, css } from "lit";

const MAJOR_TICK_HOURS = [0, 6, 12, 18, 24];
const MINOR_TICK_HOURS = [3, 9, 15, 21];

@safeCustomElement("time-axis")
export class TimeAxis extends LitElement {
  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      display: block;
    }
    .tick {
      position: absolute;
      top: 0;
      bottom: 0;
      width: var(--day-schedule-tick-width, 1px);
      background: var(--day-schedule-tick-color, rgba(255, 255, 255, 0.5));
    }
    .tick.minor {
      background: var(--day-schedule-tick-minor-color, rgba(255, 255, 255, 0.3));
    }
    .tick-label {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      font-size: var(--day-schedule-tick-label-font-size, 10px);
      line-height: 1;
      color: var(--day-schedule-tick-label-color, rgba(255, 255, 255, 0.95));
      text-shadow: var(--day-schedule-tick-label-shadow, 0 0 2px rgba(0, 0, 0, 0.6));
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  `;

  private _tickLabelStyle(hour: number): string {
    if (hour === 0) {
      return "left:var(--day-schedule-tick-label-edge-padding, 4px);transform:translateY(-50%);";
    }
    if (hour === 24) {
      return "right:var(--day-schedule-tick-label-edge-padding, 4px);transform:translateY(-50%);";
    }
    return `left:${(hour / 24) * 100}%;transform:translate(-50%,-50%);`;
  }

  protected render() {
    return html`
      ${MINOR_TICK_HOURS.map((hour) => html`<span class="tick minor" style=${`left:${(hour / 24) * 100}%`}></span>`)}
      ${MAJOR_TICK_HOURS.map(
        (hour) => html`
          <span class="tick" style=${`left:${(hour / 24) * 100}%`}></span>
          <span class="tick-label" style=${this._tickLabelStyle(hour)}>${String(hour).padStart(2, "0")}</span>
        `
      )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "time-axis": TimeAxis;
  }
}
