import { LitElement, html, css, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "ha-share-space-ui";
import { haCardSurface, isDirty, t, validateStrategy } from "ha-share-space-ui";
import type { EntityStates, ManagedState, SensorReadings, PersonPlannings, PresetTemps, RuleStrategy, SavedRules, ScheduleRanges } from "ha-share-space-ui";
import { nameTaken } from "ha-share-space-ui/ha";
import type { AreaInfo, HeatingZone, SharedStrategy } from "ha-share-space-ui/ha";

const NEW_SHARED = "__new__";

// Rules page, props in / events out: zone-select, draft-change, save, undo, discard, take-back, detach,
// start-new, open-automation, strategy-choose, strategy-share, strategy-rename, strategy-delete, make-copy.
@customElement("share-space-rules-tab")
export class ShareSpaceRulesTab extends LitElement {
  @property({ attribute: false }) zones: HeatingZone[] | null = null;
  @property() zone = "";
  @property({ attribute: false }) areas: AreaInfo[] = [];
  @property() area = "";
  @property({ attribute: false }) draft: RuleStrategy | null = null;
  @property({ attribute: false }) saved: SavedRules | null = null;
  @property({ attribute: false }) schedule: ScheduleRanges | null = null;
  /** Each person's own planning, for rules about one person. */
  @property({ attribute: false }) plannings?: PersonPlannings;
  @property({ attribute: false }) temps?: PresetTemps;
  @property({ attribute: false }) readings?: SensorReadings;
  @property({ attribute: false }) states?: EntityStates;
  /** Other areas by id, offered by "Another area heated". */
  @property({ attribute: false }) areaNames: Record<string, string> = {};
  @property({ type: Number }) now = Date.now();
  @property() tz = "UTC";
  @property({ type: Boolean }) loading = false;
  @property({ type: Boolean }) busy = false;
  @property() error = "";
  @property({ attribute: false }) managed: ManagedState | null = null;
  @property({ type: Boolean }) active = false;
  @property({ type: Boolean }) rulesEnabled = false;
  @property({ type: Boolean }) startingNew = false;
  @property({ attribute: false }) shared: SharedStrategy[] | null = null;
  @property() choice = "";
  @property({ attribute: false }) zoneOn: string | null = null;
  @property({ type: Boolean }) missingShared = false;
  @property({ attribute: false }) users: Record<string, string[]> = {};
  @property({ type: Boolean }) switching = false;
  /** HA automations or Scheduler items heating this area, turned off when these rules are saved. */
  @property({ attribute: false }) turnsOff: string[] = [];
  @state() private _confirmNew = false;
  @state() private _naming: "share" | "rename" | null = null;
  @state() private _name = "";
  @state() private _confirmDelete = false;
  @state() private _menuOpen = false;
  @state() private _hl: string | null = null;

  static styles = css`
    :host {
      display: block;
      padding: 8px 0 0;
      color: var(--primary-text-color);
      box-sizing: border-box;
      container-type: inline-size;
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
    input,
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
    select,
    input {
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
      ${haCardSurface}
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
    button:focus-visible,
    select:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .bar {
      ${haCardSurface}
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      margin: 8px 0;
      padding: 8px 12px;
    }
    .preview-col {
      ${haCardSurface}
      padding: 12px;
    }
    .bar label,
    .bar .field {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bar .sep {
      color: var(--secondary-text-color);
    }
    .chip {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 0 12px;
      border-radius: 14px;
      border: 1px solid var(--divider-color);
      font-size: 0.85em;
      white-space: nowrap;
    }
    .chip.shared {
      border-color: var(--primary-color);
      color: var(--primary-color);
    }
    .chip.off {
      color: var(--secondary-text-color);
    }
    .menu-wrap {
      position: relative;
      margin-left: auto;
    }
    .menu-btn {
      min-width: 44px;
      padding: 0;
      font-size: 1.4em;
      line-height: 1;
    }
    .menu {
      position: absolute;
      right: 0;
      top: calc(100% + 4px);
      z-index: 10;
      min-width: 240px;
      max-width: min(340px, 90vw);
      display: flex;
      flex-direction: column;
      padding: 4px;
      ${haCardSurface}
      background: var(--mdc-theme-surface, var(--card-background-color, #fff));
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }
    .menu button {
      border: none;
      border-radius: 8px;
      text-align: left;
      padding: 8px 12px;
      display: block;
    }
    .menu button:hover:not(:disabled) {
      background: var(--secondary-background-color);
    }
    .menu button.danger {
      color: var(--error-color);
    }
    .menu .reason {
      display: block;
      font-size: 0.8em;
      color: var(--secondary-text-color);
    }
    .cols {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
      margin-top: 12px;
      align-items: start;
    }
    .cols h4 {
      margin: 0 0 8px;
    }
    @container (min-width: 900px) {
      .cols {
        grid-template-columns: minmax(300px, 2fr) minmax(0, 3fr);
        gap: 24px;
      }
      .preview-col {
        position: sticky;
        top: 8px;
      }
    }
    .actions {
      position: sticky;
      bottom: 0;
      z-index: 5;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin: 16px 0 8px;
      padding: 8px 12px;
      ${haCardSurface}
    }
    .actions .muted {
      margin-left: 4px;
    }
  `;

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("zone") || changed.has("managed")) this._confirmNew = false;
    if (changed.has("zone") || changed.has("choice")) {
      this._naming = null;
      this._confirmDelete = false;
      this._menuOpen = false;
    }
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("_menuOpen" as keyof ShareSpaceRulesTab)) {
      if (this._menuOpen) {
        window.addEventListener("click", this._onOutside);
        window.addEventListener("keydown", this._onKey);
      } else this._unlisten();
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unlisten();
  }

  private _unlisten(): void {
    window.removeEventListener("click", this._onOutside);
    window.removeEventListener("keydown", this._onKey);
  }

  private _onOutside = (e: Event): void => {
    if (!e.composedPath().includes(this.renderRoot.querySelector(".menu-wrap") as EventTarget)) this._menuOpen = false;
  };

  private _onKey = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    this._menuOpen = false;
    (this.renderRoot.querySelector(".menu-btn") as HTMLElement | null)?.focus();
  };

  private _emit(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  private get _valid(): boolean {
    return !!this.draft && validateStrategy(this.draft).ok && this.area !== "";
  }

  private _areaName(z: HeatingZone): string {
    return (z.area_id && this.areas.find((a) => a.area_id === z.area_id)?.name) || z.name;
  }

  // One entry per area with heating; the value stays the zone entity behind it.
  private _zoneSelect(): TemplateResult {
    const zones = [...(this.zones ?? [])].sort((a, b) => this._areaName(a).localeCompare(this._areaName(b)));
    return html`<label
      ><span class="sep">${t("Area")}</span>
      <select aria-label=${t("Area")} .value=${this.zone} ?disabled=${this.busy} @change=${(e: Event) => this._emit("zone-select", (e.target as HTMLSelectElement).value)}>
        <option value="" ?selected=${this.zone === ""}>${t("Choose an area")}</option>
        ${zones.map((z) => html`<option value=${z.entity_id} ?selected=${z.entity_id === this.zone}>${this._areaName(z)}</option>`)}
      </select></label
      >${this.zones && !this.zones.length
        ? html`<div class="banner" role="status">${t("No heating yet: set it up in Settings → Heating.")}</div>`
        : nothing}`;
  }

  // Why the selected heating cannot take rules: HA gives its thermostat no area, or the area has several.
  private _areaProblem(): TemplateResult | typeof nothing {
    const z = this.zones?.find((x) => x.entity_id === this.zone);
    if (!z || this.area) return nothing;
    const text = z.area_conflict
      ? t("Several heating zones are in {area}. Keep one thermostat per area in Home Assistant (Settings → Entities).", { area: this._areaName(z) })
      : t("{entity} has no area. Assign it to an area in Home Assistant (Settings → Entities).", { entity: z.climate_entity });
    return html`<div class="banner" role="status">${text}</div>`;
  }

  private _sharedName(id: string | null): string {
    return this.shared?.find((s) => s.id === id)?.name ?? "";
  }

  private _pickerChange(e: Event): void {
    const sel = e.target as HTMLSelectElement;
    if (sel.value === NEW_SHARED) {
      sel.value = this.choice;
      this._startNaming("share");
    } else this._emit("strategy-choose", sel.value);
  }

  private _startNaming(kind: "share" | "rename"): void {
    this._naming = kind;
    this._name = kind === "rename" ? this._sharedName(this.choice) : "";
    this._confirmDelete = false;
  }

  private _nameForm(): TemplateResult {
    const rename = this._naming === "rename";
    const name = this._name.trim();
    const taken = !!name && nameTaken(this.shared ?? [], name, rename ? this.choice : "");
    const same = rename && name === this._sharedName(this.choice);
    const submit = () => {
      if (!name || taken || same) return;
      if (rename) this._emit("strategy-rename", { id: this.choice, name });
      else this._emit("strategy-share", name);
      this._naming = null;
    };
    return html`<div class="row">
      <label
        >${rename ? t("New name") : t("Shared strategy name")}
        <input
          aria-label=${t("Shared strategy name")}
          .value=${this._name}
          placeholder=${t("e.g. Old building")}
          @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") this._naming = null;
          }}
      /></label>
      <button class="primary" ?disabled=${this.busy || !name || taken || same} @click=${submit}>${rename ? t("Rename") : t("Share")}</button>
      <button @click=${() => (this._naming = null)}>${t("Cancel")}</button>
      ${taken ? html`<span class="error">${t("Name already used.")}</span>` : nothing}
    </div>`;
  }

  private _strategySelect(): TemplateResult | typeof nothing {
    if (!this.shared) return nothing;
    return html`<span class="sep">${t("uses")}</span>
      <label
        ><select aria-label=${t("Strategy")} .value=${this.choice} ?disabled=${this.busy} @change=${(e: Event) => this._pickerChange(e)}>
          <option value="" ?selected=${this.choice === ""}>${t("Custom for this area")}</option>
          ${this.shared.map((x) => html`<option value=${x.id} ?selected=${x.id === this.choice}>${x.name}</option>`)}
          <option value=${NEW_SHARED}>${t("+ New shared strategy…")}</option>
        </select></label
      >`;
  }

  private _chips(editor: boolean): TemplateResult | typeof nothing {
    const s = this.shared?.find((x) => x.id === this.choice);
    const users = s ? (this.users[s.id] ?? []) : [];
    const notActive = !this.active || (editor && !this.rulesEnabled);
    return html`${s
        ? html`<span class="chip shared" title=${users.length ? t("Used by {names}", { names: users.join(", ") }) : t("Not used by any area yet")}
            >${t("Shared")} · ${users.length ? (users.length > 1 ? t("{n} areas", { n: users.length }) : t("1 area")) : t("unused")}</span
          >`
        : nothing}
      ${notActive
        ? html`<span class="chip off" title=${editor && this.active ? t("These rules are not the ones running for this area") : t("No strategy automation is running for this zone")}>${t("Not active")}</span>`
        : nothing}`;
  }

  private _menuItem(label: string, onClick: () => void, opts: { disabled?: boolean; danger?: boolean; reason?: string } = {}): TemplateResult {
    return html`<button
      role="menuitem"
      class=${opts.danger ? "danger" : ""}
      ?disabled=${opts.disabled}
      title=${opts.reason ?? nothing}
      @click=${() => {
        this._menuOpen = false;
        onClick();
      }}
    >
      ${label}${opts.reason ? html`<span class="reason">${opts.reason}</span>` : nothing}
    </button>`;
  }

  private _menu(): TemplateResult | typeof nothing {
    if (!this.shared || !this.draft) return nothing;
    const s = this.shared.find((x) => x.id === this.choice);
    const users = s ? (this.users[s.id] ?? []) : [];
    const items = s
      ? [
          this._menuItem(t("Rename"), () => this._startNaming("rename"), { disabled: this.busy }),
          this.zoneOn === s.id ? this._menuItem(t("Make a copy for this area"), () => this._emit("make-copy"), { disabled: this.busy }) : nothing,
          this._menuItem(t("Delete"), () => (this._confirmDelete = true), {
            danger: true,
            disabled: this.busy || users.length > 0,
            reason: users.length ? t("Used by {names}: delete is disabled while an area uses it.", { names: users.join(", ") }) : undefined,
          }),
        ]
      : [this._menuItem(t("Share these rules…"), () => this._startNaming("share"), { disabled: this.busy })];
    return html`<div class="menu-wrap">
      <button class="menu-btn" aria-label=${t("More actions")} aria-haspopup="menu" aria-expanded=${this._menuOpen} @click=${() => (this._menuOpen = !this._menuOpen)}>⋯</button>
      ${this._menuOpen ? html`<div class="menu" role="menu">${items}</div>` : nothing}
    </div>`;
  }

  private _info(): TemplateResult | typeof nothing {
    const s = this.shared?.find((x) => x.id === this.choice);
    const users = s ? (this.users[s.id] ?? []) : [];
    const onName = this._sharedName(this.zoneOn);
    let text = "";
    if (this.switching && s) text = t("Saving switches this area to {name}.", { name: s.name });
    else if (this.switching && onName) text = t("Saving gives this area its own copy; other areas keep {name}.", { name: onName });
    else if (this.saved && !this.rulesEnabled && !this.startingNew) text = t("These rules are saved but not running. Save to use them.");
    else if (s && users.length > 1) text = t("Changes apply to {n} areas.", { n: users.length });
    return text ? html`<div class="banner info" role="status">${text}</div>` : nothing;
  }

  private _forms(): TemplateResult | typeof nothing {
    const s = this.shared?.find((x) => x.id === this.choice);
    const users = s ? (this.users[s.id] ?? []) : [];
    return html`${this._naming ? this._nameForm() : nothing}
      ${s && this._confirmDelete
        ? html`<div class="row">
            <span>${t("Delete the shared strategy {name}?", { name: s.name })}</span>
            <button class="primary" ?disabled=${this.busy || users.length > 0} @click=${() => this._emit("strategy-delete", s.id)}>${t("Delete")}</button>
            <button @click=${() => (this._confirmDelete = false)}>${t("Cancel")}</button>
          </div>`
        : nothing}`;
  }

  // One header bar: area, strategy, status chips and the actions menu.
  private _bar(editor: boolean): TemplateResult {
    return html`<div class="bar">
      ${this._zoneSelect()}
      ${this.zone && !this.loading
        ? html`${editor ? this._strategySelect() : nothing}${this._chips(editor)}${editor ? this._menu() : nothing}`
        : nothing}
    </div>`;
  }

  private _editor(draft: RuleStrategy): TemplateResult {
    const dirty = isDirty(draft, this.saved);
    const canSave = this._valid && (dirty || !this.rulesEnabled || this.switching) && !this.busy;
    return html`
      ${this.startingNew
        ? html`<div class="banner info">${t("New rules automation. Saving it disables the detached one.")}</div>`
        : nothing}
      ${this._areaProblem()}
      ${this.missingShared
        ? html`<div class="banner" role="status">${t("This area uses a shared strategy that no longer exists. Pick one, or edit custom rules.")}</div>`
        : nothing}
      ${this._forms()} ${this._info()}
      <div class="cols">
        <div class="preview-col">
          <h4>${t("Preview")}</h4>
          ${this.area
            ? html`<share-space-rule-preview
                .strategy=${draft}
                .schedule=${this.schedule ?? {}}
                .plannings=${this.plannings}
                .now=${this.now}
                .tz=${this.tz}
                .temps=${this.temps}
                .readings=${this.readings}
                .states=${this.states}
                .highlight=${this._hl}
                @segment-hover=${(e: CustomEvent<{ reason: string | null }>) => (this._hl = e.detail.reason)}
              ></share-space-rule-preview>`
            : html`<div class="muted">${t("Choose an area to see the preview.")}</div>`}
        </div>
        <div class="rules-col">
          <share-space-rule-list
            .strategy=${draft}
            .areaNames=${this.areaNames}
            .highlight=${this._hl}
            @rule-hover=${(e: CustomEvent<{ label: string | null }>) => (this._hl = e.detail.label)}
            @strategy-change=${(e: CustomEvent<{ strategy: RuleStrategy }>) => {
              e.stopPropagation();
              this._emit("draft-change", e.detail.strategy);
            }}
          ></share-space-rule-list>
        </div>
      </div>
      <div class="actions">
        <button class="primary" ?disabled=${!canSave} @click=${() => this._emit("save")}>${this.busy ? t("Saving…") : t("Save")}</button>
        <button ?disabled=${this.busy || !this.saved?.previous} @click=${() => this._emit("undo")}>${t("Undo last change")}</button>
        <button ?disabled=${this.busy || (!dirty && !!this.saved && !this.startingNew && !this.switching)} @click=${() => this._emit("discard")}>${t("Discard")}</button>
        ${dirty && this.saved ? html`<span class="muted">${t("Unsaved changes")}</span>` : nothing}
      </div>
      ${canSave && this.turnsOff.length
        ? html`<p class="muted" role="note">${t("Saving turns off in Home Assistant: {names}. These rules become the only heating for this area.", { names: this.turnsOff.join(", ") })}</p>`
        : nothing}
    `;
  }

  private _edited(): TemplateResult {
    const what = this.managed === "edited" ? t("Edited outside Share Space") : t("Not managed by Share Space");
    return html`<div class="banner" role="status">
        <strong>${what}.</strong>
        <div class="muted">${t("Take back overwrites it with the last rules Share Space can read. Detach leaves it as a normal Home Assistant automation.")}</div>
      </div>
      <div class="row">
        <button class="primary" ?disabled=${this.busy || !this.area} @click=${() => this._emit("take-back")}>${t("Take back")}</button>
        <button ?disabled=${this.busy} @click=${() => this._emit("detach")}>${t("Detach")}</button>
        <button class="link" @click=${() => this._emit("open-automation")}>${t("Open in Home Assistant")}</button>
      </div>`;
  }

  private _detached(): TemplateResult {
    return html`<div class="banner info" role="status">
        ${t("This automation is detached; edit it in Home Assistant.")}
        <button class="link" @click=${() => this._emit("open-automation")}>${t("Open automation")}</button>
      </div>
      ${this._confirmNew
        ? html`<div class="row">
            <span>${t("Create a new rules automation for this area? The detached one will be disabled.")}</span>
            <button class="primary" ?disabled=${this.busy} @click=${() => this._emit("start-new")}>${t("Confirm")}</button>
            <button @click=${() => (this._confirmNew = false)}>${t("Cancel")}</button>
          </div>`
        : html`<div class="row"><button ?disabled=${this.busy} @click=${() => (this._confirmNew = true)}>${t("Start new rules")}</button></div>`}`;
  }

  private _body(): TemplateResult {
    if (this.managed === "detached" && !this.startingNew) return this._detached();
    if (this.managed === "edited" || this.managed === "unmanaged") return this._edited();
    return this.draft ? this._editor(this.draft) : html`<div class="muted">${t("Loading…")}</div>`;
  }

  protected render(): TemplateResult {
    if (this.zones === null) return html`<div class="muted">${t("Loading…")}</div>`;
    const editor = !!this.zone && !this.loading && this._isEditor();
    return html`
      <h3>${t("Rules")}</h3>
      ${this._bar(editor)}
      ${this.zones.length === 0 ? html`<div class="muted">${t("No heated area yet. Set up heating in Settings.")}</div>` : nothing}
      ${this.error ? html`<div class="error" role="alert">${this.error}</div>` : nothing}
      ${!this.zone ? nothing : this.loading ? html`<div class="muted">${t("Loading…")}</div>` : this._body()}
    `;
  }

  private _isEditor(): boolean {
    if (this.managed === "detached" && !this.startingNew) return false;
    if (this.managed === "edited" || this.managed === "unmanaged") return false;
    return !!this.draft;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rules-tab": ShareSpaceRulesTab;
  }
}
