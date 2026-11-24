import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { PropertyValues } from "lit";
import "ha-share-space-ui";
import { t } from "ha-share-space-ui";
import type { RosterPerson, RosterViewMode } from "ha-share-space-ui";
import {
  syncLanguage,
  haTheme,
  registerCustomCard,
  renderBackendMissing,
  isBackendMissing,
  findMyPerson,
  getPersonArea,
  getAreaCalendars,
  getAreaActions,
  listZones,
  summarizeAreaLinks,
  formatLinkChips,
} from "ha-share-space-ui/ha";
import type { HomeAssistant, LovelaceGridOptions, LovelaceConfigForm, AreaActions, HeatingZone } from "ha-share-space-ui/ha";
import { cardStyles, message } from "./shared";

interface CardConfig {
  type: string;
  area?: string;
  view_mode?: RosterViewMode;
}

const hhmm = (iso: unknown): string | null => {
  if (typeof iso !== "string") {
    return null;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

@customElement("share-space-area-planning-card")
export class ShareSpaceAreaPlanningCard extends LitElement {
  static styles = [
    haTheme,
    cardStyles,
    css`
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-radius: 20px;
        margin-bottom: 12px;
        font-weight: 600;
        background: var(--divider-color);
        color: var(--primary-text-color);
      }
      .badge.on {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      .badge small {
        font-weight: 400;
      }
      .links {
        display: flex;
        align-items: center;
        gap: 8px 16px;
        flex-wrap: wrap;
        margin-bottom: 12px;
        color: var(--primary-text-color);
      }
      .links .muted {
        color: var(--secondary-text-color);
      }
      .links button {
        min-height: 44px;
        padding: 0 16px;
        border-radius: 22px;
        border: 1px solid var(--divider-color);
        background: transparent;
        color: var(--primary-text-color);
        font: inherit;
        cursor: pointer;
      }
      .links button.active {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
        border-color: transparent;
      }
      .roster.admin {
        cursor: pointer;
      }
      .editor {
        margin-top: 12px;
        border-top: 1px solid var(--divider-color);
      }
    `,
  ];

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _config?: CardConfig;
  @state() private _area: string | null = null;
  @state() private _people: RosterPerson[] | null = null;
  @state() private _missing = false;
  @state() private _actions: AreaActions | null = null;
  @state() private _zones: HeatingZone[] = [];
  @state() private _popOpen = false;
  @state() private _editor: HTMLElement | null = null;
  private _linksArea = "";
  private _resolving = false;
  private _loadedKey = "";

  setConfig(config: CardConfig): void {
    this._config = config;
    this._area = config.area || null;
    this._people = null;
    this._loadedKey = "";
    this._linksArea = "";
    this._editor = null;
  }

  private get _entityId(): string | null {
    return this._area ? `binary_sensor.share_space_${this._area}` : null;
  }

  private get _sensorKey(): string {
    const s = this._entityId ? this.hass?.states[this._entityId] : undefined;
    return s ? `${s.last_changed}|${JSON.stringify(s.attributes.persons)}` : "";
  }

  protected willUpdate(changed: PropertyValues): void {
    syncLanguage(this.hass);
    if (!this.hass || !this._config) {
      return;
    }
    if (!this._area) {
      this._resolveArea();
      return;
    }
    if (this._linksArea !== this._area) {
      this._linksArea = this._area;
      void this._loadLinks();
    }
    const key = `${this._area}|${this._sensorKey}`;
    if (key !== this._loadedKey && (changed.has("hass") || changed.has("_area") || changed.has("_config"))) {
      this._loadedKey = key;
      this._load();
    }
  }

  private async _resolveArea(): Promise<void> {
    const person = findMyPerson(this.hass);
    if (this._resolving || !person) {
      return;
    }
    this._resolving = true;
    try {
      this._area = await getPersonArea(this.hass!, person.entity_id);
      if (!this._area) {
        this._people = [];
      }
    } catch (err) {
      this._missing = isBackendMissing(err);
    } finally {
      this._resolving = false;
    }
  }

  private async _loadLinks(): Promise<void> {
    const [actions, zones] = await Promise.allSettled([getAreaActions(this.hass!, this._area!), listZones(this.hass!)]);
    this._actions = actions.status === "fulfilled" ? actions.value : null;
    this._zones = zones.status === "fulfilled" ? zones.value : [];
  }

  private get _isAdmin(): boolean {
    return !!this.hass?.user?.is_admin;
  }

  private _openPopover(): void {
    if (this._isAdmin) this._popOpen = true;
  }

  private _onPopoverClose(): void {
    this._popOpen = false;
  }

  private _makeEditor(): HTMLElement {
    const el = document.createElement("share-space-area-actions-card") as HTMLElement & { setConfig(c: unknown): void };
    el.setConfig({ type: "custom:share-space-area-actions-card", area: this._area });
    return el;
  }

  private _toggleEditor(): void {
    this._editor = this._editor ? null : this._makeEditor();
    this._popOpen = false;
  }

  private _onLinksChanged(): void {
    void this._loadLinks();
    if (this._editor) {
      this._editor = this._makeEditor();
    }
  }

  protected updated(): void {
    if (this._editor) {
      (this._editor as HTMLElement & { hass?: HomeAssistant }).hass = this.hass;
    }
  }

  private _renderLinks() {
    const links = summarizeAreaLinks(this._actions, this._zones, this.hass, this._area ?? undefined);
    const empty = links.length === 0;
    if (empty && !this._isAdmin) {
      return null;
    }
    return html`
      <div class="links">
        ${empty
          ? html`<span class="muted">${t("Nothing linked to this planning yet.")}</span>`
          : html`<span><span class="muted">${t("Linked:")}</span> ${formatLinkChips(links)}</span>`}
        ${this._isAdmin
          ? html`<button
              class=${this._popOpen ? "active" : ""}
              aria-haspopup="dialog"
              @click=${() => this._openPopover()}
            >
              ${t("⚡ What runs")}
            </button>`
          : null}
      </div>
    `;
  }

  private async _load(): Promise<void> {
    try {
      const calendars = await getAreaCalendars(this.hass!, this._area!);
      this._people = Object.entries(calendars).map(([id, calendar]) => {
        const name = this.hass?.states[id]?.attributes.friendly_name;
        return { id, label: typeof name === "string" ? name : id, calendar };
      });
    } catch (err) {
      this._missing = isBackendMissing(err);
      this._people ??= [];
    }
  }

  private _renderBadge() {
    const sensor = this._entityId ? this.hass?.states[this._entityId] : undefined;
    if (!sensor) {
      return null;
    }
    const on = sensor.state === "on";
    const time = hhmm(sensor.attributes.next_change);
    return html`
      <div class="badge ${on ? "on" : ""}">
        ${on ? t("Occupied") : t("Empty")}
        ${time ? html`<small>${on ? t("until {time}", { time }) : t("from {time}", { time })}</small>` : null}
      </div>
    `;
  }

  protected render() {
    if (this._missing) {
      return renderBackendMissing("Share Space");
    }
    if (!this._config || !this.hass) {
      return html``;
    }
    if (!this._area) {
      return message(this._people ? t("Pick an area in the card settings.") : t("Loading…"));
    }
    return html`
      <ha-card>
        ${this._renderBadge()}
        ${this._popOpen
          ? html`<share-space-area-trigger-popover
              .hass=${this.hass}
              .area=${this._area}
              .open=${true}
              @popover-close=${this._onPopoverClose}
              @links-changed=${this._onLinksChanged}
              @open-actions-editor=${this._toggleEditor}
            ></share-space-area-trigger-popover>`
          : html`${this._renderLinks()}
              ${this._people === null
                ? html`<p class="placeholder">${t("Loading…")}</p>`
                : html`<div
                    class="roster ${this._isAdmin ? "admin" : ""}"
                    title=${this._isAdmin ? t("Click to choose what this planning drives") : ""}
                    @click=${this._isAdmin ? () => this._openPopover() : null}
                  >
                    <area-roster-view .people=${this._people} .viewMode=${this._config.view_mode ?? "lanes"}></area-roster-view>
                  </div>`}
              ${this._editor ? html`<div class="editor" @actions-saved=${() => void this._loadLinks()}>${this._editor}</div>` : null}`}
      </ha-card>
    `;
  }

  static getStubConfig(): CardConfig {
    return { type: "custom:share-space-area-planning-card", view_mode: "lanes" };
  }

  static getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        { name: "area", selector: { area: {} } },
        {
          name: "view_mode",
          selector: {
            select: {
              mode: "box",
              options: [
                { value: "lanes", label: t("One row per person") },
                { value: "overlap", label: t("Overlap stripes") },
                { value: "merged", label: t("Merged") },
              ],
            },
          },
        },
      ],
    };
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 12, min_columns: 6, rows: 10, min_rows: 6 };
  }
}

registerCustomCard({
  type: "share-space-area-planning-card",
  name: "Share Space: Area planning",
  description: "Who is in an area this week, with live occupancy.",
});

declare global {
  interface HTMLElementTagNameMap {
    "share-space-area-planning-card": ShareSpaceAreaPlanningCard;
  }
}
