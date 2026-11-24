import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { haCardSurface } from "ha-share-space-ui";
import { loadExistingHeating, loadZoneRules } from "ha-share-space-ui/ha";
import type { ExistingHeating, HeatingZone, HomeAssistant, SharedStrategy, ZoneRules } from "ha-share-space-ui/ha";

interface Row {
  zone: HeatingZone;
  rules: ZoneRules | null;
  existing: ExistingHeating[];
}

// Rules page start: every heated area in one line, saying what drives its heating; a click opens its rules.
@customElement("share-space-rules-summary")
export class ShareSpaceRulesSummary extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) zones: HeatingZone[] | null = null;
  @property({ attribute: false }) shared: SharedStrategy[] | null = null;
  /** Bumped after a save, to read the areas again. */
  @property({ type: Number }) version = 0;
  @state() private _rows: Row[] | null = null;
  private _loaded = "";

  static styles = css`
    :host {
      display: block;
    }
    h3 {
      margin: 0 0 8px;
      font-size: 1.1em;
      font-weight: 500;
    }
    .list {
      ${haCardSurface}
      display: flex;
      flex-direction: column;
    }
    button.row {
      all: unset;
      box-sizing: border-box;
      display: grid;
      grid-template-columns: minmax(120px, 1fr) minmax(0, 2fr) auto auto;
      gap: 12px;
      align-items: center;
      padding: 12px 16px;
      cursor: pointer;
      border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    }
    button.row:first-child {
      border-top: none;
    }
    button.row:hover,
    button.row:focus-visible {
      background: var(--secondary-background-color);
    }
    .name {
      font-weight: 600;
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .badge {
      font-size: 0.75em;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--secondary-background-color);
      white-space: nowrap;
    }
    .badge.on {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    @media (max-width: 600px) {
      button.row {
        grid-template-columns: minmax(0, 1fr) auto auto;
      }
      .drives {
        grid-column: 1 / -1;
        grid-row: 2;
      }
    }
  `;

  protected willUpdate(changed: PropertyValues): void {
    const key = JSON.stringify([this.zones?.map((z) => z.entity_id), this.version]);
    if (this.hass && this.zones && key !== this._loaded) {
      this._loaded = key;
      void this._load(this.hass, this.zones);
    }
  }

  private async _load(hass: HomeAssistant, zones: HeatingZone[]): Promise<void> {
    this._rows = await Promise.all(
      zones.map(async (zone) => {
        const target = zone.area_id
          ? { area: zone.area_id, entities: [zone.climate_entity, ...(zone.heaters ?? []), ...(zone.heater_switch ? [zone.heater_switch] : [])].filter(Boolean) }
          : null;
        const [rules, existing] = await Promise.all([
          zone.pending ? null : loadZoneRules(hass, zone.entity_id).catch(() => null),
          target ? loadExistingHeating(hass, target).catch(() => []) : [],
        ]);
        return { zone, rules, existing };
      }),
    );
  }

  private _on(item: ExistingHeating): boolean {
    const state = this.hass?.states[item.entityId]?.state;
    return state === undefined ? item.enabled : state !== "off";
  }

  private _drives(row: Row): { text: string; badge: string; on: boolean } {
    const r = row.rules;
    if (r?.state === "managed") {
      const shared = r.strategy ? this.shared?.find((s) => s.id === r.strategy) : undefined;
      const text = r.strategy ? `Shared strategy: ${shared?.name ?? "missing"}` : `Custom, ${r.rules?.rules.length ?? 0} rule${r.rules?.rules.length === 1 ? "" : "s"}`;
      return { text, badge: r.enabled ? "Share Space" : "Share Space, off", on: r.enabled };
    }
    const on = row.existing.filter((i) => this._on(i));
    if (on.length) return { text: on.map((i) => i.name).join(", "), badge: "Home Assistant", on: true };
    return { text: "No heating rules", badge: "", on: false };
  }

  private _row(row: Row): TemplateResult {
    const d = this._drives(row);
    return html`<button class="row" @click=${() => this.dispatchEvent(new CustomEvent("zone-select", { detail: row.zone.entity_id }))}>
      <span class="name">${row.zone.name}</span>
      <span class="drives ${d.badge ? "" : "muted"}">${d.text}</span>
      ${d.badge ? html`<span class="badge ${d.on ? "on" : ""}">${d.badge}</span>` : html`<span></span>`}
      <span class="muted" aria-hidden="true">›</span>
    </button>`;
  }

  protected render(): TemplateResult | typeof nothing {
    if (this.zones && !this.zones.length) return html`<div class="muted">No heated area found in Home Assistant yet.</div>`;
    if (!this._rows) return html`<div class="muted">Loading areas…</div>`;
    return html`<h3>Heating rules by area</h3>
      <div class="list">${this._rows.map((r) => this._row(r))}</div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rules-summary": ShareSpaceRulesSummary;
  }
}
