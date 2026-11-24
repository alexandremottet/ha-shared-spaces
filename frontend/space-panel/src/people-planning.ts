import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Calendar, RosterPerson, ScheduleRanges } from "ha-share-space-ui";
import { getCalendar, getPersonArea, setCalendar, waitForHaPeriodEditDialog } from "ha-share-space-ui/ha";
import type { CalendarChangedDetail } from "ha-share-space-ui";
import { selectStyles } from "./select-styles";
import type { HomeAssistant } from "ha-share-space-ui/ha";
import { haCardSurface } from "ha-share-space-ui";

interface PersonPlanning {
  id: string;
  name: string;
  area: string | null;
  calendar: Partial<Calendar>;
  schedule: ScheduleRanges;
}

const toRanges = (calendar: Partial<Calendar>): ScheduleRanges =>
  Object.fromEntries(Object.entries(calendar).map(([day, periods]) => [day, (periods ?? []).map((p) => [p.start, p.end] as [string, string])]));

// Admins: each person's own planning, read only, to check what the merged area plannings come from.
@customElement("share-space-people-planning")
export class ShareSpacePeoplePlanning extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _people: PersonPlanning[] | null = null;
  @state() private _error = "";
  /** Person whose planning an admin is editing for them. */
  @state() private _editing = "";
  @state() private _dialogReady = false;
  private _loadedFor = "";

  connectedCallback(): void {
    super.connectedCallback();
    void waitForHaPeriodEditDialog().then(() => (this._dialogReady = true));
  }

  static styles = [selectStyles, css`
    :host {
      display: block;
      box-sizing: border-box;
      padding: 8px 16px 16px;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }
    .card {
      ${haCardSurface}
      padding: 16px;
    }
    h3 {
      margin: 0 0 4px;
      font-size: 1.1em;
      line-height: 24px;
      font-weight: 500;
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .list {
      margin-top: 8px;
      --day-schedule-label-width: 120px;
      --day-schedule-track-height: 24px;
      --day-schedule-row-padding: 3px 0;
    }
    .edit {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
    }
    .edit label {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .who {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      margin-top: 8px;
      color: var(--secondary-text-color);
      font-size: 0.9em;
    }
  `];

  protected willUpdate(_changed: PropertyValues): void {
    const hass = this.hass;
    if (!hass) return;
    const ids = Object.keys(hass.states)
      .filter((id) => id.startsWith("person."))
      .sort()
      .join(",");
    if (ids === this._loadedFor) return;
    this._loadedFor = ids;
    void this._load(hass, ids ? ids.split(",") : []);
  }

  private async _load(hass: HomeAssistant, ids: string[]): Promise<void> {
    try {
      const people = await Promise.all(
        ids.map(async (id) => {
          const [calendar, area] = await Promise.all([getCalendar(hass, id), getPersonArea(hass, id).catch(() => null)]);
          return { id, name: String(hass.states[id]?.attributes.friendly_name ?? id), area, calendar: calendar ?? {}, schedule: toRanges(calendar ?? {}) };
        }),
      );
      this._people = people.sort((a, b) => a.name.localeCompare(b.name));
      this._error = "";
    } catch (e) {
      this._error = e instanceof Error ? e.message : "Could not load the plannings.";
    }
  }

  private async _save(id: string, calendar: Calendar): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    this._people = (this._people ?? []).map((p) => (p.id === id ? { ...p, calendar, schedule: toRanges(calendar) } : p));
    try {
      await setCalendar(hass, id, calendar);
      this._error = "";
    } catch (e) {
      this._error = e instanceof Error ? e.message : "Could not save the planning.";
    }
  }

  private _editor(): TemplateResult {
    const person = this._people?.find((p) => p.id === this._editing);
    return html`<section class="card edit">
      <h3>Edit someone's planning</h3>
      <label
        >Person
        <select aria-label="Person" @change=${(e: Event) => (this._editing = (e.target as HTMLSelectElement).value)}>
          <option value="" ?selected=${!this._editing}>Choose a person</option>
          ${(this._people ?? []).map((p) => html`<option value=${p.id} ?selected=${p.id === this._editing}>${p.name}</option>`)}
        </select></label
      >
      ${person
        ? html`<week-schedule .calendar=${person.calendar as Calendar} @calendar-changed=${(e: CustomEvent<CalendarChangedDetail>) => void this._save(person.id, e.detail.calendar)}>
            ${this._dialogReady ? html`<ha-period-edit-dialog slot="dialog"></ha-period-edit-dialog>` : nothing}
          </week-schedule>`
        : html`<div class="muted">Saved as soon as you change it, in that person's own Schedule helper.</div>`}
    </section>`;
  }

  private _hours(schedule: ScheduleRanges): number {
    let minutes = 0;
    for (const periods of Object.values(schedule)) {
      for (const [a, b] of periods ?? []) {
        const [ah, am] = a.split(":").map(Number);
        const [bh, bm] = b.split(":").map(Number);
        minutes += bh * 60 + bm - (ah * 60 + am);
      }
    }
    return Math.round(minutes / 6) / 10;
  }

  protected render(): TemplateResult | typeof nothing {
    const hass = this.hass;
    if (!hass) return nothing;
    const people: RosterPerson[] = (this._people ?? []).map((p) => ({
      id: p.id,
      label: p.name,
      calendar: p.calendar as Calendar,
    }));
    return html`${this._editor()}<section class="card"><h3>Everyone's planning</h3>
      <div class="muted">The whole week, then each person's own planning, which the area plannings merge.</div>
      ${this._error ? html`<div class="muted" role="alert">${this._error}</div>` : nothing}
      ${this._people === null && !this._error ? html`<div class="muted">Loading…</div>` : nothing}
      ${this._people?.length === 0 ? html`<div class="muted">No person in Home Assistant yet.</div>` : nothing}
      <div class="who">
        ${(this._people ?? []).map(
          (p) => html`<span><strong>${p.name}</strong> ${p.area ? (hass.areas?.[p.area]?.name ?? p.area) : "No area"} · ${this._hours(p.schedule)} h a week</span>`,
        )}
      </div>
      ${people.length ? html`<area-roster-view class="list" view-mode="lanes" .people=${people} totalLabel="Everyone"></area-roster-view>` : nothing}
    </section>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-people-planning": ShareSpacePeoplePlanning;
  }
}
