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
    :host {
      display: flex;
      gap: 6px;
      padding: 8px 0;
      overflow-x: auto;
    }
    :host([inset]) {
      padding-left: 56px;
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
      box-shadow: var(--ha-card-box-shadow, 0 1px 4px rgba(0, 0, 0, 0.25));
    }
    button.active {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    button.admin {
      color: var(--share-space-admin-color, var(--accent-color));
      box-shadow:
        inset 0 0 0 1px var(--share-space-admin-color, var(--accent-color)),
        var(--ha-card-box-shadow, 0 1px 4px rgba(0, 0, 0, 0.25));
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
