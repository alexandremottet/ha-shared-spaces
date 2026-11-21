import { LitElement, html } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { afterSave, templateRules, undoRules } from "ha-share-space-ui";
import type { RuleStrategy, SavedRules, ScheduleRanges, StrategyPreset } from "ha-share-space-ui";
import {
  hassNow,
  hassTimeZone,
  isBackendMissing,
  listAreas,
  listZones,
  loadZoneRules,
  loadZoneStrategy,
  planningSchedule,
  saveZoneRules,
  strategyAutomationId,
  useZoneStrategy,
} from "ha-share-space-ui/ha";
import type { AreaInfo, HeatingZone, HomeAssistant, ZoneStrategy } from "ha-share-space-ui/ha";
import "./rules-tab";

const PRESENCE_PREFIX = "binary_sensor.share_space_";
const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));

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
  @state() private _saved: SavedRules | null = null;
  @state() private _draft: RuleStrategy | null = null;
  @state() private _loading = false;
  @state() private _busy = false;
  @state() private _error = "";
  private _started = false;

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("hass") && this.hass && !this._started) {
      this._started = true;
      void this._init(this.hass);
    }
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

  private async _select(entityId: string): Promise<void> {
    const hass = this.hass;
    this._zone = entityId;
    this._error = "";
    this._saved = null;
    this._draft = null;
    this._current = null;
    this._area = "";
    this._locked = false;
    if (!hass || !entityId) return;
    this._loading = true;
    try {
      const [rules, current] = await Promise.all([loadZoneRules(hass, entityId), loadZoneStrategy(hass, entityId).catch(() => null)]);
      if (this._zone !== entityId) return;
      const zone = this._zoneInfo;
      const linked = zone?.presence_entity?.startsWith(PRESENCE_PREFIX) ? zone.presence_entity.slice(PRESENCE_PREFIX.length) : "";
      const presetArea = current && current.automation.kind !== "rules" ? current.area : "";
      this._current = current;
      this._locked = !!(linked || presetArea);
      this._area = rules?.area || presetArea || linked;
      this._saved = rules ? { rules: rules.rules, previous: rules.previous } : null;
      this._draft = rules?.rules ?? null;
    } catch (err) {
      if (this._zone === entityId) this._error = messageOf(err);
    } finally {
      if (this._zone === entityId) this._loading = false;
    }
  }

  private _pick(kind: StrategyPreset): void {
    const cur = this._current;
    this._draft = templateRules(kind, cur ? { kind: cur.automation.kind, inputs: cur.inputs } : null);
  }

  private _discard(): void {
    this._draft = this._saved?.rules ?? null;
  }

  private async _persist(next: SavedRules): Promise<void> {
    const hass = this.hass;
    const zone = this._zoneInfo;
    if (!hass || !zone || !this._area) return;
    this._busy = true;
    this._error = "";
    try {
      await saveZoneRules(hass, zone, this._area, next.rules, next.previous);
      await useZoneStrategy(() => this.hass ?? hass, zone, strategyAutomationId(zone.entity_id, "rules"));
      this._saved = next;
      this._draft = next.rules;
      this._zones = await listZones(hass);
    } catch (err) {
      this._error = messageOf(err);
    } finally {
      this._busy = false;
    }
  }

  private _save(): void {
    if (this._draft) void this._persist(afterSave(this._draft, this._saved));
  }

  private _undo(): void {
    const swapped = this._saved ? undoRules(this._saved) : null;
    if (swapped) void this._persist(swapped);
  }

  protected render(): TemplateResult {
    const hass = this.hass;
    const zone = this._zoneInfo;
    const attrs = zone && hass ? hass.states[zone.entity_id]?.attributes : undefined;
    const schedule: ScheduleRanges | null = hass && this._area ? planningSchedule(hass, this._area) : null;
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
      @zone-select=${(e: CustomEvent<string>) => void this._select(e.detail)}
      @area-change=${(e: CustomEvent<string>) => (this._area = e.detail)}
      @template-pick=${(e: CustomEvent<StrategyPreset>) => this._pick(e.detail)}
      @draft-change=${(e: CustomEvent<RuleStrategy>) => (this._draft = e.detail)}
      @save=${() => this._save()}
      @undo=${() => this._undo()}
      @discard=${() => this._discard()}
    ></share-space-rules-tab>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-rules-page": ShareSpaceRulesPage;
  }
}
