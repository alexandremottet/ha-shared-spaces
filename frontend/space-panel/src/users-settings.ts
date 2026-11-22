import { LitElement, html, nothing } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ADMIN_GROUP, listUsers, setSpaceAdmin } from "ha-share-space-ui/ha";
import type { HaUser, HomeAssistant } from "ha-share-space-ui/ha";
import { settingsStyles } from "./settings-styles";

// Settings > People: promote a user to Space Admin (HA administrator) or back.
@customElement("share-space-users-settings")
export class ShareSpaceUsersSettings extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _users: HaUser[] | null = null;
  @state() private _busy: string | null = null;
  @state() private _error = "";

  static styles = settingsStyles;

  connectedCallback(): void {
    super.connectedCallback();
    void this._load();
  }

  private async _load(): Promise<void> {
    if (!this.hass) return;
    try {
      const users = await listUsers(this.hass);
      this._users = users.filter((u) => !u.system_generated && u.is_active).sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      this._error = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
    }
  }

  private async _toggle(user: HaUser, admin: boolean): Promise<void> {
    this._busy = user.id;
    this._error = "";
    try {
      await setSpaceAdmin(this.hass!, user.id, admin);
      await this._load();
    } catch (err) {
      this._error = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
    } finally {
      this._busy = null;
    }
  }

  protected render(): TemplateResult {
    const me = this.hass?.user?.id;
    return html`<section class="card">
      <h4>People</h4>
      <p class="muted">Space Admins manage areas, heating, rules and people. They can't remove their own role or the owner's.</p>
      <div class="rows">
        ${(this._users ?? []).map((u) => {
          const admin = u.group_ids.includes(ADMIN_GROUP);
          const locked = u.is_owner || u.id === me;
          return html`<div class="row">
            <span class="name">${u.name}</span>
            <span class="info muted">${u.username ?? ""}${u.is_owner ? " · owner" : ""}${u.id === me ? " · you" : ""}</span>
            <label class="actions">
              <input
                type="checkbox"
                .checked=${admin}
                ?disabled=${locked || this._busy === u.id}
                @change=${(e: Event) => void this._toggle(u, (e.target as HTMLInputElement).checked)}
              />
              Space Admin
            </label>
          </div>`;
        })}
      </div>
      ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
    </section>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-users-settings": ShareSpaceUsersSettings;
  }
}
