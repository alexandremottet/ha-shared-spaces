import { safeCustomElement } from "./define";
import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";
import { WEEK_DAYS } from "./types";
import type { Calendar, TimeOfDay, WeekDay } from "./types";
import "./person-lane-track";
import type { TimesPlacement } from "./period-text";
import "./overlap-track";
import type { OverlapSegment } from "./overlap-track";
import { mergeAdjacentPeriods } from "./merge-periods";

export interface RosterPerson {
  id: string;
  label: string;
  calendar: Calendar;
}

export type RosterViewMode = "lanes" | "overlap" | "merged";

const DEFAULT_PALETTE = ["#4caf50", "#2196f3", "#ff9800", "#e91e63", "#9c27b0", "#009688", "#ffc107", "#795548"];

const MINUTES_PER_DAY = 24 * 60;

function toMinutes(time: TimeOfDay): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function toTimeOfDay(minutes: number): TimeOfDay {
  const clamped = Math.max(0, Math.min(MINUTES_PER_DAY, minutes));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function sameOccupants(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, index) => id === sortedB[index]);
}

function computeMergedPeriods(people: RosterPerson[], day: WeekDay) {
  return mergeAdjacentPeriods(people.flatMap((person) => person.calendar[day] ?? []));
}

/**
 * For one day, find every distinct sub-interval and who's present during it -- a period
 * boundary from any person is where the occupant set can change, so those boundaries alone
 * are enough to slice the day into segments with a stable occupant set each.
 */
function computeOverlapSegments(people: RosterPerson[], day: WeekDay): OverlapSegment[] {
  const tagged = people.flatMap((person) =>
    (person.calendar[day] ?? []).map((period) => ({
      start: toMinutes(period.start),
      end: toMinutes(period.end),
      id: person.id,
    }))
  );
  if (tagged.length === 0) {
    return [];
  }

  const boundaries = Array.from(new Set(tagged.flatMap((period) => [period.start, period.end]))).sort(
    (a, b) => a - b
  );

  const raw: { start: number; end: number; personIds: string[] }[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const personIds = tagged.filter((period) => period.start <= start && period.end >= end).map((period) => period.id);
    if (personIds.length > 0) {
      raw.push({ start, end, personIds });
    }
  }

  const merged: { start: number; end: number; personIds: string[] }[] = [];
  for (const segment of raw) {
    const last = merged[merged.length - 1];
    if (last && last.end === segment.start && sameOccupants(last.personIds, segment.personIds)) {
      last.end = segment.end;
    } else {
      merged.push({ ...segment });
    }
  }

  return merged.map((segment) => ({
    start: toTimeOfDay(segment.start),
    end: toTimeOfDay(segment.end),
    personIds: segment.personIds,
  }));
}

/**
 * An area's merged weekly presence, read-only.
 */
@safeCustomElement("area-roster-view")
export class AreaRosterView extends LitElement {
  @property({ attribute: false }) people: RosterPerson[] = [];
  @property({ type: String }) viewMode: RosterViewMode = "lanes";
  /** Lanes view: first lane of each day merges everyone, under this label. */
  @property({ type: String }) totalLabel?: string;
  /** "bar": times on the blocks (beside the short ones); "below": as text under each lane. */
  @property({ type: String }) times: TimesPlacement = "bar";

  static styles = css`
    :host {
      display: block;
    }
    .day-heading {
      font-weight: var(--area-roster-day-heading-font-weight, 700);
      text-transform: capitalize;
      margin: var(--area-roster-day-heading-margin, 12px 0 4px);
    }
    .day-heading:first-of-type {
      margin-top: 0;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--area-roster-legend-gap, 12px);
      margin-bottom: var(--area-roster-legend-margin-bottom, 12px);
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--area-roster-legend-font-size, 12px);
    }
    .swatch {
      width: var(--area-roster-swatch-size, 10px);
      height: var(--area-roster-swatch-size, 10px);
      border-radius: 2px;
      flex: none;
    }
    .total {
      --day-schedule-label-font-weight: 700;
    }
    .placeholder {
      color: var(--area-roster-placeholder-color, inherit);
    }
  `;

  private _colorFor = (personId: string): string => {
    const index = this.people.findIndex((person) => person.id === personId);
    return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length] ?? DEFAULT_PALETTE[0];
  };

  private _renderLegend() {
    if (this.people.length === 0 || this.viewMode === "merged") {
      return null;
    }
    return html`
      <div class="legend">
        ${this.people.map(
          (person) => html`
            <span class="legend-item">
              <span class="swatch" style=${`background:${this._colorFor(person.id)}`}></span>
              ${person.label}
            </span>
          `
        )}
      </div>
    `;
  }

  private _renderDay(day: WeekDay) {
    if (this.viewMode === "lanes") {
      return html`
        <div class="day-heading">${day}</div>
        ${this.totalLabel
          ? html`<person-lane-track class="total" .times=${this.times} .label=${this.totalLabel} .color=${"var(--area-roster-total-color, var(--primary-color))"} .periods=${computeMergedPeriods(this.people, day)}></person-lane-track>`
          : null}
        ${this.people.map(
          (person) => html`
            <person-lane-track
              .times=${this.times}
              .label=${person.label}
              .periods=${person.calendar[day] ?? []}
              .color=${this._colorFor(person.id)}
            ></person-lane-track>
          `
        )}
      `;
    }

    if (this.viewMode === "merged") {
      return html`
        <div class="day-heading">${day}</div>
        <person-lane-track .periods=${computeMergedPeriods(this.people, day)}></person-lane-track>
      `;
    }

    return html`
      <div class="day-heading">${day}</div>
      <overlap-track
        .segments=${computeOverlapSegments(this.people, day)}
        .personOrder=${this.people.map((person) => person.id)}
        .colorFor=${this._colorFor}
      ></overlap-track>
    `;
  }

  protected render() {
    if (this.people.length === 0) {
      return html`<p class="placeholder"><slot name="empty">No one is assigned to this area yet.</slot></p>`;
    }
    return html` ${this._renderLegend()} ${WEEK_DAYS.map((day) => this._renderDay(day))} `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "area-roster-view": AreaRosterView;
  }
}
