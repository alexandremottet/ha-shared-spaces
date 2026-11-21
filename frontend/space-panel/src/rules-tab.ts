import { LitElement, html, css, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "ha-share-space-ui";
import { STRATEGY_LABELS, isDirty, validateStrategy } from "ha-share-space-ui";
import type { ManagedState, PresetTemps, RuleStrategy, SavedRules, ScheduleRanges, StrategyPreset } from "ha-share-space-ui";
import { STRATEGY_KIND_LABELS } from "ha-share-space-ui/ha";
import type { AreaInfo, HeatingZone, StrategyKind } from "ha-share-space-ui/ha";

const PRESETS: StrategyPreset[] = ["office_saver", "lunch_room"];

// Rules page, props in / events out: zone-select, area-change, template-pick, draft-change, save, undo, discard,
// convert, reenable, take-back, detach, start-new, open-automation.
@customElement("share-space-rules-tab")
export class ShareSpaceRulesTab extends LitElement {
  @property({ attribute: false }) zones: HeatingZone[] | null = null;
  @property() zone = "";
  @property({ attribute: false }) areas: AreaInfo[] = [];
  @property() area = "";
  @property({ type: Boolean }) areaLocked = false;
  @property({ attribute: false }) draft: RuleStrategy | null = null;
  @property({ attribute: false }) saved: SavedRules | null = null;
  @property({ attribute: false }) schedule: ScheduleRanges | null = null;
  @property({ attribute: false }) temps?: PresetTemps;
  @property({ type: Number }) now = Date.now();
  @property() tz = "UTC";
  @property({ type: Boolean }) loading = false;
  @property({ type: Boolean }) busy = false;
  @property() error = "";
  @property({ attribute: false }) managed: ManagedState | null = null;
  @property({ attribute: false }) active: StrategyKind | null = null;
  @property({ type: Boolean }) rulesEnabled = false;
  @property({ attribute: false }) convertFrom: StrategyPreset | null = null;
  @property({ attribute: false }) keptDisabled: StrategyPreset | null = null;
  @property({ type: Boolean }) startingNew = false;
  @state() private _confirmNew = false;

  static styles = css`
    :host {
      display: block;
      padding: 16px 24px 48px;
      color: var(--primary-text-color);
      max-width: 900px;
      box-sizing: border-box;
    }
    h3 {
      margin: 0 0 12px;
    }
    h4 {
      margin: 20px 0 8px;
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .error {
      color: var(--error-color);
      margin: 8px 0;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin: 8px 0;
    }
    label {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    select,
    button {
      min-height: 44px;
      box-sizing: border-box;
      font: inherit;
      color: var(--primary-text-color);
      border: 1px solid var(--divider-color);
      border-radius: 22px;
      background: transparent;
      padding: 0 16px;
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
    button.link {
      min-height: 0;
      border: none;
      padding: 0;
      color: var(--primary-color);
      text-decoration: underline;
    }
    .banner {
      border: 1px solid var(--divider-color);
      border-left: 4px solid var(--warning-color, #ffa600);
      border-radius: 8px;
      padding: 8px 12px;
      margin: 8px 0;
    }
    .banner.info {
      border-left-color: var(--primary-color);
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `;

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("zone") || changed.has("managed")) this._confirmNew = false;
  }

  private _emit(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  private get _valid(): boolean {
    return !!this.draft && validateStrategy(this.draft).ok && this.area !== "";
  }

  private _zoneSelect(): TemplateResult {
    return html`<label
      >Zone
      <select aria-label="Heating zone" .value=${this.zone} ?disabled=${this.busy} @change=${(e: Event) => this._emit("zone-select", (e.target as HTMLSelectElement).value)}>
        <option value="" ?selected=${this.zone === ""}>Choose a zone</option>
        ${(this.zones ?? []).map((z) => html`<option value=${z.entity_id} ?selected=${z.entity_id === this.zone}>${z.name}</option>`)}
      </select></label
    >`;
  }

  private _areaField(): TemplateResult {
    const name = this.areas.find((a) => a.area_id === this.area)?.name ?? this.area;
    if (this.areaLocked) return html`<span>Area: <strong>${name}</strong></span>`;
    return html`<label
      >Area
      <select aria-label="Area" .value=${this.area} ?disabled=${this.busy} @change=${(e: Event) => this._emit("area-change", (e.target as HTMLSelectElement).value)}>
        <option value="" ?selected=${this.area === ""}>Choose an area</option>
        ${this.areas.map((a) => html`<option value=${a.area_id} ?selected=${a.area_id === this.area}>${a.name}</option>`)}
      </select></label
    >`;
  }

  private _templates(label: string, onPick: (p: StrategyPreset) => void): TemplateResult {
    return html`<div class="row">
      <span class="muted">${label}</span>
      ${PRESETS.map((p) => html`<button ?disabled=${this.busy} @click=${() => onPick(p)}>${STRATEGY_LABELS[p]}</button>`)}
    </div>`;
  }

  private _editor(draft: RuleStrategy): TemplateResult {
    const dirty = isDirty(draft, this.saved);
    const canSave = this._valid && (dirty || !this.rulesEnabled) && !this.busy;
    const conv = this.convertFrom && !this.saved ? STRATEGY_LABELS[this.convertFrom] : "";
    return html`
      ${this.startingNew
        ? html`<div class="banner info">New rules automation. Saving it disables the detached one.</div>`
        : nothing}
      ${conv
        ? html`<div class="banner info">Converting from ${conv}: review, then Save. The ${conv} automation will be kept disabled, not deleted.</div>`
        : nothing}
      ${this.keptDisabled
        ? html`<div class="row muted">
            Previous ${STRATEGY_LABELS[this.keptDisabled]} automation kept disabled.
            <button class="link" ?disabled=${this.busy} @click=${() => this._emit("reenable")}>Re-enable it</button>
          </div>`
        : nothing}
      ${this.saved && !this.rulesEnabled && !this.startingNew
        ? html`<div class="banner info">These rules are saved but not running. Save to use them.</div>`
        : nothing}
      <div class="row">${this._areaField()}</div>
      <share-space-rule-list .strategy=${draft} @strategy-change=${(e: CustomEvent<{ strategy: RuleStrategy }>) => {
          e.stopPropagation();
          this._emit("draft-change", e.detail.strategy);
        }}></share-space-rule-list>
      <h4>Preview</h4>
      ${this.schedule
        ? html`<share-space-rule-preview .strategy=${draft} .schedule=${this.schedule} .now=${this.now} .tz=${this.tz} .temps=${this.temps}></share-space-rule-preview>`
        : html`<div class="muted">${this.area ? "No planning for this area yet." : "Choose an area to see the preview."}</div>`}
      <div class="row">
        <button class="primary" ?disabled=${!canSave} @click=${() => this._emit("save")}>${this.busy ? "Saving…" : "Save"}</button>
        <button ?disabled=${this.busy || !this.saved?.previous} @click=${() => this._emit("undo")}>Undo last change</button>
        <button ?disabled=${this.busy || (!dirty && !!this.saved && !this.startingNew)} @click=${() => this._emit("discard")}>Discard</button>
        ${dirty && this.saved ? html`<span class="muted">Unsaved changes</span>` : nothing}
      </div>
      ${this._templates("Reset to template:", (p) => this._emit("template-pick", p))}
    `;
  }

  private _edited(): TemplateResult {
    const what = this.managed === "edited" ? "Edited outside Share Space" : "Not managed by Share Space";
    return html`<div class="banner" role="status">
        <strong>${what}.</strong>
        <div class="muted">Take back overwrites it with the last rules Share Space can read. Detach leaves it as a normal Home Assistant automation.</div>
      </div>
      <div class="row">${this._areaField()}</div>
      <div class="row">
        <button class="primary" ?disabled=${this.busy || !this.area} @click=${() => this._emit("take-back")}>Take back</button>
        <button ?disabled=${this.busy} @click=${() => this._emit("detach")}>Detach</button>
        <button class="link" @click=${() => this._emit("open-automation")}>Open in Home Assistant</button>
      </div>`;
  }

  private _detached(): TemplateResult {
    return html`<div class="banner info" role="status">
        This automation is detached; edit it in Home Assistant.
        <button class="link" @click=${() => this._emit("open-automation")}>Open automation</button>
      </div>
      ${this._confirmNew
        ? html`<div class="row">
            <span>Create a new rules automation for this zone? The detached one will be disabled.</span>
            <button class="primary" ?disabled=${this.busy} @click=${() => this._emit("start-new")}>Confirm</button>
            <button @click=${() => (this._confirmNew = false)}>Cancel</button>
          </div>`
        : html`<div class="row"><button ?disabled=${this.busy} @click=${() => (this._confirmNew = true)}>Start new rules</button></div>`}`;
  }

  private _empty(): TemplateResult {
    const conv = this.convertFrom ? STRATEGY_LABELS[this.convertFrom] : "";
    return html`<div class="row">${this._areaField()}</div>
      ${conv
        ? html`<div class="banner info row">
            This zone uses ${conv}.
            <button class="primary" ?disabled=${this.busy} @click=${() => this._emit("convert")}>Convert to rules</button>
          </div>`
        : html`<p class="muted">This zone has no custom rules yet.</p>`}
      ${this._templates("Start from template:", (p) => this._emit("template-pick", p))}`;
  }

  private _body(): TemplateResult {
    if (this.managed === "detached" && !this.startingNew) return this._detached();
    if (this.managed === "edited" || this.managed === "unmanaged") return this._edited();
    return this.draft ? this._editor(this.draft) : this._empty();
  }

  protected render(): TemplateResult {
    if (this.zones === null) return html`<div class="muted">Loading…</div>`;
    return html`
      <h3>Rules</h3>
      <div class="row">${this._zoneSelect()}</div>
      ${this.zones.length === 0 ? html`<div class="muted">No heating zone yet.</div>` : nothing}
      ${this.error ? html`<div class="error" role="alert">${this.error}</div>` : nothing}
      ${!this.zone
        ? nothing
        : this.loading
          ? html`<div class="muted">Loading…</div>`
          : html`<div class="row muted">Active: <strong>${this.active ? STRATEGY_KIND_LABELS[this.active] : "no strategy automation"}</strong></div>
              ${this._body()}`}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rules-tab": ShareSpaceRulesTab;
  }
}
