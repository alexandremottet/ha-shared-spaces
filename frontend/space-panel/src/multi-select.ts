import { LitElement, css, html } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export interface MultiOption {
  value: string;
  label: string;
}

// Dropdown of checkable options; emits `selection-change` with the selected values in option order.
@customElement("share-space-multi-select")
export class ShareSpaceMultiSelect extends LitElement {
  @property() label = "";
  @property() placeholder = "None";
  @property({ attribute: false }) options: MultiOption[] = [];
  @property({ attribute: false }) selected: string[] = [];
  @property({ type: Boolean }) disabled = false;
  @state() private _open = false;

  static styles = css`
    :host {
      position: relative;
      display: inline-block;
      max-width: 100%;
    }
    button.toggle {
      min-height: 36px;
      max-width: 100%;
      padding: 0 30px 0 10px;
      border-radius: 8px;
      border: 1px solid var(--divider-color);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font: inherit;
      cursor: pointer;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      position: relative;
    }
    button.toggle::after {
      content: "▾";
      position: absolute;
      right: 10px;
    }
    .menu {
      position: absolute;
      z-index: 10;
      top: calc(100% + 4px);
      left: 0;
      min-width: 100%;
      max-height: 280px;
      overflow: auto;
      padding: 6px 0;
      border-radius: 8px;
      border: 1px solid var(--divider-color);
      background: var(--card-background-color);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    }
    label {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    label:hover {
      background: var(--secondary-background-color);
    }
  `;

  private _outside = (e: Event) => {
    if (!e.composedPath().includes(this)) this._open = false;
  };

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this._outside, true);
  }

  disconnectedCallback(): void {
    document.removeEventListener("click", this._outside, true);
    super.disconnectedCallback();
  }

  private _toggle(value: string, on: boolean): void {
    const set = new Set(this.selected);
    if (on) set.add(value);
    else set.delete(value);
    const next = this.options.map((o) => o.value).filter((v) => set.has(v));
    this.dispatchEvent(new CustomEvent("selection-change", { detail: next }));
  }

  protected render(): TemplateResult {
    const names = this.options.filter((o) => this.selected.includes(o.value)).map((o) => o.label);
    return html`<button
        class="toggle"
        aria-haspopup="true"
        aria-expanded=${this._open}
        aria-label=${this.label}
        ?disabled=${this.disabled}
        @click=${() => (this._open = !this._open)}
        @keydown=${(e: KeyboardEvent) => e.key === "Escape" && (this._open = false)}
      >
        ${names.length ? names.join(", ") : this.placeholder}
      </button>
      ${this._open
        ? html`<div class="menu" role="group" aria-label=${this.label} @keydown=${(e: KeyboardEvent) => e.key === "Escape" && (this._open = false)}>
            ${this.options.map(
              (o) => html`<label
                ><input
                  type="checkbox"
                  .checked=${this.selected.includes(o.value)}
                  ?disabled=${this.disabled}
                  @change=${(e: Event) => this._toggle(o.value, (e.target as HTMLInputElement).checked)}
                />${o.label}</label
              >`,
            )}
          </div>`
        : ""}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-multi-select": ShareSpaceMultiSelect;
  }
}
