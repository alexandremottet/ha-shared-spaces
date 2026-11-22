import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";
import { safeCustomElement } from "ha-share-space-ui";
import type { PropertyValues } from "lit";
import {
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
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      button {
        flex: 1 1 140px;
        min-height: 56px;
        padding: 0 16px;
        border-radius: 28px;
        border: 2px solid var(--divider-color);
        background: transparent;
        color: var(--primary-text-color);
        font: inherit;
        font-size: 1.05em;
        cursor: pointer;
      }
      button.active {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: var(--text-primary-color, #fff);
        font-weight: 600;
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
      return message("Loading…");
    }
    if (!findMyPerson(this.hass)) {
      return message("No person is linked to your account.");
    }
    const allow = this._config.areas;
    const areas = allow?.length ? this._areas.filter((a) => allow.includes(a.area_id)) : this._areas;
    return html`
      <ha-card>
        <p class="title">Where do I work?</p>
        <div class="chips">
          ${areas.map(
            (a) => html`
              <button class=${a.area_id === this._current ? "active" : ""} @click=${() => this._pick(a.area_id)}>
                ${a.name}
              </button>
            `
          )}
        </div>
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
    return { columns: 12, min_columns: 4, rows: 3, min_rows: 2 };
  }
}

registerCustomCard({
  type: "share-space-work-area-card",
  name: "Share Space: Where do I work?",
  description: "Tap an area to say where you work.",
});

declare global {
  interface HTMLElementTagNameMap {
    "share-space-work-area-card": ShareSpaceWorkAreaCard;
  }
}
