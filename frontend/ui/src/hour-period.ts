import { safeCustomElement } from "./define";
import { LitElement, html, css, nothing, PropertyValues } from "lit";
import { property } from "lit/decorators.js";
import { SLOT_MINUTES } from "./types";
import type { TimeOfDay, TimeRange } from "./types";

export type PresenceStatus = "present" | "absent";

const MINUTES_PER_DAY = 24 * 60;
const TAP_THRESHOLD_MINUTES = SLOT_MINUTES / 2;

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

function snap(minutes: number): number {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

export interface PeriodChangedDetail {
  period: TimeRange;
}

type DragMode = "move" | "resize-start" | "resize-end";

/**
 * One colored block on a day's timeline, positioned from `start`/`end`.
 */
@safeCustomElement("hour-period")
export class HourPeriod extends LitElement {
  @property({ type: String }) start: TimeOfDay = "00:00";
  @property({ type: String }) end: TimeOfDay = "24:00";
  @property({ type: String, reflect: true }) status: PresenceStatus = "absent";
  @property({ type: Boolean, reflect: true }) selected = false;
  @property({ type: Boolean, reflect: true }) draft = false;
  /** View-only: no drag/resize/select interaction, no handles, regardless of `selected`. */
  @property({ type: Boolean, reflect: true }) readonly = false;

  private _previewStart: number | null = null;
  private _previewEnd: number | null = null;
  private _dragMode: DragMode | null = null;
  private _dragOriginClientX = 0;
  private _dragOriginStart = 0;
  private _dragOriginEnd = 0;
  private _dragMoved = false;
  private _wasSelectedAtDragStart = false;

  static styles = css`
    :host {
      position: absolute;
      inset-block: 0;
      box-sizing: border-box;
      display: block;
      touch-action: none;
    }
    .segment {
      position: relative;
      width: 100%;
      height: 100%;
      background: var(--hour-period-absent-color, #b0bec5);
    }
    /* above the hour ticks */
    :host([status="present"]) {
      z-index: 1;
    }
    :host([status="present"]) .segment {
      background: var(--hour-period-present-color, #4caf50);
    }
    :host([selected]:not([readonly])) .segment {
      outline: var(--hour-period-selected-outline-width, 2px) solid var(--hour-period-selected-color, #f3f3f3);
      outline-offset: var(--hour-period-selected-outline-offset, -2px);
      cursor: grab;
    }
    :host([draft]) .segment {
      opacity: var(--hour-period-draft-opacity, 0.7);
      background-image: repeating-linear-gradient(
        var(--hour-period-draft-stripe-angle, 45deg),
        var(--hour-period-draft-stripe-color, rgba(255, 255, 255, 0.5)) 0 var(--hour-period-draft-stripe-size, 4px),
        transparent var(--hour-period-draft-stripe-size, 4px) calc(var(--hour-period-draft-stripe-size, 4px) * 2)
      );
    }
    .handle {
      position: absolute;
      top: 0;
      bottom: 0;
      width: var(--hour-period-handle-width, 14px);
      cursor: ew-resize;
    }
    .handle.start {
      left: calc(var(--hour-period-handle-width, 14px) / -2);
    }
    .handle.end {
      right: calc(var(--hour-period-handle-width, 14px) / -2);
    }
    /* fingers need a bigger target than the grip shows */
    @media (pointer: coarse) {
      .handle {
        width: var(--hour-period-handle-width, 28px);
      }
      .handle.start {
        left: calc(var(--hour-period-handle-width, 28px) / -2);
      }
      .handle.end {
        right: calc(var(--hour-period-handle-width, 28px) / -2);
      }
    }
    .handle::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: var(--hour-period-handle-grip-width, 10px);
      height: var(--hour-period-handle-grip-height, 16px);
      border-radius: var(--hour-period-handle-grip-radius, 2px);
      background: var(--hour-period-selected-color, #f3f3f3);
    }
    /* times shown while the block is dragged */
    .time {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 1;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: var(--hour-period-time-font-size, 11px);
      font-weight: 700;
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      pointer-events: none;
      color: var(--hour-period-time-color, #fff);
      background: var(--hour-period-time-background, rgba(0, 0, 0, 0.55));
    }
    .time.start {
      right: calc(100% + 3px);
    }
    .time.end {
      left: calc(100% + 3px);
    }
  `;

  protected updated(changed: PropertyValues) {
    if (changed.has("start") || changed.has("end")) {
      this._previewStart = null;
      this._previewEnd = null;
      this._applyGeometry(toMinutes(this.start), toMinutes(this.end));
    }
  }

  private _applyGeometry(startMinutes: number, endMinutes: number) {
    this.style.left = `${(startMinutes / MINUTES_PER_DAY) * 100}%`;
    this.style.width = `${((endMinutes - startMinutes) / MINUTES_PER_DAY) * 100}%`;
  }

  private _trackWidth(): number {
    return this.parentElement?.getBoundingClientRect().width ?? 1;
  }

  private _beginDrag(event: PointerEvent, mode: DragMode | null) {
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this._dragOriginClientX = event.clientX;
    this._dragOriginStart = toMinutes(this.start);
    this._dragOriginEnd = toMinutes(this.end);
    this._dragMoved = false;
    this._dragMode = mode;
    this._wasSelectedAtDragStart = this.selected;
  }

  private _onBodyPointerDown(event: PointerEvent) {
    this._beginDrag(event, this.selected ? "move" : null);
  }

  private _onStartHandlePointerDown(event: PointerEvent) {
    event.stopPropagation();
    this._beginDrag(event, "resize-start");
  }

  private _onEndHandlePointerDown(event: PointerEvent) {
    event.stopPropagation();
    this._beginDrag(event, "resize-end");
  }

  private _onPointerMove(event: PointerEvent) {
    if (this._dragMode === null) {
      return;
    }

    const deltaMinutes = ((event.clientX - this._dragOriginClientX) / this._trackWidth()) * MINUTES_PER_DAY;
    if (Math.abs(deltaMinutes) >= TAP_THRESHOLD_MINUTES) {
      this._dragMoved = true;
    }
    if (!this._dragMoved) {
      return;
    }

    let newStart = this._dragOriginStart;
    let newEnd = this._dragOriginEnd;

    if (this._dragMode === "move") {
      const duration = this._dragOriginEnd - this._dragOriginStart;
      newStart = Math.max(0, Math.min(MINUTES_PER_DAY - duration, snap(this._dragOriginStart + deltaMinutes)));
      newEnd = newStart + duration;
    } else if (this._dragMode === "resize-start") {
      newStart = Math.max(0, Math.min(this._dragOriginEnd - SLOT_MINUTES, snap(this._dragOriginStart + deltaMinutes)));
    } else {
      newEnd = Math.max(this._dragOriginStart + SLOT_MINUTES, Math.min(MINUTES_PER_DAY, snap(this._dragOriginEnd + deltaMinutes)));
    }

    this._previewStart = newStart;
    this._previewEnd = newEnd;
    this._applyGeometry(newStart, newEnd);
    this.requestUpdate();
  }

  private _onPointerUp() {
    const mode = this._dragMode;
    const moved = this._dragMoved;
    const wasSelected = this._wasSelectedAtDragStart;
    this._dragMode = null;
    this._dragMoved = false;

    if (moved && this._previewStart !== null && this._previewEnd !== null) {
      const period: TimeRange = { start: toTimeOfDay(this._previewStart), end: toTimeOfDay(this._previewEnd) };
      this.dispatchEvent(
        new CustomEvent<PeriodChangedDetail>("period-changed", { detail: { period }, bubbles: true, composed: true })
      );
      return;
    }

    if (!wasSelected) {
      this.dispatchEvent(new CustomEvent("period-select", { bubbles: true, composed: true }));
    } else if (mode === "move") {
      this.dispatchEvent(new CustomEvent("period-edit-request", { bubbles: true, composed: true }));
    }
  }

  private _times() {
    // while it is being edited, following the drag (the row's period-times shows them otherwise)
    if (this.status !== "present" || !this.selected || this.readonly || this._previewStart === null) return null;
    const start = toTimeOfDay(this._previewStart ?? toMinutes(this.start));
    const end = toTimeOfDay(this._previewEnd ?? toMinutes(this.end));
    const short = (t: TimeOfDay) => t.replace(/^0(\d)/, "$1");
    return html`<span class="time start">${short(start)}</span><span class="time end">${short(end)}</span>`;
  }

  protected render() {
    return html`
      <div
        class="segment"
        @pointerdown=${this.readonly ? nothing : this._onBodyPointerDown}
        @pointermove=${this.readonly ? nothing : this._onPointerMove}
        @pointerup=${this.readonly ? nothing : this._onPointerUp}
      >
        ${this._times()}
        ${this.selected && !this.readonly
          ? html`
              <span class="handle start" @pointerdown=${this._onStartHandlePointerDown} @pointermove=${this._onPointerMove} @pointerup=${this._onPointerUp}></span>
              <span class="handle end" @pointerdown=${this._onEndHandlePointerDown} @pointermove=${this._onPointerMove} @pointerup=${this._onPointerUp}></span>
            `
          : null}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hour-period": HourPeriod;
  }
}
