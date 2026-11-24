import { LitElement, html, css, nothing } from "lit";
import type { PropertyValues, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "ha-share-space-ui";
import { ZONE_TARGET_HOOK, debounce, haCardSurface, t } from "ha-share-space-ui";
import type { TemplateEntity, TemplateResult as PreviewResult } from "ha-share-space-ui";
import { isBackendMissing, listZones, subscribeTemplatePreview, updateZone, errorMessage } from "ha-share-space-ui/ha";
import type { HeatingZone, HeatingZoneAttributes, HomeAssistant } from "ha-share-space-ui/ha";

const PREVIEW_DELAY_MS = 400;
const ENTITY_DOMAINS = ["sensor.", "binary_sensor.", "input_boolean.", "input_number.", "switch.", "person.", "climate.", "weather."];

// Container for Settings > Extension points: zone picker, Zone target template editor, live preview.
@customElement("share-space-extension-points")
export class ShareSpaceExtensionPoints extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  @state() private _zones: HeatingZone[] | null = null;
  @state() private _zone = "";
  @state() private _draft = "";
  @state() private _result: PreviewResult | null = null;
  @state() private _live = true;
  @state() private _busy = false;
  @state() private _error = "";
  private _started = false;
  private _probed = false;
  private _unsub: (() => void) | null = null;
  private _token = 0;
  private readonly _schedule = debounce((tpl: string) => void this._preview(tpl), PREVIEW_DELAY_MS);

  static styles = css`
    :host {
      ${haCardSurface}
      display: block;
      padding: 12px 16px;
      color: var(--primary-text-color);
    }
    h4 {
      margin: 16px 0 8px;
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .error {
      color: var(--error-color);
      margin: 8px 0;
    }
    .zones {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 8px 0;
    }
    button {
      min-height: 44px;
      box-sizing: border-box;
      font: inherit;
      color: var(--primary-text-color);
      border: 1px solid var(--divider-color);
      border-radius: 4px;
      background: transparent;
      padding: 0 16px;
      cursor: pointer;
    }
    button[aria-pressed="true"] {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      border-color: transparent;
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 4px 12px;
      margin: 8px 0;
    }
    dt {
      color: var(--secondary-text-color);
    }
    dd {
      margin: 0;
    }
    code {
      font-family: var(--code-font-family, monospace);
    }
  `;

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("hass") && this.hass && !this._started) {
      this._started = true;
      void this._init(this.hass);
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._schedule.cancel();
    this._stop();
  }

  private async _init(hass: HomeAssistant): Promise<void> {
    try {
      this._zones = await listZones(hass);
    } catch (err) {
      this._zones = [];
      if (!isBackendMissing(err)) this._error = errorMessage(err);
    }
  }

  private _stop(): void {
    this._token++;
    this._unsub?.();
    this._unsub = null;
  }

  private get _info(): HeatingZone | undefined {
    return this._zones?.find((z) => z.entity_id === this._zone);
  }

  private get _attrs(): Partial<HeatingZoneAttributes> {
    return (this.hass?.states[this._zone]?.attributes ?? {}) as Partial<HeatingZoneAttributes>;
  }

  private get _entities(): TemplateEntity[] {
    const states = this.hass?.states ?? {};
    return Object.values(states)
      .filter((s) => ENTITY_DOMAINS.some((d) => s.entity_id.startsWith(d)))
      .map((s) => ({ entity_id: s.entity_id, name: String(s.attributes.friendly_name ?? s.entity_id) }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 300);
  }

  private _select(zone: HeatingZone): void {
    this._zone = zone.entity_id;
    this._error = "";
    this._result = null;
    this._draft = zone.target_template ?? (this._attrs.target_template as string | null | undefined) ?? "";
    this._schedule.cancel();
    void this._preview(this._draft);
  }

  private _onChange(value: string): void {
    this._draft = value;
    this._schedule(value);
  }

  private async _preview(template: string): Promise<void> {
    this._stop();
    const token = this._token;
    const hass = this.hass;
    if (!hass || !this._live) return;
    if (!template.trim()) {
      this._result = null;
      // Probe once so the editor knows whether live evaluation exists.
      if (!this._probed) {
        this._probed = true;
        try {
          (await subscribeTemplatePreview(hass, "{{ 0 }}", {}, () => undefined))();
        } catch (err) {
          if (isBackendMissing(err)) this._live = false;
        }
      }
      return;
    }
    this._probed = true;
    const a = this._attrs;
    const variables = { zone: this._zone, comfort: a.comfort_temp ?? null, eco: a.eco_temp ?? null, base: null };
    try {
      const unsub = await subscribeTemplatePreview(hass, template, variables, (p) => {
        if (token === this._token) this._result = p.error ? { error: p.error } : { value: p.result ?? "" };
      });
      if (token === this._token) this._unsub = unsub;
      else unsub();
    } catch (err) {
      if (isBackendMissing(err)) this._live = false;
      else if (token === this._token) this._result = { error: errorMessage(err) };
    }
  }

  private async _save(template: string | null): Promise<void> {
    const hass = this.hass;
    const zone = this._info;
    if (!hass || !zone) return;
    this._busy = true;
    this._error = "";
    try {
      const updated = await updateZone(hass, zone.entry_id, { target_template: template });
      this._zones = (this._zones ?? []).map((z) => (z.entry_id === zone.entry_id ? { ...z, ...updated } : z));
      if (template === null) {
        this._draft = "";
        this._schedule.cancel();
        this._stop();
        this._result = null;
      }
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  private _renderStatus(): TemplateResult {
    const a = this._attrs;
    const driving = a.mode === "template";
    return html`<dl aria-label=${t("Current state")}>
      <dt>${t("Saved template")}</dt>
      <dd>${a.target_template ? html`<code>${a.target_template}</code>` : html`<span class="muted">${t("none")}</span>`}</dd>
      <dt>${t("Driving the target")}</dt>
      <dd>${driving ? t("Yes (mode: template)") : t("No")}</dd>
      <dt>${t("Last result")}</dt>
      <dd>${a.template_result ?? html`<span class="muted">${t("none")}</span>`}</dd>
      ${a.template_error ? html`<dt>${t("Last error")}</dt><dd class="error">${a.template_error}</dd>` : nothing}
    </dl>`;
  }

  protected render(): TemplateResult {
    if (this._zones === null) return html`<p class="muted">${t("Loading...")}</p>`;
    return html`
      <h4>${t("Extension points")}</h4>
      <p class="muted">${t("Hooks where a Jinja template replaces a default behaviour.")}</p>
      ${this._zones.length === 0 ? html`<p class="muted">${t("No heated areas.")}</p>` : nothing}
      <div class="zones" role="group" aria-label=${t("Heated areas")}>
        ${this._zones.map(
          (z) => html`<button type="button" aria-pressed=${z.entity_id === this._zone ? "true" : "false"} @click=${() => this._select(z)}>
            ${z.name}
          </button>`
        )}
      </div>
      ${this._info
        ? html`
            <h4>${t("Heating target: {name}", { name: this._info.name })}</h4>
            ${this._renderStatus()}
            <share-space-template-editor
              .value=${this._draft}
              .hook=${ZONE_TARGET_HOOK}
              .entities=${this._entities}
              .result=${this._result}
              .liveAvailable=${this._live}
              .busy=${this._busy}
              .error=${this._error}
              @value-change=${(e: CustomEvent<{ value: string }>) => this._onChange(e.detail.value)}
              @save=${(e: CustomEvent<{ value: string }>) => void this._save(e.detail.value)}
              @clear=${() => void this._save(null)}
            ></share-space-template-editor>
          `
        : nothing}
      ${!this._info && this._error ? html`<div class="error">${this._error}</div>` : nothing}
    `;
  }
}
