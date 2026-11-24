import { LitElement, html, css } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { t } from "ha-share-space-ui";

export interface PanelTab {
  id: string;
  label: string;
  /** Admin-only page: drawn in the admin colour. */
  admin?: boolean;
}

const CHEVRON = html`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z" /></svg>`;

// Tab strip, a dropdown menu on narrow screens: props in, `tab-change` (detail = id) out.
@customElement("share-space-panel-tabs")
export class ShareSpacePanelTabs extends LitElement {
  @property({ attribute: false }) tabs: PanelTab[] = [];
  @property() active = "";
  // Leaves room for the panel's Back button.
  @property({ type: Boolean, reflect: true }) inset = false;
  @state() private _open = false;

  private _outside = (e: Event) => {
    if (!e.composedPath().includes(this)) this._open = false;
  };

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("pointerdown", this._outside);
  }

  disconnectedCallback(): void {
    document.removeEventListener("pointerdown", this._outside);
    super.disconnectedCallback();
  }

  private _pick(id: string): void {
    this._open = false;
    this.dispatchEvent(new CustomEvent("tab-change", { detail: id }));
  }

  static styles = css`
    /* the strip scrolls, so it clips: tabs keep a short shadow and room around it, never the card's wide one */
    :host {
      --tab-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
      display: flex;
      gap: 6px;
      padding: 8px 6px 10px;
      margin: 0 -6px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    :host([inset]) {
      padding-left: 62px;
    }
    .strip {
      display: contents;
    }
    .menu-wrap {
      display: none;
      position: relative;
    }
    .trigger {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 10px 0 18px;
      max-width: 100%;
    }
    .trigger span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .menu {
      position: absolute;
      z-index: 10;
      top: calc(100% + 6px);
      left: 0;
      min-width: 180px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 6px;
      border-radius: 16px;
      /* themes may give cards a see-through background: the menu must hide what is under it */
      background: var(--primary-background-color, #fff);
      background-image: linear-gradient(var(--card-background-color), var(--card-background-color));
      backdrop-filter: blur(20px);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
    }
    .menu button {
      text-align: left;
      box-shadow: none;
      background: transparent;
    }
    .menu button.active {
      background: var(--primary-color);
    }
    .menu button.admin.active {
      background: var(--share-space-admin-color, var(--accent-color));
    }
    .menu button.admin:not(.active) {
      box-shadow: none;
    }
    /* narrow screens: one button opens the list of tabs */
    @media (max-width: 720px) {
      :host {
        overflow: visible;
        min-width: 0;
      }
      .strip {
        display: none;
      }
      .menu-wrap {
        display: block;
        min-width: 0;
      }
    }
    button {
      min-height: 40px;
      padding: 0 18px;
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font: inherit;
      font-weight: 500;
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: var(--tab-shadow);
      flex: none;
    }
    button.active {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    button.admin {
      color: var(--share-space-admin-color, var(--accent-color));
      box-shadow:
        inset 0 0 0 1px var(--share-space-admin-color, var(--accent-color)),
        var(--tab-shadow);
    }
    button.admin.active {
      background: var(--share-space-admin-color, var(--accent-color));
      color: var(--text-primary-color, #fff);
    }
  `;

  private _button(t: PanelTab): TemplateResult {
    return html`<button
      class="${t.id === this.active ? "active" : ""} ${t.admin ? "admin" : ""}"
      aria-current=${t.id === this.active ? "page" : "false"}
      @click=${() => this._pick(t.id)}
    >
      ${t.label}
    </button>`;
  }

  protected render(): TemplateResult {
    const current = this.tabs.find((t) => t.id === this.active) ?? this.tabs[0];
    return html`<div class="strip">${this.tabs.map((t) => this._button(t))}</div>
      <div class="menu-wrap" @keydown=${(e: KeyboardEvent) => e.key === "Escape" && (this._open = false)}>
        <button
          class="trigger active ${current?.admin ? "admin" : ""}"
          aria-haspopup="menu"
          aria-expanded=${this._open ? "true" : "false"}
          aria-label=${t("Pages")}
          @click=${() => (this._open = !this._open)}
        >
          <span>${current?.label ?? ""}</span>${CHEVRON}
        </button>
        ${this._open ? html`<div class="menu" role="menu">${this.tabs.map((t) => this._button(t))}</div>` : null}
      </div>`;
  }
}
