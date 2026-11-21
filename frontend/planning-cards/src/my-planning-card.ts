import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import {
  ShareSpaceScheduleView,
  haTheme,
  registerCustomCard,
  renderBackendMissing,
  setCalendar,
  assignPersonArea,
} from "ha-share-space-ui/ha";
import type { LovelaceGridOptions, LovelaceConfigForm } from "ha-share-space-ui/ha";
import type { CalendarChangedDetail } from "ha-share-space-ui";
import { cardStyles, message } from "./shared";

interface CardConfig {
  type: string;
  show_area_picker?: boolean;
}

@customElement("share-space-my-planning-card")
export class ShareSpaceMyPlanningCard extends ShareSpaceScheduleView {
  static styles = [
    haTheme,
    cardStyles,
    css`
      select {
        width: 100%;
        min-height: 44px;
        margin-bottom: 12px;
        padding: 0 8px;
        border-radius: 8px;
        border: 1px solid var(--divider-color);
        background: transparent;
        color: var(--primary-text-color);
        font: inherit;
      }
    `,
  ];

  private _config?: CardConfig;

  setConfig(config: CardConfig): void {
    this._config = config;
    this.requestUpdate();
  }

  private _onChanged(event: CustomEvent<CalendarChangedDetail>): void {
    this._calendar = event.detail.calendar;
    setCalendar(this.hass!, this._personEntityId!, event.detail.calendar);
  }

  private async _onArea(event: Event): Promise<void> {
    const area = (event.target as HTMLSelectElement).value;
    if (!area || area === this._area) {
      return;
    }
    await assignPersonArea(this.hass!, this._personEntityId!, area);
    this._area = area;
  }

  protected render() {
    if (!this.hass) {
      return html``;
    }
    if (this._backendMissing) {
      return renderBackendMissing("Share Space");
    }
    if (!this._initialized) {
      return message("Loading…");
    }
    if (!this._personEntityId) {
      return message("No person is linked to your account.");
    }
    return html`
      <ha-card>
        ${this._config?.show_area_picker
          ? html`
              <select aria-label="Area" @change=${this._onArea}>
                <option value="" ?selected=${!this._area} disabled>Where do you work?</option>
                ${this._areas.map(
                  (a) => html`<option value=${a.area_id} ?selected=${a.area_id === this._area}>${a.name}</option>`
                )}
              </select>
            `
          : null}
        ${this._calendar === null
          ? html`<p class="placeholder">Loading…</p>`
          : html`
              <week-schedule .calendar=${this._calendar} @calendar-changed=${this._onChanged}>
                ${this._haDialogReady ? html`<ha-period-edit-dialog slot="dialog"></ha-period-edit-dialog>` : null}
              </week-schedule>
            `}
      </ha-card>
    `;
  }

  static getStubConfig(): CardConfig {
    return { type: "custom:share-space-my-planning-card", show_area_picker: false };
  }

  static getConfigForm(): LovelaceConfigForm {
    return { schema: [{ name: "show_area_picker", selector: { boolean: {} } }] };
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 12, min_columns: 6, rows: 9, min_rows: 7 };
  }
}

registerCustomCard({
  type: "share-space-my-planning-card",
  name: "Share Space: My planning",
  description: "Edit your own weekly presence.",
});

declare global {
  interface HTMLElementTagNameMap {
    "share-space-my-planning-card": ShareSpaceMyPlanningCard;
  }
}
