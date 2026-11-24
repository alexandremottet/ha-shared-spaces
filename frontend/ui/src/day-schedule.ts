import { safeCustomElement } from "./define";
import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";
import { SLOT_MINUTES } from "./types";
import type { TimeOfDay, TimeRange, WeekDay } from "./types";
import "./hour-period";
import type { PeriodChangedDetail } from "./hour-period";
import "./time-axis";
import "./period-times";
import { periodsText } from "./period-text";
import type { TimesPlacement } from "./period-text";
import { mergeAdjacentPeriods } from "./merge-periods";

const MINUTES_PER_DAY = 24 * 60;

function toTimeOfDay(minutes: number): TimeOfDay {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, minutes));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function snap(minutes: number): number {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

export interface PeriodEditRequestDetail {
  day: WeekDay;
  index: number;
  period: TimeRange;
}

export interface PeriodsChangedDetail {
  day: WeekDay;
  periods: TimeRange[];
}

export interface PeriodSelectRequestDetail {
  day: WeekDay;
  index: number | null;
}

/**
 * One day's 24h presence track.
 */
@safeCustomElement("day-schedule")
export class DaySchedule extends LitElement {
  @property({ type: String }) day!: WeekDay;
  @property({ type: Array }) periods: TimeRange[] = [];
  /** "bar": times on the blocks (beside the short ones); "below": as text under the track. */
  @property({ type: String }) times: TimesPlacement = "bar";
  @property({ type: Number }) selectedIndex: number | null = null;

  @state() private _draftStart: number | null = null;
  @state() private _draftEnd: number | null = null;

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
      text-transform: capitalize;
      align-self: flex-start;
      line-height: var(--day-schedule-track-height, 32px);
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
      touch-action: none;
      cursor: crosshair;
      background: var(--hour-period-absent-color, #b0bec5);
    }
    @media (pointer: coarse) {
      .track {
        height: var(--day-schedule-track-height, 40px);
      }
      .label {
        line-height: var(--day-schedule-track-height, 40px);
      }
    }
  `;

  private _minutesFromEvent(event: PointerEvent, track: HTMLElement): number {
    const rect = track.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(MINUTES_PER_DAY, fraction * MINUTES_PER_DAY));
  }

  private _onTrackPointerDown(event: PointerEvent) {
    if ((event.target as HTMLElement).closest("hour-period")) {
      return;
    }
    this._requestSelect(null);

    const track = event.currentTarget as HTMLElement;
    track.setPointerCapture(event.pointerId);
    const minutes = snap(this._minutesFromEvent(event, track));
    this._draftStart = minutes;
    this._draftEnd = minutes;
  }

  private _onTrackPointerMove(event: PointerEvent) {
    if (this._draftStart === null) {
      return;
    }
    this._draftEnd = snap(this._minutesFromEvent(event, event.currentTarget as HTMLElement));
  }

  private _onTrackPointerUp() {
    if (this._draftStart === null || this._draftEnd === null) {
      return;
    }
    const start = Math.min(this._draftStart, this._draftEnd);
    const end = Math.max(this._draftStart, this._draftEnd);
    this._draftStart = null;
    this._draftEnd = null;

    if (end - start < SLOT_MINUTES) {
      return;
    }

    const period: TimeRange = { start: toTimeOfDay(start), end: toTimeOfDay(end) };
    this._emitChange([...this.periods, period], period);
  }

  private _onPeriodSelect(index: number, event: Event) {
    event.stopPropagation();
    this._requestSelect(index);
  }

  private _requestSelect(index: number | null): void {
    this.dispatchEvent(
      new CustomEvent<PeriodSelectRequestDetail>("period-select-request", {
        detail: { day: this.day, index },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onPeriodEditRequest(index: number, period: TimeRange, event: Event) {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent<PeriodEditRequestDetail>("period-edit-request", {
        detail: { day: this.day, index, period },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onPeriodChanged(index: number, event: CustomEvent<PeriodChangedDetail>) {
    event.stopPropagation();
    const periods = [...this.periods];
    periods[index] = event.detail.period;
    this._emitChange(periods, event.detail.period);
  }

  private _emitChange(periods: TimeRange[], keepSelected?: TimeRange) {
    const merged = mergeAdjacentPeriods(periods);

    const index = keepSelected
      ? merged.findIndex((period) => period.start <= keepSelected.start && period.end >= keepSelected.end)
      : -1;
    this._requestSelect(index === -1 ? null : index);

    this.dispatchEvent(
      new CustomEvent<PeriodsChangedDetail>("periods-changed", {
        detail: { day: this.day, periods: merged },
        bubbles: true,
        composed: true,
      })
    );
  }

  protected render() {
    const draft =
      this._draftStart !== null && this._draftEnd !== null
        ? { start: Math.min(this._draftStart, this._draftEnd), end: Math.max(this._draftStart, this._draftEnd) }
        : null;

    return html`
      <div class="row">
        <span class="label">${this.day}</span>
        <div class="lane">
        <div
          class="track"
          @pointerdown=${this._onTrackPointerDown}
          @pointermove=${this._onTrackPointerMove}
          @pointerup=${this._onTrackPointerUp}
        >
          ${this.periods.map(
            (period, index) => html`
              <hour-period
                status="present"
                .start=${period.start}
                .end=${period.end}
                ?selected=${this.selectedIndex === index}
                @period-select=${(event: Event) => this._onPeriodSelect(index, event)}
                @period-edit-request=${(event: Event) => this._onPeriodEditRequest(index, period, event)}
                @period-changed=${(event: CustomEvent<PeriodChangedDetail>) => this._onPeriodChanged(index, event)}
              ></hour-period>
            `
          )}
          ${draft
            ? html`
                <hour-period status="present" draft .start=${toTimeOfDay(draft.start)} .end=${toTimeOfDay(draft.end)}></hour-period>
              `
            : null}
          <time-axis aria-hidden="true"></time-axis>
          ${this.times === "bar" && this._draftStart === null ? html`<period-times aria-hidden="true" .periods=${this.periods}></period-times>` : null}
        </div>
        ${this.times === "below" && this.periods.length ? html`<div class="times">${periodsText(this.periods)}</div>` : null}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "day-schedule": DaySchedule;
  }
}
