import { LitElement, css, html, nothing } from "lit";
import { property } from "lit/decorators.js";
import { safeCustomElement } from "../define";
import type { StrategySegment } from "./strategy-sim";

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
    }
    .seg.off {
      background: var(--secondary-text-color);
      opacity: 0.25;
    }
    .seg.setback {
      background: var(--primary-color);
      opacity: 0.4;
    }
    .seg.comfort {
      background: var(--primary-color);
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

  protected render() {
    const { segments, days, now, tz } = this;
    if (days.length < 2) return nothing;
    const targets = segments.flatMap((s) => ("target" in s.result ? [s.result.target] : []));
    const top = Math.max(...targets);
    const fmt = new Intl.DateTimeFormat([], { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit" });
    const dayFmt = new Intl.DateTimeFormat([], { timeZone: tz, weekday: "short", day: "numeric" });
    const cls = (s: StrategySegment) => ("off" in s.result ? "off" : s.result.target >= top ? "comfort" : "setback");
    return html`<div class="preview" aria-label="Next ${days.length - 1} days">
      ${days.slice(0, -1).map((ds, i) => {
        const de = days[i + 1];
        const span = de - ds;
        return html`<div class="day"><span>${dayFmt.format(ds)}</span><div class="track">
          ${segments
            .filter((s) => s.end > ds && s.start < de)
            .map((s) => {
              const a = Math.max(s.start, ds);
              const b = Math.min(s.end, de);
              const label = "off" in s.result ? "off" : `${s.result.target}°`;
              return html`<div class="seg ${cls(s)}" style="left:${((a - ds) / span) * 100}%;width:${((b - a) / span) * 100}%" title="${s.reason} · ${label} · ${fmt.format(s.start)} – ${fmt.format(s.end)}"></div>`;
            })}
          ${now >= ds && now < de ? html`<div class="now" style="left:${((now - ds) / span) * 100}%" title="Now"></div>` : nothing}
        </div></div>`;
      })}
      <div class="legend"><span><i style="background:var(--primary-color)"></i>comfort</span><span><i style="background:var(--primary-color);opacity:.4"></i>setback</span><span><i style="background:var(--secondary-text-color);opacity:.25"></i>off</span></div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-week-preview": ShareSpaceWeekPreview;
  }
}
