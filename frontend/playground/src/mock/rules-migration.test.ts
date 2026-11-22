import { afterEach, describe, expect, it } from "vitest";
import { detachAutomation, findZoneStrategies, loadZoneRules, nextRulesId, saveStrategyAutomation, saveZoneRules, strategyAutomationId, useZoneStrategy, zoneRulesIds } from "ha-share-space-ui/ha";
import { createMockHass } from "./mock-hass";
import type { MockHassController } from "./mock-hass";
import { fromWall } from "./planning";
import { starterRules } from "./seed";

const TZ = "Europe/Paris";
const OPEN = "sensor.share_space_heating_open_space";
let c: MockHassController;
afterEach(() => c?.dispose());

const zoneOf = () => ({ entity_id: OPEN, entry_id: "x", name: "Open space", presence_entity: null });
const enabled = () => Object.fromEntries(findZoneStrategies(c.hass, OPEN).map((a) => [a.id, a.enabled]));
const rulesId = strategyAutomationId(OPEN);

function setup() {
  c = createMockHass({ startTime: fromWall(TZ, 2026, 11, 20, 10, 0), timeZone: TZ, playing: false });
}

describe("edits outside Share Space (mock)", () => {
  it("HA edit and take control show as edited; take back restores managed", async () => {
    setup();
    await saveZoneRules(c.hass, zoneOf(), "open_space", { rules: starterRules("office_saver"), previous: null });
    c.simulateAutomationEdit(rulesId);
    expect((await loadZoneRules(c.hass, OPEN))?.state).toBe("edited");
    c.simulateTakeControl(rulesId);
    const edited = await loadZoneRules(c.hass, OPEN);
    expect(edited).toMatchObject({ state: "edited", rules: null });
    await saveZoneRules(c.hass, zoneOf(), "open_space", { rules: starterRules("office_saver"), previous: null });
    expect((await loadZoneRules(c.hass, OPEN))?.state).toBe("managed");
  });

  it("detach, then start new rules under _rules_2 and disable the detached one", async () => {
    setup();
    await saveZoneRules(c.hass, zoneOf(), "open_space", { rules: starterRules("office_saver"), previous: null });
    await useZoneStrategy(() => c.hass, zoneOf(), rulesId);
    await detachAutomation(c.hass, rulesId);
    expect(await loadZoneRules(c.hass, OPEN)).toMatchObject({ state: "detached", enabled: true });
    const next = nextRulesId(OPEN, zoneRulesIds(c.hass, OPEN));
    expect(next).toBe(`${rulesId}_2`);
    await saveZoneRules(c.hass, zoneOf(), "open_space", { rules: starterRules("lunch_room"), previous: null }, next);
    await useZoneStrategy(() => c.hass, zoneOf(), next);
    expect(enabled()).toEqual({ [rulesId]: false, [next]: true });
    expect(await loadZoneRules(c.hass, OPEN)).toMatchObject({ id: next, state: "managed" });
  });
});
