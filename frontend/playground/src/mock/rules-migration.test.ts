import { afterEach, describe, expect, it } from "vitest";
import { detachAutomation, findZoneStrategies, loadZoneRules, nextRulesId, saveStrategyAutomation, saveZoneRules, strategyAutomationId, useZoneStrategy, zoneRulesIds } from "ha-share-space-ui/ha";
import { templateRules } from "ha-share-space-ui";
import { createMockHass } from "./mock-hass";
import type { MockHassController } from "./mock-hass";
import { fromWall } from "./planning";

const TZ = "Europe/Paris";
const OPEN = "sensor.share_space_heating_open_space";
let c: MockHassController;
afterEach(() => c?.dispose());

const zoneOf = () => ({ entity_id: OPEN, entry_id: "x", name: "Open space", presence_entity: null });
const enabled = () => Object.fromEntries(findZoneStrategies(c.hass, OPEN).map((a) => [a.id, a.enabled]));
const officeId = strategyAutomationId(OPEN, "office_saver");
const rulesId = strategyAutomationId(OPEN, "rules");

async function setup() {
  c = createMockHass({ startTime: fromWall(TZ, 2026, 11, 20, 10, 0), timeZone: TZ, playing: false });
  await saveStrategyAutomation(c.hass, officeId, {
    alias: "Share Space · Open space · Office saver",
    description: "",
    use_blueprint: { path: "share_space/office_saver.yaml", input: { zone: OPEN, area: "open_space" } },
  });
}

describe("migration and edits outside Share Space (mock)", () => {
  it("convert keeps the preset disabled, re-enable stops the rules", async () => {
    await setup();
    expect(await loadZoneRules(c.hass, OPEN)).toBeNull();
    await saveZoneRules(c.hass, zoneOf(), "open_space", templateRules("office_saver"), null);
    await useZoneStrategy(() => c.hass, zoneOf(), rulesId);
    expect(enabled()).toEqual({ [officeId]: false, [rulesId]: true });
    expect((await loadZoneRules(c.hass, OPEN))?.state).toBe("managed");
    await useZoneStrategy(() => c.hass, zoneOf(), officeId);
    expect(enabled()).toEqual({ [officeId]: true, [rulesId]: false });
  });

  it("HA edit and take control show as edited; take back restores managed", async () => {
    await setup();
    await saveZoneRules(c.hass, zoneOf(), "open_space", templateRules("office_saver"), null);
    c.simulateAutomationEdit(rulesId);
    expect((await loadZoneRules(c.hass, OPEN))?.state).toBe("edited");
    c.simulateTakeControl(rulesId);
    const edited = await loadZoneRules(c.hass, OPEN);
    expect(edited).toMatchObject({ state: "edited", rules: null });
    await saveZoneRules(c.hass, zoneOf(), "open_space", templateRules("office_saver"), null);
    expect((await loadZoneRules(c.hass, OPEN))?.state).toBe("managed");
  });

  it("detach, then start new rules under _rules_2 and disable the detached one", async () => {
    await setup();
    await saveZoneRules(c.hass, zoneOf(), "open_space", templateRules("office_saver"), null);
    await useZoneStrategy(() => c.hass, zoneOf(), rulesId);
    await detachAutomation(c.hass, rulesId);
    expect(await loadZoneRules(c.hass, OPEN)).toMatchObject({ state: "detached", enabled: true });
    const next = nextRulesId(OPEN, zoneRulesIds(c.hass, OPEN));
    expect(next).toBe(`${rulesId}_2`);
    await saveZoneRules(c.hass, zoneOf(), "open_space", templateRules("lunch_room"), null, next);
    await useZoneStrategy(() => c.hass, zoneOf(), next);
    expect(enabled()).toEqual({ [officeId]: false, [rulesId]: false, [next]: true });
    expect(await loadZoneRules(c.hass, OPEN)).toMatchObject({ id: next, state: "managed" });
  });
});
