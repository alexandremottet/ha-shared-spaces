import { LitElement, css, html, nothing } from "lit";
import type { TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import { safeCustomElement } from "../../define";
import { WEEK_DAYS } from "../../types";
import type { WeekDay } from "../../types";
import type { Condition, ConditionType, TimeWindow, Value } from "../types";
import type { RuleError } from "../validate";
import { CONDITION_LABELS, changeConditionType, parseNumber, removeAt, replaceAt, scopeErrors, toggleDay } from "./edit";
import "./rule-value";
import { sensorField } from "./sensor-field";
import { ruleStyles } from "./styles";

const TYPES = Object.keys(CONDITION_LABELS) as ConditionType[];
const DAY_LABELS: Record<WeekDay, string> = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };
const num = (v: number) => (Number.isFinite(v) ? String(v) : "");

/** One condition: type select, its fields and a "not" toggle. Errors have paths relative to the condition. */
@safeCustomElement("share-space-rule-condition")
export class ShareSpaceRuleCondition extends LitElement {
  static styles = [
    ruleStyles,
    css`
      .cond {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .windows {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
    `,
  ];

  @property({ attribute: false }) condition: Condition = { type: "occupied" };
  @property({ attribute: false }) errors: RuleError[] = [];
  /** Area names by id, offered by "Another area heated". */
  @property({ attribute: false }) areaNames: Record<string, string> = {};

  private _emit(condition: Condition): void {
    this.dispatchEvent(new CustomEvent("condition-change", { detail: { condition }, bubbles: true, composed: true }));
  }

  private _patch(patch: Record<string, unknown>): void {
    this._emit({ ...this.condition, ...patch } as Condition);
  }

  private _time(label: string, value: string, onChange: (v: string) => void): TemplateResult {
    return html`<input class="time" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" aria-label=${label} .value=${value} @change=${(e: Event) => onChange((e.target as HTMLInputElement).value.trim())} />`;
  }

  private _number(label: string, value: number, unit: string, onChange: (n: number) => void, min: number | undefined = 0): TemplateResult {
    return html`<input type="number" min=${min ?? nothing} step="any" aria-label=${label} .value=${num(value)} @change=${(e: Event) => onChange(parseNumber((e.target as HTMLInputElement).value) ?? NaN)} /><span>${unit}</span>`;
  }

  private _fields(c: Condition): TemplateResult | typeof nothing {
    switch (c.type) {
      case "occupied":
        return nothing;
      case "occupied_within":
        return html`<share-space-rule-value .value=${c.hours} unit="h" label="Hours" .errors=${scopeErrors(this.errors, ".hours")} @value-change=${(e: CustomEvent<{ value: Value }>) => {
          e.stopPropagation();
          this._patch({ hours: e.detail.value });
        }}></share-space-rule-value>`;
      case "between_days":
        return html`<div class="row"><span>gap of at most</span>${this._number("Gap in hours", c.gap_hours, "hours", (gap_hours) => this._patch({ gap_hours }))}</div>`;
      case "weekday":
        return html`<div class="row" role="group" aria-label="Days of the week">
          ${WEEK_DAYS.map(
            (d) =>
              html`<button class="chip ${c.days.includes(d) ? "active" : ""}" aria-pressed=${c.days.includes(d)} aria-label=${d} @click=${() => this._patch({ days: toggleDay(c.days, d, WEEK_DAYS) })}>${DAY_LABELS[d]}</button>`,
          )}
        </div>`;
      case "time":
        return html`<div class="row">${this._time("From", c.start, (start) => this._patch({ start }))}<span>to</span>${this._time("To", c.end, (end) => this._patch({ end }))}</div>`;
      case "planned":
        return this._planned(c.windows, c.match, c.who ?? "area");
      case "sensor":
        return html`<div class="row">
          ${sensorField(c.entity, (entity) => this._patch({ entity }))}
          <select aria-label="Comparison" @change=${(e: Event) => this._patch({ op: (e.target as HTMLSelectElement).value })}>
            <option value="below" ?selected=${c.op === "below"}>below</option>
            <option value="above" ?selected=${c.op === "above"}>above</option>
          </select>
          ${this._number("Threshold", c.than, "°C", (than) => this._patch({ than }), undefined)}
        </div>
        <div class="muted">No reading: the condition does not hold.</div>`;
      case "state":
        return html`<div class="row">
          <input type="text" placeholder="binary_sensor.office_neighbors" aria-label="Entity" .value=${c.entity} @change=${(e: Event) => this._patch({ entity: (e.target as HTMLInputElement).value.trim() })} />
          <span>is</span>
          <input type="text" placeholder="on" aria-label="State" .value=${c.is} @change=${(e: Event) => this._patch({ is: (e.target as HTMLInputElement).value.trim() })} />
        </div>
        <div class="muted">Any HA entity, e.g. a group helper of other areas. Missing entity: the condition does not hold.</div>`;
      case "heated": {
        const ids = [...new Set([...Object.keys(this.areaNames), ...c.areas])];
        const toggle = (id: string) => this._patch({ areas: c.areas.includes(id) ? c.areas.filter((a) => a !== id) : [...c.areas, id] });
        return html`<div class="row" role="group" aria-label="Areas">
            ${ids.map(
              (id) =>
                html`<button class="chip ${c.areas.includes(id) ? "active" : ""}" aria-pressed=${c.areas.includes(id)} @click=${() => toggle(id)}>${this.areaNames[id] ?? id}</button>`,
            )}
          </div>
          <div class="muted">Holds when one of them is heated: its thermostat is on and not on eco, away or sleep.</div>`;
      }
    }
  }

  private _planned(windows: TimeWindow[], match: "all" | "any", who: "area" | "anyone"): TemplateResult {
    const set = (i: number, patch: Partial<TimeWindow>) => this._patch({ windows: replaceAt(windows, i, { ...windows[i], ...patch }) });
    return html`<div class="windows">
      <div class="row">
        <select aria-label="Whose planning" @change=${(e: Event) => this._patch({ who: (e.target as HTMLSelectElement).value === "anyone" ? "anyone" : undefined })}>
          <option value="area" ?selected=${who === "area"}>this area's planning</option>
          <option value="anyone" ?selected=${who === "anyone"}>one person's planning</option>
        </select>
        <span>has a slot starting in</span>
        <select aria-label="Match" @change=${(e: Event) => this._patch({ match: (e.target as HTMLSelectElement).value })}>
          <option value="all" ?selected=${match === "all"}>all windows</option>
          <option value="any" ?selected=${match === "any"}>any window</option>
        </select>
      </div>
      ${windows.map(
        (w, i) => html`<div class="row">
          ${this._time(`Window ${i + 1} from`, w.start, (start) => set(i, { start }))}<span>to</span>${this._time(`Window ${i + 1} to`, w.end, (end) => set(i, { end }))}
          <button class="danger" aria-label="Remove window ${i + 1}" @click=${() => this._patch({ windows: removeAt(windows, i) })}>✕</button>
        </div>`,
      )}
      <div class="row"><button aria-label="Add window" @click=${() => this._patch({ windows: [...windows, { start: "12:00", end: "14:00" }] })}>+ Add window</button></div>
    </div>`;
  }

  protected render() {
    const c = this.condition;
    return html`<div class="cond">
      <div class="row">
        <label class="inline"><input type="checkbox" .checked=${!!c.negate} aria-label="Not" @change=${(e: Event) => this._patch({ negate: (e.target as HTMLInputElement).checked || undefined })} />not</label>
        <select aria-label="Condition type" @change=${(e: Event) => this._emit(changeConditionType(c, (e.target as HTMLSelectElement).value as ConditionType))}>
          ${TYPES.map((t) => html`<option value=${t} ?selected=${t === c.type}>${CONDITION_LABELS[t]}</option>`)}
        </select>
        <button class="danger" aria-label="Remove condition" @click=${() => this.dispatchEvent(new CustomEvent("condition-remove", { bubbles: true, composed: true }))}>✕</button>
      </div>
      ${this._fields(c)} ${this.errors.map((e) => html`<div class="err" role="alert">${e.message}</div>`)}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rule-condition": ShareSpaceRuleCondition;
  }
}
