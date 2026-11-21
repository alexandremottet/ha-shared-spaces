import { afterEach, describe, expect, it } from "vitest";
import { createMockHass } from "./mock-hass";
import type { MockHassController } from "./mock-hass";
import { templateSyntaxError } from "./heating";
import { fromWall } from "./planning";

let c: MockHassController;
afterEach(() => c?.dispose());

const make = () => {
  c = createMockHass({ startTime: fromWall("Europe/Paris", 2026, 11, 16, 9, 5), timeZone: "Europe/Paris", playing: false });
  return c;
};

describe("templateSyntaxError", () => {
  it("accepts balanced templates", () => {
    expect(templateSyntaxError("{{ base }}")).toBeNull();
    expect(templateSyntaxError("{% if x %}comfort{% else %}eco{% endif %}")).toBeNull();
    expect(templateSyntaxError("21")).toBeNull();
  });
  it("rejects unbalanced delimiters", () => {
    expect(templateSyntaxError("{{ base")).toMatch(/Unclosed/);
    expect(templateSyntaxError("base }}")).toMatch(/Unexpected/);
    expect(templateSyntaxError("{% if x")).toMatch(/Unclosed/);
    expect(templateSyntaxError("{{ {{ x }} }}")).toMatch(/Unexpected/);
  });
});

describe("zone target_template in the mock", () => {
  it("stores, exposes and clears the template", async () => {
    make();
    const [z] = await c.hass.callWS<any[]>({ type: "share_space_heating/list_zones" });
    const set = await c.hass.callWS<any>({ type: "share_space_heating/update_zone", entry_id: z.entry_id, target_template: "{{ base }}" });
    expect(set.target_template).toBe("{{ base }}");
    expect((c.hass.states[z.entity_id].attributes as any).target_template).toBe("{{ base }}");
    await c.hass.callWS({ type: "share_space_heating/update_zone", entry_id: z.entry_id, target_template: null });
    expect((c.hass.states[z.entity_id].attributes as any).target_template).toBeNull();
  });

  it("rejects broken syntax with invalid_format", async () => {
    make();
    const [z] = await c.hass.callWS<any[]>({ type: "share_space_heating/list_zones" });
    await expect(
      c.hass.callWS({ type: "share_space_heating/update_zone", entry_id: z.entry_id, target_template: "{{ base" }),
    ).rejects.toMatchObject({ code: "invalid_format" });
  });

  it("has no live evaluation", async () => {
    make();
    await expect(c.hass.connection!.subscribeMessage!(() => undefined, { type: "render_template" })).rejects.toMatchObject({
      code: "unknown_command",
    });
  });
});
