import { LitElement, html } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { afterSave, entityStates, isDirty, sensorReadings, sameRules, undoRules } from "ha-share-space-ui";
import type { RuleStrategy, RulesSource, SavedRules, ScheduleRanges } from "ha-share-space-ui";
import {
  deleteStrategy,
  detachAutomation,
  findZoneStrategies,
  hassNow,
  hassTimeZone,
  isBackendMissing,
  listAreas,
  listStrategies,
  listStrategyAutomations,
  listZones,
  loadStrategyUses,
  loadRulesAutomation,
  loadZoneRules,
  nextRulesId,
  planningSchedule,
  saveStrategy,
  saveZoneRules,
  strategyAutomationId,
  strategyUsers,
  useZoneStrategy,
  zoneRulesIds,
  errorMessage,
} from "ha-share-space-ui/ha";
import type { AreaInfo, HeatingZone, HomeAssistant, SharedStrategy, StrategyAutomation, StrategyUse, ZoneRules } from "ha-share-space-ui/ha";
import "./rules-tab";

const messageOf = (err: unknown): string => {
  if ((err as { code?: string })?.code === "name_taken") return "Another shared strategy already has this name.";
  return errorMessage(err);
};
const emptyRules = (): RuleStrategy => ({ version: 1, rules: [], fallback: { label: "Otherwise", then: { type: "off" } } });

// Container for the Rules tab: does the WS calls, feeds the presentational tab.
@customElement("share-space-rules-page")
export class ShareSpaceRulesPage extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  @state() private _zones: HeatingZone[] | null = null;
  @state() private _areas: AreaInfo[] = [];
  @state() private _zone = "";
  @state() private _rules: ZoneRules | null = null;
  @state() private _targetId = "";
  @state() private _startingNew = false;
  @state() private _saved: SavedRules | null = null;
  @state() private _draft: RuleStrategy | null = null;
  @state() private _loading = false;
  @state() private _busy = false;
  @state() private _error = "";
  @state() private _shared: SharedStrategy[] | null = null;
  @state() private _uses: StrategyUse[] = [];
  @state() private _choice = "";
  private _started = false;
  private _sig = "";
  private _usesSig = "";

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
    // any zone's strategy automation added, renamed or toggled: refresh "used by"
    if (changed.has("hass") && this.hass && this._shared && !this._busy) {
      const sig = JSON.stringify(listStrategyAutomations(this.hass).map((a) => [a.id, a.enabled, a.name]));
      if (this._usesSig && sig !== this._usesSig) void this._loadShared(this.hass);
      this._usesSig = sig;
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
    await this._loadShared(hass);
  }

  // Shared strategies and which zones use them; null hides the shared UI (backend without them).
  private async _loadShared(hass: HomeAssistant): Promise<void> {
    try {
      this._shared = await listStrategies(hass);
    } catch (err) {
      this._shared = null;
      this._uses = [];
      if (!isBackendMissing(err)) this._error = messageOf(err);
      return;
    }
    this._uses = await loadStrategyUses(hass, this._zones ?? []).catch(() => []);
  }

  private _sharedById(id: string | null | undefined): SharedStrategy | undefined {
    return id ? this._shared?.find((s) => s.id === id) : undefined;
  }

  // Shared strategy id the zone's managed rules automation points at.
  private get _zoneOn(): string | null {
    const r = this._rules;
    return !this._startingNew && r?.state === "managed" ? r.strategy : null;
  }

  private get _zoneInfo(): HeatingZone | undefined {
    return this._zones?.find((z) => z.entity_id === this._zone);
  }

  // HA's area of the zone's thermostat; rules for an area with several zones are refused by HA.
  private get _area(): string {
    const z = this._zoneInfo;
    return z?.area_id && !z.area_conflict ? z.area_id : "";
  }

  private _strategies(): StrategyAutomation[] {
    return this.hass && this._zone ? findZoneStrategies(this.hass, this._zone) : [];
  }

  private async _select(entityId: string): Promise<void> {
    this._zone = entityId;
    this._error = "";
    this._saved = null;
    this._draft = null;
    this._rules = null;
    this._startingNew = false;
    this._choice = "";
    if (!this.hass || !entityId) return;
    this._loading = true;
    await this._load(entityId);
  }

  private async _load(entityId: string): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    try {
      const rules = await loadZoneRules(hass, entityId);
      if (this._zone !== entityId) return;
      const managed = rules?.state === "managed" && rules.rules ? rules.rules : null;
      const shared = rules?.state === "managed" ? this._sharedById(rules.strategy) : undefined;
      this._sig = this._signature();
      this._rules = rules;
      this._targetId = rules?.id ?? strategyAutomationId(entityId);
      this._startingNew = false;
      this._choice = shared?.id ?? "";
      this._saved = shared ? { rules: shared.rules, previous: shared.previous } : managed ? { rules: managed, previous: rules?.previous ?? null } : null;
      this._draft = shared?.rules ?? managed ?? emptyRules();
    } catch (err) {
      if (this._zone === entityId) this._error = messageOf(err);
    } finally {
      if (this._zone === entityId) this._loading = false;
    }
  }

  private _discard(): void {
    if (this._startingNew) void this._select(this._zone);
    else if (this._choice !== (this._sharedById(this._zoneOn)?.id ?? "")) this._choose(this._sharedById(this._zoneOn)?.id ?? "", true);
    else this._draft = this._saved?.rules ?? emptyRules();
  }

  // Picker: a shared strategy edits its rules; custom keeps the zone's own rules, or copies the current ones.
  private _choose(choice: string, reset = false): void {
    const s = this._sharedById(choice);
    if (choice && !s) return;
    this._choice = choice;
    if (s) {
      this._saved = { rules: s.rules, previous: s.previous };
      this._draft = s.rules;
      return;
    }
    const r = this._rules;
    const own = !this._startingNew && r?.state === "managed" && !r.strategy && r.rules ? { rules: r.rules, previous: r.previous } : null;
    this._saved = own;
    this._draft = own?.rules ?? (reset || !this._draft ? emptyRules() : this._draft);
  }

  private async _run(fn: (hass: HomeAssistant, zone: HeatingZone) => Promise<void>, after?: () => void): Promise<void> {
    const hass = this.hass;
    const zone = this._zoneInfo;
    if (!hass || !zone) return;
    this._busy = true;
    this._error = "";
    try {
      await fn(hass, zone);
      this._zones = await listZones(hass);
      if (this._shared !== null) await this._loadShared(this.hass ?? hass);
      await this._load(zone.entity_id);
      after?.();
    } catch (err) {
      this._error = messageOf(err);
    } finally {
      this._busy = false;
    }
  }

  // Refuses to overwrite an automation edited or detached outside Share Space.
  private async _guard(hass: HomeAssistant, zone: HeatingZone, id: string): Promise<void> {
    if (this._startingNew) return;
    const fresh = await loadRulesAutomation(hass, zone.entity_id, id);
    if (fresh && fresh.state !== "managed") {
      await this._load(zone.entity_id);
      throw new Error("This automation was changed outside Share Space; reloaded.");
    }
  }

  // Save to the target id; `before` runs once the target is known to be safe to overwrite.
  private _persist(
    source: RulesSource,
    opts: { exclusive: boolean; force?: boolean },
    before?: (hass: HomeAssistant) => Promise<unknown>,
  ): Promise<void> {
    const id = this._targetId;
    const area = this._area;
    if (!area) return Promise.resolve();
    return this._run(async (hass, zone) => {
      if (!opts.force) await this._guard(hass, zone, id);
      await before?.(hass);
      await saveZoneRules(hass, zone, area, source, id);
      if (opts.exclusive) await useZoneStrategy(() => this.hass ?? hass, zone, id);
    });
  }

  private _save(): void {
    const draft = this._draft;
    if (!draft) return;
    const s = this._sharedById(this._choice);
    if (s) {
      const dirty = isDirty(draft, this._saved);
      void this._persist({ strategy: s.id, name: s.name }, { exclusive: true }, (hass) =>
        dirty ? saveStrategy(hass, { id: s.id, name: s.name, rules: draft, previous: s.rules }) : Promise.resolve(),
      );
      return;
    }
    const next = isDirty(draft, this._saved) || !this._saved ? afterSave(draft, this._saved) : this._saved;
    void this._persist(next, { exclusive: true });
  }

  private _undo(): void {
    const s = this._sharedById(this._choice);
    if (s) {
      const choice = s.id;
      if (s.previous) void this._run((hass) => saveStrategy(hass, { id: s.id, name: s.name, rules: s.previous!, previous: s.rules }).then(() => undefined), () => this._choose(choice));
      return;
    }
    const swapped = this._saved ? undoRules(this._saved) : null;
    if (swapped) void this._persist(swapped, { exclusive: true });
  }

  // Copy the shown rules into this zone's own automation; other zones keep the shared strategy.
  private _makeCopy(): void {
    const draft = this._draft;
    if (draft) void this._persist({ rules: draft, previous: null }, { exclusive: true });
  }

  // New shared strategy from the shown rules; the zone points at it when it has an area.
  private _share(name: string): void {
    const rules = this._draft ?? emptyRules();
    const id = this._targetId;
    const area = this._area;
    let created = "";
    void this._run(
      async (hass, zone) => {
        if (area) await this._guard(hass, zone, id);
        created = (await saveStrategy(hass, { name, rules, previous: null })).id;
        if (!area) return;
        await saveZoneRules(hass, zone, area, { strategy: created, name }, id);
        await useZoneStrategy(() => this.hass ?? hass, zone, id);
      },
      () => {
        if (created && this._choice !== created) this._choose(created);
      },
    );
  }

  // Rename, then refresh the alias of the managed automations using it.
  private _rename(id: string, name: string): void {
    const s = this._sharedById(id);
    if (!s) return;
    const choice = this._choice;
    const uses = this._uses.filter((u) => u.strategy === id);
    void this._run(
      async (hass) => {
        await saveStrategy(hass, { id, name, rules: s.rules, previous: s.previous });
        for (const u of uses) {
          const zone = this._zones?.find((z) => z.entity_id === u.zone);
          const fresh = zone ? await loadRulesAutomation(hass, u.zone, u.automationId) : null;
          if (zone && fresh?.state === "managed" && fresh.strategy === id) await saveZoneRules(hass, zone, zone.area_id || u.area, { strategy: id, name }, u.automationId);
        }
      },
      () => this._choose(choice),
    );
  }

  private _deleteShared(id: string): void {
    if (strategyUsers(this._uses, id).length > 0) return;
    void this._run((hass) => deleteStrategy(hass, id).then(() => undefined));
  }

  private _takeBack(): void {
    const r = this._rules;
    if (!r) return;
    const shared = this._sharedById(r.strategy);
    if (shared) {
      void this._persist({ strategy: shared.id, name: shared.name }, { exclusive: false, force: true });
      return;
    }
    const rules = r.rules ?? r.previous ?? emptyRules();
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
    this._choice = "";
    this._draft = r?.rules ?? r?.previous ?? this._sharedById(r?.strategy)?.rules ?? emptyRules();
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
    const managed = this._startingNew ? "managed" : (this._rules?.state ?? null);
    const zoneOn = this._zoneOn;
    const users = Object.fromEntries((this._shared ?? []).map((s) => [s.id, strategyUsers(this._uses, s.id)]));
    const switching = (this._choice || null) !== zoneOn && !!(this._rules || this._choice);
    return html`<share-space-rules-tab
      .zones=${this._zones}
      .zone=${this._zone}
      .areas=${this._areas}
      .area=${this._area}
      .draft=${this._draft}
      .saved=${this._saved}
      .schedule=${schedule}
      .readings=${hass && this._draft ? sensorReadings(this._draft, hass.states, (attrs?.outdoor_entity as string | null | undefined) ?? null) : undefined}
      .states=${hass && this._draft ? entityStates(this._draft, hass.states) : undefined}
      .temps=${attrs ? { comfort: Number(attrs.comfort_temp ?? 21), eco: Number(attrs.eco_temp ?? 17) } : undefined}
      .now=${hass ? hassNow(hass) : Date.now()}
      .tz=${hass ? hassTimeZone(hass) : "UTC"}
      .loading=${this._loading}
      .busy=${this._busy}
      .error=${this._error}
      .managed=${managed}
      .active=${!!active}
      .rulesEnabled=${rulesEnabled}
      .startingNew=${this._startingNew}
      .shared=${this._shared}
      .choice=${this._choice}
      .zoneOn=${zoneOn}
      .missingShared=${!!zoneOn && !this._sharedById(zoneOn)}
      .users=${users}
      .switching=${switching}
      @zone-select=${(e: CustomEvent<string>) => void this._select(e.detail)}
      @draft-change=${(e: CustomEvent<RuleStrategy>) => (this._draft = e.detail)}
      @save=${() => this._save()}
      @undo=${() => this._undo()}
      @discard=${() => this._discard()}
      @take-back=${() => this._takeBack()}
      @detach=${() => this._detach()}
      @start-new=${() => this._startNew()}
      @open-automation=${() => this._openAutomation()}
      @strategy-choose=${(e: CustomEvent<string>) => this._choose(e.detail)}
      @strategy-share=${(e: CustomEvent<string>) => this._share(e.detail)}
      @strategy-rename=${(e: CustomEvent<{ id: string; name: string }>) => this._rename(e.detail.id, e.detail.name)}
      @strategy-delete=${(e: CustomEvent<string>) => this._deleteShared(e.detail)}
      @make-copy=${() => this._makeCopy()}
    ></share-space-rules-tab>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rules-page": ShareSpaceRulesPage;
  }
}
