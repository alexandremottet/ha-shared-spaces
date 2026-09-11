import { customElement } from "lit/decorators.js";
import { ShareSpaceScheduleView } from "./share-space-schedule-view";
import type { LovelaceGridOptions } from "./lovelace-grid-options";
import type { LovelaceConfigForm } from "./lovelace-config-form";

interface CardConfig {
  type: string;
}

/**
 * Dashboard card version of the sidebar panel: identical content (area picker, placeholder,
 * own calendar) via the shared ShareSpaceScheduleView.
 */
@customElement("share-space-my-schedule-card")
export class ShareSpaceMyScheduleCard extends ShareSpaceScheduleView {
  setConfig(_config: CardConfig): void {
  }

  protected render() {
    return this._renderScheduleBody();
  }

  static getStubConfig(): CardConfig {
    return { type: "custom:share-space-my-schedule-card" };
  }

  static getConfigForm(): LovelaceConfigForm {
    return { schema: [] };
  }

  public getGridOptions(): LovelaceGridOptions {
    return {
      columns: 12,
      min_columns: 6,
      rows: 9,
      min_rows: 7,
    };
  }
}

declare global {
  interface Window {
    customCards: Array<Record<string, unknown>>;
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "share-space-my-schedule-card",
  name: "Share Space (My Schedule)",
  description: "Same content as the Share Space sidebar panel: your own area picker and weekly calendar.",
});

declare global {
  interface HTMLElementTagNameMap {
    "share-space-my-schedule-card": ShareSpaceMyScheduleCard;
  }
}
