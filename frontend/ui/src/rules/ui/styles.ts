import { css } from "lit";

/** Same surface as HA's ha-card (theme background, border, radius, frosted blur). */
export const haCardSurface = css`
  background: var(--ha-card-background, var(--card-background-color, #fff));
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color));
  border-radius: var(--ha-card-border-radius, 12px);
  box-shadow: var(--ha-card-box-shadow, none);
  backdrop-filter: var(--ha-card-backdrop-filter, none);
  -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
`;

export const ruleStyles = css`
  :host {
    display: block;
    color: var(--primary-text-color);
  }
  button,
  select,
  input {
    min-height: 44px;
    box-sizing: border-box;
    font: inherit;
    color: var(--primary-text-color);
    border: 1px solid var(--divider-color);
    border-radius: 8px;
    background: var(--card-background-color, #fff);
    padding: 0 12px;
  }
  button {
    background: transparent;
    border-radius: 22px;
    cursor: pointer;
    min-width: 44px;
  }
  button.active {
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
    border-color: transparent;
  }
  button.danger {
    color: var(--error-color);
    border-color: var(--error-color);
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  input[type="number"] {
    width: 90px;
  }
  input.time {
    width: 90px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .muted {
    color: var(--secondary-text-color);
    font-size: 0.9em;
  }
  .err {
    color: var(--error-color);
    font-size: 0.85em;
  }
  .invalid {
    border-color: var(--error-color);
  }
  .chip {
    border-radius: 22px;
  }
  label.inline {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    min-height: 44px;
  }
  label.inline input {
    min-height: 0;
  }
`;
