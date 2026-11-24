import { afterEach, describe, expect, it } from "vitest";
import { deleteStrategy, listStrategies, loadStrategyUses, saveStrategy, saveZoneRules, strategyUsers } from "ha-share-space-ui/ha";
import { createMockHass } from "./mock-hass";
import type { MockHassController } from "./mock-hass";
import { fromWall } from "./planning";
import { STARTERS, starterRules } from "./seed";

const TZ = "Europe/Paris";
const at = (day: number, h: number, m = 0) => fromWall(TZ, 2026, 11, day, h, m);
const OPEN = "sensor.share_space_heating_open_space";
const KITCHEN = "sensor.share_space_heating_kitchen";
let c: MockHassController;
afterEach(() => c?.dispose());

const make = () => (c = createMockHass({ startTime: at(16, 8, 45), timeZone: TZ, playing: false, demoRules: true }));
const attrs = (id: string) => c.hass.states[id].attributes as Record<string, any>;
const zones = [
  { entity_id: OPEN, name: "Open space" },
  { entity_id: KITCHEN, name: "Kitchen" },
];

describe("shared strategies (mock)", () => {
  it("seeds the starters and Old building used by Open space", async () => {
    make();
    const list = await listStrategies(c.hass);
    expect(list.map((s) => s.name)).toEqual(["Lunch room", "Office saver", "Old building", "Well insulated"]);
    expect(list.find((s) => s.id === "office_saver")?.rules).toEqual(STARTERS[0].rules);
    expect(strategyUsers(await loadStrategyUses(c.hass, zones), "old_building")).toEqual(["Open space"]);
  });

  it("seeds the starters without the demo; a deleted starter stays deleted", async () => {
    c = createMockHass({ startTime: at(16, 8, 45), timeZone: TZ, playing: false });
    expect((await listStrategies(c.hass)).map((s) => s.id).sort()).toEqual(STARTERS.map((s) => s.id).sort());
    await deleteStrategy(c.hass, "lunch_room");
    expect((await listStrategies(c.hass)).map((s) => s.id)).toEqual(["office_saver", "old_building", "well_insulated"]);
  });

  it("save creates, updates, rejects taken names and unknown ids; delete removes", async () => {
    make();
    const rules = starterRules("office_saver");
    const { id } = await saveStrategy(c.hass, { name: "Office", rules });
    await expect(saveStrategy(c.hass, { name: "old BUILDING", rules })).rejects.toMatchObject({ code: "name_taken" });
    await expect(saveStrategy(c.hass, { id: "nope", name: "X", rules })).rejects.toMatchObject({ code: "not_found" });
    await expect(saveStrategy(c.hass, { name: "Bad", rules: { version: 2 } as never })).rejects.toMatchObject({ code: "invalid_format" });
    await saveStrategy(c.hass, { id, name: "Office 2", rules, previous: rules });
    expect((await listStrategies(c.hass)).map((s) => [s.name, s.previous !== null])).toEqual([
      ["Lunch room", false],
      ["Office 2", true],
      ["Office saver", false],
      ["Old building", false],
      ["Well insulated", false],
    ]);
    await deleteStrategy(c.hass, id);
    expect((await listStrategies(c.hass)).map((s) => s.name)).toEqual(["Lunch room", "Office saver", "Old building", "Well insulated"]);
    await expect(deleteStrategy(c.hass, id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("writes are admin only", async () => {
    c = createMockHass({ startTime: at(16, 8, 45), timeZone: TZ, playing: false, userId: "u2", demoRules: true });
    await expect(saveStrategy(c.hass, { name: "X", rules: starterRules("office_saver") })).rejects.toMatchObject({ code: "unauthorized" });
    await expect(deleteStrategy(c.hass, "old_building")).rejects.toMatchObject({ code: "unauthorized" });
    expect(await listStrategies(c.hass)).toHaveLength(STARTERS.length);
  });

  it("an automation pointing at a strategy runs its rules; a missing id does nothing", async () => {
    make();
    const old = (await listStrategies(c.hass)).find((s) => s.id === "old_building")!;
    c.clock.set(at(16, 9, 0));
    const before = attrs(KITCHEN).active_rule;
    await saveZoneRules(c.hass, zones[1], "kitchen", { strategy: "missing", name: "Gone" });
    c.clock.set(at(16, 9, 5));
    expect(attrs(KITCHEN).active_rule).toBe(before);
    await saveZoneRules(c.hass, zones[1], "kitchen", { strategy: old.id, name: old.name });
    c.clock.set(at(16, 9, 10));
    expect(attrs(KITCHEN).active_rule).not.toBe(before);
    expect(strategyUsers(await loadStrategyUses(c.hass, zones), old.id)).toEqual(["Kitchen", "Open space"]);
  });
});
