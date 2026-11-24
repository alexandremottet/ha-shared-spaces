import { safeCustomElement } from "../define";
import { LitElement, html, css } from "lit";
import { query } from "lit/decorators.js";
import { t } from "../i18n";
import { PeriodEditController } from "../period-edit-controller";
import type { TimeOfDay, TimeRange, WeekDay } from "../types";
import "./ha-time-field";

interface HaDialogElement extends HTMLElement {
  open: boolean;
}

/**
 * HA-styled period editor: same PeriodEditController as the pure package's native
 * <period-edit-dialog>, rendered with real ha-dialog/ha-button/ha-time-input instead.
 */
@safeCustomElement("ha-period-edit-dialog")
export class HaPeriodEditDialog extends LitElement {
  private _controller = new PeriodEditController(this);

  @query("ha-dialog") private _dialogEl!: HaDialogElement;

  static styles = css`
    .field {
      margin-bottom: 12px;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
    }
  `;

  open(day: WeekDay, index: number, period: TimeRange): void {
    this._controller.open(day, index, period);
    if (this._dialogEl) {
      this._dialogEl.open = true;
    }
  }

  private _close(): void {
    this._dialogEl.open = false;
  }

  private _onSave(): void {
    this._controller.save();
    this._close();
  }

  private _onDelete(): void {
    this._controller.delete();
    this._close();
  }

  private _renderTimeField(label: string, value: TimeOfDay, onChange: (value: TimeOfDay) => void) {
    return html`<ha-time-field
      .label=${label}
      .value=${value}
      @change=${(event: Event) => onChange((event.target as { value?: string }).value ?? value)}
    ></ha-time-field>`;
  }

  protected render() {
    return html`
      <ha-dialog header-title=${t("Edit period")}>
        <div class="field">${this._renderTimeField(t("Start"), this._controller.start, (value) => this._controller.setStart(value))}</div>
        <div class="field">${this._renderTimeField(t("End"), this._controller.end, (value) => this._controller.setEnd(value))}</div>
        <div slot="footer" class="footer">
          <ha-button variant="danger" @click=${this._onDelete}>${t("Delete")}</ha-button>
          <span>
            <ha-button @click=${this._close}>${t("Cancel")}</ha-button>
            <ha-button variant="brand" @click=${this._onSave}>${t("Save")}</ha-button>
          </span>
        </div>
      </ha-dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-period-edit-dialog": HaPeriodEditDialog;
  }
}
