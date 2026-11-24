import { LitElement, css, html, nothing } from "lit";
import type { TemplateResult as LitResult } from "lit";
import { property, query } from "lit/decorators.js";
import { safeCustomElement } from "./define";
import { t } from "./i18n";
import { entityRef, insertSnippet } from "./template-hooks";
import type { TemplateEntity, TemplateHook, TemplateResult } from "./template-hooks";

interface CmView {
  state: { selection: { main: { from: number; to: number } } };
  dispatch(spec: unknown): void;
  focus(): void;
}
interface CodeEditorEl extends HTMLElement {
  codemirror?: { view?: CmView } & Partial<CmView>;
}

/** Jinja template editor with beginner help; emits value-change {value}, save {value}, clear. */
@safeCustomElement("share-space-template-editor")
export class ShareSpaceTemplateEditor extends LitElement {
  @property() value = "";
  @property({ attribute: false }) hook?: TemplateHook;
  @property({ attribute: false }) entities: TemplateEntity[] = [];
  @property({ attribute: false }) result: TemplateResult | null = null;
  @property({ type: Boolean }) liveAvailable = false;
  @property({ type: Boolean }) busy = false;
  @property() error = "";
  @query("textarea") private _textarea?: HTMLTextAreaElement;
  @query("ha-code-editor") private _code?: CodeEditorEl;

  static styles = css`
    :host {
      display: block;
      color: var(--primary-text-color);
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .error {
      color: var(--error-color);
      margin: 8px 0;
      white-space: pre-wrap;
    }
    textarea {
      width: 100%;
      min-height: 120px;
      box-sizing: border-box;
      font-family: var(--code-font-family, monospace);
      font-size: 14px;
      color: var(--primary-text-color);
      background: var(--card-background-color, transparent);
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 8px;
    }
    ha-code-editor {
      display: block;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin: 8px 0;
    }
    button,
    select {
      min-height: 44px;
      box-sizing: border-box;
      font: inherit;
      color: var(--primary-text-color);
      border: 1px solid var(--divider-color);
      border-radius: 22px;
      background: transparent;
      padding: 0 16px;
      cursor: pointer;
    }
    button.primary {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      border-color: transparent;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    button:focus-visible,
    select:focus-visible,
    textarea:focus-visible,
    summary:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .live {
      margin: 8px 0;
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--secondary-background-color);
      min-height: 20px;
    }
    .live .error {
      margin: 0;
    }
    details {
      margin: 8px 0;
    }
    summary {
      min-height: 44px;
      display: flex;
      align-items: center;
      cursor: pointer;
      font-weight: 500;
    }
    ul {
      margin: 4px 0 8px;
      padding-left: 20px;
    }
    code {
      font-family: var(--code-font-family, monospace);
    }
    .snip {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      height: auto;
      padding: 8px 16px;
      border-radius: 12px;
      text-align: left;
    }
    .snip code {
      font-size: 12px;
      color: var(--secondary-text-color);
    }
  `;

  private _change(value: string): void {
    this.dispatchEvent(new CustomEvent("value-change", { detail: { value } }));
  }

  private _insert(text: string): void {
    const cm = this._code?.codemirror;
    const view = (cm?.view ?? cm) as CmView | undefined;
    if (view?.state?.selection && typeof view.dispatch === "function") {
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
      view.focus();
      return;
    }
    const ta = this._textarea;
    if (ta) {
      const { value, cursor } = insertSnippet(ta.value, text, ta.selectionStart, ta.selectionEnd);
      this._change(value);
      void this.updateComplete.then(() => {
        ta.focus();
        ta.setSelectionRange(cursor, cursor);
      });
      return;
    }
    this._change(insertSnippet(this.value, text).value);
  }

  private _renderEditor(): LitResult {
    const label = t("{title} template", { title: this.hook ? t(this.hook.title) : t("Template") });
    if (customElements.get("ha-code-editor")) {
      return html`<ha-code-editor
        mode="jinja2"
        .value=${this.value}
        .autofocus=${false}
        aria-label=${label}
        @value-changed=${(e: CustomEvent<{ value: string }>) => {
          e.stopPropagation();
          if (e.detail.value !== this.value) this._change(e.detail.value);
        }}
      ></ha-code-editor>`;
    }
    return html`<textarea
      spellcheck="false"
      aria-label=${label}
      .value=${this.value}
      @input=${(e: Event) => this._change((e.target as HTMLTextAreaElement).value)}
    ></textarea>`;
  }

  private _renderLive(): LitResult {
    if (!this.liveAvailable) return html`<div class="live muted" role="status">${t("Evaluated in Home Assistant only")}</div>`;
    const r = this.result;
    return html`<div class="live" role="status" aria-live="polite">
      ${!r
        ? html`<span class="muted">${t("Type a template to see its result")}</span>`
        : r.error
          ? html`<span class="error">${r.error}</span>`
          : html`${t("Result:")} <code>${r.value === "" || r.value === undefined ? t("(empty)") : r.value}</code>`}
    </div>`;
  }

  private _renderHelp(h: TemplateHook): LitResult {
    return html`<details ?open=${!this.value?.trim()}>
      <summary>${t("Help for {title}", { title: t(h.title) })}</summary>
      <p><strong>${t("It must return:")}</strong> ${t(h.returns)}</p>
      <p class="muted">${t("Default when the template is empty or invalid: {default}.", { default: t(h.defaultText) })}</p>
      <p><strong>${t("Variables")}</strong></p>
      <ul>
        ${h.variables.map((v) => html`<li><code>${v.name}</code>: ${t(v.description)}</li>`)}
      </ul>
      <p><strong>${t("Snippets")}</strong> ${t("(click to insert)")}</p>
      <div class="row">
        ${h.snippets.map(
          (s) => html`<button class="snip" type="button" @click=${() => this._insert(s.code)}>
            <span>${t(s.label)}</span><code>${s.code}</code>
          </button>`
        )}
      </div>
      ${this.entities.length
        ? html`<div class="row">
            <select
              aria-label=${t("Insert an entity")}
              @change=${(e: Event) => {
                const sel = e.target as HTMLSelectElement;
                if (sel.value) this._insert(entityRef(sel.value));
                sel.value = "";
              }}
            >
              <option value="">${t("Insert an entity...")}</option>
              ${this.entities.map((en) => html`<option value=${en.entity_id}>${en.name} (${en.entity_id})</option>`)}
            </select>
          </div>`
        : nothing}
    </details>`;
  }

  protected render(): LitResult {
    const h = this.hook;
    return html`
      ${h ? this._renderHelp(h) : nothing} ${this._renderEditor()} ${this._renderLive()}
      ${this.error ? html`<div class="error" role="alert">${this.error}</div>` : nothing}
      <div class="row">
        <button class="primary" type="button" ?disabled=${this.busy} @click=${() => this.dispatchEvent(new CustomEvent("save", { detail: { value: this.value } }))}>
          ${t("Save")}
        </button>
        <button type="button" ?disabled=${this.busy} @click=${() => this.dispatchEvent(new CustomEvent("clear"))}>${t("Clear")}</button>
      </div>
    `;
  }
}
