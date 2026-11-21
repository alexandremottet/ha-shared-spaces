import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { TimeOfDay, TimeRange, WeekDay } from "./types";

export interface PeriodSavedDetail {
  day: WeekDay;
  index: number;
  period: TimeRange;
}

export interface PeriodDeletedDetail {
  day: WeekDay;
  index: number;
}

export type PeriodEditHost = ReactiveControllerHost & HTMLElement;

/**
 * Shared day/index/start/end state and open()/save()/delete() event logic for a period-edit
 * dialog, independent of how the host actually renders itself.
 */
export class PeriodEditController implements ReactiveController {
  day: WeekDay | null = null;
  index = -1;
  start: TimeOfDay = "00:00";
  end: TimeOfDay = "00:00";

  private readonly host: PeriodEditHost;

  constructor(host: PeriodEditHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void {}

  open(day: WeekDay, index: number, period: TimeRange): void {
    this.day = day;
    this.index = index;
    this.start = period.start;
    this.end = period.end;
    this.host.requestUpdate();
  }

  setStart(value: TimeOfDay): void {
    this.start = value;
    this.host.requestUpdate();
  }

  setEnd(value: TimeOfDay): void {
    this.end = value;
    this.host.requestUpdate();
  }

  save(): void {
    if (this.day === null) {
      return;
    }
    this.host.dispatchEvent(
      new CustomEvent<PeriodSavedDetail>("period-saved", {
        detail: { day: this.day, index: this.index, period: { start: this.start, end: this.end } },
        bubbles: true,
        composed: true,
      })
    );
  }

  delete(): void {
    if (this.day === null) {
      return;
    }
    this.host.dispatchEvent(
      new CustomEvent<PeriodDeletedDetail>("period-deleted", {
        detail: { day: this.day, index: this.index },
        bubbles: true,
        composed: true,
      })
    );
  }
}
