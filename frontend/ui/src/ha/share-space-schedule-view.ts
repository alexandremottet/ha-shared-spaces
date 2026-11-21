import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";
import type { CSSResultGroup, PropertyValues } from "lit";
import "../index";
import type { CalendarChangedDetail } from "../index";
import type { Calendar } from "../types";
import { haTheme } from "./theme";
import { waitForHaPeriodEditDialog } from "./ha-dialog-controls";
import "./ha-period-edit-dialog";

import type { HomeAssistant } from "./hass";
import { findMyPerson } from "./my-person";
import { isBackendMissing } from "./ws";
import { renderBackendMissing } from "./card-base";

/** Shape of `config/area_registry/list`'s result (HA core, no admin required to read it). */
interface AreaRegistryEntry {
  area_id: string;
  name: string;
}


export abstract class ShareSpaceScheduleView extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  @state() protected _area: string | null = null;
  @state() protected _personEntityId: string | null = null;
  @state() protected _calendar: Calendar | null = null;
  @state() protected _areas: AreaRegistryEntry[] = [];
  @state() protected _initialized = false;
  @state() protected _haDialogReady = false;
  @state() protected _backendMissing = false;

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("hass") && this.hass && !this._initialized) {
      this._initialized = true;
      this._initialize();
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    waitForHaPeriodEditDialog().then(() => {
      this._haDialogReady = true;
    });
  }

  private async _initialize(): Promise<void> {
    try {
      this._areas = await this.hass!.callWS<AreaRegistryEntry[]>({ type: "config/area_registry/list" });

      const person = findMyPerson(this.hass);
      if (!person) {
        return;
      }
      this._personEntityId = person.entity_id;

      const { area } = await this.hass!.callWS<{ area: string | null }>({
        type: "share_space/get_person_area",
        person: person.entity_id,
      });
      this._area = area;
      await this._loadCalendar();
    } catch (err) {
      if (!isBackendMissing(err)) {
        throw err;
      }
      this._backendMissing = true;
    }
  }

  protected async _loadCalendar(): Promise<void> {
    const { calendar } = await this.hass!.callWS<{ calendar: Calendar }>({
      type: "share_space/get_calendar",
      person: this._personEntityId,
    });
    this._calendar = calendar;
  }

  private async _onAreaSelected(event: Event): Promise<void> {
    const area = (event.target as HTMLSelectElement).value;
    if (!this._personEntityId || !area || area === this._area) {
      return;
    }
    await this.hass!.callService("share_space", "assign_person_area", {
      person: this._personEntityId,
      area,
    });
    this._area = area;
    this._calendar = null;
    await this._loadCalendar();
  }

  private _onCalendarChanged(event: CustomEvent<CalendarChangedDetail>): void {
    if (!this._personEntityId) {
      return;
    }
    this.hass!.callService("share_space", "set_calendar", {
      person: this._personEntityId,
      calendar: event.detail.calendar,
    });
  }

  static styles: CSSResultGroup = [
    haTheme,
    css`
    .content {
      color: var(--primary-text-color);
    }
    ha-card {
      padding: 16px;
    }
    ha-card .card-content > *:first-child {
      margin-top: 0;
    }
    ha-card .card-content > *:last-child {
      margin-bottom: 0;
    }
    .area-picker {
      display: flex;
      align-items: center;
      gap: var(--share-space-area-picker-gap, 8px);
      margin-bottom: var(--share-space-area-picker-margin-bottom, 16px);
    }
    .area-picker label {
      font-weight: 600;
    }
    .area-picker select {
      flex: none;
      padding: var(--share-space-area-picker-select-padding, 6px 8px);
      border-radius: var(--share-space-area-picker-select-radius, 4px);
      border: 1px solid var(--divider-color, #ccc);
      background: var(--share-space-select-background, transparent);
      color: var(--primary-text-color);
      font: inherit;
    }
    .placeholder {
      color: var(--secondary-text-color);
    }
  `,
  ];

  private _renderAreaPicker() {
    return html`
      <div class="area-picker">
        <label for="area-select">Area</label>
        <select id="area-select" @change=${this._onAreaSelected}>
          <option value="" ?selected=${!this._area} disabled>Select an area…</option>
          ${this._areas.map(
            (area) =>
              html`<option value=${area.area_id} ?selected=${area.area_id === this._area}>${area.name}</option>`
          )}
        </select>
      </div>
    `;
  }

  protected _renderScheduleBody() {
    if (!this.hass) {
      return html``;
    }

    if (this._backendMissing) {
      return renderBackendMissing("Share Space");
    }

    if (!this._personEntityId) {
      return html`
        <div class="content">
          <ha-card header="Share Space">
            <div class="card-content">
              <p>No person entity is linked to your account.</p>
            </div>
          </ha-card>
        </div>
      `;
    }

    return html`
      <div class="content">
        <ha-card header="Share Space">
          <div class="card-content">
            ${this._renderAreaPicker()}
            ${!this._area
              ? html`<p class="placeholder">You're not assigned to an area yet. Pick one above to see your schedule.</p>`
              : this._calendar === null
                ? html`<p class="placeholder">Loading…</p>`
                : html`
                    <week-schedule .calendar=${this._calendar} @calendar-changed=${this._onCalendarChanged}>
                      ${this._haDialogReady ? html`<ha-period-edit-dialog slot="dialog"></ha-period-edit-dialog>` : null}
                    </week-schedule>
                  `}
          </div>
        </ha-card>
      </div>
    `;
  }
}
