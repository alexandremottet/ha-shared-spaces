import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { safeCustomElement } from "../../define";
import { t } from "../../i18n";
import type { ScheduleRanges } from "../../heating/strategy-sim";
import { strategyTimeline } from "../../heating/strategy-timeline";
import { fromWall, wallTime } from "../../heating/tz";
import { plannedSpans } from "../../heating/week-preview";
import type { EntityStates, SensorReadings } from "../value";
import type { PersonPlannings, PresetTemps, RuleStrategy } from "../types";
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
  /** Current sensor readings, kept for the whole week. */
  @property({ attribute: false }) readings?: SensorReadings;
  /** Current entity states for state conditions, kept for the whole week. */
  @property({ attribute: false }) states?: EntityStates;
  /** Each person's own planning, for rules about one person. */
  @property({ attribute: false }) plannings?: PersonPlannings;
  /** Segment reason to emphasise; others are dimmed. */
  @property() highlight: string | null = null;

  private _compute() {
    const days = previewDays(this.now, this.tz);
    if (!this.strategy || !validateStrategy(this.strategy).ok) return null;
    return { days, planned: plannedSpans(this.schedule, days, this.tz), segments: strategyTimeline(this.strategy, this.schedule, days[0], days[PREVIEW_DAYS], this.tz, this.temps, this.readings, this.states, this.plannings) };
  }

  protected render() {
    const sim = this._compute();
    if (!sim) return html`<div style="color:var(--secondary-text-color);font-size:0.9em">${t("Fix the errors above to see the preview.")}</div>`;
    return html`<share-space-week-preview .segments=${sim.segments} .planned=${sim.planned} .days=${sim.days} .now=${this.now} .tz=${this.tz} .highlight=${this.highlight}></share-space-week-preview>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rule-preview": ShareSpaceRulePreview;
  }
}
