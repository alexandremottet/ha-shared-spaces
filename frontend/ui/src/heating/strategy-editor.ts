import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues } from "lit";
import { property, state } from "lit/decorators.js";
import { safeCustomElement } from "../define";
import { hassNow, hassTimeZone } from "../ha/hass";
import type { HomeAssistant } from "../ha/hass";
import {
  deleteStrategyAutomation,
  findZoneStrategies,
  findZoneStrategiesByConfig,
  getAutomationConfig,
  listAreas,
  planningSchedule,
  saveStrategyAutomation,
  setAutomationEnabled,
  strategyAutomationId,
  strategyBlueprintPath,
} from "../ha/ws";
import type { StrategyAutomation } from "../ha/ws";
import { haTheme } from "../ha/theme";
import { STRATEGY_LABELS, defaultInputs } from "./strategy-sim";
import { strategyTimeline } from "./strategy-timeline";
import "./week-preview";
import type { StrategyInputs, StrategyPreset, StrategySegment } from "./strategy-sim";
import { fromWall, wallTime } from "./tz";

type Fields = Record<string, number | string>;

const PRESETS: StrategyPreset[] = ["office_saver", "lunch_room"];
const DAY_MS = 86400000;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
export const normalizeTime = (v: unknown): unknown => (typeof v === "string" && TIME_RE.test(v) ? v.slice(0, 5) : v);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

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
      select,
      input {
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
      select,
      input {
        border-radius: 8px;
        background: var(--card-background-color, #fff);
        cursor: auto;
      }
      input {
        width: 90px;
      }
      button.active,
      button.primary {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        border-color: transparent;
      }
      button.danger {
        color: var(--error-color);
        border-color: var(--error-color);
      }
      button:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .fields {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 8px;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 0.85em;
        color: var(--secondary-text-color);
      }
      .field input,
      .field select {
        width: 100%;
        font-size: 1.1em;
      }
      .desc,
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

  @state() private _preset: StrategyPreset = "office_saver";
  @state() private _areaId = "";
  @state() private _fields: Fields = {};
  @state() private _areas: Array<{ area_id: string; name: string }> = [];
  @state() private _renamed = new Map<StrategyPreset, StrategyAutomation>();
  @state() private _saved = new Set<string>();
  @state() private _busy = false;
  @state() private _error = "";
  @state() private _notice = "";
  @state() private _confirmDelete = false;

  private _token = 0;
  private _initFor = "";
  private _memo: { key: string; segments: StrategySegment[]; days: number[] } | null = null;

  private get _isAdmin(): boolean {
    return !!this.hass?.user?.is_admin;
  }

  private get _strategies(): StrategyAutomation[] {
    return this.hass && this.zone ? findZoneStrategies(this.hass, this.zone) : [];
  }

  private get _existing(): StrategyAutomation | undefined {
    return this._strategies.find((a) => a.preset === this._preset) ?? this._renamed.get(this._preset);
  }

  private get _id(): string {
    return this._existing?.id ?? strategyAutomationId(this.zone, this._preset);
  }

  private get _zoneName(): string {
    return String(this.hass?.states[this.zone]?.attributes.friendly_name ?? this.zone);
  }

  protected willUpdate(changed: PropertyValues): void {
    if (this.hass && this.zone && this._initFor !== this.zone) {
      this._initFor = this.zone;
      void this._init();
    }
    if (changed.has("area") && this.area && !this._existing) this._areaId = this.area;
  }

  private async _init(): Promise<void> {
    const hass = this.hass!;
    try {
      this._areas = (await listAreas(hass)).map((a) => ({ area_id: a.area_id, name: a.name }));
    } catch {
      this._areas = Object.values(hass.areas ?? {}).map((a) => ({ area_id: a.area_id, name: a.name }));
    }
    const first = this._strategies.find((a) => a.enabled) ?? this._strategies[0];
    await this._loadPreset(first?.preset ?? this._preset);
  }

  private _defaultArea(): string {
    if (this.area) return this.area;
    const zoneSlug = slug(this._zoneName);
    const match = this._areas.find((a) => a.area_id === zoneSlug || slug(a.name) === zoneSlug);
    return (match ?? this._areas[0])?.area_id ?? "";
  }

  private async _loadPreset(preset: StrategyPreset): Promise<void> {
    const token = ++this._token;
    this._preset = preset;
    this._error = "";
    this._notice = "";
    this._confirmDelete = false;
    this._fields = { ...defaultInputs(preset) } as unknown as Fields;
    this._areaId = this._defaultArea();
    if (!this._existing && this._isAdmin && this.hass && this.zone) {
      const found = await findZoneStrategiesByConfig(this.hass, this.zone, preset);
      if (token !== this._token) return;
      if (found) this._renamed = new Map(this._renamed).set(preset, found);
    }
    if (!this._existing || !this._isAdmin || !this.hass) return;
    try {
      const cfg = await getAutomationConfig(this.hass, this._id);
      if (token !== this._token) return;
      const { zone: _zone, area, ...inputs } = cfg.use_blueprint.input as Fields;
      const merged: Fields = { ...(defaultInputs(preset) as unknown as Fields), ...inputs };
      for (const k of Object.keys(merged)) if (/_(start|end)$/.test(k)) merged[k] = String(normalizeTime(merged[k]));
      this._fields = merged;
      if (area) this._areaId = String(area);
    } catch (err) {
      if (token === this._token) this._error = this._msg(err);
    }
  }

  private _msg(err: unknown): string {
    const e = err as { message?: string; body?: { message?: string } } | null;
    return e?.body?.message ?? e?.message ?? String(err);
  }

  private _inputs(): StrategyInputs {
    const out: Record<string, unknown> = { ...this._fields };
    for (const [k, v] of Object.entries(defaultInputs(this._preset))) {
      if (typeof v === "number") out[k] = Number(out[k]);
      else if (/_(start|end)$/.test(k)) out[k] = normalizeTime(out[k]);
    }
    return out as unknown as StrategyInputs;
  }

  private _validate(): string {
    if (!this._areaId) return "Choose an area.";
    const inputs = this._inputs() as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(inputs)) {
      if (typeof v === "number" && !Number.isFinite(v)) return `Invalid number: ${k}`;
      if (/_(start|end)$/.test(k) && !TIME_RE.test(String(v))) return `Invalid time: ${k}`;
    }
    return "";
  }

  private async _act(fn: () => Promise<string | void>): Promise<void> {
    this._busy = true;
    this._error = "";
    this._notice = "";
    try {
      this._notice = (await fn()) ?? "";
      this.dispatchEvent(new CustomEvent("strategy-changed", { bubbles: true, composed: true }));
    } catch (err) {
      this._error = this._msg(err);
    } finally {
      this._busy = false;
    }
  }

  private _save(): Promise<void> {
    const invalid = this._validate();
    if (invalid) {
      this._error = invalid;
      return Promise.resolve();
    }
    return this._act(async () => {
      const existed = !!this._existing || this._saved.has(this._id);
      await saveStrategyAutomation(this.hass!, this._id, {
        alias: `Share Space · ${this._zoneName} · ${STRATEGY_LABELS[this._preset]}`,
        description: "",
        use_blueprint: {
          path: strategyBlueprintPath(this._preset),
          input: { zone: this.zone, area: this._areaId, ...(this._inputs() as unknown as Record<string, unknown>) },
        },
      });
      this._saved = new Set(this._saved).add(this._id);
      return existed ? "Updated" : "Created";
    });
  }

  private _toggle(entity: StrategyAutomation): Promise<void> {
    return this._act(async () => {
      await setAutomationEnabled(this.hass!, entity.entityId, !entity.enabled);
      return entity.enabled ? "Disabled" : "Enabled";
    });
  }

  private _delete(): Promise<void> {
    return this._act(async () => {
      await deleteStrategyAutomation(this.hass!, this._id);
      const next = new Set(this._saved);
      next.delete(this._id);
      this._saved = next;
      this._confirmDelete = false;
      return "Deleted";
    });
  }

  private _go(path: string, e?: Event): void {
    e?.preventDefault();
    const ev = new CustomEvent("navigate-requested", { detail: { path }, bubbles: true, composed: true, cancelable: true });
    if (this.dispatchEvent(ev)) {
      history.pushState(null, "", path);
      window.dispatchEvent(new CustomEvent("location-changed"));
    }
  }

  private _set(key: string, value: string, numeric: boolean): void {
    this._fields = { ...this._fields, [key]: numeric ? (value === "" ? NaN : Number(value)) : value };
  }

  private _numField(key: string, label: string, step = 0.5) {
    const v = this._fields[key];
    return html`<label class="field">${label}<input type="number" step=${step} .value=${typeof v === "number" && Number.isNaN(v) ? "" : String(v ?? "")} @input=${(e: Event) => this._set(key, (e.target as HTMLInputElement).value, true)} /></label>`;
  }

  private _timeField(key: string, label: string) {
    return html`<label class="field">${label}<input type="time" .value=${String(this._fields[key] ?? "")} @input=${(e: Event) => this._set(key, (e.target as HTMLInputElement).value, false)} /></label>`;
  }

  private _renderForm() {
    const areas = [...this._areas];
    if (this._areaId && !areas.some((a) => a.area_id === this._areaId)) areas.push({ area_id: this._areaId, name: this._areaId });
    const area = html`<label class="field">Area<select .value=${this._areaId} @change=${(e: Event) => (this._areaId = (e.target as HTMLSelectElement).value)}>
      <option value="">Choose…</option>
      ${areas.map((a) => html`<option value=${a.area_id} ?selected=${a.area_id === this._areaId}>${a.name}</option>`)}
    </select></label>`;
    if (this._preset === "office_saver") {
      return html`<div class="desc">Comfort while occupied, preheat before the next day, setback between working days, off when away.</div>
        <div class="fields">${area}${this._numField("comfort_temp", "Comfort °C")}${this._numField("setback_temp", "Setback °C")}${this._numField("preheat_hours", "Preheat hours", 0.5)}${this._numField("max_gap_hours", "Max gap hours", 1)}</div>`;
    }
    return html`<div class="desc">Heat at lunch only when the area is planned in both windows (or either, with "any").</div>
      <div class="fields">${area}${this._numField("temperature", "Temperature °C")}
        <label class="field">Match<select .value=${String(this._fields.match ?? "all")} @change=${(e: Event) => this._set("match", (e.target as HTMLSelectElement).value, false)}>
          <option value="all" ?selected=${this._fields.match !== "any"}>all windows</option>
          <option value="any" ?selected=${this._fields.match === "any"}>any window</option>
        </select></label>
        ${this._timeField("morning_start", "Morning from")}${this._timeField("morning_end", "Morning to")}${this._timeField("afternoon_start", "Afternoon from")}${this._timeField("afternoon_end", "Afternoon to")}
        ${this._timeField("heat_start", "Heat from")}${this._timeField("heat_end", "Heat to")}</div>`;
  }

  private _segments(tz: string, now: number): { segments: StrategySegment[]; days: number[] } | null {
    const hass = this.hass!;
    const schedule = this._areaId ? planningSchedule(hass, this._areaId) : null;
    if (!schedule) return null;
    const w = wallTime(now, tz);
    const days = Array.from({ length: 8 }, (_, i) => fromWall(tz, w.year, w.month, w.day + i, 0, 0));
    const key = [this._preset, JSON.stringify(this._inputs()), this._areaId, days[0], JSON.stringify(schedule)].join("|");
    if (this._memo?.key !== key) {
      this._memo = { key, days, segments: strategyTimeline(this._preset, this._inputs(), schedule, days[0], days[7], tz) };
    }
    return this._memo;
  }

  private _renderPreview() {
    if (!this.hass) return nothing;
    const tz = hassTimeZone(this.hass);
    const now = hassNow(this.hass);
    const sim = this._segments(tz, now);
    if (!sim) return html`<div class="muted">No planning for this area, preview unavailable.</div>`;
    return html`<share-space-week-preview .segments=${sim.segments} .days=${sim.days} .now=${now} .tz=${tz}></share-space-week-preview>`;
  }

  protected render() {
    if (!this.hass || !this.zone) return nothing;
    if (!this._isAdmin) {
      const list = this._strategies;
      return html`<div class="wrap">${list.length === 0
        ? html`<div class="muted">No strategy on this zone.</div>`
        : list.map((a) => html`<div>${STRATEGY_LABELS[a.preset]} <span class="muted">· ${a.enabled ? "active" : "disabled"}</span></div>`)}</div>`;
    }
    const existing = this._existing;
    const exists = !!existing || this._saved.has(this._id);
    return html`<div class="wrap">
      <div class="row">
        ${PRESETS.map((p) => html`<button class=${this._preset === p ? "active" : ""} ?disabled=${this._busy} @click=${() => this._loadPreset(p)}>${STRATEGY_LABELS[p]}</button>`)}
      </div>
      ${this._renderForm()} ${this._renderPreview()}
      <div class="row">
        <button class="primary" ?disabled=${this._busy} @click=${() => this._save()}>${exists ? "Update" : "Create"}</button>
        ${existing ? html`<button ?disabled=${this._busy} @click=${() => this._toggle(existing)}>${existing.enabled ? "Disable" : "Enable"}</button>` : nothing}
        ${exists
          ? this._confirmDelete
            ? html`<button class="danger" ?disabled=${this._busy} @click=${() => this._delete()}>Really delete?</button>`
            : html`<button class="danger" ?disabled=${this._busy} @click=${() => (this._confirmDelete = true)}>Delete</button>`
          : nothing}
        ${exists ? html`<a class="link" href="/config/automation/edit/${this._id}" @click=${(e: Event) => this._go(`/config/automation/edit/${this._id}`, e)}>Open in HA</a>` : nothing}
        <a class="link" href="/config/automation/edit/new" @click=${(e: Event) => this._go("/config/automation/edit/new", e)}>Custom…</a>
      </div>
      ${existing ? html`<div class="muted">${existing.enabled ? "Active" : "Disabled"} · ${existing.name}</div>` : nothing}
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
