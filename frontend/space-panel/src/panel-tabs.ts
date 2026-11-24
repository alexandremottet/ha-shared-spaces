import { LitElement, html, css } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

export interface PanelTab {
  id: string;
  label: string;
  /** Admin-only page: drawn in the admin colour. */
  admin?: boolean;
}

// Tab strip: props in, `tab-change` (detail = id) out.
@customElement("share-space-panel-tabs")
export class ShareSpacePanelTabs extends LitElement {
  @property({ attribute: false }) tabs: PanelTab[] = [];
  @property() active = "";
  // Leaves room for the panel's Back button.
  @property({ type: Boolean, reflect: true }) inset = false;

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

  protected render(): TemplateResult {
    return html`${this.tabs.map(
      (t) =>
        html`<button
          class="${t.id === this.active ? "active" : ""} ${t.admin ? "admin" : ""}"
          @click=${() => this.dispatchEvent(new CustomEvent("tab-change", { detail: t.id }))}
        >
          ${t.label}
        </button>`,
    )}`;
  }
}
