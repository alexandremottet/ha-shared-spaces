import { LitElement, html, css, nothing } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { haCardSurface } from "ha-share-space-ui";
import type { SpaceRole } from "ha-share-space-ui/ha";

const ROLE_LABEL: Record<SpaceRole, string> = {
  user: "User",
  space_admin: "Space admin",
  technical_admin: "Technical admin",
};

// Settings page: role, admin switches, outdoor sensor; emits `technical-change` / `full-ha-change` / `everyone-change` (boolean), `outdoor-change` (entity id or null).
@customElement("share-space-settings")
export class ShareSpaceSettings extends LitElement {
  @property() role: SpaceRole = "user";
  @property({ type: Boolean }) fullHa = false;
  @property({ type: Boolean }) everyone = false;
  @property() outdoorEntity: string | null = null;
  @property({ attribute: false }) outdoorOptions: Array<{ id: string; name: string }> = [];

  static styles = css`
    :host {
      display: block;
      padding: 8px 24px 16px;
      color: var(--primary-text-color);
    }
    h3 {
      margin: 0 0 8px;
    }
    .card {
      ${haCardSurface}
      padding: 12px 16px;
      margin-bottom: 12px;
    }
    p {
      margin: 4px 0 12px;
    }
    .muted {
      color: var(--secondary-text-color);
    }
    h4 {
      margin: 0 0 8px;
    }
    .field {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
    }
    select {
      min-height: 36px;
      padding: 0 8px;
      border-radius: 8px;
      border: 1px solid var(--divider-color);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font: inherit;
    }
    .switch {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 0 12px;
    }
  `;

  private _renderHeating(): TemplateResult {
    const current = this.outdoorEntity ?? "";
    const known = this.outdoorOptions.some((o) => o.id === current);
    return html`<section class="card">
      <h4>Outdoor temperature</h4>
      <label class="field">
        Sensor
        <select
          @change=${(e: Event) =>
            this.dispatchEvent(new CustomEvent("outdoor-change", { detail: (e.target as HTMLSelectElement).value || null }))}
        >
          <option value="" ?selected=${!current}>None</option>
          ${current && !known ? html`<option value=${current} selected>${current} (unavailable)</option>` : nothing}
          ${this.outdoorOptions.map((o) => html`<option value=${o.id} ?selected=${o.id === current}>${o.name}</option>`)}
        </select>
      </label>
      <p class="muted">Rules that follow the outdoor temperature read this sensor (e.g. Old building's preheat). None: they use their default.</p>
    </section>`;
  }

  protected render(): TemplateResult {
    return html`
      <h3>Settings</h3>
      <section class="card">
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
          </label>
          <label class="switch">
            <input
              type="checkbox"
              .checked=${this.fullHa}
              @change=${(e: Event) =>
                this.dispatchEvent(new CustomEvent("full-ha-change", { detail: (e.target as HTMLInputElement).checked }))}
            />
            Full Home Assistant interface
          </label>
          <p class="muted">Off: Home Assistant opens on Share Space after login. On: its usual interface, with a Back button here.</p>
          <label class="switch">
            <input
              type="checkbox"
              .checked=${this.everyone}
              @change=${(e: Event) =>
                this.dispatchEvent(new CustomEvent("everyone-change", { detail: (e.target as HTMLInputElement).checked }))}
            />
            Open Share Space after login for everyone
          </label>
          <p class="muted">Home Assistant's own default page for all users. Someone who picked another page in their Home Assistant profile keeps it.</p>`
        : nothing}
      </section>
      ${this.role !== "user" ? html`<slot name="zones"></slot><slot name="dashboards"></slot>${this._renderHeating()}<slot name="users"></slot>` : nothing}
      ${this.role === "technical_admin" ? html`<slot name="extension-points"></slot>` : nothing}
    `;
  }
}
