import { html } from "lit";
import type { TemplateResult } from "lit";
import { setOverride, extendOverride, clearOverride } from "ha-share-space-ui/ha";
import type { HomeAssistant } from "ha-share-space-ui/ha";
import type { ZoneViewModel } from "ha-share-space-heating-card/view-model";

export const HEATING_SENSOR_PREFIX = "sensor.share_space_heating_";

// Heating control wired to the zone services; `run` reports failures.
export function renderHeatingControl(
  hass: HomeAssistant,
  vm: ZoneViewModel,
  run: (action: () => Promise<unknown>) => void,
  compact = false,
): TemplateResult {
  const zone = vm.serviceEntityId;
  return html`<share-space-heating-control
    ?compact=${compact}
    .name=${vm.name}
    .currentTemperature=${vm.currentTemperature}
    .target=${vm.target}
    .min=${vm.min}
    .max=${vm.max}
    .step=${vm.step}
    .unit=${vm.unit}
    .mode=${vm.mode}
    .overrideUntil=${vm.overrideUntil}
    .presence=${vm.presence}
    .presets=${vm.presets}
    .heating=${vm.hvacAction === "heating"}
    @override-requested=${(e: CustomEvent<{ temperature: number; hours: number }>) =>
      zone && run(() => setOverride(hass, zone, e.detail.temperature, e.detail.hours))}
    @override-extended=${(e: CustomEvent<{ hours: number }>) => zone && run(() => extendOverride(hass, zone, e.detail.hours))}
    @override-cleared=${() => zone && run(() => clearOverride(hass, zone))}
    @target-set=${(e: CustomEvent<{ temperature: number }>) =>
      vm.climateEntity &&
      run(() => hass.callService("climate", "set_temperature", { entity_id: vm.climateEntity, temperature: e.detail.temperature }))}
  ></share-space-heating-control>`;
}
