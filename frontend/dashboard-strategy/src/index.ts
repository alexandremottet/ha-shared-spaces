import type { AreaInfo, HeatingZone, HomeAssistant } from "ha-share-space-ui/ha";

interface StrategyConfig {
  areas?: string[];
  show_heating?: boolean;
  show_actions?: boolean;
}

interface AreaViewConfig {
  area_id: string;
  show_actions?: boolean;
}

type Card = Record<string, unknown>;

const isBackendMissing = (err: unknown): boolean => {
  const e = err as { code?: string; message?: string } | null;
  return (
    e?.code === "unknown_command" ||
    e?.code === "service_not_found" ||
    /unknown[_ ]command|service .* not found/i.test(e?.message ?? "")
  );
};

async function optionalWS<T>(hass: HomeAssistant, type: string): Promise<{ data: T[]; ok: boolean }> {
  try {
    return { data: await hass.callWS<T[]>({ type }), ok: true };
  } catch (err) {
    if (isBackendMissing(err)) {
      return { data: [], ok: false };
    }
    throw err;
  }
}

async function elementDefined(tag: string): Promise<boolean> {
  if (customElements.get(tag)) {
    return true;
  }
  await Promise.race([customElements.whenDefined(tag), new Promise((r) => setTimeout(r, 1000))]);
  return !!customElements.get(tag);
}

const zoneArea = (zone: HeatingZone): string | null => {
  const m = /^binary_sensor\.share_space_(.+)$/.exec(zone.presence_entity ?? "");
  return m ? m[1] : null;
};

const heatingCards = (zones: HeatingZone[]): Card[] =>
  zones.map((z) => ({ type: "custom:share-space-heating-card", entity: z.entity_id }));

async function load(hass: HomeAssistant) {
  const [areasRes, zonesRes] = await Promise.all([
    optionalWS<AreaInfo>(hass, "share_space/list_areas"),
    optionalWS<HeatingZone>(hass, "share_space_heating/list_zones"),
  ]);
  const [planningCard, heatingCard] = await Promise.all([
    areasRes.ok ? true : elementDefined("share-space-my-planning-card"),
    elementDefined("share-space-heating-card"),
  ]);
  return {
    areas: areasRes.data,
    zones: zonesRes.data,
    planning: planningCard,
    heating: heatingCard && zonesRes.data.length > 0,
  };
}

export class ShareSpaceDashboardStrategy extends HTMLElement {
  static async generate(config: StrategyConfig, hass: HomeAssistant) {
    const { areas, zones, planning, heating } = await load(hass);
    const showHeating = (config.show_heating ?? true) && heating;
    const restrict = config.areas;
    const allowed = (id: string) => !restrict || restrict.includes(id);

    const areaIds = new Set<string>(areas.map((a) => a.area_id));
    if (showHeating) {
      for (const z of zones) {
        const id = zoneArea(z);
        if (id) {
          areaIds.add(id);
        }
      }
    }
    const names: Record<string, string> = {};
    try {
      const registry = await hass.callWS<Array<{ area_id: string; name: string }>>({ type: "config/area_registry/list" });
      for (const a of registry) {
        names[a.area_id] = a.name;
      }
    } catch {
      // names fall back to area ids
    }
    for (const a of areas) {
      names[a.area_id] = a.name;
    }

    const views: Card[] = [];
    if (planning) {
      views.push(meView(hass));
    }
    if (planning || showHeating) {
      for (const id of [...areaIds].filter(allowed)) {
        views.push({
          title: names[id] ?? id,
          path: `area-${id}`,
          icon: "mdi:office-building",
          strategy: {
            type: "custom:share-space-area",
            area_id: id,
            show_actions: config.show_actions ?? true,
          },
        });
      }
    }
    if (showHeating) {
      views.push({
        title: "Heating",
        path: "heating",
        icon: "mdi:thermostat",
        type: "sections",
        sections: [{ type: "grid", cards: [{ type: "heading", heading: "Heating" }, ...heatingCards(zones)] }],
      });
    }
    if (views.length === 0) {
      views.push(emptyView());
    }
    return { title: "Share Space", views };
  }
}

function meView(hass: HomeAssistant): Card {
  const hasPerson = Object.values(hass.states).some(
    (e) => e.entity_id.startsWith("person.") && e.attributes.user_id === hass.user?.id
  );
  const cards: Card[] = [{ type: "heading", heading: "My week" }];
  if (hasPerson) {
    cards.push(
      { type: "custom:share-space-my-planning-card", show_area_picker: false },
      { type: "custom:share-space-work-area-card" }
    );
  } else {
    cards.push({
      type: "markdown",
      content: "Your Home Assistant user is not linked to a person. Open Settings > People, edit your person and enable 'Allow person to login' for your user.",
    });
  }
  return { title: "Me", path: "me", icon: "mdi:account-clock", type: "sections", sections: [{ type: "grid", cards }] };
}

function emptyView(): Card {
  return {
    title: "Share Space",
    path: "setup",
    icon: "mdi:information-outline",
    type: "sections",
    sections: [
      {
        type: "grid",
        cards: [
          {
            type: "markdown",
            content:
              "Nothing to show yet. Install the **share_space** integration (planning) and/or **share_space_heating** (zones), then add their card resources and reload.",
          },
        ],
      },
    ],
  };
}

export class ShareSpaceAreaViewStrategy extends HTMLElement {
  static async generate(config: AreaViewConfig, hass: HomeAssistant) {
    const id = config.area_id;
    const { areas, zones, planning, heating } = await load(hass);
    const name = areas.find((a) => a.area_id === id)?.name ?? hass.areas?.[id]?.name ?? id;
    const cards: Card[] = [{ type: "heading", heading: name }];
    if (planning) {
      cards.push({ type: "custom:share-space-area-planning-card", area: id, view_mode: "lanes" });
    }
    if (heating) {
      cards.push(...heatingCards(zones.filter((z) => zoneArea(z) === id)));
    }
    if (planning && hass.user?.is_admin && (config.show_actions ?? true)) {
      cards.push(
        { type: "heading", heading: "Automations" },
        { type: "custom:share-space-area-actions-card", area: id }
      );
    }
    return { type: "sections", sections: [{ type: "grid", cards }] };
  }
}

customElements.define("ll-strategy-dashboard-share-space", ShareSpaceDashboardStrategy);
customElements.define("ll-strategy-view-share-space-area", ShareSpaceAreaViewStrategy);
