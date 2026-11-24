import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { entityStates, sensorReadings } from "ha-share-space-ui";
import type { RuleStrategy } from "ha-share-space-ui";
import { hassNow, hassTimeZone, listStrategies, listZones, loadZoneRules, planningSchedule } from "ha-share-space-ui/ha";
import type { HeatingZone, HomeAssistant } from "ha-share-space-ui/ha";
import { selectStyles } from "./select-styles";

const OCCUPANCY_PREFIX = "binary_sensor.share_space_";

// Without saved rules the week shows only when people are planned.
export const PLANNED_ONLY: RuleStrategy = {
  version: 1,
  rules: [{ label: "Planned", when: [{ type: "occupied" }], then: { type: "comfort" } }],
  fallback: { label: "Nobody planned", then: { type: "off" } },
};

// Overview: an area's week as the Rules editor previews it (planned presence, and the heating its saved rules give).
@customElement("share-space-overview-planning")
export class ShareSpaceOverviewPlanning extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  /** Area shown first (mine). */
  @property() initial: string | null = null;
  /** Areas whose thermostat HA already has, before Share Space has a zone for them. */
  @property({ attribute: false }) detected: string[] = [];
  @state() private _area = "";
  @state() private _strategy: RuleStrategy | null = null;
  @state() private _zones: HeatingZone[] = [];
  private _zonesAsked = false;
  private _loadedFor = "";

  static styles = [
    selectStyles,
    css`
    :host {
      display: block;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    h3 {
      margin: 0;
      font-size: 1.1em;
      line-height: 24px;
      font-weight: 500;
      flex: 1;
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .week {
      position: relative;
    }
    /* frosted veil over the week: the planned bars still show through */
    .no-rules {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      text-align: center;
      font-weight: 500;
      color: var(--primary-text-color);
      border-radius: 8px;
      background: color-mix(in srgb, var(--card-background-color, #fff) 60%, transparent);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      /* feathered edges: the veil fades into the card instead of stopping on a line */
      --fade: linear-gradient(to right, transparent, #000 32px, #000 calc(100% - 32px), transparent),
        linear-gradient(to bottom, transparent, #000 16px, #000 calc(100% - 16px), transparent);
      mask-image: var(--fade);
      mask-composite: intersect;
      -webkit-mask-image: var(--fade);
      -webkit-mask-composite: source-in;
    }
  `,
  ];

  // Every area with heating or someone planned in it: the card never depends on one of them alone.
  private _areas(hass: HomeAssistant): { id: string; name: string }[] {
    const ids = new Set<string>([
      ...this._zones.map((z) => z.area_id).filter((a): a is string => !!a),
      ...this.detected,
      ...Object.keys(hass.states)
        .filter((id) => id.startsWith(OCCUPANCY_PREFIX) && hass.states[id].attributes.schedule)
        .map((id) => id.slice(OCCUPANCY_PREFIX.length)),
    ]);
    return [...ids]
      .map((id) => ({ id, name: hass.areas?.[id]?.name ?? String(hass.states[OCCUPANCY_PREFIX + id]?.attributes.friendly_name ?? id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // The Share Space zone heating the area, if it has one.
  private _zone(area: string): string | null {
    return this._zones.find((z) => z.area_id === area)?.entity_id ?? null;
  }

  protected willUpdate(changed: PropertyValues): void {
    const hass = this.hass;
    if (!hass) return;
    if (!this._zonesAsked) {
      this._zonesAsked = true;
      void listZones(hass)
        .then((z) => {
          this._zones = z;
          this._loadedFor = "";
        })
        .catch(() => undefined);
    }
    const areas = this._areas(hass);
    if (!this._area || !areas.some((a) => a.id === this._area)) this._area = areas.find((a) => a.id === this.initial)?.id ?? areas[0]?.id ?? "";
    if (this._loadedFor !== this._area) {
      this._loadedFor = this._area;
      void this._loadRules(hass, this._area);
    }
  }

  private async _loadRules(hass: HomeAssistant, area: string): Promise<void> {
    this._strategy = null;
    const zone = area ? this._zone(area) : null;
    if (!zone) return;
    const r = await loadZoneRules(hass, zone).catch(() => null);
    if (this._area !== area || r?.state !== "managed" || !r.enabled) return;
    if (r.rules && !r.strategy) {
      this._strategy = r.rules;
      return;
    }
    const shared = r.strategy ? (await listStrategies(hass).catch(() => [])).find((s) => s.id === r.strategy) : undefined;
    if (this._area === area) this._strategy = shared?.rules ?? null;
  }

  protected render(): TemplateResult | typeof nothing {
    const hass = this.hass;
    if (!hass) return nothing;
    const areas = this._areas(hass);
    if (!areas.length) return html`<h3>Planning</h3><div class="muted">No heated area and nobody planned yet.</div>`;
    const schedule = planningSchedule(hass, this._area) ?? {};
    const now = hassNow(hass);
    const tz = hassTimeZone(hass);
    const zone = this._zone(this._area);
    const attrs = zone ? hass.states[zone].attributes : undefined;
    const strategy = this._strategy ?? PLANNED_ONLY;
    return html`<div class="head">
        <h3>Planning</h3>
        <select aria-label="Area" @change=${(e: Event) => (this._area = (e.target as HTMLSelectElement).value)}>
          ${areas.map((a) => html`<option value=${a.id} ?selected=${a.id === this._area}>${a.name}</option>`)}
        </select>
      </div>
      <div class="week">
      <share-space-rule-preview
        .strategy=${strategy}
        .schedule=${schedule}
        .now=${now}
        .tz=${tz}
        .temps=${attrs ? { comfort: Number(attrs.comfort_temp ?? 21), eco: Number(attrs.eco_temp ?? 17) } : undefined}
        .readings=${sensorReadings(strategy, hass.states, (attrs?.outdoor_entity as string | null | undefined) ?? null)}
        .states=${entityStates(strategy, hass.states)}
      ></share-space-rule-preview>
      ${this._strategy ? nothing : html`<div class="no-rules" role="note">No Share Space rules for this area yet: the week shows who is planned.</div>`}
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-overview-planning": ShareSpaceOverviewPlanning;
  }
}
