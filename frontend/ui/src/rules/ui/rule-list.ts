import { LitElement, css, html, nothing } from "lit";
import { property } from "lit/decorators.js";
import { safeCustomElement } from "../../define";
import type { Rule, RuleStrategy } from "../types";
import { validateStrategy } from "../validate";
import type { RuleError } from "../validate";
import { blankRule, moveItem, removeAt, replaceAt, scopeErrors } from "./edit";
import "./rule-row";
import { ruleStyles } from "./styles";

const EMPTY: RuleStrategy = { version: 1, rules: [], fallback: { label: "Otherwise", then: { type: "off" } } };

/** Rules as a vertical chain of block rows joined by ELSE IF (first match wins), ending with the fallback; emits the whole strategy on every edit, and `rule-hover` {label|null}. */
@safeCustomElement("share-space-rule-list")
export class ShareSpaceRuleList extends LitElement {
  static styles = [
    ruleStyles,
    css`
      .legend {
        margin-bottom: 8px;
      }
      .vlink {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 28px;
        margin-left: 20px;
        padding-left: 10px;
        border-left: 2px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
        font-size: 0.75em;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: var(--primary-color);
      }
      .slot {
        min-height: 44px;
        padding: 0 12px;
        border: 2px dashed color-mix(in srgb, var(--primary-color) 55%, transparent);
        border-radius: 8px;
        color: var(--primary-color);
        font-size: 0.75em;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
    `,
  ];

  @property({ attribute: false }) strategy: RuleStrategy = EMPTY;
  /** Label of the rule to highlight (from the preview). */
  @property() highlight: string | null = null;

  private _errors(): RuleError[] {
    const r = validateStrategy(this.strategy);
    return r.ok ? [] : r.errors;
  }

  private _emit(strategy: RuleStrategy): void {
    this.dispatchEvent(new CustomEvent("strategy-change", { detail: { strategy }, bubbles: true, composed: true }));
  }

  private _hover(label: string | null): void {
    this.dispatchEvent(new CustomEvent("rule-hover", { detail: { label }, bubbles: true, composed: true }));
  }

  private _closeOthers(e: Event): void {
    e.stopPropagation();
    this.renderRoot.querySelectorAll("share-space-rule-row").forEach((row) => row !== e.target && row.closeEditor());
  }

  private _setRules(rules: Rule[]): void {
    this._emit({ ...this.strategy, rules });
  }

  protected render() {
    const s = this.strategy;
    const errors = this._errors();
    const hover = (label: string) => ({ enter: () => this._hover(label), leave: () => this._hover(null) });
    const fb = hover(s.fallback.label);
    return html`<div class="muted legend">First matching rule wins (top to bottom)</div>
      <div class="flow" @block-open=${this._closeOthers}>
        ${s.rules.map(
          (rule, i) => html`${i > 0 ? html`<div class="vlink" aria-hidden="true">ELSE IF</div>` : nothing}<share-space-rule-row
              ?highlighted=${this.highlight !== null && this.highlight === rule.label}
              @mouseenter=${() => this._hover(rule.label)}
              @mouseleave=${() => this._hover(null)}
              @focusin=${() => this._hover(rule.label)}
              @focusout=${() => this._hover(null)}
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
        ${s.rules.length ? html`<div class="vlink" aria-hidden="true">ELSE IF</div>` : nothing}
        <div><button class="slot" aria-label="Add rule" @click=${() => this._setRules([...s.rules, blankRule()])}>+ Rule</button></div>
        <div class="vlink" aria-hidden="true">ELSE</div>
        <share-space-rule-row
          fallback
          ?highlighted=${this.highlight !== null && this.highlight === s.fallback.label}
          @mouseenter=${fb.enter}
          @mouseleave=${fb.leave}
          @focusin=${fb.enter}
          @focusout=${fb.leave}
          .rule=${{ label: s.fallback.label, when: [], then: s.fallback.then }}
          .errors=${scopeErrors(errors, "$.fallback")}
          @rule-change=${(e: CustomEvent<{ rule: Rule }>) => {
            e.stopPropagation();
            this._emit({ ...s, fallback: { label: e.detail.rule.label, then: e.detail.rule.then } });
          }}
        ></share-space-rule-row>
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rule-list": ShareSpaceRuleList;
  }
}
