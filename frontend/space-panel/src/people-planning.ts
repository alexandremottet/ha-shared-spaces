import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Calendar, ScheduleRanges } from "ha-share-space-ui";
import { getCalendar, getPersonArea, hassNow, hassTimeZone } from "ha-share-space-ui/ha";
import type { HomeAssistant } from "ha-share-space-ui/ha";
import { haCardSurface } from "ha-share-space-ui";
import { PLANNED_ONLY } from "./overview-planning";

interface PersonPlanning {
  id: string;
  name: string;
  area: string | null;
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
      ${haCardSurface}
      padding: 16px;
      margin: 8px 16px 16px;
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
    details {
      border-top: 1px solid var(--divider-color);
      padding: 8px 0;
    }
    summary {
      cursor: pointer;
      min-height: 36px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    summary .area {
      color: var(--secondary-text-color);
      font-size: 0.9em;
    }
    .list {
      margin-top: 8px;
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
          return { id, name: String(hass.states[id]?.attributes.friendly_name ?? id), area, schedule: toRanges(calendar ?? {}) };
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
    const now = hassNow(hass);
    const tz = hassTimeZone(hass);
    return html`<h3>Everyone's planning</h3>
      <div class="muted">Read only, for admins: each person's own planning, which the area plannings merge.</div>
      ${this._error ? html`<div class="muted" role="alert">${this._error}</div>` : nothing}
      ${this._people === null && !this._error ? html`<div class="muted">Loading…</div>` : nothing}
      ${this._people?.length === 0 ? html`<div class="muted">No person in Home Assistant yet.</div>` : nothing}
      <div class="list">
        ${(this._people ?? []).map(
          (p) => html`<details data-person=${p.id}>
            <summary>
              <strong>${p.name}</strong>
              <span class="area">${p.area ? (hass.areas?.[p.area]?.name ?? p.area) : "No area"} · ${this._hours(p.schedule)} h a week</span>
            </summary>
            <share-space-rule-preview .strategy=${PLANNED_ONLY} .schedule=${p.schedule} .now=${now} .tz=${tz}></share-space-rule-preview>
          </details>`,
        )}
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-people-planning": ShareSpacePeoplePlanning;
  }
}
