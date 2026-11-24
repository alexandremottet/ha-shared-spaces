import { LitElement, html, css, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { haCardSurface, t } from "ha-share-space-ui";
import { EVERYONE_AREA, findMyPerson, errorMessage, listDetectedAreas, listZones } from "ha-share-space-ui/ha";
import type { DetectedArea, HeatingZone } from "ha-share-space-ui/ha";
import type { HomeAssistant } from "ha-share-space-ui/ha";
import { zoneViewModel } from "ha-share-space-heating-card/view-model";
import type { ZoneViewModel } from "ha-share-space-heating-card/view-model";
import "ha-share-space-planning-cards/my-planning-card";
import "ha-share-space-planning-cards/work-area-card";
import { HEATING_SENSOR_PREFIX, renderHeatingControl } from "./heating";
import "./overview-planning";
import "./ha-card";

type CardEl = HTMLElement & { hass?: HomeAssistant; setConfig(config: Record<string, unknown>): void };

function card(tag: string): CardEl {
  const el = document.createElement(tag) as CardEl;
  el.setConfig({ type: `custom:${tag}` });
  return el;
}

// Area of an entity: its own, else its device's.
function entityArea(hass: HomeAssistant, entityId: string | null): string | null {
  const entry = entityId ? hass.entities?.[entityId] : undefined;
  if (!entry) return null;
  return entry.area_id ?? (entry.device_id ? hass.devices?.[entry.device_id]?.area_id ?? null : null);
}

// Temperature sensor to graph for an area: the zone's own, the area's setting, else one in the area.
function areaTemperatureSensor(hass: HomeAssistant, area: string | null, own?: string | null): string | null {
  if (own && hass.states[own]) return own;
  if (!area) return null;
  const set = hass.areas?.[area]?.temperature_entity_id;
  if (set && hass.states[set]) return set;
  return (
    Object.values(hass.states).find(
      (s) =>
        s.entity_id.startsWith("sensor.") &&
        !s.entity_id.startsWith(HEATING_SENSOR_PREFIX) &&
        s.attributes.device_class === "temperature" &&
        entityArea(hass, s.entity_id) === area,
    )?.entity_id ?? null
  );
}

// Area I'm assigned to, read from the occupancy sensors' `persons` attribute.
function myArea(hass: HomeAssistant): string | null {
  const me = findMyPerson(hass)?.entity_id;
  if (!me) return null;
  const sensor = Object.values(hass.states).find(
    (s) =>
      s.entity_id.startsWith("binary_sensor.share_space_") &&
      s.entity_id !== `binary_sensor.share_space_${EVERYONE_AREA}` &&
      Array.isArray(s.attributes.persons) &&
      (s.attributes.persons as string[]).includes(me),
  );
  return sensor ? sensor.entity_id.slice("binary_sensor.share_space_".length) : null;
}

// Home tab: where I work with my area's heating, my planning, then the other zones.
@customElement("share-space-overview")
export class ShareSpaceOverview extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _error = "";
  /** Heating found in HA areas that have no Share Space zone yet: shown with their own thermostat. */
  @state() private _detected: DetectedArea[] = [];
  /** Share Space zones as the integration lists them, whatever their sensors are named. */
  @state() private _zones: HeatingZone[] = [];
  private _detectedFor: string | null = null;
  private _retryAt = 0;

  private _planning = card("share-space-my-planning-card");
  private _workArea = card("share-space-work-area-card");

  static styles = css`
    :host {
      display: block;
      padding: 8px 16px 16px;
      color: var(--primary-text-color);
    }
    /* one container per row (playground .panel); inner cards keep their own frame */
    .panel {
      ${haCardSurface}
      padding: 12px 16px 16px;
      margin-bottom: 16px;
    }
    .top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 24px;
    }
    /* no heating in my area: the planning takes the whole width */
    .top.single {
      grid-template-columns: minmax(0, 1fr);
    }
    @media (max-width: 720px) {
      .top {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    /* My place is set once: it sits on the title line instead of taking a column */
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px 16px;
      margin-bottom: 12px;
    }
    .place {
      flex: 0 1 380px;
      min-width: 0;
    }
    section {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }
    section > * {
      display: block;
    }
    h3 {
      margin: 0;
      font-size: 1.1em;
      line-height: 24px;
      font-weight: 500;
    }
    .zones {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 16px;
    }
    .zone {
      ${haCardSurface}
      width: 340px;
      max-width: 100%;
    }
    .top .zone {
      width: auto;
    }
    .graph {
      margin: 0 12px 12px;
    }
    /* both columns end on the same line */
    .top section > :last-child {
      flex: 1;
    }
    .top .zone {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .error {
      color: var(--error-color, #db4437);
      margin-top: 8px;
    }
  `;

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("hass") && this.hass) {
      this._planning.hass = this.hass;
      this._workArea.hass = this.hass;
      const zones = Object.keys(this.hass.states).filter((id) => id.startsWith(HEATING_SENSOR_PREFIX)).sort().join();
      if (zones !== this._detectedFor && Date.now() >= this._retryAt) {
        this._detectedFor = zones;
        void Promise.all([listDetectedAreas(this.hass), listZones(this.hass)])
          .then(([d, z]) => {
            this._detected = d;
            this._zones = z.filter((zone) => !zone.pending);
          })
          .catch(() => {
            // asked too early (integration still loading), or no heating integration: try again later
            this._detectedFor = null;
            this._retryAt = Date.now() + 30_000;
          });
      }
    }
  }

  private async _run(fn: () => Promise<unknown>): Promise<void> {
    this._error = "";
    try {
      await fn();
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private _zone(hass: HomeAssistant, vm: ZoneViewModel): TemplateResult {
    const zone = this._zones.find((z) => z.entity_id === vm.entityId);
    const area = zone?.area_id ?? entityArea(hass, vm.climateEntity);
    const found = this._detected.find((d) => d.area_id === area);
    const own = zone?.temperature_sensor ?? (found && "temperature_sensor" in found ? found.temperature_sensor : null);
    const sensor = areaTemperatureSensor(hass, area, own);
    return html`<div class="zone">
      ${renderHeatingControl(hass, vm, (fn) => void this._run(fn))}
      ${sensor
        ? html`<share-space-ha-card
            class="graph"
            .hass=${hass}
            .config=${{ type: "sensor", entity: sensor, graph: "line", detail: 1, hours_to_show: 24, name: t("Temperature") }}
          ></share-space-ha-card>`
        : nothing}
    </div>`;
  }

  protected render(): TemplateResult {
    const hass = this.hass;
    if (!hass) return html``;
    const zones = [...new Set([...this._zones.map((z) => z.entity_id), ...Object.keys(hass.states).filter((id) => id.startsWith(HEATING_SENSOR_PREFIX))])]
      .sort()
      .map((id) => zoneViewModel(hass, id))
      .filter((vm): vm is ZoneViewModel => vm !== null);
    // before an area has Share Space rules, its HA thermostat is shown and set directly (no zone, nothing created)
    for (const d of this._detected) {
      const climate = "climate_entity" in d ? d.climate_entity : null;
      const vm = climate ? zoneViewModel(hass, climate) : null;
      if (vm && !zones.some((z) => z.climateEntity === climate)) zones.push({ ...vm, name: d.name });
    }
    const area = myArea(hass);
    const mine = area ? zones.filter((vm) => entityArea(hass, vm.climateEntity) === area) : [];
    const others = zones.filter((vm) => !mine.includes(vm));
    return html`
      <div class="panel">
        <div class="head">
          <h3>${t("My planning")}</h3>
          <div class="place">${this._workArea}</div>
        </div>
        <div class="top ${mine.length ? "" : "single"}">
          ${mine.length ? html`<section>${mine.map((vm) => this._zone(hass, vm))}</section>` : nothing}
          <section>${this._planning}</section>
        </div>
      </div>
      ${others.length
        ? html`<section class="panel">
            <h3>${mine.length ? t("Other areas") : t("Heating")}</h3>
            <div class="zones">${others.map((vm) => this._zone(hass, vm))}</div>
          </section>`
        : nothing}
      <section class="panel">
        <share-space-overview-planning .hass=${hass} .initial=${area} .detected=${this._detected.map((d) => d.area_id)}></share-space-overview-planning>
      </section>
      ${zones.length ? nothing : html`<div class="muted">${t("No heated area yet.")}</div>`}
      ${this._error ? html`<div class="error">${this._error}</div>` : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-overview": ShareSpaceOverview;
  }
}
