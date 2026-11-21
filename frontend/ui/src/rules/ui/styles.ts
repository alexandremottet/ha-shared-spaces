import { css } from "lit";

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
