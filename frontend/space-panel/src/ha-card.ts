import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { loadCardHelpers } from "ha-share-space-ui/ha";
import type { CardElement, HomeAssistant } from "ha-share-space-ui/ha";

// One Home Assistant card from its YAML config, as a dashboard would show it.
@customElement("share-space-ha-card")
export class ShareSpaceHaCard extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) config?: Record<string, unknown>;
  @state() private _el: CardElement | null = null;
  private _for = "";

  static styles = css`
    :host {
      display: block;
    }
  `;

  protected willUpdate(changed: PropertyValues): void {
    const key = JSON.stringify(this.config ?? null);
    if (this.config && key !== this._for) {
      this._for = key;
      const config = this.config;
      void loadCardHelpers()
        .then((h) => {
          if (this._for !== key) return;
          const el = h.createCardElement(config);
          el.hass = this.hass;
          this._el = el;
        })
        .catch(() => (this._el = null));
    }
    if (changed.has("hass") && this._el) this._el.hass = this.hass;
  }

  protected render() {
    return this._el ?? nothing;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-ha-card": ShareSpaceHaCard;
  }
}
