import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues } from "lit";
import { property, state } from "lit/decorators.js";
import { safeCustomElement } from "../define";
import type { HomeAssistant } from "./hass";
import { getAreaActions, isBackendMissing, listZones, listStrategyAutomations, loadZoneStrategy, setAreaActions, stopZoneStrategies, updateZone } from "./ws";
import type { AreaActions, HeatingZone, PlanningAction, ZoneStrategy } from "./ws";
import { haTheme } from "./theme";
import { syncLanguage } from "./hass";
import { t } from "../i18n";
import "../heating/strategy-editor";

type Side = "on" | "off";
type Preset = "heating" | "light" | "scene" | "script";
type HeatMode = "simple" | "strategy";
interface ZoneLink {
  area: string;
  mode: HeatMode;
  label: string;
}

export interface LinkItem {
  key: string;
  icon: string;
  label: string;
  detail: string;
  kind: "zone" | "action";
  domain?: string;
  entryId?: string;
  refs: Array<{ side: Side; index: number }>;
}

const ICONS: Record<string, string> = {
  light: "💡",
  switch: "💡",
  input_boolean: "💡",
  fan: "🌀",
  scene: "🎬",
  script: "📜",
  climate: "🔥",
};

const PICKER_DOMAINS = ["light", "switch", "fan", "input_boolean"];

const sensorOf = (area: string): string => `binary_sensor.share_space_${area}`;

const entityIds = (a: PlanningAction): string[] => {
  const target = a.target as { entity_id?: string | string[] } | undefined;
  const raw = target?.entity_id ?? (a.entity_id as string | string[] | undefined) ?? [];
  return Array.isArray(raw) ? raw : [raw];
};

const nameOf = (hass: HomeAssistant | undefined, id: string): string => {
  const n = hass?.states[id]?.attributes.friendly_name;
  return typeof n === "string" ? n : id;
};

const verbOf = (a: PlanningAction): string => {
  const service = String(a.action ?? a.service ?? "");
  const [domain, name] = service.split(".");
  const data = a.data as { temperature?: number } | undefined;
  if (domain === "climate" && data?.temperature !== undefined) return `${data.temperature}°`;
  if (domain === "scene" || domain === "script") return t("run");
  if (name === "turn_on") return t("on");
  if (name === "turn_off") return t("off");
  return service || t("action");
};

/** One item per linked thing: on/off actions on the same entities are grouped, zones are a single link. */
export function summarizeAreaLinks(
  actions: AreaActions | null,
  zones: HeatingZone[],
  hass: HomeAssistant | undefined,
  area?: string,
): LinkItem[] {
  const items: LinkItem[] = area
    ? zones
        .filter((z) => z.presence_entity === sensorOf(area))
        .map((z) => ({ key: `zone:${z.entry_id}`, icon: "🔥", label: z.name, detail: t("comfort occupied · eco empty"), kind: "zone", entryId: z.entry_id, domain: "climate", refs: [] }))
    : [];
  const groups = new Map<string, { item: LinkItem; verbs: Partial<Record<Side, string>> }>();
  for (const side of ["on", "off"] as const) {
    ((side === "on" ? actions?.on_actions : actions?.off_actions) ?? []).forEach((a, index) => {
      const service = String(a.action ?? a.service ?? "");
      const domain = service.split(".")[0] ?? "";
      const ids = entityIds(a);
      const key = ids.length ? `entities:${[...ids].sort().join(",")}` : `${side}:${index}`;
      let g = groups.get(key);
      if (!g) {
        const first = ids[0] ? nameOf(hass, ids[0]) : service || t("action");
        const label = ids.length > 1 ? `${first} +${ids.length - 1}` : first;
        g = { item: { key, icon: ICONS[domain] ?? "⚙️", label, detail: "", kind: "action", domain, refs: [] }, verbs: {} };
        groups.set(key, g);
      }
      g.item.refs.push({ side, index });
      g.verbs[side] = g.verbs[side] ? `${g.verbs[side]}, ${verbOf(a)}` : verbOf(a);
    });
  }
  for (const { item, verbs } of groups.values()) {
    item.detail =
      verbs.on && verbs.off
        ? t("{on} occupied · {off} empty", { on: verbs.on, off: verbs.off })
        : verbs.on
          ? t("{verb} when occupied", { verb: verbs.on })
          : t("{verb} when empty", { verb: verbs.off ?? "" });
    items.push(item);
  }
  return items;
}

const nounOf = (domain: string): string =>
  ({ light: t("lights"), switch: t("switches"), fan: t("fans"), scene: t("scenes"), script: t("scripts"), climate: t("zones") })[domain] ?? t("actions");

export function formatLinkChips(items: LinkItem[]): string {
  const groups = new Map<string, LinkItem[]>();
  for (const c of items) {
    const k = `${c.icon}|${c.domain ?? ""}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const parts: string[] = [];
  for (const list of groups.values()) {
    const [head] = list;
    parts.push(list.length > 1 ? `${head.icon} ${list.length} ${nounOf(head.domain ?? "")}` : `${head.icon} ${head.label}`);
  }
  return parts.join(" · ");
}

@safeCustomElement("share-space-area-trigger-popover")
export class ShareSpaceAreaTriggerPopover extends LitElement {
  static styles = [
    haTheme,
    css`
      :host {
        display: contents;
      }
      .pop {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px 16px 16px;
        color: var(--primary-text-color);
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 600;
      }
      .tabs,
      .presets,
      .chips,
      .row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      button,
      select,
      input[type="number"] {
        min-height: 44px;
        box-sizing: border-box;
        font: inherit;
        color: var(--primary-text-color);
        background: transparent;
        border: 1px solid var(--divider-color);
        border-radius: 22px;
        padding: 0 16px;
        cursor: pointer;
      }
      select,
      input[type="number"] {
        border-radius: 8px;
        background: var(--card-background-color, #fff);
        cursor: auto;
      }
      input[type="number"] {
        width: 90px;
      }
      button.active,
      button.primary {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        border-color: transparent;
      }
      button:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .tabs button {
        flex: 1;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 36px;
        padding: 0 4px 0 12px;
        border-radius: 18px;
        background: var(--divider-color);
        color: var(--primary-text-color);
      }
      .chip button {
        min-height: 32px;
        min-width: 32px;
        padding: 0;
        border: none;
        border-radius: 16px;
      }
      .form {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px;
        border-radius: 8px;
        border: 1px solid var(--divider-color);
      }
      .items {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid var(--divider-color);
      }
      .use {
        text-align: left;
        min-height: 44px;
      }
      .zone {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .muted {
        color: var(--secondary-text-color);
        font-size: 0.9em;
      }
      .err {
        color: var(--error-color);
        font-size: 0.9em;
      }
      label {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
      }
      label input[type="checkbox"] {
        width: 22px;
        height: 22px;
      }
    `,
  ];

  @property({ attribute: false }) hass?: HomeAssistant;
  @property() area = "";
  @property({ type: Boolean, reflect: true }) open = false;

  @state() private _preset: Preset | null = null;
  @state() private _actions: AreaActions | null = null;
  @state() private _zones: HeatingZone[] | null = null;
  @state() private _busy = false;
  @state() private _error = "";
  @state() private _entity = "";
  @state() private _whenOn = true;
  @state() private _whenOff = true;
  @state() private _climate = "";
  @state() private _tempOn = "";
  @state() private _tempOff = "";
  @state() private _editZone = "";
  @state() private _heatMode: HeatMode = "simple";
  @state() private _zoneStrategies: Record<string, ZoneStrategy | null> = {};
  private _strategySig = "";
  /** Zone whose strategy was just saved: once hass shows it enabled, its Simple link is dropped. */
  private _exclusiveZone = "";

  private _onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      this._close();
    }
  };

  private get _isAdmin(): boolean {
    return !!this.hass?.user?.is_admin;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("hass")) syncLanguage(this.hass);
  }

  protected updated(changed: PropertyValues): void {
    // Strategy links live in automation entities, which reach hass after the save resolves.
    if (this.open && changed.has("hass") && this.hass && this._strategySignature() !== this._strategySig) void this._load();
    if (changed.has("open")) {
      if (this.open) {
        document.addEventListener("keydown", this._onKey);
        this._preset = null;
        this._editZone = "";
        this._error = "";
        void this._load();
      } else {
        this._detach();
      }
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._detach();
  }

  private _detach(): void {
    document.removeEventListener("keydown", this._onKey);
  }

  private _close(): void {
    this.open = false;
    this.dispatchEvent(new CustomEvent("popover-close", { bubbles: true, composed: true }));
  }

  private async _load(): Promise<void> {
    if (!this.hass || !this.area) {
      return;
    }
    const [actions, zones] = await Promise.allSettled([getAreaActions(this.hass, this.area), listZones(this.hass)]);
    this._actions = actions.status === "fulfilled" ? actions.value : { on_actions: [], off_actions: [], enabled: true };
    this._zones = zones.status === "fulfilled" ? zones.value : isBackendMissing(zones.reason) ? null : [];
    const hass = this.hass;
    this._strategySig = this._strategySignature();
    const entries = await Promise.all(
      (this._zones ?? []).map(async (z) => [z.entity_id, await loadZoneStrategy(hass, z.entity_id).catch(() => null)] as const),
    );
    this._zoneStrategies = Object.fromEntries(entries);
    const zone = this._zones?.find((z) => z.entity_id === this._exclusiveZone);
    if (zone && this._zoneStrategies[zone.entity_id] && zone.presence_entity) {
      this._exclusiveZone = "";
      await updateZone(hass, zone.entry_id, { presence_entity: null });
      this._zones = await listZones(hass);
      this._changed();
    }
    if (actions.status === "rejected" && !isBackendMissing(actions.reason)) {
      this._error = (actions.reason as Error)?.message ?? String(actions.reason);
    }
  }

  private _strategySignature(): string {
    return this.hass ? listStrategyAutomations(this.hass).map((a) => `${a.id}:${a.enabled}`).join(",") : "";
  }

  private _changed(): void {
    this.dispatchEvent(new CustomEvent("links-changed", { bubbles: true, composed: true }));
  }

  private async _run(fn: () => Promise<unknown>): Promise<void> {
    this._busy = true;
    this._error = "";
    try {
      await fn();
      await this._load();
      this._changed();
    } catch (err) {
      this._error = (err as Error)?.message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  private async _addActions(add: Partial<Record<Side, PlanningAction[]>>): Promise<void> {
    await this._run(async () => {
      const current = await getAreaActions(this.hass!, this.area);
      const merge = (list: PlanningAction[], extra: PlanningAction[] = []) => {
        const out = [...list];
        for (const a of extra) {
          if (!out.some((x) => JSON.stringify(x) === JSON.stringify(a))) {
            out.push(a);
          }
        }
        return out;
      };
      await setAreaActions(this.hass!, this.area, {
        on_actions: merge(current.on_actions, add.on),
        off_actions: merge(current.off_actions, add.off),
      });
      this._entity = "";
    });
  }

  private async _removeItem(item: LinkItem): Promise<void> {
    if (item.kind === "zone") {
      await this._run(() => updateZone(this.hass!, item.entryId!, { presence_entity: null }));
      return;
    }
    await this._run(async () => {
      const current = await getAreaActions(this.hass!, this.area);
      const drop = (side: Side) => new Set(item.refs.filter((r) => r.side === side).map((r) => r.index));
      const on = drop("on");
      const off = drop("off");
      await setAreaActions(this.hass!, this.area, {
        on_actions: current.on_actions.filter((_, i) => !on.has(i)),
        off_actions: current.off_actions.filter((_, i) => !off.has(i)),
      });
    });
  }

  private _link(zone: HeatingZone, on: boolean): Promise<void> {
    const patch: Parameters<typeof updateZone>[2] = { presence_entity: on ? sensorOf(this.area) : null };
    if (on && this._tempOn !== "") patch.comfort_temp = Number(this._tempOn);
    if (on && this._tempOff !== "") patch.eco_temp = Number(this._tempOff);
    return this._run(async () => {
      // Simple and Strategy are exclusive: choosing Simple stops any strategy driving this zone.
      if (on) await stopZoneStrategies(this.hass!, zone.entity_id);
      await updateZone(this.hass!, zone.entry_id, patch);
    });
  }

  private _optionIds(domains: string[]): string[] {
    return Object.keys(this.hass?.states ?? {})
      .filter((id) => domains.includes(id.split(".")[0]))
      .sort((a, b) => nameOf(this.hass, a).localeCompare(nameOf(this.hass, b)));
  }

  private _picker(domains: string[], value: string, onChange: (v: string) => void) {
    if (customElements.get("ha-entity-picker")) {
      return html`<ha-entity-picker
        .hass=${this.hass}
        .value=${value}
        .includeDomains=${domains}
        allow-custom-entity
        @value-changed=${(e: CustomEvent) => {
          e.stopPropagation();
          onChange(e.detail.value ?? "");
        }}
      ></ha-entity-picker>`;
    }
    return html`<select .value=${value} @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}>
      <option value="">${t("Choose…")}</option>
      ${this._optionIds(domains).map((id) => html`<option value=${id} ?selected=${id === value}>${nameOf(this.hass, id)}</option>`)}
    </select>`;
  }

  private _areaName(id: string): string {
    return this.hass?.areas?.[id]?.name ?? id;
  }

  private _thermostatName(z: HeatingZone): string {
    const name = this.hass?.states[z.climate_entity]?.attributes.friendly_name;
    return typeof name === "string" ? name : t("{name} thermostat", { name: z.name });
  }

  private _zoneLink(z: HeatingZone): ZoneLink | null {
    const strategy = this._zoneStrategies[z.entity_id];
    if (strategy) return { area: strategy.area, mode: "strategy", label: strategy.name };
    const area = z.presence_entity?.startsWith("binary_sensor.share_space_") ? z.presence_entity.slice("binary_sensor.share_space_".length) : null;
    return area ? { area, mode: "simple", label: t("occupied / empty °C") } : null;
  }

  private _toggleEdit(z: HeatingZone, mode: HeatMode): void {
    const same = this._editZone === z.entity_id;
    this._editZone = same ? "" : z.entity_id;
    this._heatMode = mode;
  }

  private _unlink(z: HeatingZone, link: ZoneLink): Promise<void> {
    const strategy = this._zoneStrategies[z.entity_id];
    return link.mode === "strategy" && strategy
      ? this._run(() => stopZoneStrategies(this.hass!, z.entity_id))
      : this._link(z, false);
  }

  private _renderZoneEditor(z: HeatingZone, link: ZoneLink | null) {
    const here = link?.area === this.area;
    return html`<div class="form">
      <div class="tabs">
        <button class=${this._heatMode === "simple" ? "active" : ""} @click=${() => (this._heatMode = "simple")}>${t("Simple")}</button>
        <button class=${this._heatMode === "strategy" ? "active" : ""} @click=${() => (this._heatMode = "strategy")}>${t("Strategy")}</button>
      </div>
      ${this._heatMode === "simple"
        ? html`<span class="muted">${t("Comfort while the area is occupied, eco while empty.")}</span>
            <div class="row">
              <span class="muted">${t("Occupied °C")}</span><input type="number" step="0.5" .value=${this._tempOn} @input=${(e: Event) => (this._tempOn = (e.target as HTMLInputElement).value)} />
              <span class="muted">${t("Empty °C")}</span><input type="number" step="0.5" .value=${this._tempOff} @input=${(e: Event) => (this._tempOff = (e.target as HTMLInputElement).value)} />
            </div>
            <button class="primary" ?disabled=${this._busy} @click=${() => this._link(z, true).then(() => this._doneEditing())}>${here && link?.mode === "simple" ? t("Save") : t("Link")}</button>`
        : html`<share-space-strategy-editor
            .hass=${this.hass}
            .zone=${z.entity_id}
            @strategy-changed=${() => {
              this._exclusiveZone = z.entity_id;
              void this._run(async () => undefined).then(() => this._doneEditing());
            }}
          ></share-space-strategy-editor>`}
    </div>`;
  }

  private _doneEditing(): void {
    if (!this._error) this._editZone = "";
  }

  // One thermostat at a time while configuring; the list comes back on save/cancel.
  private _renderFocused(z: HeatingZone) {
    const link = this._zoneLink(z);
    const elsewhere = link && link.area !== this.area;
    return html`<div class="zone">
        <strong>🔥 ${this._thermostatName(z)}</strong>
        <button aria-label=${t("Close")} @click=${() => (this._editZone = "")}>✕</button>
      </div>
      ${elsewhere ? html`<span class="muted">${t("Now follows {area}; saving moves it here.", { area: this._areaName(link.area) })}</span>` : nothing}
      ${this._renderZoneEditor(z, link)}
      <button @click=${() => (this._editZone = "")}>${t("Cancel")}</button>`;
  }

  private _renderHeating() {
    const zones = this._zones;
    const focused = zones?.find((z) => z.entity_id === this._editZone);
    if (zones && zones.length > 0) {
      return html`<div class="form">
        <span class="muted">${t("Thermostats")}</span>
        ${focused
          ? this._renderFocused(focused)
          : zones.map((z) => {
          const link = this._zoneLink(z);
          const here = link?.area === this.area;
          const editing = this._editZone === z.entity_id;
          const device = this._thermostatName(z);
          const row = here
            ? html`<div class="zone">
                <span>✓ ${device}<br /><span class="muted">${link!.label}</span></span>
                <span class="row">
                  <button class=${editing ? "active" : ""} @click=${() => this._toggleEdit(z, link!.mode)}>${t("Edit")}</button>
                  <button ?disabled=${this._busy} @click=${() => this._unlink(z, link!)}>${t("Unlink")}</button>
                </span>
              </div>`
            : html`<button class="use ${editing ? "active" : ""}" @click=${() => this._toggleEdit(z, link?.mode ?? "simple")}>
                🔥 ${t("Use {device}", { device })}${link ? html`<br /><span class="muted">${t("now follows {area}", { area: this._areaName(link.area) })}</span>` : nothing}
              </button>`;
          return html`${row}
`;
            })}
      </div>`;
    }
    const noTemp = this._tempOn === "" || this._tempOff === "" || !this._climate;
    return html`<div class="form">
      <span class="muted">${zones === null ? t("No heating zones available. Set a thermostat directly:") : t("No heating zones yet. Set a thermostat directly:")}</span>
      ${this._picker(["climate"], this._climate, (v) => (this._climate = v))}
      <div class="row">
        <span class="muted">${t("Occupied °C")}</span><input type="number" step="0.5" .value=${this._tempOn} @input=${(e: Event) => (this._tempOn = (e.target as HTMLInputElement).value)} />
        <span class="muted">${t("Empty °C")}</span><input type="number" step="0.5" .value=${this._tempOff} @input=${(e: Event) => (this._tempOff = (e.target as HTMLInputElement).value)} />
      </div>
      <button
        class="primary"
        ?disabled=${this._busy || noTemp}
        @click=${() => {
          const mk = (temp: string): PlanningAction => ({ action: "climate.set_temperature", target: { entity_id: this._climate }, data: { temperature: Number(temp) } });
          void this._addActions({ on: [mk(this._tempOn)], off: [mk(this._tempOff)] });
        }}
      >
        ${t("Add")}
      </button>
    </div>`;
  }

  private _renderEntityForm(preset: Preset) {
    const domains = preset === "light" ? PICKER_DOMAINS : [preset];
    const light = preset === "light";
    const submit = () => {
      const domain = this._entity.split(".")[0];
      const act = (verb: string): PlanningAction => ({ action: `${domain}.${verb}`, target: { entity_id: this._entity } });
      void this._addActions({
        on: this._whenOn ? [act("turn_on")] : [],
        off: this._whenOff ? [act(light ? "turn_off" : "turn_on")] : [],
      });
    };
    const check = (label: string, value: boolean, set: (v: boolean) => void) =>
      html`<label><input type="checkbox" .checked=${value} @change=${(e: Event) => set((e.target as HTMLInputElement).checked)} />${label}</label>`;
    return html`<div class="form">
      ${this._picker(domains, this._entity, (v) => (this._entity = v))}
      ${check(light ? t("Turn on when occupied") : t("Run when occupied"), this._whenOn, (v) => (this._whenOn = v))}
      ${check(light ? t("Turn off when empty") : t("Run when empty"), this._whenOff, (v) => (this._whenOff = v))}
      <button class="primary" ?disabled=${this._busy || !this._entity || (!this._whenOn && !this._whenOff)} @click=${submit}>${t("Add")}</button>
    </div>`;
  }

  private _renderItems(items: LinkItem[]) {
    if (items.length === 0) {
      return html`<div class="muted">${t("Nothing linked yet.")}</div>`;
    }
    return html`<div class="items">
      ${items.map(
        (c) => html`<div class="item">
          <span>${c.icon} ${c.label}<br /><span class="muted">${c.detail}</span></span>
          <button title=${t("Remove")} aria-label=${t("Remove {label}", { label: c.label })} ?disabled=${this._busy} @click=${() => this._removeItem(c)}>✕</button>
        </div>`,
      )}
    </div>`;
  }

  protected render() {
    if (!this.open || !this._isAdmin) {
      return nothing;
    }
    const links = summarizeAreaLinks(this._actions, this._zones ?? [], this.hass, this.area);
    const presets: Array<[Preset, string]> = [
      ["heating", `🔥 ${t("Heating")}`],
      ["light", `💡 ${t("Light / switch")}`],
      ["scene", `🎬 ${t("Scene")}`],
      ["script", `📜 ${t("Script")}`],
    ];
    return html`<div class="pop" role="region" aria-label=${t("What runs for this area")}>
      <div class="head">⚡ ${t("What runs")}<button aria-label=${t("Back to planning")} @click=${() => this._close()}>✕</button></div>
      <span class="muted">${t("Linked to this area's planning")}</span>
      ${this._renderItems(links)}
      <div class="presets">
        ${presets.map(
          ([p, label]) => html`<button class=${this._preset === p ? "active" : ""} @click=${() => { this._preset = this._preset === p ? null : p; this._entity = ""; this._whenOn = true; this._whenOff = p === "light"; }}>${label}</button>`,
        )}
        <button @click=${() => this.dispatchEvent(new CustomEvent("open-actions-editor", { bubbles: true, composed: true }))}>${t("Custom…")}</button>
      </div>
      ${this._preset === "heating" ? this._renderHeating() : this._preset ? this._renderEntityForm(this._preset) : nothing}
      ${this._error ? html`<div class="err">${this._error}</div>` : nothing}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-area-trigger-popover": ShareSpaceAreaTriggerPopover;
  }
}
