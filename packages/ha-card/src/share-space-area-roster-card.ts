import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { PropertyValues } from "lit";
import "ha-share-space-components";
import type { RosterPerson, RosterViewMode } from "ha-share-space-components";
import type { Calendar } from "ha-share-space-types";
import { haTheme } from "./ha-theme";
import type { LovelaceGridOptions } from "./lovelace-grid-options";
import type { LovelaceConfigForm } from "./lovelace-config-form";

interface HassEntity {
  entity_id: string;
  attributes: Record<string, unknown>;
}

interface HomeAssistant {
  states: Record<string, HassEntity>;
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  callService(domain: string, service: string, serviceData?: Record<string, unknown>): Promise<void>;
}

/** One HA automation-style action, as produced/edited by the `action` selector. */
type HaAction = Record<string, unknown>;

interface CardConfig {
  type: string;
  area: string;
  view_mode?: RosterViewMode;
  on_action?: HaAction[];
  off_action?: HaAction[];
}

/**
 * Read-only merged calendar for one Area: every person assigned to it, with their own
 * periods, either as separate lanes (one row per person), a single overlap-striped timeline.
 */
@customElement("share-space-area-roster-card")
export class ShareSpaceAreaRosterCard extends LitElement {
  static styles = [
    haTheme,
    css`
      ha-card {
        padding: 16px;
      }
      ha-card .card-content > *:first-child {
        margin-top: 0;
      }
      ha-card .card-content > *:last-child {
        margin-bottom: 0;
      }
    `,
  ];

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _config?: CardConfig;
  @state() private _people: RosterPerson[] | null = null;

  protected willUpdate(changed: PropertyValues): void {
    if ((changed.has("hass") || changed.has("_config")) && this.hass && this._config && this._people === null) {
      this._loadPeople();
    }
  }

  setConfig(config: CardConfig): void {
    if (!config.area) {
      throw new Error("You need to define an area in the card config.");
    }
    this._syncAreaActionIfChanged(config);
    this._config = config;
  }

  /**
   * The card's own config is dashboard-YAML state; our backend needs to know the configured
   * actions too, since it (not this card) is what keeps scheduler-component in sync -- so any
   * change is pushed to it via `set_area_action` as soon as the card sees a new config.
   */
  private _syncAreaActionIfChanged(config: CardConfig): void {
    if (!this.hass) {
      return;
    }
    const previous = this._config;
    const onAction = config.on_action ?? [];
    const offAction = config.off_action ?? [];
    const changed =
      !previous ||
      previous.area !== config.area ||
      JSON.stringify(previous.on_action ?? []) !== JSON.stringify(onAction) ||
      JSON.stringify(previous.off_action ?? []) !== JSON.stringify(offAction);
    if (!changed) {
      return;
    }
    this.hass.callService("share_space", "set_area_action", {
      area: config.area,
      on_action: onAction,
      off_action: offAction,
    });
  }

  private async _loadPeople(): Promise<void> {
    const { persons } = await this.hass!.callWS<{ persons: Record<string, Calendar> }>({
      type: "share_space/get_area_calendars",
      area: this._config!.area,
    });
    this._people = Object.entries(persons).map(([id, calendar]) => ({
      id,
      label: this._labelFor(id),
      calendar,
    }));
  }

  private _labelFor(personId: string): string {
    const friendlyName = this.hass?.states[personId]?.attributes.friendly_name;
    return typeof friendlyName === "string" ? friendlyName : personId;
  }

  protected render() {
    if (!this._config) {
      return html``;
    }
    return html`
      <ha-card header="Share Space">
        <div class="card-content">
          ${this._people === null
            ? html`<p>Loading…</p>`
            : html`<area-roster-view .people=${this._people} .viewMode=${this._config.view_mode ?? "lanes"}></area-roster-view>`}
        </div>
      </ha-card>
    `;
  }

  static getStubConfig(): CardConfig {
    return { type: "custom:share-space-area-roster-card", area: "", view_mode: "lanes", on_action: [], off_action: [] };
  }

  static getConfigForm(): LovelaceConfigForm {
    return {
      schema: [
        { name: "area", required: true, selector: { area: {} } },
        {
          name: "view_mode",
          selector: {
            select: {
              mode: "box",
              options: [
                { value: "lanes", label: "One row per person" },
                { value: "overlap", label: "Merged timeline with overlap stripes" },
                { value: "merged", label: "Plain merged calendar (no distinction)" },
              ],
            },
          },
        },
        { name: "on_action", selector: { action: {} } },
        { name: "off_action", selector: { action: {} } },
      ],
    };
  }

  /** Sizing for the sections-view "Layout" tab: a week's worth of rows, full-width by default. */
  public getGridOptions(): LovelaceGridOptions {
    return {
      columns: 12,
      min_columns: 6,
      rows: 10,
      min_rows: 6,
    };
  }
}

declare global {
  interface Window {
    customCards: Array<Record<string, unknown>>;
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "share-space-area-roster-card",
  name: "Share Space (Area Roster)",
  description: "Read-only merged calendar for one Area: per-person lanes, an overlap-striped timeline, or plain merged.",
});

declare global {
  interface HTMLElementTagNameMap {
    "share-space-area-roster-card": ShareSpaceAreaRosterCard;
  }
}
