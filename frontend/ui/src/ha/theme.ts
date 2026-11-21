import { css } from "lit";

/**
 * Maps the UI components' generic CSS custom properties onto real Home
 * Assistant theme.
 */
export const haTheme = css`
  :host {
    --hour-period-present-color: var(--primary-color);
    --hour-period-absent-color: var(--divider-color);
    --hour-period-selected-color: var(--accent-color);
    --period-edit-dialog-radius: var(--ha-card-border-radius, 8px);
    --period-edit-dialog-delete-color: var(--error-color);
  }
`;
