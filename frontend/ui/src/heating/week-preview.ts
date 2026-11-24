import { LitElement, css, html, nothing } from "lit";
import { property } from "lit/decorators.js";
import { safeCustomElement } from "../define";
import { WEEK_DAYS } from "../types";
import type { ScheduleRanges, StrategySegment } from "./strategy-sim";
import { fromWall, wallTime } from "./tz";

export interface Span {
  start: number;
  end: number;
}

export type BandKind = "planned" | "preheat" | "setback" | "off";

export interface Band extends Span {
  kind: BandKind;
  segment: StrategySegment;
}

/** Segments split at planned edges: heating inside planned time = planned, outside = preheat (top target) or setback. */
export function previewBands(segments: StrategySegment[], planned: Span[]): Band[] {
  const targets = segments.flatMap((s) => ("target" in s.result ? [s.result.target] : []));
  const top = Math.max(...targets);
  const out: Band[] = [];
  for (const segment of segments) {
    const cuts = new Set([segment.start, segment.end]);
    for (const p of planned) for (const t of [p.start, p.end]) if (t > segment.start && t < segment.end) cuts.add(t);
    const edges = [...cuts].sort((a, b) => a - b);
    for (let i = 1; i < edges.length; i++) {
      const [start, end] = [edges[i - 1], edges[i]];
      const inPlan = planned.some((p) => p.start <= start && end <= p.end);
      const r = segment.result;
      const kind: BandKind = "off" in r ? "off" : inPlan ? "planned" : r.target >= top ? "preheat" : "setback";
      const last = out[out.length - 1];
      if (last && last.kind === kind && last.end === start && last.segment === segment) last.end = end;
      else out.push({ start, end, kind, segment });
    }
  }
  return out;
}

const KIND_LABELS: Record<BandKind, string> = { planned: "Planned", preheat: "Preheat", setback: "Setback", off: "Off" };

/** Planned (occupied) spans of each shown day, from the area's weekly schedule. */
export function plannedSpans(schedule: ScheduleRanges, days: number[], tz: string): Span[] {
  const out: Span[] = [];
  for (const ds of days.slice(0, -1)) {
    const w = wallTime(ds, tz);
    for (const [a, b] of schedule[WEEK_DAYS[w.weekday]] ?? []) {
      const at = (hm: string) => fromWall(tz, w.year, w.month, w.day, Number(hm.slice(0, 2)), Number(hm.slice(3)));
      out.push({ start: at(a), end: at(b) });
    }
  }
  return out;
}

@safeCustomElement("share-space-week-preview")
export class ShareSpaceWeekPreview extends LitElement {
  static styles = css`
    :host {
      display: block;
      color: var(--primary-text-color);
    }
    .preview {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .day {
      display: grid;
      grid-template-columns: 56px 1fr;
      align-items: center;
      gap: 6px;
      font-size: 0.8em;
      color: var(--secondary-text-color);
    }
    .track {
      position: relative;
      height: 18px;
      border-radius: 4px;
      overflow: hidden;
      background: var(--divider-color);
    }
    .seg {
      position: absolute;
      top: 0;
      bottom: 0;
      container-type: inline-size;
    }
    /* start and end times on the bar itself; dropped when the bar is too short to hold them */
    .t {
      position: absolute;
      top: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      padding: 0 3px;
      font-size: 10px;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      color: var(--text-primary-color, #fff);
      text-shadow: 0 0 2px rgba(0, 0, 0, 0.35);
      pointer-events: none;
      white-space: nowrap;
    }
    .t.s {
      left: 0;
    }
    .t.e {
      right: 0;
    }
    @container (max-width: 64px) {
      .t.e {
        display: none;
      }
    }
    @container (max-width: 30px) {
      .t.s {
        display: none;
      }
    }
    .seg.off,
    .legend i.off {
      background: var(--secondary-text-color);
      opacity: 0.25;
    }
    .seg.planned,
    .legend i.planned {
      background: var(--primary-color);
    }
    .seg.preheat,
    .legend i.preheat {
      background: var(--warning-color, #ff9800);
    }
    .seg.setback,
    .legend i.setback {
      background: var(--success-color, #4caf50);
    }
    .seg {
      transition: opacity 0.12s;
    }
    .seg.dim {
      opacity: 0.25;
    }
    .seg:focus-visible {
      outline: 2px solid var(--primary-text-color);
      outline-offset: -2px;
      z-index: 1;
    }
    .now {
      position: absolute;
      top: -2px;
      bottom: -2px;
      width: 2px;
      background: var(--error-color, red);
    }
    .legend {
      display: flex;
      gap: 12px;
      font-size: 0.8em;
      color: var(--secondary-text-color);
    }
    .legend i {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 2px;
      margin-right: 4px;
      vertical-align: middle;
    }
  `;

  @property({ attribute: false }) segments: StrategySegment[] = [];
  /** Midnights of the shown days plus the end of the last one (length = days + 1). */
  @property({ attribute: false }) days: number[] = [];
  @property({ type: Number }) now = 0;
  @property() tz = "UTC";
  /** Planned occupancy: heating inside it shows as planned, outside as preheat / setback. */
  @property({ attribute: false }) planned: Span[] = [];
  /** Segment reason to emphasise; other segments are dimmed. */
  @property() highlight: string | null = null;

  private _hover(reason: string | null): void {
    this.dispatchEvent(new CustomEvent("segment-hover", { detail: { reason }, bubbles: true, composed: true }));
  }

  protected render() {
    const { segments, days, now, tz } = this;
    if (days.length < 2) return nothing;
    const fmt = new Intl.DateTimeFormat([], { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit" });
    const dayFmt = new Intl.DateTimeFormat([], { timeZone: tz, weekday: "short", day: "numeric" });
    const hm = new Intl.DateTimeFormat([], { timeZone: tz, hour: "numeric", minute: "2-digit", hourCycle: "h23" });
    const bands = previewBands(segments, this.planned);
    return html`<div class="preview" aria-label="Next ${days.length - 1} days">
      ${days.slice(0, -1).map((ds, i) => {
        const de = days[i + 1];
        const span = de - ds;
        return html`<div class="day"><span>${dayFmt.format(ds)}</span><div class="track">
          ${bands
            .filter((s) => s.end > ds && s.start < de)
            .map((s) => {
              const a = Math.max(s.start, ds);
              const b = Math.min(s.end, de);
              const r = s.segment.result;
              const label = "off" in r ? "off" : `${r.target}°`;
              const tip = `${KIND_LABELS[s.kind]} · ${s.segment.reason} · ${label} · ${fmt.format(s.start)} – ${fmt.format(s.end)}`;
              const dim = this.highlight !== null && this.highlight !== s.segment.reason;
              // a bar running on from the day before or into the next one has no edge here to label
              const times =
                s.kind === "off"
                  ? nothing
                  : html`${a > ds ? html`<span class="t s">${hm.format(a)}</span>` : nothing}${b < de ? html`<span class="t e">${hm.format(b)}</span>` : nothing}`;
              return html`<div class="seg ${s.kind} ${dim ? "dim" : ""}" style="left:${((a - ds) / span) * 100}%;width:${((b - a) / span) * 100}%" title=${tip} tabindex="0" role="img" aria-label=${tip}
                @mouseenter=${() => this._hover(s.segment.reason)} @mouseleave=${() => this._hover(null)} @focus=${() => this._hover(s.segment.reason)} @blur=${() => this._hover(null)}>${times}</div>`;
            })}
          ${now >= ds && now < de ? html`<div class="now" style="left:${((now - ds) / span) * 100}%" title="Now"></div>` : nothing}
        </div></div>`;
      })}
      <div class="legend">${(Object.keys(KIND_LABELS) as BandKind[]).map((k) => html`<span><i class=${k}></i>${KIND_LABELS[k]}</span>`)}</div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-week-preview": ShareSpaceWeekPreview;
  }
}
