import { safeCustomElement } from "./define";
import { LitElement, html, css } from "lit";
import { property, query, state } from "lit/decorators.js";
import type { TimeOfDay } from "./types";
import "./time-axis";

const MINUTES_PER_DAY = 24 * 60;
const STRIPE_SIZE_PX = 10;

function toMinutes(time: TimeOfDay): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function segmentBackground(colors: string[]): string {
  if (colors.length === 0) {
    return "var(--hour-period-absent-color, #b0bec5)";
  }
  const bands = colors.length === 1 ? [colors[0], `color-mix(in srgb, ${colors[0]} 60%, white)`] : colors;
  const stops = bands.map((color, index) => `${color} ${index * STRIPE_SIZE_PX}px ${(index + 1) * STRIPE_SIZE_PX}px`);
  return `repeating-linear-gradient(45deg, ${stops.join(", ")})`;
}

export interface OverlapSegment {
  start: TimeOfDay;
  end: TimeOfDay;
  /** Every person present during this segment; length > 1 means their periods overlap. */
  personIds: string[];
}

@safeCustomElement("overlap-track")
export class OverlapTrack extends LitElement {
  @property({ type: String }) label = "";
  @property({ type: Array }) segments: OverlapSegment[] = [];
  @property({ type: Array }) personOrder: string[] = [];
  @property({ attribute: false }) colorFor: (personId: string) => string = () => "#4caf50";

  @query(".track") private _trackEl?: HTMLElement;
  @state() private _trackWidthPx = 0;
  private _resizeObserver?: ResizeObserver;

  static styles = css`
    :host {
      display: block;
      container-type: inline-size;
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
    }
    .track {
      position: relative;
      flex: 1;
      height: var(--day-schedule-track-height, 32px);
      border-radius: var(--day-schedule-track-radius, 4px);
      overflow: hidden;
      background: var(--hour-period-absent-color, #b0bec5);
    }
    @container (max-width: 480px) {
      .row {
        flex-direction: column;
        align-items: stretch;
        gap: 4px;
      }
      .label {
        width: auto;
      }
      .track {
        flex: none;
      }
    }
    .segment {
      position: absolute;
      inset-block: 0;
      box-sizing: border-box;
    }
  `;

  protected firstUpdated(): void {
    if (!this._trackEl) {
      return;
    }
    this._resizeObserver = new ResizeObserver((entries) => {
      this._trackWidthPx = entries[0].contentRect.width;
    });
    this._resizeObserver.observe(this._trackEl);
    this._trackWidthPx = this._trackEl.getBoundingClientRect().width;
  }

  disconnectedCallback(): void {
    this._resizeObserver?.disconnect();
    super.disconnectedCallback();
  }

  private _orderedColors(personIds: string[]): string[] {
    const ranked = [...personIds].sort((a, b) => this.personOrder.indexOf(a) - this.personOrder.indexOf(b));
    return ranked.map((id) => this.colorFor(id));
  }

  private _segmentStyle(segment: OverlapSegment): string {
    const startMinutes = toMinutes(segment.start);
    const endMinutes = toMinutes(segment.end);
    const left = (startMinutes / MINUTES_PER_DAY) * 100;
    const width = ((endMinutes - startMinutes) / MINUTES_PER_DAY) * 100;
    const background = segmentBackground(this._orderedColors(segment.personIds));
    const backgroundPositionX = -(this._trackWidthPx * (startMinutes / MINUTES_PER_DAY));
    return `left:${left}%;width:${width}%;background-image:${background};background-position:${backgroundPositionX}px 0;`;
  }

  protected render() {
    return html`
      <div class="row">
        <span class="label">${this.label}</span>
        <div class="track">
          ${this.segments.map((segment) => html`<div class="segment" style=${this._segmentStyle(segment)}></div>`)}
          <time-axis aria-hidden="true"></time-axis>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "overlap-track": OverlapTrack;
  }
}
