import { safeCustomElement } from "./define";
import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";
import type { TimeOfDay, TimeRange } from "./types";

const MINUTES_PER_DAY = 24 * 60;
const GAP = 3;

const minutes = (t: TimeOfDay): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const short = (t: TimeOfDay): string => t.replace(/^0(\d)/, "$1");

interface Box {
  left: number;
  width: number;
  text: string;
  /** 0 top, 1 bottom; absent when every label fits on one row, centred. */
  row?: number;
}

interface Label {
  text: string;
  width: number;
  /** Left position against its edge inside the block, then just outside it. */
  inside: number;
  outside: number;
  /** The block holds both its times. */
  holds: boolean;
}

/**
 * Start and end times of a day's periods, laid over its track, each against its block's edge. On one
 * row a short block's times sit outside it; when they would touch, they alternate top and bottom rows, and a time with no room on either is left out.
 */
export function layoutTimes(periods: TimeRange[], trackWidth: number, charWidth = 6.6, padding = 8): Box[] {
  const w = (text: string) => text.length * charWidth + padding;
  const labels: Label[] = [];
  for (const p of [...periods].sort((a, b) => minutes(a.start) - minutes(b.start))) {
    const a = (minutes(p.start) / MINUTES_PER_DAY) * trackWidth;
    const b = (minutes(p.end) / MINUTES_PER_DAY) * trackWidth;
    const [s, e] = [short(p.start), short(p.end)];
    const holds = b - a >= w(s) + w(e) + 2 * GAP + 4;
    labels.push(
      { text: s, width: w(s), inside: a + GAP, outside: a - GAP - w(s), holds },
      { text: e, width: w(e), inside: b - GAP - w(e), outside: b + GAP, holds },
    );
  }
  const clamp = (left: number, width: number) => Math.max(0, Math.min(trackWidth - width, left));
  const place = (rowsCount: number): Box[] | null => {
    const rows: Box[][] = Array.from({ length: rowsCount }, () => []);
    const out: Box[] = [];
    for (const [i, label] of labels.entries()) {
      const order = rowsCount === 1 ? [0] : [i % 2, 1 - (i % 2)];
      let box: Box | null = null;
      for (const row of order) {
        const last = rows[row][rows[row].length - 1];
        // on one row a short block's times go outside it; alternating rows leave room for them inside
        const sides = rowsCount === 2 || label.holds ? [label.inside, label.outside] : [label.outside, label.inside];
        const left = sides.map((l) => clamp(l, label.width)).find((l) => !last || l >= last.left + last.width + 2);
        if (left !== undefined) {
          box = { left, width: label.width, text: label.text, row: rowsCount === 1 ? undefined : row };
          rows[row].push(box);
          break;
        }
      }
      if (box) out.push(box);
      // one row must hold every label; on two rows a time with no room is left out
      else if (rowsCount === 1) return null;
    }
    return out;
  };
  return place(1) ?? place(2)!;
}

@safeCustomElement("period-times")
export class PeriodTimes extends LitElement {
  @property({ attribute: false }) periods: TimeRange[] = [];
  @state() private _width = 0;
  private _observer = new ResizeObserver(([entry]) => (this._width = entry.contentRect.width));

  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      z-index: 2;
      pointer-events: none;
      display: block;
    }
    span {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
    }
    span.r0 {
      top: 1px;
      transform: none;
    }
    span.r1 {
      top: auto;
      bottom: 1px;
      transform: none;
    }
    span {
      box-sizing: border-box;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: var(--hour-period-time-font-size, 11px);
      font-weight: 700;
      line-height: 1.2;
      text-align: center;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      color: var(--hour-period-time-color, #fff);
      background: var(--hour-period-time-background, rgba(0, 0, 0, 0.55));
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this._observer.observe(this);
  }

  disconnectedCallback(): void {
    this._observer.disconnect();
    super.disconnectedCallback();
  }

  protected render() {
    if (!this._width) return null;
    return layoutTimes(this.periods, this._width).map((b) => html`<span class=${b.row === undefined ? "" : `r${b.row}`} style="left:${b.left}px;min-width:${b.width}px">${b.text}</span>`);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "period-times": PeriodTimes;
  }
}
