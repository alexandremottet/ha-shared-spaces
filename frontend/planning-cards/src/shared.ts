import { css, html } from "lit";
import type { HomeAssistant } from "ha-share-space-ui/ha";

export interface AreaEntry {
  area_id: string;
  name: string;
}

export const listHaAreas = (hass: HomeAssistant) =>
  hass.callWS<AreaEntry[]>({ type: "config/area_registry/list" });

export const cardStyles = css`
  :host {
    display: block;
    container-type: inline-size;
  }
  ha-card {
    background: none;
    padding: 16px;
    box-sizing: border-box;
    height: 100%;
  }
  .title {
    font-size: 1.1em;
    font-weight: 600;
    margin: 0 0 12px;
  }
  .placeholder {
    color: var(--secondary-text-color);
    margin: 0;
  }
`;

export const message = (text: string) => html`
  <ha-card><p class="placeholder">${text}</p></ha-card>
`;
