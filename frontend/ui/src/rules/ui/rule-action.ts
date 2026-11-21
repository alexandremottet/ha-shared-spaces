import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { safeCustomElement } from "../../define";
import type { Action, ActionType } from "../types";
import type { RuleError } from "../validate";
import { ACTION_LABELS, changeActionType, parseNumber } from "./edit";
import { ruleStyles } from "./styles";

const TYPES = Object.keys(ACTION_LABELS) as ActionType[];

/** What a rule does: comfort, eco, off or a fixed temperature. */
@safeCustomElement("share-space-rule-action")
export class ShareSpaceRuleAction extends LitElement {
  static styles = [ruleStyles];

  @property({ attribute: false }) action: Action = { type: "comfort" };
  @property({ attribute: false }) errors: RuleError[] = [];

  private _emit(action: Action): void {
    this.dispatchEvent(new CustomEvent("action-change", { detail: { action }, bubbles: true, composed: true }));
  }

  protected render() {
    const a = this.action;
    return html`<div class="row">
        <select aria-label="Action" @change=${(e: Event) => this._emit(changeActionType(a, (e.target as HTMLSelectElement).value as ActionType))}>
          ${TYPES.map((t) => html`<option value=${t} ?selected=${t === a.type}>${ACTION_LABELS[t]}</option>`)}
        </select>
        ${a.type === "temperature"
          ? html`<input type="number" step="0.5" aria-label="Temperature" .value=${Number.isFinite(a.value) ? String(a.value) : ""} @change=${(e: Event) => this._emit({ type: "temperature", value: parseNumber((e.target as HTMLInputElement).value) ?? NaN })} /><span>°C</span>`
          : null}
      </div>
      ${this.errors.map((e) => html`<div class="err" role="alert">${e.message}</div>`)}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rule-action": ShareSpaceRuleAction;
  }
}
