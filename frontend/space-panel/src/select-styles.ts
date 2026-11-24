import { css } from "lit";

// Native selects drawn like the multi-select dropdowns: same box, same ▾, solid option list.
export const selectStyles = css`
  select {
    appearance: none;
    -webkit-appearance: none;
    min-height: 36px;
    max-width: 100%;
    padding: 0 30px 0 10px;
    border-radius: 4px;
    border: 1px solid var(--divider-color);
    color: var(--primary-text-color);
    font: inherit;
    cursor: pointer;
    text-overflow: ellipsis;
    background:
      linear-gradient(45deg, transparent 50%, currentColor 50%) no-repeat calc(100% - 15px) 50% / 5px 5px,
      linear-gradient(135deg, currentColor 50%, transparent 50%) no-repeat calc(100% - 10px) 50% / 5px 5px,
      var(--card-background-color);
  }
  select:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  select:disabled {
    opacity: 0.5;
    cursor: default;
  }
  option {
    background: var(--primary-background-color, #fff);
    color: var(--primary-text-color);
  }
`;
