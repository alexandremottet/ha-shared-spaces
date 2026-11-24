import { css } from "lit";

// Pill buttons as on the Rules page, for the panels around it.
export const buttonStyles = css`
  button {
    min-height: 40px;
    box-sizing: border-box;
    font: inherit;
    color: var(--primary-text-color);
    border: 1px solid var(--divider-color);
    border-radius: 20px;
    background: transparent;
    padding: 0 16px;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: var(--secondary-background-color);
  }
  button.primary {
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
    border-color: transparent;
  }
  button.primary:hover:not(:disabled) {
    filter: brightness(1.08);
    background: var(--primary-color);
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
`;
