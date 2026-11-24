import "./i18n-fr";
import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";
import { safeCustomElement, t } from "ha-share-space-ui";
import type { PropertyValues } from "lit";
import {
  syncLanguage,
  haTheme,
  registerCustomCard,
  renderBackendMissing,
  isBackendMissing,
  findMyPerson,
  getPersonArea,
  assignPersonArea,
} from "ha-share-space-ui/ha";
import type { HomeAssistant, LovelaceGridOptions, LovelaceConfigForm } from "ha-share-space-ui/ha";
import { cardStyles, listHaAreas, message } from "./shared";
import type { AreaEntry } from "./shared";

interface CardConfig {
  type: string;
  areas?: string[];
}

@safeCustomElement("share-space-work-area-card")
export class ShareSpaceWorkAreaCard extends LitElement {
  static styles = [
    haTheme,
    cardStyles,
    css`
      /* set once, so it takes one line: a label and a select */
      ha-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 8px 8px 16px;
      }
      .title {
        margin: 0;
        flex: none;
      }
      select {
        flex: 1;
        min-width: 0;
        min-height: 40px;
        padding: 0 12px;
        border-radius: 4px;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font: inherit;
        cursor: pointer;
      }
    `,
  ];

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _config?: CardConfig;
  @state() private _areas: AreaEntry[] | null = null;
  @state() private _current: string | null = null;
  @state() private _missing = false;
  private _started = false;

  setConfig(config: CardConfig): void {
    this._config = config;
  }

  protected willUpdate(_changed: PropertyValues): void {
    syncLanguage(this.hass);
    if (this.hass && !this._started) {
      this._started = true;
      this._init();
    }
  }

  private async _init(): Promise<void> {
    try {
      this._areas = await listHaAreas(this.hass!);
      const person = findMyPerson(this.hass);
      if (person) {
        this._current = await getPersonArea(this.hass!, person.entity_id);
      }
    } catch (err) {
      this._missing = isBackendMissing(err);
      this._areas ??= [];
    }
  }

  private async _pick(area: string): Promise<void> {
    const person = findMyPerson(this.hass);
    if (!person || area === this._current) {
      return;
    }
    const previous = this._current;
    this._current = area;
    try {
      await assignPersonArea(this.hass!, person.entity_id, area);
    } catch {
      this._current = previous;
    }
  }

  protected render() {
    if (this._missing) {
      return renderBackendMissing("Share Space");
    }
    if (!this._config || this._areas === null) {
      return message(t("Loading…"));
    }
    if (!findMyPerson(this.hass)) {
      return message(t("No person is linked to your account."));
    }
    const allow = this._config.areas;
    const areas = allow?.length ? this._areas.filter((a) => allow.includes(a.area_id)) : this._areas;
    return html`
      <ha-card>
        <p class="title">${t("My place")}</p>
        <select aria-label=${t("My place")} @change=${(e: Event) => this._pick((e.target as HTMLSelectElement).value)}>
          <option value="" disabled ?selected=${!this._current}>${t("Choose an area")}</option>
          ${areas.map((a) => html`<option value=${a.area_id} ?selected=${a.area_id === this._current}>${a.name}</option>`)}
        </select>
      </ha-card>
    `;
  }

  static getStubConfig(): CardConfig {
    return { type: "custom:share-space-work-area-card" };
  }

  static getConfigForm(): LovelaceConfigForm {
    return { schema: [{ name: "areas", selector: { area: { multiple: true } } }] };
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 12, min_columns: 4, rows: 1, min_rows: 1 };
  }
}

registerCustomCard({
  type: "share-space-work-area-card",
  name: "Share Space: My place",
  description: "Pick the area where you work.",
});

declare global {
  interface HTMLElementTagNameMap {
    "share-space-work-area-card": ShareSpaceWorkAreaCard;
  }
}
