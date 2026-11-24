import { LitElement, html, css, nothing } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { haCardSurface, t } from "ha-share-space-ui";
import { selectStyles } from "./select-styles";
import "./multi-select";
import type { SpaceRole } from "ha-share-space-ui/ha";

const roleLabel = (r: SpaceRole): string => ({ user: t("User"), space_admin: t("Space admin"), technical_admin: t("Technical admin") })[r];

// Settings page: role, admin switches, outdoor sensor; emits `technical-change` / `full-ha-change` / `everyone-change` (boolean), `outdoor-change` (entity id or null).
@customElement("share-space-settings")
export class ShareSpaceSettings extends LitElement {
  @property() role: SpaceRole = "user";
  @property({ type: Boolean }) fullHa = false;
  @property({ type: Boolean }) everyone = false;
  @property() outdoorEntity: string | null = null;
  @property({ attribute: false }) outdoorOptions: Array<{ id: string; name: string }> = [];

  static styles = [
    selectStyles,
    css`
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
    .switch {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 0 12px;
    }
  `,
  ];

  private _renderHeating(): TemplateResult {
    const current = this.outdoorEntity ?? "";
    const known = this.outdoorOptions.some((o) => o.id === current);
    return html`<section class="card">
      <h4>${t("Outdoor temperature")}</h4>
      <label class="field">
        ${t("Sensor")}
        <share-space-multi-select
          single
          label=${t("Outdoor temperature sensor")}
          placeholder=${t("None")}
          .options=${[
            { value: "", label: t("None") },
            ...(current && !known ? [{ value: current, label: t("{name} (unavailable)", { name: current }) }] : []),
            ...this.outdoorOptions.map((o) => ({ value: o.id, label: o.name })),
          ]}
          .selected=${[current]}
          @selection-change=${(e: CustomEvent<string[]>) =>
            this.dispatchEvent(new CustomEvent("outdoor-change", { detail: e.detail[0] || null }))}
        ></share-space-multi-select>
      </label>
      <p class="muted">${t("Rules that follow the outdoor temperature read this sensor (e.g. Old building's preheat). None: they use their default.")}</p>
    </section>`;
  }

  protected render(): TemplateResult {
    return html`
      <h3>${t("Settings")}</h3>
      <section class="card">
      <p>${t("Your role:")} <strong>${roleLabel(this.role)}</strong></p>
      ${this.role !== "user"
        ? html`<label class="switch">
            <input
              type="checkbox"
              .checked=${this.role === "technical_admin"}
              @change=${(e: Event) =>
                this.dispatchEvent(new CustomEvent("technical-change", { detail: (e.target as HTMLInputElement).checked }))}
            />
            ${t("Technical tools")}
          </label>
          <label class="switch">
            <input
              type="checkbox"
              .checked=${this.fullHa}
              @change=${(e: Event) =>
                this.dispatchEvent(new CustomEvent("full-ha-change", { detail: (e.target as HTMLInputElement).checked }))}
            />
            ${t("Full Home Assistant interface")}
          </label>
          <p class="muted">${t("Off: Home Assistant opens on Share Space after login. On: its usual interface, with a Back button here.")}</p>
          <label class="switch">
            <input
              type="checkbox"
              .checked=${this.everyone}
              @change=${(e: Event) =>
                this.dispatchEvent(new CustomEvent("everyone-change", { detail: (e.target as HTMLInputElement).checked }))}
            />
            ${t("Open Share Space after login for everyone")}
          </label>
          <p class="muted">${t("Home Assistant's own default page for all users. Someone who picked another page in their Home Assistant profile keeps it.")}</p>`
        : nothing}
      </section>
      ${this.role !== "user" ? html`<slot name="zones"></slot><slot name="dashboards"></slot>${this._renderHeating()}<slot name="users"></slot>` : nothing}
      ${this.role === "technical_admin" ? html`<slot name="extension-points"></slot>` : nothing}
    `;
  }
}
