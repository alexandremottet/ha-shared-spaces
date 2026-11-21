import { LitElement, html, css, nothing } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { SpaceRole } from "ha-share-space-ui/ha";

const ROLE_LABEL: Record<SpaceRole, string> = {
  user: "User",
  space_admin: "Space admin",
  technical_admin: "Technical admin",
};

// Settings page: shows the role; emits `technical-change` (detail = boolean).
@customElement("share-space-settings")
export class ShareSpaceSettings extends LitElement {
  @property() role: SpaceRole = "user";

  static styles = css`
    :host {
      display: block;
      padding: 16px 24px;
      color: var(--primary-text-color);
    }
    h3 {
      margin: 0 0 8px;
    }
    p {
      margin: 4px 0 12px;
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .switch {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 0 12px;
    }
  `;

  protected render(): TemplateResult {
    return html`
      <h3>Settings</h3>
      <p>Your role: <strong>${ROLE_LABEL[this.role]}</strong></p>
      ${this.role !== "user"
        ? html`<label class="switch">
            <input
              type="checkbox"
              .checked=${this.role === "technical_admin"}
              @change=${(e: Event) =>
                this.dispatchEvent(new CustomEvent("technical-change", { detail: (e.target as HTMLInputElement).checked }))}
            />
            Technical tools
          </label>`
        : nothing}
      ${this.role === "technical_admin" ? html`<p class="muted">Extension points coming soon</p>` : nothing}
    `;
  }
}
