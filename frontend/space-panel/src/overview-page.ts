import { LitElement, html, css, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { haCardSurface } from "ha-share-space-ui";
import { findMyPerson } from "ha-share-space-ui/ha";
import type { HomeAssistant } from "ha-share-space-ui/ha";
import { zoneViewModel } from "ha-share-space-heating-card/view-model";
import type { ZoneViewModel } from "ha-share-space-heating-card/view-model";
import "ha-share-space-planning-cards/my-planning-card";
import "ha-share-space-planning-cards/work-area-card";
import { HEATING_SENSOR_PREFIX, renderHeatingControl } from "./heating";

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

// Area I'm assigned to, read from the occupancy sensors' `persons` attribute.
function myArea(hass: HomeAssistant): string | null {
  const me = findMyPerson(hass)?.entity_id;
  if (!me) return null;
  const sensor = Object.values(hass.states).find(
    (s) =>
      s.entity_id.startsWith("binary_sensor.share_space_") &&
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
    @media (max-width: 720px) {
      .top {
        grid-template-columns: minmax(0, 1fr);
      }
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
    }
  }

  private async _run(fn: () => Promise<unknown>): Promise<void> {
    this._error = "";
    try {
      await fn();
    } catch (err) {
      this._error = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err);
    }
  }

  private _zone(hass: HomeAssistant, vm: ZoneViewModel): TemplateResult {
    return html`<div class="zone">${renderHeatingControl(hass, vm, (fn) => void this._run(fn))}</div>`;
  }

  protected render(): TemplateResult {
    const hass = this.hass;
    if (!hass) return html``;
    const zones = Object.keys(hass.states)
      .filter((id) => id.startsWith(HEATING_SENSOR_PREFIX))
      .sort()
      .map((id) => zoneViewModel(hass, id))
      .filter((vm): vm is ZoneViewModel => vm !== null);
    const area = myArea(hass);
    const mine = area ? zones.filter((vm) => entityArea(hass, vm.climateEntity) === area) : [];
    const others = zones.filter((vm) => !mine.includes(vm));
    return html`
      <div class="panel top">
        <section>
          <h3>My area</h3>
          ${this._workArea}
          ${mine.map((vm) => this._zone(hass, vm))}
        </section>
        <section>
          <h3>My planning</h3>
          ${this._planning}
        </section>
      </div>
      ${others.length
        ? html`<section class="panel">
            <h3>${mine.length ? "Other areas" : "Heating"}</h3>
            <div class="zones">${others.map((vm) => this._zone(hass, vm))}</div>
          </section>`
        : nothing}
      ${zones.length ? nothing : html`<div class="muted">No heating zone yet.</div>`}
      ${this._error ? html`<div class="error">${this._error}</div>` : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-overview": ShareSpaceOverview;
  }
}
