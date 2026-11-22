import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues } from "lit";
import { property, state } from "lit/decorators.js";
import { safeCustomElement } from "../define";
import { hassNow, hassTimeZone } from "../ha/hass";
import type { HomeAssistant } from "../ha/hass";
import {
  findZoneStrategies,
  listAreas,
  listStrategies,
  listZones,
  loadZoneRules,
  planningSchedule,
  saveZoneRules,
  stopZoneStrategies,
  strategyAutomationId,
  useZoneStrategy,
} from "../ha/ws";
import type { HeatingZone, SharedStrategy, ZoneRules } from "../ha/ws";
import { haTheme } from "../ha/theme";
import type { RuleStrategy } from "../rules/types";
import { sensorReadings } from "../rules/value";
import { strategyTimeline } from "./strategy-timeline";
import { plannedSpans } from "./week-preview";
import type { Span } from "./week-preview";
import type { StrategySegment } from "./strategy-sim";
import { fromWall, wallTime } from "./tz";

const CUSTOM = "__custom__";
const PANEL_PATH = "/share-space?tab=rules";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

// Zone strategy chooser: pick a shared strategy, preview the week, save; rule editing lives in the panel.
@safeCustomElement("share-space-strategy-editor")
export class ShareSpaceStrategyEditor extends LitElement {
  static styles = [
    haTheme,
    css`
      :host {
        display: block;
        color: var(--primary-text-color);
      }
      .wrap {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      button,
      select {
        min-height: 40px;
        box-sizing: border-box;
        font: inherit;
        color: var(--primary-text-color);
        background: transparent;
        border: 1px solid var(--divider-color);
        border-radius: 20px;
        padding: 0 14px;
        cursor: pointer;
      }
      select {
        border-radius: 8px;
        background: var(--card-background-color, #fff);
      }
      button.primary {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        border-color: transparent;
      }
      button:disabled {
        opacity: 0.5;
        cursor: default;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 0.85em;
        color: var(--secondary-text-color);
      }
      .muted {
        color: var(--secondary-text-color);
        font-size: 0.9em;
      }
      .err {
        color: var(--error-color);
        font-size: 0.9em;
      }
      .ok {
        color: var(--success-color, green);
        font-size: 0.9em;
      }
      .link {
        display: inline-flex;
        align-items: center;
        text-decoration: none;
        min-height: 40px;
        padding: 0 14px;
        border: 1px solid var(--divider-color);
        border-radius: 20px;
        color: var(--primary-text-color);
      }
    `,
  ];

  @property({ attribute: false }) hass?: HomeAssistant;
  @property() zone = "";
  @property() area = "";

  @state() private _shared: SharedStrategy[] = [];
  @state() private _current: ZoneRules | null = null;
  @state() private _zoneInfo: HeatingZone | undefined;
  @state() private _areas: Array<{ area_id: string; name: string }> = [];
  @state() private _choice = "";
  @state() private _areaId = "";
  @state() private _busy = false;
  @state() private _error = "";
  @state() private _notice = "";

  private _initFor = "";
  private _memo: { key: string; segments: StrategySegment[]; days: number[]; planned: Span[] } | null = null;

  private get _isAdmin(): boolean {
    return !!this.hass?.user?.is_admin;
  }

  private get _zoneName(): string {
    return String(this.hass?.states[this.zone]?.attributes.friendly_name ?? this.zone);
  }

  private get _id(): string {
    return this._current?.id ?? strategyAutomationId(this.zone);
  }

  private get _custom(): boolean {
    return !!this._current?.rules && !this._current.strategy;
  }

  protected willUpdate(changed: PropertyValues): void {
    if (this.hass && this.zone && this._isAdmin && this._initFor !== this.zone) {
      this._initFor = this.zone;
      void this._init();
    }
    if (changed.has("area") && this.area && !this._current) this._areaId = this.area;
  }

  private async _init(): Promise<void> {
    const hass = this.hass!;
    try {
      this._areas = (await listAreas(hass)).map((a) => ({ area_id: a.area_id, name: a.name }));
    } catch {
      this._areas = Object.values(hass.areas ?? {}).map((a) => ({ area_id: a.area_id, name: a.name }));
    }
    this._zoneInfo = (await listZones(hass).catch(() => [])).find((z) => z.entity_id === this.zone);
    await this._load();
  }

  private async _load(): Promise<void> {
    const hass = this.hass!;
    try {
      const [shared, current] = await Promise.all([listStrategies(hass), loadZoneRules(hass, this.zone)]);
      this._shared = shared;
      this._current = current;
      this._choice = current?.strategy ?? (this._custom ? CUSTOM : (shared[0]?.id ?? ""));
      this._areaId = current?.area || this._defaultArea();
    } catch (err) {
      this._error = this._msg(err);
    }
  }

  private _defaultArea(): string {
    if (this.area) return this.area;
    const zoneSlug = slug(this._zoneName);
    const match = this._areas.find((a) => a.area_id === zoneSlug || slug(a.name) === zoneSlug);
    return (match ?? this._areas[0])?.area_id ?? "";
  }

  private _msg(err: unknown): string {
    const e = err as { message?: string; body?: { message?: string } } | null;
    return e?.body?.message ?? e?.message ?? String(err);
  }

  private get _zoneRef(): Pick<HeatingZone, "entity_id" | "entry_id" | "presence_entity"> {
    return this._zoneInfo ?? { entity_id: this.zone, entry_id: "", presence_entity: null };
  }

  private async _act(fn: () => Promise<string>): Promise<void> {
    this._busy = true;
    this._error = "";
    this._notice = "";
    try {
      this._notice = await fn();
      await this._load();
      this.dispatchEvent(new CustomEvent("strategy-changed", { bubbles: true, composed: true }));
    } catch (err) {
      this._error = this._msg(err);
    } finally {
      this._busy = false;
    }
  }

  private _save(): Promise<void> {
    const s = this._shared.find((x) => x.id === this._choice);
    if (!s || !this._areaId) return Promise.resolve();
    const id = this._id;
    return this._act(async () => {
      await saveZoneRules(this.hass!, { entity_id: this.zone, name: this._zoneName }, this._areaId, { strategy: s.id, name: s.name }, id);
      await useZoneStrategy(() => this.hass!, this._zoneRef, id);
      return "Saved";
    });
  }

  private _toggle(on: boolean): Promise<void> {
    const id = this._id;
    return this._act(async () => {
      if (on) await useZoneStrategy(() => this.hass!, this._zoneRef, id);
      else await stopZoneStrategies(this.hass!, this.zone);
      return on ? "Enabled" : "Disabled";
    });
  }

  private _go(e: Event): void {
    e.preventDefault();
    const ev = new CustomEvent("navigate-requested", { detail: { path: PANEL_PATH }, bubbles: true, composed: true, cancelable: true });
    if (this.dispatchEvent(ev)) {
      history.pushState(null, "", PANEL_PATH);
      window.dispatchEvent(new CustomEvent("location-changed"));
    }
  }

  private get _rules(): RuleStrategy | null {
    if (this._choice === CUSTOM) return this._current?.rules ?? null;
    return this._shared.find((x) => x.id === this._choice)?.rules ?? null;
  }

  private _renderPreview() {
    const hass = this.hass!;
    const rules = this._rules;
    const schedule = this._areaId ? planningSchedule(hass, this._areaId) : null;
    if (!rules) return nothing;
    if (!schedule) return html`<div class="muted">No planning for this area, preview unavailable.</div>`;
    const tz = hassTimeZone(hass);
    const now = hassNow(hass);
    const w = wallTime(now, tz);
    const days = Array.from({ length: 8 }, (_, i) => fromWall(tz, w.year, w.month, w.day + i, 0, 0));
    const attrs = hass.states[this.zone]?.attributes;
    const temps = { comfort: Number(attrs?.comfort_temp ?? 21), eco: Number(attrs?.eco_temp ?? 17) };
    const readings = sensorReadings(rules, hass.states);
    const key = JSON.stringify([rules, schedule, days[0], temps, readings]);
    if (this._memo?.key !== key) {
      this._memo = { key, days, planned: plannedSpans(schedule, days, tz), segments: strategyTimeline(rules, schedule, days[0], days[7], tz, temps, readings) };
    }
    const m = this._memo;
    return html`<share-space-week-preview .segments=${m.segments} .planned=${m.planned} .days=${m.days} .now=${now} .tz=${tz}></share-space-week-preview>`;
  }

  protected render() {
    if (!this.hass || !this.zone) return nothing;
    const link = html`<a class="link" href=${PANEL_PATH} @click=${(e: Event) => this._go(e)}>Edit in panel</a>`;
    const auto = findZoneStrategies(this.hass, this.zone).find((a) => a.id === this._id);
    if (!this._isAdmin) {
      const on = findZoneStrategies(this.hass, this.zone).find((a) => a.enabled);
      return html`<div class="wrap">${on ? html`<div>Active: <strong>${on.name.split(" · ").pop()}</strong></div>` : html`<div class="muted">No strategy on this zone.</div>`}</div>`;
    }
    if (this._current && this._current.state !== "managed") {
      return html`<div class="wrap"><div class="muted">This zone's automation was changed outside Share Space.</div><div class="row">${link}</div></div>`;
    }
    const areas = [...this._areas];
    if (this._areaId && !areas.some((a) => a.area_id === this._areaId)) areas.push({ area_id: this._areaId, name: this._areaId });
    const savedChoice = this._current?.strategy ?? (this._custom ? CUSTOM : "");
    const shared = this._shared.some((x) => x.id === this._choice);
    const unchanged = this._choice === savedChoice && this._areaId === this._current?.area;
    return html`<div class="wrap">
      <div class="row">
        <label>Strategy<select .value=${this._choice} ?disabled=${this._busy} @change=${(e: Event) => (this._choice = (e.target as HTMLSelectElement).value)}>
          ${this._custom ? html`<option value=${CUSTOM} ?selected=${this._choice === CUSTOM}>Custom (edit in panel)</option>` : nothing}
          ${this._shared.map((x) => html`<option value=${x.id} ?selected=${x.id === this._choice}>${x.name}</option>`)}
        </select></label>
        <label>Area<select .value=${this._areaId} ?disabled=${this._busy || this._choice === CUSTOM} @change=${(e: Event) => (this._areaId = (e.target as HTMLSelectElement).value)}>
          <option value="">Choose…</option>
          ${areas.map((a) => html`<option value=${a.area_id} ?selected=${a.area_id === this._areaId}>${a.name}</option>`)}
        </select></label>
      </div>
      ${this._renderPreview()}
      <div class="row">
        ${shared ? html`<button class="primary" ?disabled=${this._busy || !this._areaId || (unchanged && !!auto?.enabled)} @click=${() => this._save()}>Save</button>` : nothing}
        ${auto && this._choice === savedChoice ? html`<button ?disabled=${this._busy} @click=${() => this._toggle(!auto.enabled)}>${auto.enabled ? "Disable" : "Enable"}</button>` : nothing}
        ${link}
      </div>
      ${auto ? html`<div class="muted">${auto.enabled ? "Active" : "Disabled"} · ${auto.name}</div>` : nothing}
      ${this._error ? html`<div class="err">${this._error}</div>` : nothing}
      ${this._notice ? html`<div class="ok">${this._notice}</div>` : nothing}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-strategy-editor": ShareSpaceStrategyEditor;
  }
}
