import { LitElement, css, html } from "lit";
import { property } from "lit/decorators.js";
import { safeCustomElement } from "../../define";
import type { Action, Rule, RuleStrategy } from "../types";
import { validateStrategy } from "../validate";
import type { RuleError } from "../validate";
import { blankRule, moveItem, removeAt, replaceAt, scopeErrors } from "./edit";
import "./rule-action";
import "./rule-row";
import { ruleStyles } from "./styles";

const EMPTY: RuleStrategy = { version: 1, rules: [], fallback: { label: "Otherwise", then: { type: "off" } } };

/** Editable rule list plus the fixed fallback; emits the whole new strategy on every edit. */
@safeCustomElement("share-space-rule-list")
export class ShareSpaceRuleList extends LitElement {
  static styles = [
    ruleStyles,
    css`
      .list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .fallback {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        border: 1px dashed var(--divider-color);
        border-radius: 12px;
      }
      .fallback input.label {
        flex: 1;
        min-width: 140px;
      }
      .kw {
        font-weight: 600;
        color: var(--secondary-text-color);
      }
    `,
  ];

  @property({ attribute: false }) strategy: RuleStrategy = EMPTY;

  private _errors(): RuleError[] {
    const r = validateStrategy(this.strategy);
    return r.ok ? [] : r.errors;
  }

  private _emit(strategy: RuleStrategy): void {
    this.dispatchEvent(new CustomEvent("strategy-change", { detail: { strategy }, bubbles: true, composed: true }));
  }

  private _setRules(rules: Rule[]): void {
    this._emit({ ...this.strategy, rules });
  }

  protected render() {
    const s = this.strategy;
    const errors = this._errors();
    const fb = scopeErrors(errors, "$.fallback");
    return html`<div class="list">
      ${s.rules.length === 0 ? html`<div class="muted">No rules yet. Without rules the fallback always applies.</div>` : null}
      ${s.rules.map(
        (rule, i) => html`<share-space-rule-row
          .rule=${rule}
          .index=${i}
          .count=${s.rules.length}
          .errors=${scopeErrors(errors, `$.rules[${i}]`)}
          @rule-change=${(e: CustomEvent<{ rule: Rule }>) => {
            e.stopPropagation();
            this._setRules(replaceAt(s.rules, i, e.detail.rule));
          }}
          @rule-remove=${(e: Event) => {
            e.stopPropagation();
            this._setRules(removeAt(s.rules, i));
          }}
          @rule-move=${(e: CustomEvent<{ from: number; to: number }>) => {
            e.stopPropagation();
            this._setRules(moveItem(s.rules, e.detail.from, e.detail.to));
          }}
        ></share-space-rule-row>`,
      )}
      <div class="row"><button aria-label="Add rule" @click=${() => this._setRules([...s.rules, blankRule()])}>+ Add rule</button></div>
      <div class="fallback" role="group" aria-label="Fallback rule">
        <div class="row">
          <span class="kw">Otherwise</span>
          <input class="label ${scopeErrors(fb, ".label").length ? "invalid" : ""}" type="text" aria-label="Fallback name" .value=${s.fallback.label} @change=${(e: Event) => this._emit({ ...s, fallback: { ...s.fallback, label: (e.target as HTMLInputElement).value } })} />
        </div>
        ${scopeErrors(fb, ".label").map((e) => html`<div class="err" role="alert">${e.message}</div>`)}
        <share-space-rule-action
          .action=${s.fallback.then}
          .errors=${scopeErrors(fb, ".then")}
          @action-change=${(e: CustomEvent<{ action: Action }>) => {
            e.stopPropagation();
            this._emit({ ...s, fallback: { ...s.fallback, then: e.detail.action } });
          }}
        ></share-space-rule-action>
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rule-list": ShareSpaceRuleList;
  }
}
