import { safeCustomElement } from "./define";
import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";
import { WEEK_DAYS } from "./types";
import type { Calendar, TimeRange, WeekDay } from "./types";
import "./day-schedule";
import "./period-edit-dialog";
import type { PeriodEditRequestDetail, PeriodSelectRequestDetail, PeriodsChangedDetail } from "./day-schedule";
import type { PeriodDeletedDetail, PeriodSavedDetail } from "./period-edit-dialog";

export interface CalendarChangedDetail {
  calendar: Calendar;
}

interface PeriodEditDialogLike {
  open(day: WeekDay, index: number, period: TimeRange): void;
}

function emptyCalendar(): Calendar {
  const calendar = {} as Calendar;
  for (const day of WEEK_DAYS) {
    calendar[day] = [];
  }
  return calendar;
}

/**
 * A week of day-schedule rows; owns the merged Calendar state and the shared edit dialog.
 */
@safeCustomElement("week-schedule")
export class WeekSchedule extends LitElement {
  @property({ attribute: false }) calendar: Calendar = emptyCalendar();

  /** Enforces at most one selected period across the whole week, not just within one day. */
  @state() private _selectedDay: WeekDay | null = null;
  @state() private _selectedIndex: number | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("pointerdown", this._onDocumentPointerDown);
  }

  disconnectedCallback(): void {
    document.removeEventListener("pointerdown", this._onDocumentPointerDown);
    super.disconnectedCallback();
  }

  private _onDocumentPointerDown = (event: PointerEvent): void => {
    if (this._selectedDay === null) {
      return;
    }
    const onPeriod = event.composedPath().some((node) => node instanceof Element && node.tagName === "HOUR-PERIOD");
    if (!onPeriod) {
      this._selectedDay = null;
      this._selectedIndex = null;
    }
  };

  static styles = css`
    :host {
      display: block;
    }
    day-schedule {
      display: block;
      margin-bottom: var(--week-schedule-day-gap, 0px);
    }
    day-schedule:last-of-type {
      margin-bottom: 0;
    }
  `;

  private _onPeriodsChanged(event: CustomEvent<PeriodsChangedDetail>): void {
    const { day, periods } = event.detail;
    this.calendar = { ...this.calendar, [day]: periods };
    this._emitCalendarChanged();
  }

  private _onPeriodEditRequest(event: CustomEvent<PeriodEditRequestDetail>): void {
    const { day, index, period } = event.detail;
    this._activeDialog()?.open(day, index, period);
  }

  private _onPeriodSelectRequest(event: CustomEvent<PeriodSelectRequestDetail>): void {
    const { day, index } = event.detail;
    this._selectedDay = index === null ? null : day;
    this._selectedIndex = index;
  }

  private _onPeriodSaved(event: CustomEvent<PeriodSavedDetail>): void {
    const { day, index, period } = event.detail;
    const periods = [...this.calendar[day]];
    periods[index] = period;
    this.calendar = { ...this.calendar, [day]: periods };
    this._selectedDay = null;
    this._selectedIndex = null;
    this._emitCalendarChanged();
  }

  private _onPeriodDeleted(event: CustomEvent<PeriodDeletedDetail>): void {
    const { day, index } = event.detail;
    const periods = this.calendar[day].filter((_, existingIndex) => existingIndex !== index);
    this.calendar = { ...this.calendar, [day]: periods };
    this._selectedDay = null;
    this._selectedIndex = null;
    this._emitCalendarChanged();
  }

  private _emitCalendarChanged(): void {
    this.dispatchEvent(
      new CustomEvent<CalendarChangedDetail>("calendar-changed", {
        detail: { calendar: this.calendar },
        bubbles: true,
        composed: true,
      })
    );
  }

  /** Whichever element the "dialog" slot actually resolves to: a consumer's own, or our fallback. */
  private _activeDialog(): PeriodEditDialogLike | undefined {
    const slot = this.shadowRoot?.querySelector('slot[name="dialog"]') as HTMLSlotElement | null;
    return slot?.assignedElements({ flatten: true })[0] as PeriodEditDialogLike | undefined;
  }

  protected render() {
    return html`
      ${WEEK_DAYS.map(
        (day) => html`
          <day-schedule
            .day=${day}
            .periods=${this.calendar[day] ?? []}
            .selectedIndex=${this._selectedDay === day ? this._selectedIndex : null}
            @periods-changed=${this._onPeriodsChanged}
            @period-edit-request=${this._onPeriodEditRequest}
            @period-select-request=${this._onPeriodSelectRequest}
          ></day-schedule>
        `
      )}
      <slot name="dialog" @period-saved=${this._onPeriodSaved} @period-deleted=${this._onPeriodDeleted}>
        <period-edit-dialog></period-edit-dialog>
      </slot>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "week-schedule": WeekSchedule;
  }
}
