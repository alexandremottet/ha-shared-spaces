import { LitElement, html, css, nothing } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { t } from "ha-share-space-ui";
import { createAreaZone, deleteZone, entityAreaId, listDetectedAreas, listZones, errorMessage } from "ha-share-space-ui/ha";
import type { DetectedArea, HeatingZone, HomeAssistant } from "ha-share-space-ui/ha";
import { settingsStyles } from "./settings-styles";

type Source = "heaters" | "thermostat";
interface Option {
  id: string;
  name: string;
  area: string | null;
}
interface Draft {
  area: string;
  source: Source;
  heaters: string[];
  sensor: string;
  thermostat: string;
}


// Settings > Heating: Share Space sets up each area HA already heats on its own; this page maintains them.
@customElement("share-space-zones-settings")
export class ShareSpaceZonesSettings extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _zones: HeatingZone[] | null = null;
  @state() private _detected: DetectedArea[] = [];
  @state() private _draft: Draft | null = null;
  @state() private _confirm: string | null = null;
  @state() private _busy = false;
  @state() private _error = "";

  static styles = [
    settingsStyles,
    css`
      form {
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 100%;
        padding: 8px 0 4px;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 4px 2px 10px;
        border-radius: 4px;
        background: var(--secondary-background-color);
      }
      .chip button {
        min-height: 24px;
        padding: 0 6px;
        border: none;
        background: none;
      }
      .source {
        display: flex;
        gap: 16px;
      }
    `,
  ];

  connectedCallback(): void {
    super.connectedCallback();
    void this._load();
  }

  private async _load(): Promise<void> {
    if (!this.hass) return;
    try {
      const [zones, detected] = await Promise.all([listZones(this.hass), listDetectedAreas(this.hass).catch(() => [])]);
      this._zones = zones;
      this._detected = detected;
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private async _run(fn: () => Promise<unknown>): Promise<void> {
    this._busy = true;
    this._error = "";
    try {
      await fn();
      await this._load();
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  // Entities of a domain, this area's first, then by name.
  private _options(filter: (id: string, attrs: Record<string, unknown>) => boolean, area: string): Option[] {
    const hass = this.hass!;
    return Object.values(hass.states)
      .filter((s) => filter(s.entity_id, s.attributes))
      .map((s) => ({ id: s.entity_id, name: String(s.attributes.friendly_name ?? s.entity_id), area: entityAreaId(hass, s.entity_id) }))
      .sort((a, b) => Number(b.area === area) - Number(a.area === area) || a.name.localeCompare(b.name));
  }

  private _label(id: string): string {
    return String(this.hass?.states[id]?.attributes.friendly_name ?? id);
  }

  private _select(label: string, value: string, options: Option[], onChange: (v: string) => void): TemplateResult {
    return html`<label class="field">
      ${label}
      <select @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}>
        <option value="" ?selected=${!value}>${t("Choose…")}</option>
        ${options.map((o) => html`<option value=${o.id} ?selected=${o.id === value}>${o.name}</option>`)}
      </select>
    </label>`;
  }

  private _renderForm(d: Draft): TemplateResult {
    const zones = this._zones ?? [];
    const used = new Set(zones.map((z) => z.climate_entity));
    // heaters already driven by a zone, and the groups Share Space made for them
    const taken = new Set([...d.heaters, ...zones.flatMap((z) => [...(z.heaters ?? []), z.heater_switch ?? ""])]);
    const switches = this._options((id) => id.startsWith("switch.") && !taken.has(id), d.area);
    const sensors = this._options((id, a) => id.startsWith("sensor.") && a.device_class === "temperature" && !id.startsWith("sensor.share_space_"), d.area);
    const thermostats = this._options((id) => id.startsWith("climate.") && !used.has(id), d.area);
    const patch = (p: Partial<Draft>) => (this._draft = { ...d, ...p });
    const ready = d.source === "thermostat" ? !!d.thermostat : d.heaters.length > 0 && !!d.sensor;
    const submit = (e: Event) => {
      e.preventDefault();
      if (!ready || !this.hass) return;
      const hass = this.hass;
      void this._run(async () => {
        await createAreaZone(
          hass,
          d.source === "thermostat"
            ? { area_id: d.area, climate_entity: d.thermostat }
            : { area_id: d.area, heaters: d.heaters, temperature_sensor: d.sensor },
        );
        this._draft = null;
      });
    };
    return html`<form @submit=${submit}>
      <div class="source">
        <label><input type="radio" name="source" .checked=${d.source === "heaters"} @change=${() => patch({ source: "heaters" })} /> ${t("Heaters (smart plugs or switches)")}</label>
        <label><input type="radio" name="source" .checked=${d.source === "thermostat"} @change=${() => patch({ source: "thermostat" })} /> ${t("Existing thermostat")}</label>
      </div>
      ${d.source === "heaters"
        ? html`<div class="chips">
              ${d.heaters.map(
                (h) => html`<span class="chip">${this._label(h)}<button type="button" aria-label=${t("Remove {name}", { name: this._label(h) })} @click=${() => patch({ heaters: d.heaters.filter((x) => x !== h) })}>✕</button></span>`,
              )}
            </div>
            ${this._select(d.heaters.length ? t("Add another heater") : t("Heater"), "", switches, (v) => v && patch({ heaters: [...d.heaters, v] }))}
            ${this._select(t("Temperature sensor"), d.sensor, sensors, (sensor) => patch({ sensor }))}
            <p class="muted">${t("Share Space creates the thermostat: heaters turn on below the target, off above it.")}</p>`
        : this._select(t("Thermostat"), d.thermostat, thermostats, (thermostat) => patch({ thermostat }))}
      <div class="field">
        <button class="primary" type="submit" ?disabled=${!ready || this._busy}>${t("Create zone")}</button>
        <button type="button" @click=${() => (this._draft = null)}>${t("Cancel")}</button>
      </div>
    </form>`;
  }

  private _renderZone(zone: HeatingZone): TemplateResult {
    const temp = this.hass?.states[zone.climate_entity]?.attributes.current_temperature;
    const parts = zone.managed
      ? [
          t("Heaters: {names}", { names: (zone.heaters ?? []).map((h) => this._label(h)).join(", ") }),
          t("Sensor: {name}", { name: this._label(zone.temperature_sensor ?? "") }),
        ]
      : [t("Thermostat: {name}", { name: this._label(zone.climate_entity) })];
    if (typeof temp === "number") parts.push(t("{temp} °C now", { temp }));
    return html`<span class="info muted">${parts.join(" · ")}</span>
      <span class="actions">
        ${this._confirm === zone.entry_id
          ? html`<button class="danger" ?disabled=${this._busy} @click=${() => void this._run(async () => { await deleteZone(this.hass!, zone.entry_id); this._confirm = null; })}>${t("Delete")}</button>
              <button @click=${() => (this._confirm = null)}>${t("Keep")}</button>`
          : html`<button @click=${() => (this._confirm = zone.entry_id)}>${t("Stop managing")}</button>`}
      </span>`;
  }

  protected render(): TemplateResult {
    const hass = this.hass;
    if (!hass) return html``;
    const areas = Object.values(hass.areas ?? {}).sort((a, b) => a.name.localeCompare(b.name));
    const zones = this._zones ?? [];
    const orphans = zones.filter((z) => !z.area_id || !hass.areas?.[z.area_id]);
    return html`<section class="card">
      <h4>${t("Heating")}</h4>
      <p class="muted">
        ${t("Share Space finds each area's thermostat, or heater switches and temperature sensor, in Home Assistant. Nothing is created or changed until you save the area's first rule. Stop managing removes only what Share Space created, never your devices.")}
      </p>
      <div class="rows">
        ${areas.map((area) => {
          const here = zones.filter((z) => z.area_id === area.area_id);
          const zone = here[0];
          const editing = this._draft?.area === area.area_id;
          const found = this._detected.find((d) => d.area_id === area.area_id);
          return html`<div class="row">
            <span class="name">${area.name}</span>
            ${zone
              ? this._renderZone(zone)
              : editing
                ? nothing
                : found
                  ? html`<span class="info muted"
                      >${"climate_entity" in found
                        ? t("Found in Home Assistant: thermostat {name}. Used once the area has a rule.", { name: this._label(found.climate_entity) })
                        : t("Found in Home Assistant: heaters {heaters}, sensor {sensor}. Used once the area has a rule.", {
                            heaters: found.heaters.map((h) => this._label(h)).join(", "),
                            sensor: this._label(found.temperature_sensor),
                          })}</span
                    >`
                  : html`<span class="info muted">${t("No thermostat, or heaters and temperature sensor, in this area in Home Assistant")}</span>
                      <span class="actions">
                        <button
                          ?disabled=${this._zones === null}
                          @click=${() => (this._draft = { area: area.area_id, source: "heaters", heaters: [], sensor: "", thermostat: "" })}
                        >
                          ${t("Add heating")}
                        </button>
                      </span>`}
            ${editing ? this._renderForm(this._draft!) : nothing}
            ${here.length > 1
              ? html`<span class="error">${t("Several thermostats in this area: {names}. Move all but one to another area in Home Assistant (Settings → Entities).", { names: here.map((z) => this._label(z.climate_entity)).join(", ") })}</span>`
              : nothing}
          </div>`;
        })}
        ${orphans.map(
          (zone) =>
            html`<div class="row">
              <span class="name">${zone.name}</span>${this._renderZone(zone)}
              <span class="error">${t("No area: assign {name} to an area in Home Assistant (Settings → Entities) so rules can run.", { name: this._label(zone.climate_entity) })}</span>
            </div>`,
        )}
      </div>
      ${areas.length ? nothing : html`<p class="muted">${t("No areas yet: the Technical Admin creates them in Home Assistant.")}</p>`}
      ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
    </section>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-zones-settings": ShareSpaceZonesSettings;
  }
}
