import { LitElement, html, css, nothing } from "lit";
import type { TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { getLovelaceConfig, getSpaceDashboards, listHaDashboards, listUsers, saveLovelaceConfig, setSpaceDashboards, errorMessage } from "ha-share-space-ui/ha";
import type { HaDashboard, HaUser, HomeAssistant, LovelaceConfig, LovelaceView, SpaceDashboard } from "ha-share-space-ui/ha";
import { settingsStyles } from "./settings-styles";
import "./multi-select";

const EVERYONE = "*";

const key = (urlPath: string | null): string => urlPath ?? "";

// Settings > Dashboards: pick HA dashboards to show as tabs and who sees each view; emits `dashboards-change`.
@customElement("share-space-dashboards-settings")
export class ShareSpaceDashboardsSettings extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _available: HaDashboard[] = [{ url_path: null, title: "Overview (default)" }];
  @state() private _selected: SpaceDashboard[] = [];
  @state() private _configs: Record<string, LovelaceConfig | null> = {};
  @state() private _users: HaUser[] = [];
  @state() private _busy = false;
  @state() private _error = "";

  static styles = [
    settingsStyles,
    css`
      .views {
        flex-basis: 100%;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-left: 16px;
      }
      .view {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 14px;
      }
      .view .name {
        min-width: 120px;
        font-weight: 400;
      }
      .view label {
        display: inline-flex;
        align-items: center;
        gap: 4px;
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
      const [selected, list, users] = await Promise.all([getSpaceDashboards(this.hass), listHaDashboards(this.hass), listUsers(this.hass)]);
      this._selected = selected;
      this._available = [{ url_path: null, title: "Overview (default)" }, ...list];
      this._users = users.filter((u) => !u.system_generated && u.is_active).sort((a, b) => a.name.localeCompare(b.name));
      await Promise.all(selected.map((d) => this._loadConfig(d.url_path)));
    } catch (err) {
      this._error = errorMessage(err);
    }
  }

  private async _loadConfig(urlPath: string | null): Promise<void> {
    const config = await getLovelaceConfig(this.hass!, urlPath).catch(() => null);
    this._configs = { ...this._configs, [key(urlPath)]: config };
  }

  private async _setShown(paths: string[]): Promise<void> {
    const next = this._available
      .filter((d) => paths.includes(key(d.url_path)))
      .map((d) => this._selected.find((s) => s.url_path === d.url_path) ?? { url_path: d.url_path, title: d.url_path === null ? "Dashboard" : d.title });
    const added = next.filter((d) => !this._selected.some((s) => s.url_path === d.url_path));
    await this._run(async () => {
      await setSpaceDashboards(this.hass!, next);
      this._selected = next;
      await Promise.all(added.map((d) => this._loadConfig(d.url_path)));
    });
  }

  // Writes HA's own per-view visibility: undefined = everyone, else the listed users.
  private async _setVisible(d: HaDashboard, index: number, visible: string[] | undefined): Promise<void> {
    const config = this._configs[key(d.url_path)];
    if (!config?.views) return;
    const views = config.views.map((v, i): LovelaceView => {
      if (i !== index) return v;
      const { visible: _old, ...rest } = v;
      return visible ? { ...rest, visible: visible.map((user) => ({ user })) } : rest;
    });
    const next = { ...config, views };
    await this._run(async () => {
      await saveLovelaceConfig(this.hass!, d.url_path, next);
      this._configs = { ...this._configs, [key(d.url_path)]: next };
    });
  }

  private async _run(fn: () => Promise<void>): Promise<void> {
    this._busy = true;
    this._error = "";
    try {
      await fn();
      this.dispatchEvent(new CustomEvent("dashboards-change", { detail: this._selected }));
    } catch (err) {
      this._error = errorMessage(err);
    } finally {
      this._busy = false;
    }
  }

  private _renderViews(d: HaDashboard): TemplateResult {
    const config = this._configs[key(d.url_path)];
    if (config === undefined) return html`<div class="views muted">Loading…</div>`;
    if (d.mode === "yaml") return html`<div class="views muted">YAML dashboard: set who sees each view in its YAML file.</div>`;
    const views = (config?.views ?? []).map((v, i) => ({ v, i })).filter(({ v }) => !v.subview);
    if (!views.length) return html`<div class="views muted">Auto-generated dashboard: take control of it in Home Assistant to choose who sees it.</div>`;
    return html`<div class="views">
      ${views.map(({ v, i }) => {
        const everyone = !Array.isArray(v.visible) && v.visible !== false;
        const allowed = Array.isArray(v.visible) ? v.visible.flatMap((s) => (s.user ? [s.user] : [])) : [];
        // Everyone picked again, or nobody left, shows the view to everyone
        const pick = (values: string[]) =>
          void this._setVisible(d, i, (values.includes(EVERYONE) && !everyone) || !values.filter((v) => v !== EVERYONE).length ? undefined : values.filter((v) => v !== EVERYONE));
        return html`<div class="view">
          <span class="name">${v.title ?? v.path ?? `View ${i + 1}`}</span>
          <share-space-multi-select
            label=${`Who sees ${v.title ?? v.path ?? `view ${i + 1}`}`}
            .options=${[{ value: EVERYONE, label: "Everyone" }, ...this._users.map((u) => ({ value: u.id, label: u.name }))]}
            .selected=${everyone ? [EVERYONE] : allowed}
            ?disabled=${this._busy}
            @selection-change=${(e: CustomEvent<string[]>) => pick(e.detail)}
          ></share-space-multi-select>
        </div>`;
      })}
    </div>`;
  }

  protected render(): TemplateResult {
    return html`<section class="card">
      <h4>Dashboards</h4>
      <p class="muted">Build a dashboard in Home Assistant, then pick it to show it as a tab here. Choose who sees each of its views.</p>
      <div class="field">
        <span>Show as tabs</span>
        <share-space-multi-select
          label="Dashboards shown as tabs"
          placeholder="No dashboard"
          .options=${this._available.map((d) => ({ value: key(d.url_path), label: d.title }))}
          .selected=${this._selected.map((s) => key(s.url_path))}
          ?disabled=${this._busy}
          @selection-change=${(e: CustomEvent<string[]>) => void this._setShown(e.detail)}
        ></share-space-multi-select>
      </div>
      <div class="rows">
        ${this._available
          .filter((d) => this._selected.some((s) => s.url_path === d.url_path))
          .map((d) => html`<div class="row"><span class="name">${d.title}</span>${this._renderViews(d)}</div>`)}
      </div>
      ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
    </section>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "share-space-dashboards-settings": ShareSpaceDashboardsSettings;
  }
}
