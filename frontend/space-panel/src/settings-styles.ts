import { css } from "lit";
import { haCardSurface } from "ha-share-space-ui";
import { selectStyles } from "./select-styles";

// Shared look of the Settings sections.
const base = css`
  :host {
    display: block;
    color: var(--primary-text-color);
  }
  .card {
    ${haCardSurface}
    padding: 12px 16px;
    margin-bottom: 12px;
  }
  h4 {
    margin: 0 0 8px;
  }
  p {
    margin: 4px 0 12px;
  }
  .muted {
    color: var(--secondary-text-color);
  }
  .error {
    color: var(--error-color, #db4437);
  }
  .field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  button {
    min-height: 36px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid var(--divider-color);
    background: var(--card-background-color);
    color: var(--primary-text-color);
    font: inherit;
  }
  button {
    cursor: pointer;
  }
  button.primary {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: var(--text-primary-color, #fff);
  }
  button.danger {
    color: var(--error-color, #db4437);
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    padding: 10px 0;
    border-top: 1px solid var(--divider-color);
  }
  .row:first-child {
    border-top: none;
  }
  .row .name {
    font-weight: 500;
    min-width: 140px;
  }
  .row .info {
    flex: 1;
    min-width: 0;
  }
  .row .actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
`;

export const settingsStyles = [base, selectStyles];
