import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";
import { safeCustomElement } from "../../define";
import type { Action, ActionType, Value } from "../types";
import type { RuleError } from "../validate";
import { t } from "../../i18n";
import { ACTION_TYPES, actionLabel, changeActionType, scopeErrors } from "./edit";
import "./rule-value";
import { ruleStyles } from "./styles";

/** What a rule does: comfort, eco, off or a temperature (fixed or following a sensor). */
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
        <select aria-label=${t("Action")} @change=${(e: Event) => this._emit(changeActionType(a, (e.target as HTMLSelectElement).value as ActionType))}>
          ${ACTION_TYPES.map((k) => html`<option value=${k} ?selected=${k === a.type}>${actionLabel(k)}</option>`)}
        </select>
      </div>
      ${a.type === "temperature"
        ? html`<share-space-rule-value .value=${a.value} unit="°C" label=${t("Temperature")} .errors=${scopeErrors(this.errors, ".value")} @value-change=${(e: CustomEvent<{ value: Value }>) => {
            e.stopPropagation();
            this._emit({ type: "temperature", value: e.detail.value });
          }}></share-space-rule-value>`
        : null}
      ${this.errors.map((e) => html`<div class="err" role="alert">${e.message}</div>`)}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rule-action": ShareSpaceRuleAction;
  }
}
