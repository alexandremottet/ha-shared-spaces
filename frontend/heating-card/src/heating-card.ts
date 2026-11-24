import "./i18n-fr";
import { html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import "ha-share-space-ui";
import {
  ShareSpaceCardBase,
  registerCustomCard,
  haTheme,
  setOverride,
  extendOverride,
  clearOverride,
  hassNow,
  hassTimeZone,
  findZoneStrategies,
  loadZoneStrategy,
  planningSchedule,
  errorMessage,
} from "ha-share-space-ui/ha";
import { strategyTimeline, t } from "ha-share-space-ui";
import type { StrategySegment } from "ha-share-space-ui";
import type { ZoneStrategy } from "ha-share-space-ui/ha";
import type { HomeAssistant, LovelaceConfigForm, LovelaceGridOptions } from "ha-share-space-ui/ha";
import { zoneViewModel } from "./view-model";

interface CardConfig {
  type: string;
  entity: string;
  name?: string;
  durations?: number[];
}

@customElement("share-space-heating-card")
export class ShareSpaceHeatingCard extends ShareSpaceCardBase<CardConfig> {
  static styles = [
    haTheme,
    css`
      :host {
        display: block;
        container-type: inline-size;
      }
      .header {
        padding: 16px 16px 0;
        font-size: 1.2em;
        font-weight: 500;
      }
      .status,
      .error {
        padding: 0 16px 12px;
        font-size: 0.85em;
        color: var(--secondary-text-color);
      }
      .error {
        color: var(--error-color);
      }
      .banner {
        margin: 0 16px 12px;
        padding: 8px 12px;
        border-radius: var(--ha-card-border-radius, 12px);
        border: 1px solid var(--primary-color);
        font-size: 0.9em;
      }
      .tools {
        padding: 0 16px 12px;
      }
      .tools button {
        min-height: 40px;
        padding: 0 16px;
        font: inherit;
        cursor: pointer;
        color: var(--primary-text-color);
        background: transparent;
        border: 1px solid var(--divider-color);
        border-radius: 20px;
      }
      .tools button.active {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        border-color: transparent;
      }
      share-space-strategy-editor {
        margin-top: 12px;
      }
    `,
  ];

  @state() private _error = "";
  @state() private _showStrategy = false;
  @state() private _strategy: ZoneStrategy | null = null;
  private _strategyKey = "";
  private _nextMemo: { key: string; segments: StrategySegment[] } | null = null;

  setConfig(config: CardConfig): void {
    if (!config.entity) throw new Error("You need to define an entity.");
    this._config = config;
  }

  protected willUpdate(): void {
    const hass = this.hass;
    const zone = this._config?.entity;
    if (!hass || !zone || !hass.user?.is_admin || hass.states[zone]?.attributes.mode !== "automation") return;
    const auto = findZoneStrategies(hass, zone).find((a) => a.enabled);
    const key = `${zone}|${auto?.entityId ?? ""}`;
    if (key === this._strategyKey) return;
    this._strategyKey = key;
    loadZoneStrategy(hass, zone).then(
      (s) => (this._strategy = s),
      () => (this._strategy = null),
    );
  }

  private _nextChange(hass: HomeAssistant): string | null {
    const strategy = this._strategy;
    const schedule = strategy ? planningSchedule(hass, strategy.area) : null;
    if (!strategy || !schedule) return null;
    const tz = hassTimeZone(hass);
    const now = hassNow(hass);
    const bucket = Math.floor(now / 300000);
    const attrs = hass.states[this._config?.entity ?? ""]?.attributes;
    const temps = { comfort: Number(attrs?.comfort_temp ?? 21), eco: Number(attrs?.eco_temp ?? 17) };
    const key = `${strategy.id}|${JSON.stringify(strategy.effective)}|${JSON.stringify(temps)}|${bucket}|${JSON.stringify(schedule)}`;
    if (this._nextMemo?.key !== key) {
      const from = bucket * 300000;
      const to = from + 7 * 86400000;
      const segments = strategy.effective ? strategyTimeline(strategy.effective, schedule, from, to, tz, temps) : [];
      this._nextMemo = { key, segments };
    }
    const next = this._nextMemo.segments.find((s) => s.start > now);
    if (!next) return null;
    const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(next.start) === new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
    const when = new Intl.DateTimeFormat([], { timeZone: tz, hour: "2-digit", minute: "2-digit", ...(sameDay ? {} : { weekday: "short" }) }).format(next.start);
    const label = "off" in next.result ? t("off") : `${next.result.target}°`;
    return t("next: {label} at {when}", { label, when });
  }

  private _renderBanner(hass: HomeAssistant, vm: NonNullable<ReturnType<typeof zoneViewModel>>) {
    if (vm.mode !== "automation") return nothing;
    const next = this._nextChange(hass);
    return html`<div class="banner" role="status">${t(next ? "Automation · {rule} · {target}° · {next}" : "Automation · {rule} · {target}°", { rule: vm.activeRule ?? t("Active"), target: vm.target, next: next ?? "" })}</div>`;
  }

  private async _run(fn: () => Promise<unknown>): Promise<void> {
    this._error = "";
    try {
      await fn();
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  protected render() {
    const cfg = this._config;
    const hass = this.hass;
    if (!cfg || !hass) return nothing;
    const vm = zoneViewModel(hass, cfg.entity);
    if (!vm) {
      return html`<ha-card><div class="error" style="padding:16px">${t("Entity not found: {entity}", { entity: cfg.entity })}</div></ha-card>`;
    }
    const zone = vm.serviceEntityId;
    const name = cfg.name ?? vm.name;
    return html`
      <ha-card>
        <div class="header">${name}</div>
        <share-space-heating-control
          .currentTemperature=${vm.currentTemperature}
          .target=${vm.target}
          .min=${vm.min}
          .max=${vm.max}
          .step=${vm.step}
          .unit=${vm.unit}
          .mode=${vm.mode}
          .overrideUntil=${vm.overrideUntil}
          .presence=${vm.presence}
          .reason=${vm.activeRule}
          .durations=${cfg.durations ?? [1, 2, 3, 6]}
          .presets=${vm.presets}
          @override-requested=${(e: CustomEvent<{ temperature: number; hours: number }>) =>
            zone && this._run(() => setOverride(hass, zone, e.detail.temperature, e.detail.hours))}
          @override-extended=${(e: CustomEvent<{ hours: number }>) =>
            zone && this._run(() => extendOverride(hass, zone, e.detail.hours))}
          @override-cleared=${() => zone && this._run(() => clearOverride(hass, zone))}
          @target-set=${(e: CustomEvent<{ temperature: number }>) =>
            vm.climateEntity &&
            this._run(() =>
              hass.callService("climate", "set_temperature", {
                entity_id: vm.climateEntity,
                temperature: e.detail.temperature,
              }),
            )}
        ></share-space-heating-control>
        ${this._renderBanner(hass, vm)}
        ${vm.hvacAction && vm.hvacAction !== "off" ? html`<div class="status">${t(vm.hvacAction)}</div>` : nothing}
        ${this._error ? html`<div class="error">${this._error}</div>` : nothing}
        ${zone && hass.user?.is_admin
          ? html`<div class="tools">
              <button class=${this._showStrategy ? "active" : ""} @click=${() => (this._showStrategy = !this._showStrategy)}>${t("Strategy")}</button>
              ${this._showStrategy ? html`<share-space-strategy-editor .hass=${hass} .zone=${zone}></share-space-strategy-editor>` : nothing}
            </div>`
          : nothing}
      </ha-card>
    `;
  }

  static getStubConfig(hass?: HomeAssistant): CardConfig {
    const ids = Object.keys(hass?.states ?? {});
    const entity =
      ids.find((id) => id.startsWith("sensor.share_space_heating_")) ??
      ids.find((id) => id.startsWith("climate.")) ??
      "";
    return { type: "custom:share-space-heating-card", entity };
  }

  static getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: ["sensor", "climate"] } } },
        { name: "name", selector: { text: {} } },
      ],
    };
  }

  getGridOptions(): LovelaceGridOptions {
    return { columns: 6, min_columns: 3, rows: "auto" } as unknown as LovelaceGridOptions;
  }
}

registerCustomCard({
  type: "share-space-heating-card",
  name: "Share Space – Heating",
  description: "Thermostat with timed manual override",
  preview: true,
});

declare global {
  interface HTMLElementTagNameMap {
    "share-space-heating-card": ShareSpaceHeatingCard;
  }
}
