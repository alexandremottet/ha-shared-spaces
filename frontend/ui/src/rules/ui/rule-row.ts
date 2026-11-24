import { LitElement, html, nothing } from "lit";
import type { TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { safeCustomElement } from "../../define";
import { t } from "../../i18n";
import type { Action, Condition, Rule } from "../types";
import type { RuleError } from "../validate";
import { defaultCondition, describeAction, describeCondition, removeAt, replaceAt, scopeErrors } from "./edit";
import "./rule-action";
import "./rule-condition";
import { chainStyles, ruleStyles } from "./styles";

type Open = "head" | "then" | number | null;

/**
 * One rule as a chain of blocks: RULE (name) — IF … AND … — + CONDITION — THEN (action).
 * Clicking a block body opens its editor under the chain. Errors have paths relative to the rule.
 * With `fallback`, the chain is OTHERWISE — THEN and cannot move or be removed.
 */
@safeCustomElement("share-space-rule-row")
export class ShareSpaceRuleRow extends LitElement {
  static styles = [ruleStyles, chainStyles];

  @property({ attribute: false }) rule: Rule = { label: "", when: [], then: { type: "comfort" } };
  @property({ type: Number }) index = 0;
  @property({ type: Number }) count = 1;
  @property({ type: Boolean }) fallback = false;
  @property({ type: Boolean, reflect: true }) highlighted = false;
  @property({ attribute: false }) errors: RuleError[] = [];
  @property({ attribute: false }) areaNames: Record<string, string> = {};
  @state() private _open: Open = null;

  private _fire(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _change(rule: Rule): void {
    this._fire("rule-change", { rule });
  }

  private _toggle(node: Open): void {
    this._open = this._open === node ? null : node;
    if (this._open !== null) this._fire("block-open");
  }

  /** Closes this row's editor (the list keeps one block selected at a time). */
  closeEditor(): void {
    this._open = null;
  }

  private _block(o: {
    node: Open;
    kind: "rule" | "cond" | "then";
    title: string;
    body: TemplateResult | string;
    errPrefix: string;
    label: string;
    remove?: { label: string; run: () => void };
  }): TemplateResult {
    const bad = scopeErrors(this.errors, o.errPrefix).length > 0;
    const open = this._open === o.node;
    return html`<div class="block ${o.kind} ${bad ? "bad" : ""} ${open ? "open" : ""}">
      <div class="bh">
        <span>${bad ? "⚠ " : ""}${o.title}</span>
        ${o.remove ? html`<button class="x" aria-label=${o.remove.label} @click=${o.remove.run}>×</button>` : nothing}
      </div>
      <button class="bb" aria-label=${o.label} aria-expanded=${open} @click=${() => this._toggle(o.node)}>${o.body}</button>
    </div>`;
  }

  private _editor(): TemplateResult | typeof nothing {
    const { rule, index, count, errors } = this;
    const open = this._open;
    if (open === "head") {
      const labelErrors = scopeErrors(errors, ".label");
      return this._panel(html`<div class="row head-edit">
          <input class="label ${labelErrors.length ? "invalid" : ""}" type="text" aria-label=${t("Rule name")} placeholder=${t("Rule name")} .value=${rule.label} @change=${(e: Event) => this._change({ ...rule, label: (e.target as HTMLInputElement).value })} />
          ${this.fallback
            ? nothing
            : html`<button aria-label=${t("Move rule up")} ?disabled=${index === 0} @click=${() => this._fire("rule-move", { from: index, to: index - 1 })}>↑</button>
                <button aria-label=${t("Move rule down")} ?disabled=${index >= count - 1} @click=${() => this._fire("rule-move", { from: index, to: index + 1 })}>↓</button>`}
        </div>
        ${labelErrors.map((e) => html`<div class="err" role="alert">${e.message}</div>`)}`);
    }
    if (open === "then") {
      return this._panel(html`<share-space-rule-action
        .action=${rule.then}
        .errors=${scopeErrors(errors, ".then")}
        @action-change=${(e: CustomEvent<{ action: Action }>) => {
          e.stopPropagation();
          this._change({ ...rule, then: e.detail.action });
        }}
      ></share-space-rule-action>`);
    }
    if (typeof open === "number" && rule.when[open]) {
      return this._panel(html`<share-space-rule-condition
        .condition=${rule.when[open]}
        .areaNames=${this.areaNames}
        .errors=${scopeErrors(errors, `.when[${open}]`)}
        @condition-change=${(e: CustomEvent<{ condition: Condition }>) => {
          e.stopPropagation();
          this._change({ ...rule, when: replaceAt(rule.when, open, e.detail.condition) });
        }}
        @condition-remove=${(e: Event) => {
          e.stopPropagation();
          this._removeCondition(open);
        }}
      ></share-space-rule-condition>`);
    }
    return nothing;
  }

  private _panel(content: TemplateResult): TemplateResult {
    const open = this._open;
    const kind = open === "head" ? "rule" : open === "then" ? "then" : "cond";
    return html`<div class="editor ${kind}">${content}</div>`;
  }

  private _caretObserver?: ResizeObserver;

  connectedCallback(): void {
    super.connectedCallback();
    this._caretObserver ??= new ResizeObserver(() => this._placeCaret());
    this._caretObserver.observe(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._caretObserver?.disconnect();
  }

  protected updated(): void {
    this._placeCaret();
  }

  /** Points the editor's caret at the centre of the open block (blocks wrap, so it is measured). */
  private _placeCaret(): void {
    const root = this.renderRoot as ShadowRoot;
    const editor = root.querySelector<HTMLElement>(".editor");
    const block = root.querySelector<HTMLElement>(".block.open");
    if (!editor || !block) return;
    const e = editor.getBoundingClientRect();
    const b = block.getBoundingClientRect();
    editor.style.setProperty("--caret-x", `${Math.max(16, Math.min(e.width - 16, b.left + b.width / 2 - e.left))}px`);
  }

  private _removeCondition(i: number): void {
    const open = this._open;
    if (open === i) this._open = null;
    else if (typeof open === "number" && open > i) this._open = open - 1;
    this._change({ ...this.rule, when: removeAt(this.rule.when, i) });
  }

  protected render() {
    const { rule, index } = this;
    const link = html`<span class="link" aria-hidden="true"></span>`;
    const then = this._block({ node: "then", kind: "then", title: t("Then"), body: describeAction(rule.then), errPrefix: ".then", label: t("Action: {value}", { value: describeAction(rule.then) }) });
    if (this.fallback) {
      const head = this._block({ node: "head", kind: "rule", title: t("Otherwise"), body: rule.label, errPrefix: ".label", label: t("Fallback name: {name}", { name: rule.label }) });
      return html`<div class="wrap" role="group" aria-label=${t("Fallback: {name}", { name: rule.label })}>
        <div class="chain">${head}${link}${then}</div>
        ${this._editor()}
      </div>`;
    }
    const head = this._block({
      node: "head",
      kind: "rule",
      title: t("Rule {n}", { n: index + 1 }),
      body: rule.label,
      errPrefix: ".label",
      label: t("Rule {n} name: {name}", { n: index + 1, name: rule.label }),
      remove: { label: t("Remove rule"), run: () => this._fire("rule-remove") },
    });
    const addCondition = () => {
      this._change({ ...rule, when: [...rule.when, defaultCondition("occupied")] });
      this._open = rule.when.length;
      this._fire("block-open");
    };
    return html`<div class="wrap" role="group" aria-label=${t("Rule {n}: {name}", { n: index + 1, name: rule.label })}>
      <div class="chain">
        ${head}${link}
        <div class="conds">
          ${rule.when.map(
            (c, i) => html`${this._block({
              node: i,
              kind: "cond",
              title: i === 0 ? t("If") : t("And"),
              body: describeCondition(c, this.areaNames),
              errPrefix: `.when[${i}]`,
              label: t("Condition {n}: {value}", { n: i + 1, value: describeCondition(c, this.areaNames) }),
              remove: { label: t("Remove condition {n}", { n: i + 1 }), run: () => this._removeCondition(i) },
            })}${this._open === i ? this._editor() : nothing}`,
          )}
          <button class="slot" aria-label=${t("Add condition")} @click=${addCondition}>+ ${rule.when.length === 0 ? t("If") : t("And")}</button>
        </div>
        ${link}${then}
      </div>
      ${rule.when.length === 0 ? html`<div class="muted always">${t("No condition: always applies")}</div>` : nothing}
      ${typeof this._open === "number" ? nothing : this._editor()}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rule-row": ShareSpaceRuleRow;
  }
}
