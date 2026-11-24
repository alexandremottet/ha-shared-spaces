import { safeCustomElement } from "./define";
import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";
import type { TimeRange } from "./types";
import "./hour-period";
import "./time-axis";
import "./period-times";
import { periodsText } from "./period-text";
import type { TimesPlacement } from "./period-text";

/**
 * One person's read-only 24h presence row.
 */
@safeCustomElement("person-lane-track")
export class PersonLaneTrack extends LitElement {
  @property({ type: String }) label = "";
  @property({ type: Array }) periods: TimeRange[] = [];
  /** "bar": times on the blocks (beside the short ones); "below": as text under the track. */
  @property({ type: String }) times: TimesPlacement = "bar";
  /** Sets --hour-period-present-color for just this row's periods, via inline style. */
  @property({ type: String }) color?: string;

  static styles = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--day-schedule-row-gap, 8px);
      padding: var(--day-schedule-row-padding, 6px 0);
    }
    .label {
      width: var(--day-schedule-label-width, 96px);
      flex: none;
      font-weight: var(--day-schedule-label-font-weight, 600);
      align-self: flex-start;
      line-height: var(--day-schedule-track-height, 32px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .lane {
      flex: 1;
      min-width: 0;
    }
    .times {
      margin-top: 2px;
      font-size: var(--day-schedule-times-font-size, 12px);
      line-height: 1.3;
      font-variant-numeric: tabular-nums;
      color: var(--day-schedule-times-color, var(--secondary-text-color, inherit));
    }

    .track {
      position: relative;
      height: var(--day-schedule-track-height, 32px);
      border-radius: var(--day-schedule-track-radius, 4px);
      overflow: hidden;
      background: var(--hour-period-absent-color, #b0bec5);
    }
  `;

  protected render() {
    return html`
      <div class="row">
        <span class="label" title=${this.label}>${this.label}</span>
        <div class="lane">
        <div class="track" style=${this.color ? `--hour-period-present-color: ${this.color}` : ""}>
          ${this.periods.map(
            (period) =>
              html`<hour-period readonly status="present" .start=${period.start} .end=${period.end}></hour-period>`
          )}
          <time-axis aria-hidden="true"></time-axis>
          ${this.times === "bar" ? html`<period-times aria-hidden="true" .periods=${this.periods}></period-times>` : null}
        </div>
        ${this.times === "below" && this.periods.length ? html`<div class="times">${periodsText(this.periods)}</div>` : null}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "person-lane-track": PersonLaneTrack;
  }
}
