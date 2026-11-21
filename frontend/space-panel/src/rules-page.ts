import { LitElement, html } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { afterSave, isDirty, sameRules, templateRules, undoRules } from "ha-share-space-ui";
import type { RuleStrategy, SavedRules, ScheduleRanges, StrategyPreset } from "ha-share-space-ui";
import {
  detachAutomation,
  findZoneStrategies,
  hassNow,
  hassTimeZone,
  isBackendMissing,
  listAreas,
  listZones,
  loadRulesAutomation,
  loadZoneRules,
  loadZoneStrategy,
  nextRulesId,
  planningSchedule,
  saveZoneRules,
  strategyAutomationId,
  useZoneStrategy,
  zoneRulesIds,
} from "ha-share-space-ui/ha";
import type { AreaInfo, HeatingZone, HomeAssistant, StrategyAutomation, ZoneRules, ZoneStrategy } from "ha-share-space-ui/ha";
import "./rules-tab";

const PRESENCE_PREFIX = "binary_sensor.share_space_";
const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));
const isPreset = (k: string): k is StrategyPreset => k === "office_saver" || k === "lunch_room";

// Container for the Rules tab: does the WS calls, feeds the presentational tab.
@customElement("share-space-rules-page")
export class ShareSpaceRulesPage extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  @state() private _zones: HeatingZone[] | null = null;
  @state() private _areas: AreaInfo[] = [];
  @state() private _zone = "";
  @state() private _area = "";
  @state() private _locked = false;
  @state() private _current: ZoneStrategy | null = null;
  @state() private _rules: ZoneRules | null = null;
  @state() private _targetId = "";
  @state() private _startingNew = false;
  @state() private _saved: SavedRules | null = null;
  @state() private _draft: RuleStrategy | null = null;
  @state() private _loading = false;
  @state() private _busy = false;
  @state() private _error = "";
  private _started = false;
  private _sig = "";

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("hass") && this.hass && !this._started) {
      this._started = true;
      void this._init(this.hass);
    }
    if (changed.has("hass") && this._zone && !this._busy && !this._loading) {
      const sig = this._signature();
      if (this._sig && sig !== this._sig) void this._load(this._zone);
      this._sig = sig;
    }
  }

  // Changes to the zone's automations (renamed or toggled in HA) trigger a reload.
  private _signature(): string {
    return JSON.stringify(this._strategies().map((a) => [a.id, a.enabled, a.name]));
  }

  private async _init(hass: HomeAssistant): Promise<void> {
    const [zones, areas] = await Promise.allSettled([listZones(hass), listAreas(hass)]);
    this._areas = areas.status === "fulfilled" ? areas.value : [];
    if (zones.status === "fulfilled") this._zones = zones.value;
    else {
      this._zones = [];
      if (!isBackendMissing(zones.reason)) this._error = messageOf(zones.reason);
    }
  }

  private get _zoneInfo(): HeatingZone | undefined {
    return this._zones?.find((z) => z.entity_id === this._zone);
  }

  private _strategies(): StrategyAutomation[] {
    return this.hass && this._zone ? findZoneStrategies(this.hass, this._zone) : [];
  }

  private async _select(entityId: string): Promise<void> {
    this._zone = entityId;
    this._error = "";
    this._saved = null;
    this._draft = null;
    this._current = null;
    this._rules = null;
    this._area = "";
    this._locked = false;
    this._startingNew = false;
    if (!this.hass || !entityId) return;
    this._loading = true;
    await this._load(entityId);
  }

  private async _load(entityId: string): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    try {
      const [rules, current] = await Promise.all([loadZoneRules(hass, entityId), loadZoneStrategy(hass, entityId).catch(() => null)]);
      if (this._zone !== entityId) return;
      const zone = this._zoneInfo;
      const linked = zone?.presence_entity?.startsWith(PRESENCE_PREFIX) ? zone.presence_entity.slice(PRESENCE_PREFIX.length) : "";
      const presetArea = current && current.automation.kind !== "rules" ? current.area : "";
      const managed = rules?.state === "managed" && rules.rules ? rules.rules : null;
      this._sig = this._signature();
      this._current = current;
      this._rules = rules;
      this._targetId = rules?.id ?? strategyAutomationId(entityId, "rules");
      this._startingNew = false;
      this._locked = !!(linked || presetArea);
      this._area = rules?.area || presetArea || linked;
      this._saved = managed ? { rules: managed, previous: rules?.previous ?? null } : null;
      this._draft = managed;
    } catch (err) {
      if (this._zone === entityId) this._error = messageOf(err);
    } finally {
      if (this._zone === entityId) this._loading = false;
    }
  }

  // Zone's template: its preset kind (with current inputs when that preset runs), Office saver otherwise.
  private _template(): RuleStrategy {
    const cur = this._current;
    const kind = cur && isPreset(cur.automation.kind) ? cur.automation.kind : this._strategies().find((a) => isPreset(a.kind))?.kind;
    const k: StrategyPreset = kind && isPreset(kind) ? kind : "office_saver";
    return templateRules(k, cur ? { kind: cur.automation.kind, inputs: cur.inputs } : null);
  }

  private _pick(kind: StrategyPreset): void {
    const cur = this._current;
    this._draft = templateRules(kind, cur ? { kind: cur.automation.kind, inputs: cur.inputs } : null);
  }

  private _convert(): void {
    const cur = this._current;
    if (!cur || !isPreset(cur.automation.kind)) return;
    this._pick(cur.automation.kind);
    if (cur.area) this._area = cur.area;
  }

  private _discard(): void {
    if (this._startingNew) void this._select(this._zone);
    else this._draft = this._saved?.rules ?? null;
  }

  private async _run(fn: (hass: HomeAssistant, zone: HeatingZone) => Promise<void>): Promise<void> {
    const hass = this.hass;
    const zone = this._zoneInfo;
    if (!hass || !zone) return;
    this._busy = true;
    this._error = "";
    try {
      await fn(hass, zone);
      this._zones = await listZones(hass);
      await this._load(zone.entity_id);
    } catch (err) {
      this._error = messageOf(err);
    } finally {
      this._busy = false;
    }
  }

  // Save to the target id; never overwrites an automation edited or detached outside Share Space.
  private _persist(next: SavedRules, opts: { exclusive: boolean; force?: boolean }): Promise<void> {
    const id = this._targetId;
    const area = this._area;
    if (!area) return Promise.resolve();
    return this._run(async (hass, zone) => {
      if (!opts.force && !this._startingNew) {
        const fresh = await loadRulesAutomation(hass, zone.entity_id, id);
        if (fresh && fresh.state !== "managed") {
          await this._load(zone.entity_id);
          throw new Error("This automation was changed outside Share Space; reloaded.");
        }
      }
      await saveZoneRules(hass, zone, area, next.rules, next.previous, id);
      if (opts.exclusive) await useZoneStrategy(() => this.hass ?? hass, zone, id);
    });
  }

  private _save(): void {
    const draft = this._draft;
    if (!draft) return;
    const next = isDirty(draft, this._saved) || !this._saved ? afterSave(draft, this._saved) : this._saved;
    void this._persist(next, { exclusive: true });
  }

  private _undo(): void {
    const swapped = this._saved ? undoRules(this._saved) : null;
    if (swapped) void this._persist(swapped, { exclusive: true });
  }

  private _takeBack(): void {
    const r = this._rules;
    if (!r) return;
    const rules = r.rules ?? r.previous ?? this._template();
    const previous = r.previous && !sameRules(r.previous, rules) ? r.previous : null;
    void this._persist({ rules, previous }, { exclusive: false, force: true });
  }

  private _detach(): void {
    const id = this._rules?.id;
    if (id) void this._run((hass) => detachAutomation(hass, id));
  }

  private _startNew(): void {
    if (!this.hass) return;
    const r = this._rules;
    this._targetId = nextRulesId(this._zone, zoneRulesIds(this.hass, this._zone));
    this._startingNew = true;
    this._saved = null;
    this._draft = r?.rules ?? r?.previous ?? this._template();
  }

  private _reenable(preset: StrategyAutomation | undefined): void {
    if (preset) void this._run((hass, zone) => useZoneStrategy(() => this.hass ?? hass, zone, preset.id));
  }

  private _openAutomation(): void {
    const id = this._rules?.id;
    if (!id) return;
    const path = `/config/automation/edit/${id}`;
    const ev = new CustomEvent("navigate-requested", { detail: { path }, bubbles: true, composed: true, cancelable: true });
    if (this.dispatchEvent(ev)) {
      history.pushState(null, "", path);
      window.dispatchEvent(new CustomEvent("location-changed"));
    }
  }

  protected render(): TemplateResult {
    const hass = this.hass;
    const zone = this._zoneInfo;
    const attrs = zone && hass ? hass.states[zone.entity_id]?.attributes : undefined;
    const schedule: ScheduleRanges | null = hass && this._area ? planningSchedule(hass, this._area) : null;
    const strategies = this._strategies();
    const active = strategies.find((a) => a.enabled);
    const rulesEnabled = strategies.find((a) => a.id === this._targetId)?.enabled ?? false;
    const disabledPreset = strategies.find((a) => isPreset(a.kind) && !a.enabled);
    const managed = this._startingNew ? "managed" : (this._rules?.state ?? null);
    const convertFrom = !this._rules && active && isPreset(active.kind) ? active.kind : null;
    const keptDisabled =
      managed === "managed" && rulesEnabled && this._saved && disabledPreset && isPreset(disabledPreset.kind) ? disabledPreset.kind : null;
    return html`<share-space-rules-tab
      .zones=${this._zones}
      .zone=${this._zone}
      .areas=${this._areas}
      .area=${this._area}
      .areaLocked=${this._locked}
      .draft=${this._draft}
      .saved=${this._saved}
      .schedule=${schedule}
      .temps=${attrs ? { comfort: Number(attrs.comfort_temp ?? 21), eco: Number(attrs.eco_temp ?? 17) } : undefined}
      .now=${hass ? hassNow(hass) : Date.now()}
      .tz=${hass ? hassTimeZone(hass) : "UTC"}
      .loading=${this._loading}
      .busy=${this._busy}
      .error=${this._error}
      .managed=${managed}
      .active=${active?.kind ?? null}
      .rulesEnabled=${rulesEnabled}
      .convertFrom=${convertFrom}
      .keptDisabled=${keptDisabled}
      .startingNew=${this._startingNew}
      @zone-select=${(e: CustomEvent<string>) => void this._select(e.detail)}
      @area-change=${(e: CustomEvent<string>) => (this._area = e.detail)}
      @template-pick=${(e: CustomEvent<StrategyPreset>) => this._pick(e.detail)}
      @draft-change=${(e: CustomEvent<RuleStrategy>) => (this._draft = e.detail)}
      @save=${() => this._save()}
      @undo=${() => this._undo()}
      @discard=${() => this._discard()}
      @convert=${() => this._convert()}
      @reenable=${() => this._reenable(disabledPreset)}
      @take-back=${() => this._takeBack()}
      @detach=${() => this._detach()}
      @start-new=${() => this._startNew()}
      @open-automation=${() => this._openAutomation()}
    ></share-space-rules-tab>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rules-page": ShareSpaceRulesPage;
  }
}
