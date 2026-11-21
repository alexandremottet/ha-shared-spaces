import type { HomeAssistant } from "ha-share-space-ui/ha";

export interface CardDef {
  tag: string;
  label: string;
  seedConfig: (hass: HomeAssistant) => Record<string, unknown>;
}

const type = (tag: string) => `custom:${tag}`;

export const CARDS: CardDef[] = [
  { tag: "share-space-my-planning-card", label: "My planning", seedConfig: () => ({ type: type("share-space-my-planning-card"), show_area_picker: true }) },
  { tag: "share-space-work-area-card", label: "Work area", seedConfig: () => ({ type: type("share-space-work-area-card") }) },
  { tag: "share-space-area-planning-card", label: "Area planning", seedConfig: () => ({ type: type("share-space-area-planning-card"), area: "open_space", view_mode: "lanes" }) },
  { tag: "share-space-compare-card", label: "Compare", seedConfig: () => ({ type: type("share-space-compare-card") }) },
  { tag: "share-space-area-actions-card", label: "Area actions", seedConfig: () => ({ type: type("share-space-area-actions-card"), area: "open_space" }) },
  {
    tag: "share-space-heating-card",
    label: "Heating",
    seedConfig: (hass) => {
      const cls = customElements.get("share-space-heating-card") as unknown as { getStubConfig?: (h: HomeAssistant) => Record<string, unknown> } | undefined;
      return cls?.getStubConfig?.(hass) ?? { type: type("share-space-heating-card"), entity: "" };
    },
  },
];

export const staticOf = (tag: string) =>
  customElements.get(tag) as unknown as { getConfigForm?: () => unknown } | undefined;
