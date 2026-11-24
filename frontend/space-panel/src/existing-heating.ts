import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { haCardSurface } from "ha-share-space-ui";
import { findCardView, loadExistingHeating } from "ha-share-space-ui/ha";
import { buttonStyles } from "./button-styles";
import type { ExistingHeating, HeatingTarget, HomeAssistant } from "ha-share-space-ui/ha";

const SOURCE: Record<ExistingHeating["kind"], string> = { automation: "Automation", scheduler: "Scheduler" };

// Rules tab: heating the area already gets from HA, read only; the admin migrates it into Share Space rules or starts from scratch.
@customElement("share-space-existing-heating")
export class ShareSpaceExistingHeating extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) target: HeatingTarget | null = null;
  /** Share Space rules are on for this area too. */
  @property({ type: Boolean }) rulesActive = false;
  /** Bumped to reload after the page changed these objects. */
  @property({ type: Number }) version = 0;
  @state() private _items: ExistingHeating[] | null = null;
  private _loaded = "";

  static styles = [
    buttonStyles,
    css`
    :host {
      display: block;
    }
    .panel {
      ${haCardSurface}
      padding: 16px;
      margin-top: 16px;
    }
    h3 {
      margin: 0 0 4px;
      font-size: 1.05em;
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .item {
      ${haCardSurface}
      padding: 12px;
      margin-top: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .item.off {
      opacity: 0.6;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .name {
      font-weight: 600;
      flex: 1;
    }
    .badge {
      font-size: 0.75em;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--secondary-background-color);
    }
    .mapping {
      border-collapse: collapse;
      width: 100%;
      font-size: 0.9em;
    }
    .mapping th,
    .mapping td {
      text-align: left;
      vertical-align: top;
      padding: 4px 8px;
      border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
    }
    .mapping th {
      color: var(--secondary-text-color);
      font-weight: 500;
      border-top: none;
    }
    .mapping td:first-child {
      width: 50%;
      color: var(--secondary-text-color);
    }
    .mapping .lost {
      color: var(--warning-color, #b26a00);
      font-style: italic;
    }
    summary {
      cursor: pointer;
      color: var(--primary-color);
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .banner {
      ${haCardSurface}
      padding: 8px 12px;
      margin-top: 8px;
    }
  `,
  ];

  protected willUpdate(changed: PropertyValues): void {
    const key = JSON.stringify([this.target, this.version]);
    if ((changed.has("target") || changed.has("hass") || changed.has("version")) && this.hass && this.target && key !== this._loaded) {
      this._loaded = key;
      void this._load();
    }
  }

  private async _load(): Promise<void> {
    if (!this.hass || !this.target) return;
    this._items = null;
    const items = await loadExistingHeating(this.hass, this.target).catch(() => []);
    // Scheduler items have no page of their own in HA: open the dashboard showing the Scheduler card.
    const card = items.some((i) => i.kind === "scheduler") ? await findCardView(this.hass, "custom:scheduler-card") : null;
    this._items = card ? items.map((i) => (i.kind === "scheduler" ? { ...i, haPath: card } : i)) : items;
    this.dispatchEvent(new CustomEvent("existing-loaded", { detail: this._items }));
  }

  private _open(path: string): void {
    const ev = new CustomEvent("navigate-requested", { detail: { path }, bubbles: true, composed: true, cancelable: true });
    if (this.dispatchEvent(ev)) {
      history.pushState(null, "", path);
      window.dispatchEvent(new CustomEvent("location-changed"));
    }
  }

  // Live from HA, so turning it off in HA shows at once.
  private _enabled(item: ExistingHeating): boolean {
    const state = this.hass?.states[item.entityId]?.state;
    return state === undefined ? item.enabled : state !== "off";
  }

  private _renderItem(item: ExistingHeating): TemplateResult {
    const on = this._enabled(item);
    const names = Object.fromEntries(Object.values(this.hass?.areas ?? {}).map((a) => [a.area_id, a.name]));
    return html`<div class="item ${on ? "" : "off"}">
      <div class="head">
        <span class="badge">${SOURCE[item.kind]}</span>
        <span class="name">${item.name}</span>
        <span class="badge">${on ? "On" : "Off"}</span>
        <button @click=${() => this._open(item.haPath)}>Open in Home Assistant</button>
      </div>
      <table class="mapping">
        <thead>
          <tr>
            <th scope="col">In Home Assistant</th>
            <th scope="col">In Share Space rules</th>
          </tr>
        </thead>
        <tbody>
          ${item.mapping.map(
            (m) => html`<tr>
              <td>${m.ha}</td>
              <td class=${m.rules === null ? "lost" : ""}>${m.rules ?? "Not copied"}</td>
            </tr>`,
          )}
        </tbody>
      </table>
      ${item.rules.length
        ? html`<details>
            <summary>As Share Space rules</summary>
            <div inert>
              ${item.rules.map((rule, i) => html`<share-space-rule-row .rule=${rule} .areaNames=${names} .index=${i} .count=${item.rules.length}></share-space-rule-row>`)}
            </div>
          </details>`
        : nothing}
    </div>`;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.target) return nothing;
    const items = this._items;
    if (items === null) return html`<section class="panel"><h3>Already in Home Assistant</h3><div class="muted">Looking for schedules and automations…</div></section>`;
    if (!items.length) return nothing;
    const running = items.filter((i) => this._enabled(i));
    return html`<section class="panel">
      <h3>Already in Home Assistant</h3>
      <div class="muted">
        Schedules and automations that heat this area today, read only here. Saving Share Space rules for this area turns the ones that
        are on off, so the rules are its only heating.
      </div>
      ${this.rulesActive && running.length
        ? html`<div class="banner" role="status">Share Space rules are on too: both act on the radiators. Save the rules again to turn these off, or turn the rules off.</div>`
        : nothing}
      ${items.map((i) => this._renderItem(i))}
    </section>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-existing-heating": ShareSpaceExistingHeating;
  }
}
