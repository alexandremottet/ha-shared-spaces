import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { haCardSurface, t } from "ha-share-space-ui";
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
    .panel {
      ${haCardSurface}
      padding: 16px;
    }
    h3 {
      margin: 0;
      font-size: 1.1em;
      font-weight: 500;
    }
    .intro {
      margin: 4px 0 16px;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    button.area {
      all: unset;
      box-sizing: border-box;
      ${haCardSurface}
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto auto;
      gap: 6px 16px;
      align-items: center;
      min-height: 84px;
      padding: 16px 20px;
      cursor: pointer;
      transition: box-shadow 0.15s;
    }
    button.area:hover,
    button.area:focus-visible {
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
    }
    button.area:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .name {
      font-weight: 600;
      font-size: 1.05em;
    }
    .drives {
      grid-column: 1;
      grid-row: 2;
    }
    .side {
      grid-column: 2;
      grid-row: 1 / span 2;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .chevron {
      font-size: 1.4em;
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .badge {
      font-size: 0.8em;
      padding: 3px 10px;
      border-radius: 12px;
      background: var(--secondary-background-color);
      white-space: nowrap;
    }
    .badge.on {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
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
      const text = r.strategy ? t("Shared strategy: {name}", { name: shared?.name ?? t("missing") }) : (r.rules?.rules.length === 1 ? t("Custom, 1 rule") : t("Custom, {n} rules", { n: r.rules?.rules.length ?? 0 }));
      return { text, badge: r.enabled ? t("Share Space") : t("Share Space, off"), on: r.enabled };
    }
    const on = row.existing.filter((i) => this._on(i));
    if (on.length) return { text: on.map((i) => i.name).join(", "), badge: t("Home Assistant"), on: true };
    return { text: t("No heating rules"), badge: "", on: false };
  }

  private _row(row: Row): TemplateResult {
    const d = this._drives(row);
    return html`<button class="area" @click=${() => this.dispatchEvent(new CustomEvent("zone-select", { detail: row.zone.entity_id }))}>
      <span class="name">${row.zone.name}</span>
      <span class="drives muted">${d.text}</span>
      <span class="side">
        ${d.badge ? html`<span class="badge ${d.on ? "on" : ""}">${d.badge}</span>` : nothing}
        <span class="chevron muted" aria-hidden="true">›</span>
      </span>
    </button>`;
  }


  protected render(): TemplateResult | typeof nothing {
    if (this.zones && !this.zones.length) return html`<div class="muted">${t("No heated area found in Home Assistant yet.")}</div>`;
    if (!this._rows) return html`<div class="muted">${t("Loading areas…")}</div>`;
    return html`<section class="panel">
      <h3>${t("Heating rules by area")}</h3>
      <div class="intro muted">${t("What heats each area today. Open one to see or edit its rules.")}</div>
      <div class="list">${this._rows.map((r) => this._row(r))}</div>
    </section>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rules-summary": ShareSpaceRulesSummary;
  }
}
