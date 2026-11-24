import { LitElement, html } from "lit";
import type { PropertyValues } from "lit";
import { property, state } from "lit/decorators.js";
import { syncLanguage } from "./hass";
import type { HomeAssistant } from "./hass";
import { t } from "../i18n";
import type { LovelaceGridOptions } from "./lovelace-grid-options";

declare global {
  interface Window {
    customCards: Array<Record<string, unknown>>;
  }
}

export interface CustomCardInfo {
  type: string;
  name: string;
  description: string;
  preview?: boolean;
}

export function registerCustomCard(info: CustomCardInfo): void {
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === info.type)) window.customCards.push({ ...info });
}

export abstract class ShareSpaceCardBase<C extends { type: string } = { type: string }> extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() protected _config?: C;

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("hass") && syncLanguage(this.hass)) this.requestUpdate();
  }

  setConfig(config: C): void {
    this._config = config;
  }

  getGridOptions(): LovelaceGridOptions {
    return { columns: 12, min_columns: 6, rows: "auto" } as unknown as LovelaceGridOptions;
  }

  getCardSize(): number {
    return 4;
  }
}

export function renderBackendMissing(name: string) {
  const [before, after] = t("Install the {name} integration to use this card.", { name: "\u0000" }).split("\u0000");
  return html`
    <ha-card>
      <div style="padding:16px;color:var(--secondary-text-color)">
        ${before}<strong>${name}</strong>${after}
      </div>
    </ha-card>
  `;
}
