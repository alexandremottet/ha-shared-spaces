import "./i18n-fr";
import { t } from "ha-share-space-ui";
import type { HomeAssistant, HeatingZoneAttributes } from "ha-share-space-ui/ha";

export type HeatingMode = HeatingZoneAttributes["mode"] | "unmanaged";

export interface HeatingPreset {
  label: string;
  temperature: number;
}

export interface ZoneViewModel {
  entityId: string;
  serviceEntityId: string | null;
  climateEntity: string | null;
  name: string;
  currentTemperature: number | null;
  target: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  mode: HeatingMode;
  overrideUntil: Date | null;
  presence: boolean | null;
  activeRule: string | null;
  hvacAction: string | null;
  presets: HeatingPreset[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : v === null || v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function zoneViewModel(hass: HomeAssistant, entityId: string): ZoneViewModel | null {
  const ent = hass.states[entityId];
  if (!ent) return null;
  const isClimate = entityId.startsWith("climate.");
  const zoneAttrs = isClimate ? null : (ent.attributes as unknown as HeatingZoneAttributes);
  const climateId = isClimate ? entityId : zoneAttrs?.climate_entity ?? null;
  const climate = climateId ? hass.states[climateId] : undefined;
  const ca = climate?.attributes ?? {};
  const name = String(ent.attributes.friendly_name ?? entityId);
  const unit = hass.config?.unit_system?.temperature ?? "°C";
  const common = {
    entityId,
    climateEntity: climateId,
    name,
    min: num(ca.min_temp) ?? 5,
    max: num(ca.max_temp) ?? 30,
    step: num(ca.target_temp_step) ?? 0.5,
    unit,
    hvacAction: typeof ca.hvac_action === "string" ? ca.hvac_action : null,
  };
  if (isClimate) {
    return {
      ...common,
      serviceEntityId: null,
      currentTemperature: num(ent.attributes.current_temperature),
      target: num(ent.attributes.temperature) ?? 20,
      mode: "unmanaged",
      overrideUntil: null,
      presence: null,
      activeRule: null,
      presets: [],
    };
  }
  const until = zoneAttrs?.override_until ? new Date(zoneAttrs.override_until) : null;
  return {
    ...common,
    serviceEntityId: entityId,
    currentTemperature: num(zoneAttrs?.current_temperature),
    target: num(ent.state) ?? 20,
    mode: zoneAttrs?.mode ?? "schedule",
    overrideUntil: until && !Number.isNaN(until.getTime()) ? until : null,
    presence: zoneAttrs?.presence ?? null,
    activeRule: zoneAttrs?.active_rule ?? null,
    presets: (
      [
        [t("Comfort"), zoneAttrs?.comfort_temp],
        [t("Eco"), zoneAttrs?.eco_temp],
        [t("Frost"), zoneAttrs?.frost_temp],
      ] as const
    ).flatMap(([label, t]) => (num(t) === null ? [] : [{ label, temperature: num(t)! }])),
  };
}
