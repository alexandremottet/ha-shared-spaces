import { LitElement, html, css, nothing } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createAreaZone, deleteZone, listZones } from "ha-share-space-ui/ha";
import type { HeatingZone, HomeAssistant } from "ha-share-space-ui/ha";
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

const errorText = (err: unknown) => (err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err));

// Settings > Zones: one heating zone per area, built from heaters + a sensor or an existing thermostat.
@customElement("share-space-zones-settings")
export class ShareSpaceZonesSettings extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _zones: HeatingZone[] | null = null;
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
        border-radius: 16px;
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
      this._zones = await listZones(this.hass);
    } catch (err) {
      this._error = errorText(err);
    }
  }

  private async _run(fn: () => Promise<unknown>): Promise<void> {
    this._busy = true;
    this._error = "";
    try {
      await fn();
      await this._load();
    } catch (err) {
      this._error = errorText(err);
    } finally {
      this._busy = false;
    }
  }

  // Entities of a domain, this area's first, then by name.
  private _options(filter: (id: string, attrs: Record<string, unknown>) => boolean, area: string): Option[] {
    const hass = this.hass!;
    const areaOf = (id: string): string | null => {
      const e = hass.entities?.[id];
      return e?.area_id ?? (e?.device_id ? hass.devices?.[e.device_id]?.area_id ?? null : null);
    };
    return Object.values(hass.states)
      .filter((s) => filter(s.entity_id, s.attributes))
      .map((s) => ({ id: s.entity_id, name: String(s.attributes.friendly_name ?? s.entity_id), area: areaOf(s.entity_id) }))
      .sort((a, b) => Number(b.area === area) - Number(a.area === area) || a.name.localeCompare(b.name));
  }

  private _label(id: string): string {
    return String(this.hass?.states[id]?.attributes.friendly_name ?? id);
  }

  private _select(label: string, value: string, options: Option[], onChange: (v: string) => void): TemplateResult {
    return html`<label class="field">
      ${label}
      <select @change=${(e: Event) => onChange((e.target as HTMLSelectElement).value)}>
        <option value="" ?selected=${!value}>Choose…</option>
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
        <label><input type="radio" name="source" .checked=${d.source === "heaters"} @change=${() => patch({ source: "heaters" })} /> Heaters (smart plugs or switches)</label>
        <label><input type="radio" name="source" .checked=${d.source === "thermostat"} @change=${() => patch({ source: "thermostat" })} /> Existing thermostat</label>
      </div>
      ${d.source === "heaters"
        ? html`<div class="chips">
              ${d.heaters.map(
                (h) => html`<span class="chip">${this._label(h)}<button type="button" aria-label="Remove ${this._label(h)}" @click=${() => patch({ heaters: d.heaters.filter((x) => x !== h) })}>✕</button></span>`,
              )}
            </div>
            ${this._select(d.heaters.length ? "Add another heater" : "Heater", "", switches, (v) => v && patch({ heaters: [...d.heaters, v] }))}
            ${this._select("Temperature sensor", d.sensor, sensors, (sensor) => patch({ sensor }))}
            <p class="muted">Share Space creates the thermostat: heaters turn on below the target, off above it.</p>`
        : this._select("Thermostat", d.thermostat, thermostats, (thermostat) => patch({ thermostat }))}
      <div class="field">
        <button class="primary" type="submit" ?disabled=${!ready || this._busy}>Create zone</button>
        <button type="button" @click=${() => (this._draft = null)}>Cancel</button>
      </div>
    </form>`;
  }

  private _renderZone(zone: HeatingZone): TemplateResult {
    const temp = this.hass?.states[zone.climate_entity]?.attributes.current_temperature;
    const parts = zone.managed
      ? [`Heaters: ${(zone.heaters ?? []).map((h) => this._label(h)).join(", ")}`, `Sensor: ${this._label(zone.temperature_sensor ?? "")}`]
      : [`Thermostat: ${this._label(zone.climate_entity)}`];
    if (typeof temp === "number") parts.push(`${temp} °C now`);
    return html`<span class="info muted">${parts.join(" · ")}</span>
      <span class="actions">
        ${this._confirm === zone.entry_id
          ? html`<button class="danger" ?disabled=${this._busy} @click=${() => void this._run(async () => { await deleteZone(this.hass!, zone.entry_id); this._confirm = null; })}>Delete</button>
              <button @click=${() => (this._confirm = null)}>Keep</button>`
          : html`<button @click=${() => (this._confirm = zone.entry_id)}>Remove heating</button>`}
      </span>`;
  }

  protected render(): TemplateResult {
    const hass = this.hass;
    if (!hass) return html``;
    const areas = Object.values(hass.areas ?? {}).sort((a, b) => a.name.localeCompare(b.name));
    const zones = this._zones ?? [];
    const orphans = zones.filter((z) => !z.area_id || !hass.areas?.[z.area_id]);
    return html`<section class="card">
      <h4>Heating zones</h4>
      <p class="muted">One zone per area. Removing a zone also removes the thermostat Share Space created for it, never your devices.</p>
      <div class="rows">
        ${areas.map((area) => {
          const zone = zones.find((z) => z.area_id === area.area_id);
          const editing = this._draft?.area === area.area_id;
          return html`<div class="row">
            <span class="name">${area.name}</span>
            ${zone
              ? this._renderZone(zone)
              : editing
                ? nothing
                : html`<span class="info muted">No heating</span>
                    <span class="actions">
                      <button ?disabled=${this._zones === null} @click=${() => (this._draft = { area: area.area_id, source: "heaters", heaters: [], sensor: "", thermostat: "" })}>Add heating</button>
                    </span>`}
            ${editing ? this._renderForm(this._draft!) : nothing}
          </div>`;
        })}
        ${orphans.map((zone) => html`<div class="row"><span class="name">${zone.name}</span>${this._renderZone(zone)}</div>`)}
      </div>
      ${areas.length ? nothing : html`<p class="muted">No areas yet: the Technical Admin creates them in Home Assistant.</p>`}
      ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
    </section>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-zones-settings": ShareSpaceZonesSettings;
  }
}
