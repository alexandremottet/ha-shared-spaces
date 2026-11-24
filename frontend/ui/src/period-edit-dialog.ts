import { safeCustomElement } from "./define";
import { LitElement, html, css } from "lit";
import { query } from "lit/decorators.js";
import type { TimeRange, WeekDay } from "./types";
import { t } from "./i18n";
import { PeriodEditController } from "./period-edit-controller";

export type { PeriodDeletedDetail, PeriodSavedDetail } from "./period-edit-controller";

/**
 * Native-<dialog>-backed editor: opened on a second touch of an existing period.
 */
@safeCustomElement("period-edit-dialog")
export class PeriodEditDialog extends LitElement {
  private _controller = new PeriodEditController(this);

  @query("dialog") private _dialogEl!: HTMLDialogElement;

  static styles = css`
    dialog {
      border: none;
      border-radius: var(--period-edit-dialog-radius, 4px);
      padding: var(--period-edit-dialog-padding, 16px);
      backdrop-filter: var(--ha-dialog-surface-backdrop-filter, none);
      min-width: var(--period-edit-dialog-min-width, 260px);
    }
    dialog::backdrop {
      background: var(--period-edit-dialog-backdrop-color, rgba(0, 0, 0, 0.4));
    }
    .row {
      display: flex;
      flex-direction: column;
      gap: var(--period-edit-dialog-row-gap, 4px);
      margin-bottom: var(--period-edit-dialog-field-spacing, 12px);
    }
    .actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: var(--period-edit-dialog-actions-spacing, 16px);
    }
    button {
      cursor: pointer;
    }
    .delete {
      color: var(--period-edit-dialog-delete-color, #c62828);
      background: none;
      border: none;
      padding: 0;
    }
  `;

  open(day: WeekDay, index: number, period: TimeRange): void {
    this._controller.open(day, index, period);
    this._dialogEl.showModal();
  }

  private _close(): void {
    this._dialogEl.close();
  }

  private _onSave(): void {
    this._controller.save();
    this._close();
  }

  private _onDelete(): void {
    this._controller.delete();
    this._close();
  }

  protected render() {
    return html`
      <dialog>
        <div class="row">
          <label>
            ${t("Start")}
            <input
              type="time"
              .value=${this._controller.start}
              @change=${(event: Event) => this._controller.setStart((event.target as HTMLInputElement).value)}
            />
          </label>
        </div>
        <div class="row">
          <label>
            ${t("End")}
            <input
              type="time"
              .value=${this._controller.end}
              @change=${(event: Event) => this._controller.setEnd((event.target as HTMLInputElement).value)}
            />
          </label>
        </div>
        <div class="actions">
          <button class="delete" @click=${this._onDelete}>${t("Delete")}</button>
          <span>
            <button @click=${this._close}>${t("Cancel")}</button>
            <button @click=${this._onSave}>${t("Save")}</button>
          </span>
        </div>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "period-edit-dialog": PeriodEditDialog;
  }
}
