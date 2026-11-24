import { LitElement, css, html, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { haCardSurface, removeAt, replaceAt } from "ha-share-space-ui";
import type { Rule } from "ha-share-space-ui";
import { errorMessage, findCardView, loadExistingHeating, saveExistingHeating, setExistingEnabled } from "ha-share-space-ui/ha";
import type { ExistingHeating, HeatingTarget, HomeAssistant } from "ha-share-space-ui/ha";

const SOURCE: Record<ExistingHeating["kind"], string> = { automation: "Automation", scheduler: "Scheduler" };

// Rules tab: heating the area already gets from HA, edited in place (the HA object itself is saved).
@customElement("share-space-existing-heating")
export class ShareSpaceExistingHeating extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) target: HeatingTarget | null = null;
  /** Share Space rules are on for this area too. */
  @property({ type: Boolean }) rulesActive = false;
  /** Bumped to reload after the page changed these objects. */
  @property({ type: Number }) version = 0;
  /** Entity ids of the items to turn off once the area's Share Space rules are saved. */
  @property({ attribute: false }) replacing: string[] = [];
  @state() private _items: ExistingHeating[] | null = null;
  @state() private _drafts: Record<string, Rule[]> = {};
  @state() private _undo: Record<string, Rule[]> = {};
  @state() private _busy = "";
  @state() private _errors: Record<string, string> = {};
  private _loaded = "";

  static styles = css`
    :host {
      display: block;
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
    .unmapped {
      margin: 0;
      padding-left: 18px;
      font-size: 0.9em;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .error {
      color: var(--error-color);
    }
    .readonly {
      opacity: 0.85;
    }
    .note {
      font-size: 0.9em;
    }
    .banner {
      ${haCardSurface}
      padding: 8px 12px;
      margin-top: 8px;
    }
  `;

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
    this._drafts = {};
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

  private _setDraft(item: ExistingHeating, rules: Rule[]): void {
    this._drafts = { ...this._drafts, [item.entityId]: rules };
  }

  private async _save(item: ExistingHeating, rules: Rule[], undo: Rule[] | null): Promise<void> {
    if (!this.hass) return;
    this._busy = item.entityId;
    this._errors = { ...this._errors, [item.entityId]: "" };
    try {
      await saveExistingHeating(this.hass, item, rules);
      const { [item.entityId]: _draft, ...drafts } = this._drafts;
      this._drafts = drafts;
      this._undo = undo ? { ...this._undo, [item.entityId]: undo } : Object.fromEntries(Object.entries(this._undo).filter(([k]) => k !== item.entityId));
      await this._load();
    } catch (err) {
      this._errors = { ...this._errors, [item.entityId]: errorMessage(err) };
    } finally {
      this._busy = "";
    }
  }

  // Live from HA, so turning it off here or in HA shows at once.
  private _enabled(item: ExistingHeating): boolean {
    const state = this.hass?.states[item.entityId]?.state;
    return state === undefined ? item.enabled : state !== "off";
  }

  private _replace(item: ExistingHeating): void {
    this.dispatchEvent(new CustomEvent("replace-with-rules", { detail: item, bubbles: true, composed: true }));
  }

  private _renderItem(item: ExistingHeating): TemplateResult {
    const draft = this._drafts[item.entityId];
    const rules = draft ?? item.rules;
    const busy = this._busy === item.entityId;
    const undo = this._undo[item.entityId];
    const replacing = this.replacing.includes(item.entityId);
    const rows = rules.map(
      (rule, i) => html`<share-space-rule-row
        .rule=${rule}
        .index=${i}
        .count=${rules.length}
        @rule-change=${(e: CustomEvent<{ rule: Rule }>) => {
          e.stopPropagation();
          this._setDraft(item, replaceAt(rules, i, e.detail.rule));
        }}
        @rule-remove=${(e: Event) => {
          e.stopPropagation();
          this._setDraft(item, removeAt(rules, i));
        }}
        @rule-move=${(e: Event) => e.stopPropagation()}
      ></share-space-rule-row>`,
    );
    return html`<div class="item">
      <div class="head">
        <span class="badge">${SOURCE[item.kind]}</span>
        <span class="name">${item.name}</span>
        ${item.compatible ? nothing : html`<span class="badge">Read only</span>`}
        <label
          ><input
            type="checkbox"
            .checked=${this._enabled(item)}
            ?disabled=${busy}
            @change=${(e: Event) => void setExistingEnabled(this.hass!, item, (e.target as HTMLInputElement).checked)}
          />
          On</label
        >
        <button @click=${() => this._open(item.haPath)}>Open in Home Assistant</button>
      </div>
      ${item.compatible ? rows : html`<div class="readonly" inert>${rows}</div>`}
      ${item.unmapped.length
        ? html`<div class="muted">${item.compatible ? "Also in Home Assistant, kept as is:" : "Share Space cannot show this as rules:"}</div>
            <ul class="unmapped muted">
              ${item.unmapped.map((u) => html`<li>${u}</li>`)}
            </ul>`
        : nothing}
      ${replacing
        ? html`<div class="note" role="status">Copied into the Share Space rules above. It is turned off when you save them.</div>`
        : nothing}
      <div class="actions">
        ${draft
          ? html`<button class="primary" ?disabled=${busy} @click=${() => void this._save(item, draft, item.rules)}>Save to Home Assistant</button>
              <button ?disabled=${busy} @click=${() => this._discard(item)}>Cancel</button>`
          : undo
            ? html`<button ?disabled=${busy} @click=${() => void this._save(item, undo, null)}>Undo last change</button>`
            : nothing}
        ${replacing || draft ? nothing : html`<button ?disabled=${busy} @click=${() => this._replace(item)}>Replace with Share Space rules</button>`}
      </div>
      ${this._errors[item.entityId] ? html`<div class="error" role="alert">${this._errors[item.entityId]}</div>` : nothing}
    </div>`;
  }

  private _discard(item: ExistingHeating): void {
    const { [item.entityId]: _draft, ...drafts } = this._drafts;
    this._drafts = drafts;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.target) return nothing;
    const items = this._items;
    if (items === null) return html`<h3>Already in Home Assistant</h3><div class="muted">Looking for schedules and automations…</div>`;
    if (!items.length) return nothing;
    const running = items.some((i) => this._enabled(i));
    return html`<h3>Already in Home Assistant</h3>
      <div class="muted">
        Schedules and automations that already heat this area. Changes are saved into them, so Home Assistant shows the same. What Share
        Space cannot show as rules is read only. Saving Share Space rules for this area turns all of these off: the rules then are the
        area's only heating. "Replace with Share Space rules" copies one into them first.
      </div>
      ${this.rulesActive && running
        ? html`<div class="banner" role="status">Share Space rules are on too: both act on the radiators. Turn one of them off.</div>`
        : nothing}
      ${items.map((i) => this._renderItem(i))}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-existing-heating": ShareSpaceExistingHeating;
  }
}
