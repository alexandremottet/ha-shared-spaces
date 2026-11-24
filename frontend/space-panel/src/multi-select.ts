import { LitElement, css, html } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";

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
  /** One value at most: options are picked, not checked, and the menu closes on a pick. */
  @property({ type: Boolean }) single = false;
  @state() private _open = false;
  @query(".menu") private _menu?: HTMLElement;
  @query("button.toggle") private _button?: HTMLElement;

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
    /* top layer (popover): above every card, whatever their stacking; solid behind see-through theme cards */
    .menu {
      position: fixed;
      inset: auto;
      margin: 0;
      max-height: 280px;
      overflow: auto;
      padding: 6px 0;
      border-radius: 8px;
      border: 1px solid var(--divider-color);
      color: var(--primary-text-color);
      font: inherit;
      background: linear-gradient(var(--card-background-color, #fff), var(--card-background-color, #fff)), var(--primary-background-color, #fff);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    }
    label {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    label:hover,
    button.option:hover {
      background: var(--secondary-background-color);
    }
    button.option {
      display: block;
      width: 100%;
      padding: 6px 12px 6px 28px;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      white-space: nowrap;
      cursor: pointer;
      position: relative;
    }
    button.option[aria-checked="true"]::before {
      content: "✓";
      position: absolute;
      left: 10px;
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
    window.removeEventListener("scroll", this._place, true);
    window.removeEventListener("resize", this._place);
    super.disconnectedCallback();
  }

  // Under the button, or above it when the screen ends first.
  private _place = () => {
    const menu = this._menu;
    const r = this._button?.getBoundingClientRect();
    if (!menu || !r) return;
    menu.style.minWidth = `${r.width}px`;
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    const below = r.bottom + 4;
    menu.style.top = below + menu.offsetHeight > window.innerHeight - 8 && r.top > menu.offsetHeight ? `${r.top - 4 - menu.offsetHeight}px` : `${below}px`;
  };

  protected updated(): void {
    const menu = this._menu;
    if (!menu) return;
    if (this._open && !menu.matches(":popover-open")) {
      menu.showPopover?.();
      this._place();
      window.addEventListener("scroll", this._place, true);
      window.addEventListener("resize", this._place);
    } else if (!this._open) {
      window.removeEventListener("scroll", this._place, true);
      window.removeEventListener("resize", this._place);
    }
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
        ? html`<div class="menu" popover="manual" role="group" aria-label=${this.label} @keydown=${(e: KeyboardEvent) => e.key === "Escape" && (this._open = false)}>
            ${this.single
              ? this.options.map(
                  (o) => html`<button
                    class="option"
                    role="menuitemradio"
                    aria-checked=${this.selected.includes(o.value)}
                    ?disabled=${this.disabled}
                    @click=${() => {
                      this._open = false;
                      this.dispatchEvent(new CustomEvent("selection-change", { detail: [o.value] }));
                    }}
                  >
                    ${o.label}
                  </button>`,
                )
              : this.options.map(
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
