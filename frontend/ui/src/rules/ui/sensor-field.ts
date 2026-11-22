import { html, nothing } from "lit";
import type { TemplateResult } from "lit";
import { OUTDOOR } from "../value";

// Rules read the outdoor sensor set in Settings; an older rule on another sensor shows it with a switch back.
export function sensorField(entity: string, onChange: (entity: string) => void, invalid = false): TemplateResult | typeof nothing {
  if (entity === OUTDOOR) return nothing;
  return html`<span class="muted ${invalid ? "invalid" : ""}">${entity || "no sensor"}</span>
    <button aria-label="Use the outdoor temperature" @click=${() => onChange(OUTDOOR)}>Use outdoor temperature</button>`;
}
