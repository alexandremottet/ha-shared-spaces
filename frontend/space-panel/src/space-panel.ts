import { LitElement, html, css, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import "ha-share-space-ui";
import {
  getFloorplans,
  saveFloorplan,
  listAreas,
  spaceRole,
  getSharePrefs,
  setSharePrefs,
  getDefaultPanel,
  getSpaceDashboards,
  dashboardsForUser,
  loadCardHelpers,
  getHeatingSettings,
  saveHeatingSettings,
  setMyDefaultPanel,
  opensShareSpaceForEveryone,
  setOpensShareSpaceForEveryone,
  SHARE_SPACE_PANEL,
  errorMessage,
} from "ha-share-space-ui/ha";
import type { SharePrefs, HomeAssistant, Floorplan, Hotspot, AreaInfo, SpaceDashboard } from "ha-share-space-ui/ha";
import { zoneViewModel } from "ha-share-space-heating-card/view-model";
import "./panel-tabs";
import "./settings-tab";
import "./rules-page";
import "./extension-points-page";
import "./overview-page";
import "./theme-picker";

const DEFAULT_THEME = "Le Portemine";
import "./zones-settings";
import "./users-settings";
import "./dashboard-tab";
import "./dashboards-settings";
import { renderHeatingControl } from "./heating";
import { PLACEHOLDER_SIZE, PLACEHOLDER_URL } from "./placeholder";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Pt = [number, number];

const TOGGLE_DOMAINS = ["light", "switch", "fan", "input_boolean"];
const KINDS: Array<Hotspot["target"]["kind"]> = ["heating", "area", "entity", "card"];
const KIND_LABEL: Record<string, string> = { heating: "Heating", area: "Area", entity: "Entity", card: "Card" };

const ICON_BACK = html`<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`;
const ICON_LOGOUT = html`<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M16 17v-3H9v-4h7V7l5 5-5 5M14 2a2 2 0 0 1 2 2v2h-2V4H5v16h9v-2h2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9z"/></svg>`;
const ICON_CLOSE = html`<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;

const centroid = (pts: Pt[]): Pt => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];

const rectPoints = (a: Pt, b: Pt): Pt[] => [
  [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
  [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
];

function polyPoints(h: Hotspot): string {
  const p = h.shape.points;
  if (h.shape.type === "rect" && p.length >= 2) {
    const [[x1, y1], [x2, y2]] = p;
    return `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`;
  }
  return p.map((q) => q.join(",")).join(" ");
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const round = (n: number) => Math.round(n * 10) / 10;

@customElement("share-space-space")
export class ShareSpaceSpace extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: Boolean }) narrow = false;
  @property({ attribute: false }) route?: unknown;
  @property({ attribute: false }) panel?: unknown;

  @state() private _tab = "overview";
  // Admins only: null until known; false = Share Space is their home page.
  @state() private _fullHa: boolean | null = null;
  @state() private _everyone = false;
  @state() private _outdoor: string | null = null;
  @state() private _dashboards: SpaceDashboard[] = [];
@state() private _prefs: SharePrefs | null = null;
private _prefsFor = "";
@state() private _plans: Floorplan[] | null = null;
  @state() private _error = "";
  @state() private _planId = "";
  @state() private _box: Box = { x: 0, y: 0, w: 0, h: 0 };
  @state() private _imgFailed = false;
  @state() private _openId: string | null = null;
  @state() private _hoverId: string | null = null;
  @state() private _popPos: { left: number; top: number } | null = null;
  @state() private _edit = false;
  @state() private _draft: Floorplan | null = null;
  @state() private _sel: string | null = null;
  @state() private _drawing: { a: Pt; b: Pt } | null = null;
  @state() private _saving = false;
  @state() private _areas: AreaInfo[] = [];
  @state() private _cardError = "";
  @state() private _actionError = "";

  private _ro?: ResizeObserver;
  private _natural: { w: number; h: number } = { ...PLACEHOLDER_SIZE };
  private _cardEl?: HTMLElement & { hass?: HomeAssistant };
  private _cardKey = "";
  private _loadedFor?: HomeAssistant;

  connectedCallback(): void {
    super.connectedCallback();
    this._ro = new ResizeObserver(() => this._measure());
    window.addEventListener("keydown", this._onKey);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._ro?.disconnect();
    window.removeEventListener("keydown", this._onKey);
  }

  private get _isAdmin(): boolean {
    return !!this.hass?.user?.is_admin;
  }

  private async _loadPrefs(): Promise<void> {
    const id = this.hass?.user?.id ?? "";
    if (!this.hass || !id || id === this._prefsFor) return;
    this._prefsFor = id;
    try {
      this._prefs = await getSharePrefs(this.hass);
    } catch {
      this._prefs = null;
    }
    this._dashboards = await getSpaceDashboards(this.hass)
      .then((d) => dashboardsForUser(this.hass!, d))
      .catch(() => []);
    if (this._isAdmin) {
      try {
        this._fullHa = (await getDefaultPanel(this.hass)) !== SHARE_SPACE_PANEL;
      } catch {
        this._fullHa = true;
      }
      this._everyone = await opensShareSpaceForEveryone(this.hass).catch(() => false);
      this._outdoor = await getHeatingSettings(this.hass)
        .then((s) => s.outdoor_entity)
        .catch(() => null);
    }
  }

  private async _setOutdoor(entity: string | null): Promise<void> {
    if (!this.hass) return;
    const prev = this._outdoor;
    this._outdoor = entity;
    try {
      this._outdoor = (await saveHeatingSettings(this.hass, { outdoor_entity: entity })).outdoor_entity;
    } catch {
      this._outdoor = prev;
    }
  }

  // Temperature sensors and weather entities, by name.
  private get _outdoorOptions(): Array<{ id: string; name: string }> {
    const states = this.hass?.states ?? {};
    return Object.values(states)
      .filter((s) => s.entity_id.startsWith("weather.") || (s.entity_id.startsWith("sensor.") && s.attributes.device_class === "temperature"))
      .filter((s) => !s.entity_id.startsWith("sensor.share_space_heating_"))
      .map((s) => ({ id: s.entity_id, name: `${String(s.attributes.friendly_name ?? s.entity_id)} (${s.entity_id})` }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Full HA: HA opens on its default dashboard and the Back button returns there.
  private async _setFullHa(fullHa: boolean): Promise<void> {
    if (!this.hass) return;
    const prev = this._fullHa;
    this._fullHa = fullHa;
    try {
      await setMyDefaultPanel(this.hass, fullHa ? "lovelace" : SHARE_SPACE_PANEL);
    } catch {
      this._fullHa = prev;
    }
  }

  private async _setEveryone(on: boolean): Promise<void> {
    if (!this.hass) return;
    this._everyone = on;
    try {
      await setOpensShareSpaceForEveryone(this.hass, on);
      this._fullHa = (await getDefaultPanel(this.hass)) !== SHARE_SPACE_PANEL;
    } catch {
      this._everyone = !on;
    }
  }

  private async _setTechnical(technical: boolean): Promise<void> {
    if (!this.hass) return;
    const prev = this._prefs;
    this._prefs = { ...prev, technical };
    try {
      await setSharePrefs(this.hass, this._prefs);
    } catch {
      this._prefs = prev;
    }
  }

  private get _role() {
    return spaceRole(this.hass, this._prefs);
  }

  private get _tabs() {
    const overview = { id: "overview", label: "Overview" };
    const dashboards = this._dashboards.map((d) => ({ id: `dash:${d.url_path ?? "lovelace"}`, label: d.title }));
    if (this._role === "user") {
      return [overview, ...(this._plans?.length ? [{ id: "space", label: "Space" }] : []), ...dashboards];
    }
    return [overview, { id: "space", label: "Space" }, ...dashboards, { id: "rules", label: "Areas" }, { id: "settings", label: "Settings" }];
  }

  private get _activeTab(): string {
    return this._tabs.some((t) => t.id === this._tab) ? this._tab : "overview";
  }

  private get _plan(): Floorplan | null {
    if (this._edit && this._draft) return this._draft;
    const plans = this._plans ?? [];
    return plans.find((p) => p.id === this._planId) ?? plans[0] ?? null;
  }

  private _themeDefaulted = false;

  protected willUpdate(changed: PropertyValues): void {
    // a browser that never picked a theme starts on Le Portemine, when it is installed
    if (changed.has("hass") && this.hass && !this._themeDefaulted) {
      this._themeDefaulted = true;
      if (!this.hass.selectedTheme?.theme && this.hass.themes?.themes?.[DEFAULT_THEME]) {
        this.dispatchEvent(new CustomEvent("settheme", { detail: { theme: DEFAULT_THEME }, bubbles: true, composed: true }));
      }
    }
    if (changed.has("hass") && this.hass && !this._loadedFor) {
      this._loadedFor = this.hass;
      void this._load();
      void listAreas(this.hass).then((a) => (this._areas = a)).catch(() => undefined);
      if (this._isAdmin && new URLSearchParams(location.search).get("edit") === "1") this._startEdit();
      this._tab = new URLSearchParams(location.search).get("tab") ?? this._tab;
    }
  }

  private async _load(): Promise<void> {
    if (!this.hass) return;
    try {
      this._plans = await getFloorplans(this.hass);
      this._error = "";
      if (!this._planId && this._plans[0]) this._planId = this._plans[0].id;
    } catch (err) {
      this._error = errorMessage(err);
      this._plans = [];
    }
  }

  private _onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && this._openId) this._closePopover();
  };

  // Handled by HA's root element, same as the profile page's log out.
  private _logout(): void {
    this.dispatchEvent(new CustomEvent("hass-logout", { bubbles: true, composed: true }));
  }

  private _exit(): void {
    history.pushState(null, "", "/");
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  private _measure(): void {
    const stage = this.renderRoot.querySelector<HTMLElement>(".stage");
    if (!stage) return;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const { w: nw, h: nh } = this._natural;
    if (!sw || !sh || !nw || !nh) return;
    const scale = Math.min(sw / nw, sh / nh);
    const w = nw * scale;
    const h = nh * scale;
    const box = { x: (sw - w) / 2, y: (sh - h) / 2, w, h };
    const b = this._box;
    if (Math.abs(b.x - box.x) + Math.abs(b.y - box.y) + Math.abs(b.w - box.w) + Math.abs(b.h - box.h) > 0.5) {
      this._box = box;
      if (this._openId) this._closePopover();
    }
  }

  protected updated(changed: PropertyValues): void {
    const stage = this.renderRoot.querySelector<HTMLElement>(".stage");
    if (stage && stage !== this._observed) {
      if (this._observed) this._ro?.unobserve(this._observed);
      this._observed = stage;
      this._ro?.observe(stage);
      this._measure();
    }
    if (changed.has("hass")) void this._loadPrefs();
    if (changed.has("_openId") || changed.has("_box")) this._placePopover();
    if (this._cardEl && changed.has("hass") && this.hass) this._cardEl.hass = this.hass;
    if (changed.has("_openId") || changed.has("_plans")) void this._mountCard();
    if (changed.has("_planId") || changed.has("_edit")) this._measure();
  }

  private _observed?: HTMLElement;

  private _onImgLoad(e: Event): void {
    const img = e.target as HTMLImageElement;
    this._natural = { w: img.naturalWidth || PLACEHOLDER_SIZE.w, h: img.naturalHeight || PLACEHOLDER_SIZE.h };
    this._imgFailed = false;
    this._measure();
  }

  private _onImgError(): void {
    this._imgFailed = true;
    this._natural = { ...PLACEHOLDER_SIZE };
    this._measure();
  }

  private _closePopover(): void {
    this._openId = null;
    this._popPos = null;
    this._cardEl = undefined;
    this._cardKey = "";
    this._cardError = "";
    this._actionError = "";
  }

  private _openHotspot(id: string, ev: Event): void {
    ev.stopPropagation();
    this._popPos = null;
    this._actionError = "";
    this._openId = id;
    this._anchor = (ev.currentTarget as Element).getBoundingClientRect();
  }

  private _anchor?: DOMRect;

  private _placePopover(): void {
    const pop = this.renderRoot.querySelector<HTMLElement>(".popover");
    if (!pop || !this._anchor) return;
    const a = this._anchor;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const m = 12;
    let top = a.top - ph - m;
    if (top < m) top = a.bottom + m;
    if (top + ph > vh - m) top = Math.max(m, vh - ph - m);
    const left = Math.max(m, Math.min(a.left + a.width / 2 - pw / 2, vw - pw - m));
    if (!this._popPos || this._popPos.left !== left || this._popPos.top !== top) this._popPos = { left, top };
  }

  private async _mountCard(): Promise<void> {
    const h = this._openHotspotObj();
    const host = this.renderRoot.querySelector<HTMLElement>(".card-host");
    if (!h || h.target.kind !== "card" || !host || !this.hass) return;
    const key = `${h.id}:${JSON.stringify(h.target.ref)}`;
    if (key === this._cardKey) return;
    this._cardKey = key;
    this._cardError = "";
    try {
      const helpers = await loadCardHelpers();
      if (this._cardKey !== key) return;
      const el = helpers.createCardElement(h.target.ref) as HTMLElement & { hass?: HomeAssistant };
      el.hass = this.hass;
      this._cardEl = el;
      host.replaceChildren(el);
      this._placePopover();
    } catch (err) {
      this._cardError = err instanceof Error ? err.message : "Could not render card";
    }
  }

  private _openHotspotObj(): Hotspot | undefined {
    return this._plan?.hotspots.find((h) => h.id === this._openId);
  }

  private async _run(fn: () => Promise<unknown>): Promise<void> {
    this._actionError = "";
    try {
      await fn();
    } catch (err) {
      this._actionError = errorMessage(err);
    }
  }

  private _startEdit(): void {
    const plan = this._plan ?? { id: "main", name: "Shared space", image_url: "", hotspots: [] };
    this._draft = JSON.parse(JSON.stringify(plan));
    this._edit = true;
    this._sel = null;
    this._closePopover();
  }

  private _cancelEdit(): void {
    this._edit = false;
    this._draft = null;
    this._sel = null;
  }

  private async _save(): Promise<void> {
    if (!this.hass || !this._draft) return;
    this._saving = true;
    this._error = "";
    try {
      await saveFloorplan(this.hass, this._draft);
      const saved = this._draft;
      this._plans = [...(this._plans ?? []).filter((p) => p.id !== saved.id), saved];
      this._planId = saved.id;
      this._cancelEdit();
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._saving = false;
    }
  }

  private _createPlan(): void {
    this._draft = { id: "main", name: "Shared space", image_url: "", hotspots: [] };
    this._edit = true;
  }

  private _pct(e: PointerEvent): Pt {
    const r = this.renderRoot.querySelector(".overlay svg")!.getBoundingClientRect();
    return [round(clamp(((e.clientX - r.left) / r.width) * 100)), round(clamp(((e.clientY - r.top) / r.height) * 100))];
  }

  private _onSvgDown(e: PointerEvent): void {
    if (!this._edit) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = this._pct(e);
    this._drawing = { a: p, b: p };
    this._sel = null;
  }

  private _onSvgMove(e: PointerEvent): void {
    if (this._drawing) this._drawing = { ...this._drawing, b: this._pct(e) };
  }

  private _onSvgUp(): void {
    const d = this._drawing;
    this._drawing = null;
    if (!d || !this._draft) return;
    const pts = rectPoints(d.a, d.b);
    if (pts[1][0] - pts[0][0] < 1.5 || pts[1][1] - pts[0][1] < 1.5) return;
    const id = `h${Date.now().toString(36)}`;
    this._draft = {
      ...this._draft,
      hotspots: [
        ...this._draft.hotspots,
        { id, label: "New hotspot", shape: { type: "rect", points: pts }, target: { kind: "entity", ref: "" } },
      ],
    };
    this._sel = id;
  }

  private _patchHotspot(id: string, patch: Partial<Hotspot>): void {
    if (!this._draft) return;
    this._draft = { ...this._draft, hotspots: this._draft.hotspots.map((h) => (h.id === id ? { ...h, ...patch } : h)) };
  }

  private _deleteHotspot(id: string): void {
    if (!this._draft) return;
    this._draft = { ...this._draft, hotspots: this._draft.hotspots.filter((h) => h.id !== id) };
    this._sel = null;
  }

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      background: var(--lovelace-background, var(--primary-background-color));
      color: var(--primary-text-color);
      font-family: var(--paper-font-body1_-_font-family, inherit);
    }
    .space {
      position: relative;
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .space[hidden] {
      display: none;
    }
    /* header: tabs | title | theme + log out, same max width as the overview */
    .top {
      flex-shrink: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      gap: 12px;
    }
    .title {
      margin: 0;
      font-size: 1.4em;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 8px 0;
    }
    .fab.logout {
      position: static;
      flex: none;
    }
    @media (max-width: 720px) {
      .top {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .title {
        display: none;
      }
    }
    /* tab pages scroll inside the fixed host */
    share-space-overview,
    share-space-dashboard,
    share-space-rules-page,
    share-space-settings {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }
    /* every row is centered in the same 1500px column; scrollbars stay at the window edge */
    .top,
    share-space-overview,
    share-space-dashboard,
    share-space-rules-page,
    share-space-settings {
      box-sizing: border-box;
      width: 100%;
      padding-left: max(16px, calc((100% - 1500px) / 2));
      padding-right: max(16px, calc((100% - 1500px) / 2));
    }
    .space {
      width: 100%;
      max-width: 1500px;
      margin: 0 auto;
    }
    .page {
      padding: 16px 24px;
    }
    .fab {
      position: absolute;
      z-index: 3;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      display: grid;
      place-items: center;
      cursor: pointer;
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0, 0, 0, 0.3));
    }
    .exit {
      top: 12px;
      left: 12px;
    }
    .bar {
      position: absolute;
      z-index: 3;
      top: 12px;
      left: 72px;
      right: 12px;
      display: flex;
      gap: 8px;
      align-items: center;
      pointer-events: none;
    }
    .bar > * {
      pointer-events: auto;
    }
    .tabs {
      display: flex;
      gap: 6px;
      overflow-x: auto;
    }
    .spacer {
      flex: 1;
      pointer-events: none !important;
    }
    .btn {
      min-height: 44px;
      padding: 0 18px;
      border-radius: 22px;
      border: none;
      cursor: pointer;
      font: inherit;
      font-weight: 500;
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: var(--ha-card-box-shadow, 0 1px 4px rgba(0, 0, 0, 0.25));
      white-space: nowrap;
    }
    .btn.primary {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .btn.danger {
      color: var(--error-color);
    }
    .btn.active {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .btn[disabled] {
      opacity: 0.5;
    }
    .stage {
      position: relative;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .stage img {
      position: absolute;
      object-fit: contain;
      user-select: none;
      -webkit-user-drag: none;
    }
    .overlay {
      position: absolute;
    }
    .overlay svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      touch-action: none;
    }
    .hs {
      fill: transparent;
      stroke: transparent;
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
      cursor: pointer;
      transition: fill 0.15s, stroke 0.15s;
    }
    .hs.hover,
    .hs.open {
      fill: color-mix(in srgb, var(--primary-color) 28%, transparent);
      stroke: var(--primary-color);
    }
    .edit .hs {
      fill: color-mix(in srgb, var(--primary-color) 14%, transparent);
      stroke: var(--primary-color);
      stroke-dasharray: 6 4;
    }
    .edit .hs.sel {
      fill: color-mix(in srgb, var(--accent-color, var(--primary-color)) 35%, transparent);
      stroke-dasharray: none;
    }
    .draw {
      fill: color-mix(in srgb, var(--primary-color) 25%, transparent);
      stroke: var(--primary-color);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    .chip,
    .label {
      position: absolute;
      transform: translate(-50%, -50%);
      pointer-events: none;
      border-radius: 14px;
      padding: 4px 10px;
      font-size: 0.9em;
      white-space: nowrap;
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    }
    .chip {
      font-weight: 600;
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .label {
      transform: translate(-50%, calc(-100% - 6px));
    }
    .popover {
      position: fixed;
      z-index: 5;
      width: min(380px, calc(100vw - 24px));
      max-height: calc(100vh - 24px);
      overflow: auto;
      border-radius: var(--ha-card-border-radius, 12px);
      background: var(--card-background-color);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
    }
    .pop-head {
      display: flex;
      align-items: center;
      padding: 8px 8px 0 16px;
      font-weight: 600;
      font-size: 1.1em;
    }
    .pop-head span {
      flex: 1;
    }
    .icon-btn {
      width: 44px;
      height: 44px;
      border: none;
      background: none;
      color: var(--secondary-text-color);
      cursor: pointer;
      display: grid;
      place-items: center;
      border-radius: 50%;
    }
    .pop-body {
      padding: 8px 16px 16px;
    }
    .big {
      font-size: 1.4em;
      font-weight: 500;
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .error {
      color: var(--error-color);
      padding: 4px 0;
    }
    ul {
      margin: 8px 0 0;
      padding-left: 20px;
    }
    .center {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 24px;
    }
    .editor {
      position: absolute;
      z-index: 4;
      right: 12px;
      bottom: 12px;
      width: min(340px, calc(100vw - 24px));
      max-height: 60vh;
      overflow: auto;
      box-sizing: border-box;
      padding: 16px;
      border-radius: var(--ha-card-border-radius, 12px);
      background: var(--card-background-color);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 0.85em;
      color: var(--secondary-text-color);
    }
    input,
    select,
    textarea {
      min-height: 44px;
      box-sizing: border-box;
      padding: 8px 10px;
      font: inherit;
      color: var(--primary-text-color);
      background: var(--secondary-background-color);
      border: 1px solid var(--divider-color);
      border-radius: 8px;
    }
    textarea {
      min-height: 120px;
      font-family: monospace;
    }
    .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
  `;

  protected render(): TemplateResult {
    const plans = this._plans;
    const plan = this._plan;
    const tab = this._activeTab;
    return html`
      ${this._fullHa ? html`<button class="fab exit" aria-label="Back" @click=${this._exit}>${ICON_BACK}</button>` : nothing}
      <div class="top">
      ${this._tabs.length > 1
        ? html`<share-space-panel-tabs
            ?inset=${!!this._fullHa}
            .tabs=${this._tabs}
            .active=${tab}
            @tab-change=${(e: CustomEvent<string>) => {
              this._tab = e.detail;
              this._closePopover();
            }}
          ></share-space-panel-tabs>`
        : html`<div></div>`}
        <h1 class="title">${this.hass?.config?.location_name ?? "Share Space"}</h1>
        <div class="actions">
          <share-space-theme-picker .hass=${this.hass}></share-space-theme-picker>
          ${this._fullHa
            ? nothing
            : html`<button class="fab logout" aria-label="Log out" title="Log out" @click=${this._logout}>${ICON_LOGOUT}</button>`}
        </div>
      </div>
      <div class="space" ?hidden=${tab !== "space"}>
        ${plans === null && !this._draft ? html`<div class="center muted">Loading…</div>` : nothing}
        ${plan ? this._renderStage(plan) : plans !== null ? this._renderEmpty() : nothing}
        ${plan ? this._renderBar(plans ?? []) : nothing}
        ${this._edit && this._draft ? this._renderEditor(this._draft) : nothing}
        ${this._renderPopover()}
      </div>
      ${tab === "overview" ? html`<share-space-overview .hass=${this.hass}></share-space-overview>` : nothing}
      ${this._dashboards.map((d) =>
        tab === `dash:${d.url_path ?? "lovelace"}`
          ? html`<share-space-dashboard .hass=${this.hass} .urlPath=${d.url_path}></share-space-dashboard>`
          : nothing,
      )}
      ${tab === "rules" ? html`<share-space-rules-page .hass=${this.hass}></share-space-rules-page>` : nothing}
      ${tab === "settings"
        ? html`<share-space-settings
            .role=${this._role}
            .fullHa=${!!this._fullHa}
            .everyone=${this._everyone}
            .outdoorEntity=${this._outdoor}
            .outdoorOptions=${this._outdoorOptions}
            @outdoor-change=${(e: CustomEvent<string | null>) => void this._setOutdoor(e.detail)}
            @technical-change=${(e: CustomEvent<boolean>) => void this._setTechnical(e.detail)}
            @full-ha-change=${(e: CustomEvent<boolean>) => void this._setFullHa(e.detail)}
            @everyone-change=${(e: CustomEvent<boolean>) => void this._setEveryone(e.detail)}
          >
            ${this._isAdmin
              ? html`<share-space-zones-settings slot="zones" .hass=${this.hass}></share-space-zones-settings>
                  <share-space-users-settings slot="users" .hass=${this.hass}></share-space-users-settings>
                  <share-space-dashboards-settings
                    slot="dashboards"
                    .hass=${this.hass}
                    @dashboards-change=${(e: CustomEvent<SpaceDashboard[]>) => {
                      void dashboardsForUser(this.hass!, e.detail).then((d) => (this._dashboards = d));
                    }}
                  ></share-space-dashboards-settings>`
              : nothing}
            ${this._role === "technical_admin"
              ? html`<share-space-extension-points slot="extension-points" .hass=${this.hass}></share-space-extension-points>`
              : nothing}
          </share-space-settings>`
        : nothing}
    `;
  }

  private _renderEmpty(): TemplateResult {
    return html`
      <div class="center">
        <div class="big">No floor plan yet</div>
        ${this._error ? html`<div class="error">${this._error}</div>` : nothing}
        ${this._isAdmin
          ? html`<button class="btn primary" @click=${this._createPlan}>Create plan</button>`
          : html`<div class="muted">Ask an administrator to create one.</div>`}
      </div>
    `;
  }

  private _renderBar(plans: Floorplan[]): TemplateResult {
    return html`
      <div class="bar">
        ${plans.length > 1 && !this._edit
          ? html`<div class="tabs">
              ${plans.map(
                (p) =>
                  html`<button
                    class="btn ${p.id === this._plan?.id ? "active" : ""}"
                    @click=${() => {
                      this._planId = p.id;
                      this._closePopover();
                    }}
                  >
                    ${p.name || p.id}
                  </button>`,
              )}
            </div>`
          : nothing}
        <span class="spacer"></span>
        ${this._error ? html`<span class="error">${this._error}</span>` : nothing}
        ${this._isAdmin && !this._edit ? html`<button class="btn" @click=${this._startEdit}>Edit</button>` : nothing}
        ${this._edit
          ? html`<button class="btn" @click=${this._cancelEdit}>Cancel</button>
              <button class="btn primary" ?disabled=${this._saving} @click=${this._save}>Save</button>`
          : nothing}
      </div>
    `;
  }

  private _renderStage(plan: Floorplan): TemplateResult {
    const b = this._box;
    const src = plan.image_url && !this._imgFailed ? plan.image_url : PLACEHOLDER_URL;
    const boxStyle = { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` };
    return html`
      <div class="stage ${this._edit ? "edit" : ""}" @click=${() => this._openId && this._closePopover()}>
        <img
          src=${src}
          alt=""
          style=${styleMap(boxStyle)}
          @load=${this._onImgLoad}
          @error=${this._onImgError}
        />
        <div class="overlay" style=${styleMap(boxStyle)}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            @pointerdown=${this._onSvgDown}
            @pointermove=${this._onSvgMove}
            @pointerup=${this._onSvgUp}
          >
            ${plan.hotspots.map(
              (h) => html`<polygon
                class="hs ${this._hoverId === h.id ? "hover" : ""} ${this._openId === h.id ? "open" : ""} ${this._sel === h.id ? "sel" : ""}"
                points=${polyPoints(h)}
                @pointerdown=${(e: PointerEvent) => this._edit && e.stopPropagation()}
                @pointerenter=${() => (this._hoverId = h.id)}
                @pointerleave=${() => (this._hoverId = null)}
                @click=${(e: Event) => (this._edit ? this._selectHotspot(h.id, e) : this._openHotspot(h.id, e))}
              ></polygon>`,
            )}
            ${this._drawing
              ? html`<polygon class="draw" points=${polyPoints({ shape: { type: "rect", points: rectPoints(this._drawing.a, this._drawing.b) } } as Hotspot)}></polygon>`
              : nothing}
          </svg>
          ${plan.hotspots.map((h) => this._renderBadge(h))}
        </div>
      </div>
    `;
  }

  private _selectHotspot(id: string, e: Event): void {
    e.stopPropagation();
    this._sel = id;
  }

  private _renderBadge(h: Hotspot): TemplateResult | typeof nothing {
    const [cx, cy] = centroid(h.shape.type === "rect" ? [[h.shape.points[0][0], h.shape.points[0][1]], [h.shape.points[1][0], h.shape.points[1][1]]] : h.shape.points);
    const pos = { left: `${cx}%`, top: `${cy}%` };
    if (h.target.kind === "heating" && typeof h.target.ref === "string" && this.hass && !this._edit) {
      const vm = zoneViewModel(this.hass, h.target.ref);
      if (vm) {
        return html`<div class="chip" style=${styleMap(pos)}>${vm.target}${vm.unit}</div>`;
      }
    }
    if (this._hoverId === h.id || (this._edit && this._sel === h.id)) {
      return html`<div class="label" style=${styleMap(pos)}>${h.label}</div>`;
    }
    return nothing;
  }

  private _renderPopover(): TemplateResult | typeof nothing {
    const h = this._openHotspotObj();
    if (!h || this._edit) return nothing;
    const pos = this._popPos ?? { left: 0, top: 0 };
    return html`
      <div
        class="popover"
        style=${styleMap({ left: `${pos.left}px`, top: `${pos.top}px`, visibility: this._popPos ? "visible" : "hidden" })}
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="pop-head">
          <span>${h.label}</span>
          <button class="icon-btn" aria-label="Close" @click=${this._closePopover}>${ICON_CLOSE}</button>
        </div>
        <div class="pop-body">
          ${this._renderTarget(h)}
          ${this._actionError ? html`<div class="error">${this._actionError}</div>` : nothing}
        </div>
      </div>
    `;
  }

  private _renderTarget(h: Hotspot): TemplateResult {
    const hass = this.hass;
    const ref = h.target.ref;
    if (!hass) return html``;
    switch (h.target.kind) {
      case "heating": {
        const vm = typeof ref === "string" ? zoneViewModel(hass, ref) : null;
        if (!vm) return html`<div class="error">Entity not found: ${String(ref)}</div>`;
        return renderHeatingControl(hass, vm, (fn) => void this._run(fn), true);
      }
      case "area": {
        const id = String(ref);
        const info = this._areas.find((a) => a.area_id === id);
        const sensor = hass.states[info?.entity_id ?? `binary_sensor.share_space_${id}`];
        const names = (info?.persons ?? []).map((p) => String(hass.states[p]?.attributes.friendly_name ?? p));
        return html`
          <div class="big">${sensor ? (sensor.state === "on" ? "Occupied" : "Empty") : "Unknown"}</div>
          ${names.length
            ? html`<ul>${names.map((n) => html`<li>${n}</li>`)}</ul>`
            : html`<div class="muted">Nobody assigned</div>`}
        `;
      }
      case "entity": {
        const id = String(ref);
        const st = hass.states[id];
        if (!st) return html`<div class="error">Entity not found: ${id}</div>`;
        const unit = st.attributes.unit_of_measurement ? ` ${st.attributes.unit_of_measurement}` : "";
        const toggle = TOGGLE_DOMAINS.includes(id.split(".")[0]);
        return html`
          <div class="muted">${String(st.attributes.friendly_name ?? id)}</div>
          <div class="big">${st.state}${unit}</div>
          ${toggle
            ? html`<div class="row" style="margin-top:12px">
                <button class="btn primary" @click=${() => this._run(() => hass.callService("homeassistant", "toggle", { entity_id: id }))}>
                  Toggle
                </button>
              </div>`
            : nothing}
        `;
      }
      case "card":
        return html`<div class="card-host"></div>${this._cardError ? html`<div class="error">${this._cardError}</div>` : nothing}`;
    }
  }

  private _renderEditor(plan: Floorplan): TemplateResult {
    const sel = plan.hotspots.find((h) => h.id === this._sel);
    return html`
      <div class="editor">
        <label>
          Plan name
          <input .value=${plan.name} @input=${(e: Event) => (this._draft = { ...plan, name: (e.target as HTMLInputElement).value })} />
        </label>
        <label>
          Image URL
          <input
            placeholder="/local/space.png"
            .value=${plan.image_url}
            @change=${(e: Event) => {
              this._imgFailed = false;
              this._draft = { ...plan, image_url: (e.target as HTMLInputElement).value.trim() };
            }}
          />
          <span>Leave empty for the placeholder. Drag on the image to draw a hotspot.</span>
        </label>
        ${sel ? this._renderHotspotEditor(sel) : html`<div class="muted">Draw a rectangle, or tap a hotspot to edit it.</div>`}
      </div>
    `;
  }

  private _renderHotspotEditor(h: Hotspot): TemplateResult {
    const kind = h.target.kind;
    const ref = h.target.ref;
    const setTarget = (t: Partial<Hotspot["target"]>) => this._patchHotspot(h.id, { target: { ...h.target, ...t } });
    return html`
      <label>
        Label
        <input .value=${h.label} @input=${(e: Event) => this._patchHotspot(h.id, { label: (e.target as HTMLInputElement).value })} />
      </label>
      <label>
        Type
        <select
          @change=${(e: Event) => {
            const k = (e.target as HTMLSelectElement).value as Hotspot["target"]["kind"];
            this._patchHotspot(h.id, { target: { kind: k, ref: k === "card" ? { type: "markdown", content: "Hello" } : "" } });
          }}
        >
          ${KINDS.map((k) => html`<option value=${k} ?selected=${k === kind}>${KIND_LABEL[k]}</option>`)}
        </select>
      </label>
      ${kind === "card" ? this._cardEditor(h, ref, setTarget) : this._refEditor(kind, ref, setTarget)}
      <div class="row">
        <button class="btn danger" @click=${() => this._deleteHotspot(h.id)}>Delete hotspot</button>
      </div>
    `;
  }

  private _refEditor(kind: string, ref: unknown, setTarget: (t: Partial<Hotspot["target"]>) => void): TemplateResult {
    const value = typeof ref === "string" ? ref : "";
    if (kind !== "area" && customElements.get("ha-entity-picker")) {
      const domains = kind === "heating" ? ["sensor", "climate"] : undefined;
      return html`<ha-entity-picker
        .hass=${this.hass}
        .value=${value}
        .includeDomains=${domains}
        allow-custom-entity
        @value-changed=${(e: CustomEvent<{ value: string }>) => setTarget({ ref: e.detail.value ?? "" })}
      ></ha-entity-picker>`;
    }
    return html`<label>
      ${kind === "area" ? "Area id" : "Entity id"}
      <input .value=${value} @input=${(e: Event) => setTarget({ ref: (e.target as HTMLInputElement).value.trim() })} />
    </label>`;
  }

  private _cardEditor(h: Hotspot, ref: unknown, setTarget: (t: Partial<Hotspot["target"]>) => void): TemplateResult {
    return html`<label>
      Card config (JSON)
      <textarea
        .value=${JSON.stringify(ref, null, 2)}
        @change=${(e: Event) => {
          const el = e.target as HTMLTextAreaElement;
          try {
            setTarget({ ref: JSON.parse(el.value) });
            el.style.borderColor = "";
          } catch {
            el.style.borderColor = "var(--error-color)";
          }
        }}
      ></textarea>
    </label>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-space": ShareSpaceSpace;
  }
}
