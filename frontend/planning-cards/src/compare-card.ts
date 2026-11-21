import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { PropertyValues } from "lit";
import "ha-share-space-ui";
import type { Calendar, WeekDay } from "ha-share-space-ui";
import { WEEK_DAYS } from "ha-share-space-ui";
import {
  haTheme,
  registerCustomCard,
  renderBackendMissing,
  isBackendMissing,
  findMyPerson,
  getCalendar,
  getPersonArea,
  getAreaSchedule,
} from "ha-share-space-ui/ha";
import type { HomeAssistant, Schedule, LovelaceGridOptions, LovelaceConfigForm } from "ha-share-space-ui/ha";
import { cardStyles, message } from "./shared";

interface CardConfig {
  type: string;
  area?: string;
}

const ME_COLOR = "var(--accent-color)";
const SPACE_COLOR = "var(--primary-color)";

const SLOT = 30;
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const slotsToPeriods = (slots: string[] | undefined) => {
  const out: { start: string; end: string }[] = [];
  let endMin = -1;
  for (const s of [...(slots ?? [])].sort()) {
    const [h, m] = s.split(":").map(Number);
    const start = h * 60 + m;
    if (start === endMin && out.length) {
      out[out.length - 1].end = fmt(start + SLOT);
    } else {
      out.push({ start: s, end: fmt(start + SLOT) });
    }
    endMin = start + SLOT;
  }
  return out;
};

@customElement("share-space-compare-card")
export class ShareSpaceCompareCard extends LitElement {
  static styles = [haTheme, cardStyles];

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _config?: CardConfig;
  @state() private _mine: Calendar | null = null;
  @state() private _space: Schedule | null = null;
  @state() private _noPerson = false;
  @state() private _noArea = false;
  @state() private _missing = false;
  private _started = false;

  setConfig(config: CardConfig): void {
    this._config = config;
    this._started = false;
  }

  protected willUpdate(_changed: PropertyValues): void {
    if (this.hass && this._config && !this._started) {
      this._started = true;
      this._load();
    }
  }

  private async _load(): Promise<void> {
    const person = findMyPerson(this.hass);
    if (!person) {
      this._noPerson = true;
      return;
    }
    try {
      const area = this._config!.area || (await getPersonArea(this.hass!, person.entity_id));
      if (!area) {
        this._noArea = true;
        return;
      }
      [this._mine, this._space] = await Promise.all([
        getCalendar(this.hass!, person.entity_id),
        getAreaSchedule(this.hass!, area),
      ]);
    } catch (err) {
      this._missing = isBackendMissing(err);
    }
  }

  protected render() {
    if (this._missing) {
      return renderBackendMissing("Share Space");
    }
    if (this._noPerson) {
      return message("No person is linked to your account.");
    }
    if (this._noArea) {
      return message("Pick where you work first.");
    }
    if (!this._mine || !this._space) {
      return message("Loading…");
    }
    return html`
      <ha-card>
        ${WEEK_DAYS.map(
          (day: WeekDay) => html`
            <person-lane-track
              .label=${day}
              .periods=${slotsToPeriods(this._space![day])}
              .color=${SPACE_COLOR}
            ></person-lane-track>
            <person-lane-track
              .label=${"Me"}
              .periods=${this._mine![day] ?? []}
              .color=${ME_COLOR}
            ></person-lane-track>
          `
        )}
      </ha-card>
    `;
  }

  static getStubConfig(): CardConfig {
    return { type: "custom:share-space-compare-card" };
  }

  static getConfigForm(): LovelaceConfigForm {
    return { schema: [{ name: "area", selector: { area: {} } }] };
  }

  public getGridOptions(): LovelaceGridOptions {
    return { columns: 12, min_columns: 6, rows: 12, min_rows: 8 };
  }
}

registerCustomCard({
  type: "share-space-compare-card",
  name: "Share Space: Compare",
  description: "Your week next to the area's presence.",
});

declare global {
  interface HTMLElementTagNameMap {
    "share-space-compare-card": ShareSpaceCompareCard;
  }
}
