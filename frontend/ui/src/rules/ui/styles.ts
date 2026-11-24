import { css } from "lit";

/** Same surface as HA's ha-card (theme background, border, radius, frosted blur). */
export const haCardSurface = css`
  background: var(--ha-card-background, var(--card-background-color, #fff));
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color));
  border-radius: var(--ha-card-border-radius, 6px);
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
    border-radius: 4px;
    background: var(--card-background-color, #fff);
    padding: 0 12px;
  }
  button {
    background: transparent;
    border-radius: 4px;
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
    border-radius: 4px;
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

/** Chained blocks: titled header bar (kind colour, ×), clickable body, connector links, dashed "+" slots. */
export const chainStyles = css`
  :host {
    display: block;
    container-type: inline-size;
    --chain-rule: var(--secondary-text-color);
    --chain-cond: var(--primary-color);
    --chain-then: var(--accent-color, var(--primary-color));
    --chain-link: color-mix(in srgb, var(--primary-color) 55%, transparent);
  }
  .chain {
    display: flex;
    align-items: flex-start;
  }
  .chain > .block {
    flex: none;
    margin-top: 7px;
  }
  .conds {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
    flex: 0 1 auto;
    padding: 6px;
    border: 1px solid color-mix(in srgb, var(--chain-cond) 35%, transparent);
    border-radius: 4px;
    background: color-mix(in srgb, var(--chain-cond) 6%, transparent);
  }
  .link {
    flex: none;
    width: 14px;
    height: 2px;
    margin-top: 23px;
    background: var(--chain-link);
  }
  .block {
    --kind: var(--chain-cond);
    display: flex;
    flex-direction: column;
    min-width: 120px;
    max-width: min(260px, 100%);
    border: 1px solid var(--ha-card-border-color, var(--divider-color));
    border-radius: 4px;
    overflow: hidden;
    background: var(--ha-card-background, var(--card-background-color, #fff));
    transition: box-shadow 0.12s, border-color 0.12s;
  }
  .block.rule {
    --kind: var(--chain-rule);
    min-width: 160px;
  }
  .block.then {
    --kind: var(--chain-then);
  }
  .bh {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 32px;
    padding: 0 4px 0 12px;
    font-size: 0.75em;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--kind);
    background: color-mix(in srgb, var(--kind) 14%, var(--ha-card-background, var(--card-background-color, #fff)));
    border-bottom: 1px solid var(--ha-card-border-color, var(--divider-color));
  }
  .bh .x {
    min-height: 32px;
    min-width: 32px;
    padding: 0;
    border: none;
    border-radius: 50%;
    color: var(--kind);
    font-size: 1.3em;
    line-height: 1;
  }
  .bb {
    min-height: 44px;
    padding: 8px 12px;
    border: none;
    border-radius: 0;
    text-align: left;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.3;
  }
  .bb:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: -2px;
  }
  .block.open {
    border-color: var(--kind);
    box-shadow: 0 0 0 2px var(--kind), 0 4px 14px color-mix(in srgb, var(--kind) 35%, transparent);
  }
  .block.open .bh {
    background: var(--kind);
    color: var(--text-primary-color, #fff);
    border-bottom-color: var(--kind);
  }
  .block.open .bh .x {
    color: inherit;
  }
  .block.open .bb {
    background: color-mix(in srgb, var(--kind) 10%, transparent);
  }
  .block.bad {
    --kind: var(--error-color);
    border-color: var(--error-color);
  }
  .wrap {
    border-radius: 4px;
    transition: background 0.12s, box-shadow 0.12s;
  }
  :host([highlighted]) .wrap {
    background: color-mix(in srgb, var(--primary-color) 7%, transparent);
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--primary-color) 7%, transparent);
  }
  .slot {
    flex: none;
    min-height: 44px;
    padding: 0 12px;
    border: 2px dashed var(--chain-link);
    border-radius: 4px;
    color: var(--primary-color);
    font-size: 0.75em;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .always {
    margin-top: 6px;
  }
  .editor {
    --kind: var(--chain-cond);
    position: relative;
    margin: 14px 0 6px;
    padding: 12px;
    border: 2px solid var(--kind);
    border-radius: 4px;
    background: color-mix(in srgb, var(--kind) 8%, var(--ha-card-background, var(--card-background-color, #fff)));
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .conds > .editor {
    flex: 0 0 100%;
    box-sizing: border-box;
    margin: 6px 0;
  }
  .editor.rule {
    --kind: var(--chain-rule);
  }
  .editor.then {
    --kind: var(--chain-then);
  }
  .editor::before {
    content: "";
    position: absolute;
    top: -9px;
    left: calc(var(--caret-x, 32px) - 8px);
    width: 14px;
    height: 14px;
    background: inherit;
    border-left: 2px solid var(--kind);
    border-top: 2px solid var(--kind);
    transform: rotate(45deg);
  }
  .head-edit input.label {
    flex: 1;
    min-width: 140px;
  }
  @container (max-width: 480px) {
    .chain {
      flex-direction: column;
      align-items: stretch;
    }
    .conds {
      flex-direction: column;
      align-items: stretch;
    }
    .link {
      width: 2px;
      height: 10px;
      margin: 0 0 0 20px;
    }
    .chain > .block {
      margin-top: 0;
    }
    .block {
      max-width: none;
    }
    .slot {
      align-self: flex-start;
    }
  }
`;
