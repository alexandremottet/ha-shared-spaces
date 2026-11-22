import { LitElement, css, html, nothing } from "lit";
import type { TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { safeCustomElement } from "../../define";
import type { Action, Condition, Rule } from "../types";
import type { RuleError } from "../validate";
import { defaultCondition, describeAction, describeCondition, removeAt, replaceAt, scopeErrors } from "./edit";
import "./rule-action";
import "./rule-condition";
import { haCardSurface, ruleStyles } from "./styles";

type Open = "head" | "then" | number | null;

/**
 * One rule as a card: "#n name" on top, then IF [condition] AND … on the left and THEN [action] on the right.
 * Clicking a chip opens its editor under the card. Errors have paths relative to the rule.
 * With `fallback`, the card has no conditions and cannot move or be removed.
 */
@safeCustomElement("share-space-rule-row")
export class ShareSpaceRuleRow extends LitElement {
  static styles = [
    ruleStyles,
    css`
      :host {
        display: block;
        container-type: inline-size;
      }
      .card {
        ${haCardSurface}
        padding: 8px 12px 12px;
        transition: box-shadow 0.12s, border-color 0.12s;
      }
      :host([highlighted]) .card {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px var(--primary-color);
      }
      .card.fallback {
        background: transparent;
        border-style: dashed;
      }
      .top {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .fallback .top {
        flex-wrap: wrap;
      }
      .fallback .then {
        margin-left: auto;
      }
      .node {
        min-height: 44px;
        max-width: 100%;
        padding: 8px 14px;
        border-radius: 12px;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color, #fff);
        text-align: left;
        white-space: normal;
        overflow-wrap: anywhere;
        line-height: 1.3;
      }
      .node.head {
        font-weight: 600;
        border-color: transparent;
        background: transparent;
        padding-left: 4px;
      }
      .num {
        color: var(--secondary-text-color);
        font-weight: 600;
        margin-right: 6px;
      }
      .node.then {
        border-color: var(--primary-color);
      }
      .node.add {
        border-style: dashed;
        color: var(--secondary-text-color);
      }
      .node.always {
        color: var(--secondary-text-color);
        font-style: italic;
        display: inline-flex;
        align-items: center;
      }
      .node[aria-expanded="true"] {
        outline: 2px solid var(--primary-color);
        outline-offset: 1px;
      }
      .node:focus-visible,
      .node.add:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .node.bad {
        border-color: var(--error-color);
        color: var(--error-color);
      }
      .body {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 45%);
        gap: 8px 16px;
        align-items: start;
      }
      .if,
      .then {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 8px;
        min-width: 0;
      }
      .then {
        justify-content: flex-end;
      }
      .kw {
        font-size: 0.75em;
        font-weight: 700;
        letter-spacing: 0.05em;
        color: var(--secondary-text-color);
      }
      .editor {
        margin-top: 10px;
        padding: 12px;
        border: 1px solid var(--divider-color);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .head-edit input.label {
        flex: 1;
        min-width: 140px;
      }
      @container (max-width: 560px) {
        .body {
          grid-template-columns: minmax(0, 1fr);
        }
        .then {
          justify-content: flex-start;
        }
      }
    `,
  ];

  @property({ attribute: false }) rule: Rule = { label: "", when: [], then: { type: "comfort" } };
  @property({ type: Number }) index = 0;
  @property({ type: Number }) count = 1;
  @property({ type: Boolean }) fallback = false;
  @property({ type: Boolean, reflect: true }) highlighted = false;
  @property({ attribute: false }) errors: RuleError[] = [];
  @state() private _open: Open = null;

  private _fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _change(rule: Rule): void {
    this._fire("rule-change", { rule });
  }

  private _toggle(node: Open): void {
    this._open = this._open === node ? null : node;
  }

  private _node(node: Open, text: TemplateResult | string, cls: string, errPrefix: string, label?: string): TemplateResult {
    const bad = scopeErrors(this.errors, errPrefix).length > 0;
    return html`<button class="node ${cls} ${bad ? "bad" : ""}" aria-label=${label ?? nothing} aria-expanded=${this._open === node} @click=${() => this._toggle(node)}>${bad ? "⚠ " : ""}${text}</button>`;
  }

  private _editor(): TemplateResult | typeof nothing {
    const { rule, index, count, errors } = this;
    const open = this._open;
    if (open === "head") {
      const labelErrors = scopeErrors(errors, ".label");
      return html`<div class="editor"><div class="row head-edit">
          <input class="label ${labelErrors.length ? "invalid" : ""}" type="text" aria-label="Rule name" placeholder="Rule name" .value=${rule.label} @change=${(e: Event) => this._change({ ...rule, label: (e.target as HTMLInputElement).value })} />
          ${this.fallback
            ? nothing
            : html`<button aria-label="Move rule up" ?disabled=${index === 0} @click=${() => this._fire("rule-move", { from: index, to: index - 1 })}>↑</button>
                <button aria-label="Move rule down" ?disabled=${index >= count - 1} @click=${() => this._fire("rule-move", { from: index, to: index + 1 })}>↓</button>
                <button class="danger" aria-label="Remove rule" @click=${() => this._fire("rule-remove")}>✕</button>`}
        </div>
        ${labelErrors.map((e) => html`<div class="err" role="alert">${e.message}</div>`)}</div>`;
    }
    if (open === "then") {
      return html`<div class="editor"><share-space-rule-action
        .action=${rule.then}
        .errors=${scopeErrors(errors, ".then")}
        @action-change=${(e: CustomEvent<{ action: Action }>) => {
          e.stopPropagation();
          this._change({ ...rule, then: e.detail.action });
        }}
      ></share-space-rule-action></div>`;
    }
    if (typeof open === "number" && rule.when[open]) {
      return html`<div class="editor"><share-space-rule-condition
        .condition=${rule.when[open]}
        .errors=${scopeErrors(errors, `.when[${open}]`)}
        @condition-change=${(e: CustomEvent<{ condition: Condition }>) => {
          e.stopPropagation();
          this._change({ ...rule, when: replaceAt(rule.when, open, e.detail.condition) });
        }}
        @condition-remove=${(e: Event) => {
          e.stopPropagation();
          this._open = null;
          this._change({ ...rule, when: removeAt(rule.when, open) });
        }}
      ></share-space-rule-condition></div>`;
    }
    return nothing;
  }

  protected render() {
    const { rule, index } = this;
    const addCondition = () => {
      this._change({ ...rule, when: [...rule.when, defaultCondition("occupied")] });
      this._open = rule.when.length;
    };
    const then = this._node("then", describeAction(rule.then), "then", ".then");
    const group = this.fallback ? `Fallback: ${rule.label}` : `Rule ${index + 1}: ${rule.label}`;
    if (this.fallback) {
      const head = this._node("head", html`<span class="num">Otherwise</span>${rule.label}`, "head", ".label", `Fallback name: ${rule.label}`);
      return html`<div class="card fallback" role="group" aria-label=${group}>
        <div class="top">${head}<div class="then"><span class="kw">THEN</span>${then}</div></div>
        ${this._editor()}
      </div>`;
    }
    const head = this._node("head", html`<span class="num">#${index + 1}</span>${rule.label}`, "head", ".label", `Rule ${index + 1} name: ${rule.label}`);
    return html`<div class="card" role="group" aria-label=${group}>
      <div class="top">${head}</div>
      <div class="body">
        <div class="if">
          <span class="kw">IF</span>
          ${rule.when.length === 0 ? html`<span class="node always">always</span>` : nothing}
          ${rule.when.map((c, i) => html`${i > 0 ? html`<span class="kw">AND</span>` : nothing}${this._node(i, describeCondition(c), "cond", `.when[${i}]`)}`)}
          <button class="node add" aria-label="Add condition" @click=${addCondition}>+ condition</button>
        </div>
        <div class="then"><span class="kw">THEN</span>${then}</div>
      </div>
      ${this._editor()}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rule-row": ShareSpaceRuleRow;
  }
}
