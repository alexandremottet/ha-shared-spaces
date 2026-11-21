import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { safeCustomElement } from "../../define";
import type { ScheduleRanges } from "../../heating/strategy-sim";
import { strategyTimeline } from "../../heating/strategy-timeline";
import { fromWall, wallTime } from "../../heating/tz";
import "../../heating/week-preview";
import type { PresetTemps, RuleStrategy } from "../types";
import { validateStrategy } from "../validate";

const PREVIEW_DAYS = 7;

/** Midnights of `count` days starting at the local day of `now`, plus one end boundary. */
export function previewDays(now: number, tz: string, count = PREVIEW_DAYS): number[] {
  const w = wallTime(now, tz);
  return Array.from({ length: count + 1 }, (_, i) => fromWall(tz, w.year, w.month, w.day + i, 0, 0));
}

/** 7-day timeline of what a rule strategy would do for a schedule. */
@safeCustomElement("share-space-rule-preview")
export class ShareSpaceRulePreview extends LitElement {
  @property({ attribute: false }) strategy?: RuleStrategy;
  @property({ attribute: false }) schedule: ScheduleRanges = {};
  @property({ type: Number }) now = Date.now();
  @property() tz = "UTC";
  @property({ attribute: false }) temps?: PresetTemps;

  private _compute() {
    const days = previewDays(this.now, this.tz);
    if (!this.strategy || !validateStrategy(this.strategy).ok) return null;
    return { days, segments: strategyTimeline(this.strategy, this.schedule, days[0], days[PREVIEW_DAYS], this.tz, this.temps) };
  }

  protected render() {
    const sim = this._compute();
    if (!sim) return html`<div style="color:var(--secondary-text-color);font-size:0.9em">Fix the errors above to see the preview.</div>`;
    return html`<share-space-week-preview .segments=${sim.segments} .days=${sim.days} .now=${this.now} .tz=${this.tz}></share-space-week-preview>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rule-preview": ShareSpaceRulePreview;
  }
}
