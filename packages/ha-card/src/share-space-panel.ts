import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ShareSpaceScheduleView } from "./share-space-schedule-view";

/** Sidebar panel: adds the app-header/menu chrome around the shared "my own schedule" content. */
@customElement("share-space-panel")
export class ShareSpacePanel extends ShareSpaceScheduleView {
  @property({ type: Boolean }) narrow = false;

  private _toggleMenu(): void {
    this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }));
  }

  static styles = [
    ShareSpaceScheduleView.styles,
    css`
    :host {
      display: block;
      background: var(--primary-background-color);
      min-height: 100vh;
      box-sizing: border-box;
    }
    .content {
      max-width: var(--share-space-panel-max-width, 1040px);
      margin: 0 auto;
      padding: var(--share-space-panel-padding, 16px);
    }
    .app-header {
      display: flex;
      align-items: center;
      height: var(--header-height, 56px);
      padding: 0 16px;
      background: var(--app-header-background-color, var(--primary-background-color));
      color: var(--app-header-text-color, var(--primary-text-color));
      box-sizing: border-box;
    }
    .menu-button {
      background: none;
      border: none;
      padding: 8px;
      margin: 0 12px 0 -8px;
      cursor: pointer;
      color: inherit;
      display: flex;
    }
    .title {
      font-size: 20px;
      font-weight: 400;
    }
  `,
  ];

  protected render() {
    if (!this.hass) {
      return html``;
    }

    return html`
      <div class="app-header">
        ${this.narrow
          ? html`
              <button class="menu-button" @click=${this._toggleMenu} aria-label="Menu">
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path fill="currentColor" d="M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z" />
                </svg>
              </button>
            `
          : null}
        <div class="title">Share Space</div>
      </div>
      ${this._renderScheduleBody()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-panel": ShareSpacePanel;
  }
}
