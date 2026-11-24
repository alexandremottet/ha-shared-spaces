import { describe, expect, it, vi } from "vitest";
import { getDefaultPanel, opensShareSpaceForEveryone, setMyDefaultPanel, setOpensShareSpaceForEveryone } from "./ws";
import type { HomeAssistant } from "./hass";

function fakeHass(system: Record<string, unknown> | null, user: Record<string, unknown> | null = null) {
  const data = { system, user };
  const hass = {
    callWS: vi.fn(async (msg: { type: string; key: string; value?: Record<string, unknown> }) => {
      const scope = msg.type.includes("system") ? "system" : "user";
      if (msg.type.startsWith("frontend/get_")) return { value: data[scope] };
      data[scope] = msg.value ?? null;
      return null;
    }),
  } as unknown as HomeAssistant;
  return { hass, data };
}

describe("page HA opens after login", () => {
  it("is not Share Space until an admin turns it on", async () => {
    const { hass } = fakeHass(null);
    expect(await opensShareSpaceForEveryone(hass)).toBe(false);
    expect(await getDefaultPanel(hass)).toBeUndefined();
  });

  it("sets HA's system default for everyone, keeping its other settings", async () => {
    const { hass, data } = fakeHass({ other: 1 });
    await setOpensShareSpaceForEveryone(hass, true);
    expect(data.system).toEqual({ other: 1, default_panel: "share-space" });
    expect(await opensShareSpaceForEveryone(hass)).toBe(true);
    expect(await getDefaultPanel(hass)).toBe("share-space");
  });

  it("turning it off clears HA's default instead of choosing another page", async () => {
    const { hass, data } = fakeHass({ other: 1, default_panel: "share-space" });
    await setOpensShareSpaceForEveryone(hass, false);
    expect(data.system).toEqual({ other: 1 });
  });

  it("leaves a person's own choice in place", async () => {
    const { hass } = fakeHass(null, { default_panel: "lovelace" });
    await setOpensShareSpaceForEveryone(hass, true);
    expect(await getDefaultPanel(hass)).toBe("lovelace");
    await setMyDefaultPanel(hass, "share-space");
    expect(await getDefaultPanel(hass)).toBe("share-space");
  });
});
