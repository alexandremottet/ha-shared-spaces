import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues } from "lit";
import { property, state } from "lit/decorators.js";
import { safeCustomElement } from "../define";
import type { HomeAssistant } from "./hass";
import { getAreaActions, isBackendMissing, listZones, setAreaActions, updateZone } from "./ws";
import type { AreaActions, HeatingZone, PlanningAction } from "./ws";
import { haTheme } from "./theme";
import "../heating/strategy-editor";

type Side = "on" | "off";
type Preset = "heating" | "light" | "scene" | "script";

export interface LinkChip {
  key: string;
  icon: string;
  label: string;
  kind: "zone" | "action";
  side?: Side;
  index?: number;
  entryId?: string;
  domain?: string;
}

export interface AreaLinks {
  on: LinkChip[];
  off: LinkChip[];
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

export function summarizeAreaLinks(
  actions: AreaActions | null,
  zones: HeatingZone[],
  hass: HomeAssistant | undefined,
  area?: string,
): AreaLinks {
  const zoneChips: LinkChip[] = area
    ? zones
        .filter((z) => z.presence_entity === sensorOf(area))
        .map((z) => ({ key: `zone:${z.entry_id}`, icon: "🔥", label: z.name, kind: "zone", entryId: z.entry_id, domain: "climate" }))
    : [];
  const fromActions = (side: Side): LinkChip[] =>
    ((side === "on" ? actions?.on_actions : actions?.off_actions) ?? []).map((a, index) => {
      const service = String(a.action ?? a.service ?? "");
      const domain = service.split(".")[0] ?? "";
      const ids = entityIds(a);
      const first = ids[0] ? nameOf(hass, ids[0]) : service || "action";
      const label = ids.length > 1 ? `${first} +${ids.length - 1}` : first;
      return { key: `${side}:${index}`, icon: ICONS[domain] ?? "⚙️", label, kind: "action", side, index, domain };
    });
  return { on: [...zoneChips, ...fromActions("on")], off: [...zoneChips, ...fromActions("off")] };
}

const NOUNS: Record<string, string> = { light: "lights", switch: "switches", fan: "fans", scene: "scenes", script: "scripts", climate: "zones" };

export function formatLinkChips(chips: LinkChip[]): string {
  const groups = new Map<string, LinkChip[]>();
  for (const c of chips) {
    const k = `${c.icon}|${c.domain ?? ""}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const parts: string[] = [];
  for (const list of groups.values()) {
    const [head] = list;
    parts.push(list.length > 1 ? `${head.icon} ${list.length} ${NOUNS[head.domain ?? ""] ?? "actions"}` : `${head.icon} ${head.label}`);
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
        position: fixed;
        z-index: 1000;
        box-sizing: border-box;
        width: min(380px, calc(100vw - 32px));
        max-height: calc(100vh - 32px);
        overflow: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        border-radius: var(--ha-card-border-radius, 12px);
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color);
        box-shadow: var(--ha-card-box-shadow, 0 6px 24px rgba(0, 0, 0, 0.25));
      }
      .pop.sheet {
        left: 0 !important;
        right: 0;
        bottom: 0;
        top: auto !important;
        width: auto;
        max-height: 85vh;
        border-radius: 16px 16px 0 0;
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
  @property({ attribute: false }) anchor: DOMRect | null = null;

  @state() private _side: Side = "on";
  @state() private _preset: Preset | null = null;
  @state() private _actions: AreaActions | null = null;
  @state() private _zones: HeatingZone[] | null = null;
  @state() private _busy = false;
  @state() private _error = "";
  @state() private _entity = "";
  @state() private _alsoOff = true;
  @state() private _climate = "";
  @state() private _tempOn = "";
  @state() private _tempOff = "";
  @state() private _strategyZone = "";

  private _onDocPointer = (e: Event): void => {
    if (!e.composedPath().includes(this.shadowRoot!.querySelector(".pop") as EventTarget)) {
      this._close();
    }
  };
  private _onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      this._close();
    }
  };

  private get _isAdmin(): boolean {
    return !!this.hass?.user?.is_admin;
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("open")) {
      if (this.open) {
        document.addEventListener("pointerdown", this._onDocPointer, true);
        document.addEventListener("keydown", this._onKey);
        this._preset = null;
        this._strategyZone = "";
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
    document.removeEventListener("pointerdown", this._onDocPointer, true);
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
    if (actions.status === "rejected" && !isBackendMissing(actions.reason)) {
      this._error = (actions.reason as Error)?.message ?? String(actions.reason);
    }
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

  private async _removeChip(chip: LinkChip): Promise<void> {
    if (chip.kind === "zone") {
      await this._run(() => updateZone(this.hass!, chip.entryId!, { presence_entity: null }));
      return;
    }
    await this._run(async () => {
      const current = await getAreaActions(this.hass!, this.area);
      const key = chip.side === "on" ? "on_actions" : "off_actions";
      await setAreaActions(this.hass!, this.area, { [key]: current[key].filter((_, i) => i !== chip.index) });
    });
  }

  private _link(zone: HeatingZone, on: boolean): Promise<void> {
    const patch: Parameters<typeof updateZone>[2] = { presence_entity: on ? sensorOf(this.area) : null };
    if (on && this._tempOn !== "") patch.comfort_temp = Number(this._tempOn);
    if (on && this._tempOff !== "") patch.eco_temp = Number(this._tempOff);
    return this._run(() => updateZone(this.hass!, zone.entry_id, patch));
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
      <option value="">Choose…</option>
      ${this._optionIds(domains).map((id) => html`<option value=${id} ?selected=${id === value}>${nameOf(this.hass, id)}</option>`)}
    </select>`;
  }

  private _renderHeating() {
    const zones = this._zones;
    if (zones && zones.length > 0) {
      return html`<div class="form">
        <div class="row">
          <span class="muted">Occupied °C</span><input type="number" step="0.5" .value=${this._tempOn} @input=${(e: Event) => (this._tempOn = (e.target as HTMLInputElement).value)} />
          <span class="muted">Empty °C</span><input type="number" step="0.5" .value=${this._tempOff} @input=${(e: Event) => (this._tempOff = (e.target as HTMLInputElement).value)} />
        </div>
        ${zones.map((z) => {
          const mine = z.presence_entity === sensorOf(this.area);
          const other = z.presence_entity && !mine ? z.presence_entity.replace("binary_sensor.share_space_", "") : "";
          return html`<div class="zone">
            <span>${z.name}${other ? html`<br /><span class="muted">follows ${other}</span>` : nothing}</span>
            ${mine
              ? html`<button ?disabled=${this._busy} @click=${() => this._link(z, false)}>Unlink</button>`
              : html`<button class="primary" ?disabled=${this._busy} @click=${() => this._link(z, true)}>${other ? "Switch here" : "Follow"}</button>`}
            <button class=${this._strategyZone === z.entity_id ? "active" : ""} @click=${() => (this._strategyZone = this._strategyZone === z.entity_id ? "" : z.entity_id)}>Follow with strategy…</button>
          </div>`;
        })}
        ${this._strategyZone
          ? html`<share-space-strategy-editor .hass=${this.hass} .zone=${this._strategyZone} .area=${this.area} @strategy-changed=${() => this._changed()}></share-space-strategy-editor>`
          : nothing}
      </div>`;
    }
    const noTemp = this._tempOn === "" || this._tempOff === "" || !this._climate;
    return html`<div class="form">
      <span class="muted">${zones === null ? "No heating zones available." : "No heating zones yet."} Set a thermostat directly:</span>
      ${this._picker(["climate"], this._climate, (v) => (this._climate = v))}
      <div class="row">
        <span class="muted">Occupied °C</span><input type="number" step="0.5" .value=${this._tempOn} @input=${(e: Event) => (this._tempOn = (e.target as HTMLInputElement).value)} />
        <span class="muted">Empty °C</span><input type="number" step="0.5" .value=${this._tempOff} @input=${(e: Event) => (this._tempOff = (e.target as HTMLInputElement).value)} />
      </div>
      <button
        class="primary"
        ?disabled=${this._busy || noTemp}
        @click=${() => {
          const mk = (t: string): PlanningAction => ({ action: "climate.set_temperature", target: { entity_id: this._climate }, data: { temperature: Number(t) } });
          void this._addActions({ on: [mk(this._tempOn)], off: [mk(this._tempOff)] });
        }}
      >
        Add
      </button>
    </div>`;
  }

  private _renderEntityForm(preset: Preset) {
    const domains = preset === "light" ? PICKER_DOMAINS : [preset];
    const submit = () => {
      const domain = this._entity.split(".")[0];
      const act = (verb: string): PlanningAction => ({ action: `${domain}.${verb}`, target: { entity_id: this._entity } });
      if (preset === "light") {
        void this._addActions({ on: [act("turn_on")], off: this._alsoOff ? [act("turn_off")] : [] });
      } else {
        void this._addActions({ [this._side]: [act("turn_on")] });
      }
    };
    return html`<div class="form">
      ${this._picker(domains, this._entity, (v) => (this._entity = v))}
      ${preset === "light"
        ? html`<label><input type="checkbox" .checked=${this._alsoOff} @change=${(e: Event) => (this._alsoOff = (e.target as HTMLInputElement).checked)} />Also turn off when empty</label>`
        : html`<span class="muted">Runs ${this._side === "on" ? "when occupied" : "when empty"}</span>`}
      <button class="primary" ?disabled=${this._busy || !this._entity} @click=${submit}>Add</button>
    </div>`;
  }

  private _renderChips(chips: LinkChip[]) {
    if (chips.length === 0) {
      return html`<div class="muted">Nothing linked yet.</div>`;
    }
    return html`<div class="chips">
      ${chips.map(
        (c) => html`<span class="chip">${c.icon} ${c.label}<button title="Remove" aria-label="Remove ${c.label}" ?disabled=${this._busy} @click=${() => this._removeChip(c)}>✕</button></span>`,
      )}
    </div>`;
  }

  private _position(): string {
    const a = this.anchor;
    if (!a || window.innerWidth < 560) {
      return "";
    }
    const width = Math.min(380, window.innerWidth - 32);
    const left = Math.max(16, Math.min(a.left, window.innerWidth - width - 16));
    const top = Math.max(16, Math.min(a.bottom + 8, window.innerHeight - 240));
    return `left:${left}px;top:${top}px;max-height:${window.innerHeight - top - 16}px`;
  }

  protected render() {
    if (!this.open || !this._isAdmin) {
      return nothing;
    }
    const links = summarizeAreaLinks(this._actions, this._zones ?? [], this.hass, this.area);
    const presets: Array<[Preset, string]> = [
      ["heating", "🔥 Heating"],
      ["light", "💡 Light / switch"],
      ["scene", "🎬 Scene"],
      ["script", "📜 Script"],
    ];
    return html`<div class="pop ${window.innerWidth < 560 ? "sheet" : ""}" style=${this._position()} role="dialog" aria-label="What runs for this area">
      <div class="head">⚡ What runs<button aria-label="Close" @click=${() => this._close()}>✕</button></div>
      <div class="tabs">
        <button class=${this._side === "on" ? "active" : ""} @click=${() => (this._side = "on")}>When occupied (ON)</button>
        <button class=${this._side === "off" ? "active" : ""} @click=${() => (this._side = "off")}>When empty (OFF)</button>
      </div>
      ${this._renderChips(this._side === "on" ? links.on : links.off)}
      <div class="presets">
        ${presets.map(
          ([p, label]) => html`<button class=${this._preset === p ? "active" : ""} @click=${() => { this._preset = this._preset === p ? null : p; this._entity = ""; }}>${label}</button>`,
        )}
        <button @click=${() => this.dispatchEvent(new CustomEvent("open-actions-editor", { bubbles: true, composed: true }))}>Custom…</button>
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
