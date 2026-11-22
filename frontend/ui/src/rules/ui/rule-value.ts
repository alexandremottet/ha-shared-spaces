import { LitElement, css, html, nothing, svg } from "lit";
import type { TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import { safeCustomElement } from "../../define";
import type { CurvePoint, CurveValue, Value } from "../types";
import type { RuleError } from "../validate";
import type { ValueUnit } from "./edit";
import { defaultCurve, fixedOf, parseNumber, removeAt, replaceAt, scopeErrors } from "./edit";
import { sensorField } from "./sensor-field";
import { OUTDOOR } from "../value";
import { ruleStyles } from "./styles";

const MAX_POINTS = 5;
const num = (v: number) => (Number.isFinite(v) ? String(v) : "");

/** Fixed number or "Follow outdoor temperature" curve. Errors have paths relative to the value ("", ".entity", ".points[0].value"). */
@safeCustomElement("share-space-rule-value")
export class ShareSpaceRuleValue extends LitElement {
  static styles = [
    ruleStyles,
    css`
      .curve {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-left: 10px;
        border-left: 3px solid var(--primary-color);
      }
      input.entity {
        flex: 1;
        min-width: 180px;
      }
      svg {
        width: 160px;
        height: 48px;
        color: var(--primary-color);
      }
    `,
  ];

  @property({ attribute: false }) value: Value = 0;
  @property() unit: ValueUnit = "°C";
  @property() label = "Value";
  @property({ attribute: false }) errors: RuleError[] = [];

  private _emit(value: Value): void {
    this.dispatchEvent(new CustomEvent("value-change", { detail: { value }, bubbles: true, composed: true }));
  }

  private _number(label: string, value: number, onChange: (n: number) => void, invalid: boolean): TemplateResult {
    return html`<input type="number" step="any" class=${invalid ? "invalid" : ""} aria-label=${label} .value=${num(value)} @change=${(e: Event) => onChange(parseNumber((e.target as HTMLInputElement).value) ?? NaN)} />`;
  }

  private _bad(path: string): boolean {
    return scopeErrors(this.errors, path).length > 0;
  }

  private _curve(c: CurveValue): TemplateResult {
    const patch = (p: Partial<CurveValue>) => this._emit({ ...c, ...p });
    const setPoint = (i: number, p: Partial<CurvePoint>) => patch({ points: replaceAt(c.points, i, { ...c.points[i], ...p }) });
    const addPoint = () => {
      const last = c.points[c.points.length - 1];
      patch({ points: [...c.points, { at: (last?.at ?? 0) + 5, value: last?.value ?? 0 }] });
    };
    return html`<div class="curve">
      <div class="row">
        <span>${c.entity === OUTDOOR ? "outdoor temperature (Settings)" : "sensor"}</span>
        ${sensorField(c.entity, (entity) => patch({ entity }), this._bad(".entity"))}
      </div>
      ${c.points.map(
        (p, i) => html`<div class="row">
          <span>when it is</span>${this._number(`Point ${i + 1} outdoor °C`, p.at, (at) => setPoint(i, { at }), this._bad(`.points[${i}].at`))}
          <span>→</span>${this._number(`Point ${i + 1} ${this.label}`, p.value, (value) => setPoint(i, { value }), this._bad(`.points[${i}].value`))}<span>${this.unit}</span>
          ${c.points.length > 2 ? html`<button class="danger" aria-label="Remove point ${i + 1}" @click=${() => patch({ points: removeAt(c.points, i) })}>✕</button>` : nothing}
        </div>`,
      )}
      <div class="row">
        ${c.points.length < MAX_POINTS ? html`<button aria-label="Add point" @click=${addPoint}>+ Add point</button>` : nothing}
        <span>no reading: use</span>${this._number("Value when there is no outdoor reading", c.default, (d) => patch({ default: d }), this._bad(".default"))}
        ${this._spark(c.points)}
      </div>
      <div class="muted">Straight line between points, flat before the first and after the last.</div>
    </div>`;
  }

  /** Tiny plot of the curve, flat past the ends. */
  private _spark(points: CurvePoint[]) {
    const ok = points.length >= 2 && points.every((p) => Number.isFinite(p.at) && Number.isFinite(p.value));
    if (!ok) return nothing;
    const xs = points.map((p) => p.at);
    const ys = points.map((p) => p.value);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const pad = (x1 - x0) * 0.15 || 1;
    const sx = (x: number) => 4 + ((x - x0 + pad) / (x1 - x0 + 2 * pad || 1)) * 152;
    const sy = (y: number) => 44 - ((y - y0) / (y1 - y0 || 1)) * 40;
    const line = [`4,${sy(ys[0])}`, ...points.map((p) => `${sx(p.at)},${sy(p.value)}`), `156,${sy(ys[ys.length - 1])}`].join(" ");
    return html`<svg viewBox="0 0 160 48" role="img" aria-label="Curve preview">
      ${svg`<polyline points=${line} fill="none" stroke="currentColor" stroke-width="2" />`}
      ${points.map((p) => svg`<circle cx=${sx(p.at)} cy=${sy(p.value)} r="3" fill="currentColor" />`)}
    </svg>`;
  }

  protected render() {
    const v = this.value;
    const curve = typeof v === "object";
    return html`<div class="row">
        <select aria-label="${this.label} mode" @change=${(e: Event) => this._emit((e.target as HTMLSelectElement).value === "curve" ? defaultCurve(this.unit, fixedOf(v)) : fixedOf(v))}>
          <option value="fixed" ?selected=${!curve}>Fixed</option>
          <option value="curve" ?selected=${curve}>Follow outdoor temperature</option>
        </select>
        ${curve ? nothing : html`${this._number(this.label, v, (n) => this._emit(n), this.errors.length > 0)}<span>${this.unit}</span>`}
      </div>
      ${curve ? this._curve(v) : nothing}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rule-value": ShareSpaceRuleValue;
  }
}
