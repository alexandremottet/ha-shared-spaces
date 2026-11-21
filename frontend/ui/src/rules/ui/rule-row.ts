import { LitElement, css, html } from "lit";
import { property } from "lit/decorators.js";
import { safeCustomElement } from "../../define";
import type { Action, Condition, Rule } from "../types";
import type { RuleError } from "../validate";
import { defaultCondition, removeAt, replaceAt, scopeErrors } from "./edit";
import "./rule-action";
import "./rule-condition";
import { ruleStyles } from "./styles";

/** One "When ... then ..." rule. Errors have paths relative to the rule (".label", ".when[0].hours", ".then"). */
@safeCustomElement("share-space-rule-row")
export class ShareSpaceRuleRow extends LitElement {
  static styles = [
    ruleStyles,
    css`
      .card {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        border: 1px solid var(--divider-color);
        border-radius: 12px;
      }
      .card.bad {
        border-color: var(--error-color);
      }
      .head input.label {
        flex: 1;
        min-width: 140px;
      }
      .num {
        font-weight: 600;
        color: var(--secondary-text-color);
      }
      .kw {
        font-weight: 600;
        color: var(--secondary-text-color);
        text-transform: uppercase;
        font-size: 0.75em;
        letter-spacing: 0.04em;
      }
      .cond {
        padding-left: 12px;
        border-left: 3px solid var(--divider-color);
      }
      .conds {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
    `,
  ];

  @property({ attribute: false }) rule: Rule = { label: "", when: [], then: { type: "comfort" } };
  @property({ type: Number }) index = 0;
  @property({ type: Number }) count = 1;
  @property({ attribute: false }) errors: RuleError[] = [];

  private _fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _change(rule: Rule): void {
    this._fire("rule-change", { rule });
  }

  private _move(to: number): void {
    this._fire("rule-move", { from: this.index, to });
  }

  protected render() {
    const { rule, index, count, errors } = this;
    const labelErrors = scopeErrors(errors, ".label");
    return html`<div class="card ${errors.length ? "bad" : ""}" role="group" aria-label="Rule ${index + 1}: ${rule.label}">
      <div class="row head">
        <span class="num">${index + 1}</span>
        <input class="label ${labelErrors.length ? "invalid" : ""}" type="text" aria-label="Rule name" placeholder="Rule name" .value=${rule.label} @change=${(e: Event) => this._change({ ...rule, label: (e.target as HTMLInputElement).value })} />
        <button aria-label="Move rule up" ?disabled=${index === 0} @click=${() => this._move(index - 1)}>↑</button>
        <button aria-label="Move rule down" ?disabled=${index >= count - 1} @click=${() => this._move(index + 1)}>↓</button>
        <button class="danger" aria-label="Remove rule" @click=${() => this._fire("rule-remove")}>✕</button>
      </div>
      ${labelErrors.map((e) => html`<div class="err" role="alert">${e.message}</div>`)}
      <div class="kw">When</div>
      <div class="conds">
        ${rule.when.length === 0 ? html`<div class="muted">No condition: this rule always applies.</div>` : null}
        ${rule.when.map(
          (c, i) => html`${i > 0 ? html`<div class="kw">and</div>` : null}<share-space-rule-condition
            class="cond"
            .condition=${c}
            .errors=${scopeErrors(errors, `.when[${i}]`)}
            @condition-change=${(e: CustomEvent<{ condition: Condition }>) => {
              e.stopPropagation();
              this._change({ ...rule, when: replaceAt(rule.when, i, e.detail.condition) });
            }}
            @condition-remove=${(e: Event) => {
              e.stopPropagation();
              this._change({ ...rule, when: removeAt(rule.when, i) });
            }}
          ></share-space-rule-condition>`,
        )}
        <div class="row"><button aria-label="Add condition" @click=${() => this._change({ ...rule, when: [...rule.when, defaultCondition("occupied")] })}>+ Add condition</button></div>
      </div>
      <div class="kw">Then</div>
      <share-space-rule-action
        .action=${rule.then}
        .errors=${scopeErrors(errors, ".then")}
        @action-change=${(e: CustomEvent<{ action: Action }>) => {
          e.stopPropagation();
          this._change({ ...rule, then: e.detail.action });
        }}
      ></share-space-rule-action>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rule-row": ShareSpaceRuleRow;
  }
}
