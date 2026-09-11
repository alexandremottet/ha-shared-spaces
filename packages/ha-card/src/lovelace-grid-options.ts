/**
 * Shape HA's sections-view card editor reads from a card's `getGridOptions()`
 */
export interface LovelaceGridOptions {
  rows?: number;
  columns?: number;
  min_rows?: number;
  max_rows?: number;
  min_columns?: number;
  max_columns?: number;
}
