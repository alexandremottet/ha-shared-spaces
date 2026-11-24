import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Calendar, RosterPerson, ScheduleRanges } from "ha-share-space-ui";
import { getCalendar, getPersonArea } from "ha-share-space-ui/ha";
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
  private _loadedFor = "";

  static styles = css`
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
    .who {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      margin-top: 8px;
      color: var(--secondary-text-color);
      font-size: 0.9em;
    }
  `;

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
    return html`<section class="card"><h3>Everyone's planning</h3>
      <div class="muted">Read only, for admins: the whole week, then each person's own planning, which the area plannings merge.</div>
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
