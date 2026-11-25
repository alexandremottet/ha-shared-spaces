import { describe, expect, it, vi } from "vitest";
import { findCardView, getDefaultPanel, opensShareSpaceForEveryone, setMyDefaultPanel, setMyFullHa, setOpensShareSpaceForEveryone } from "./ws";
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

  it("drops the admin's own choice when turned on, so it takes effect for them too", async () => {
    const { hass, data } = fakeHass(null, { default_panel: "lovelace", theme: "dark" });
    await setOpensShareSpaceForEveryone(hass, true);
    expect(data.user).toEqual({ theme: "dark" });
    expect(await getDefaultPanel(hass)).toBe("share-space");
  });

  it("a person's own choice wins over the system default", async () => {
    const { hass } = fakeHass({ default_panel: "share-space" }, { default_panel: "lovelace" });
    expect(await getDefaultPanel(hass)).toBe("lovelace");
    await setMyDefaultPanel(hass, "share-space");
    expect(await getDefaultPanel(hass)).toBe("share-space");
  });
});

describe("full HA switch", () => {
  it("on pins this person to HA's dashboard", async () => {
    const { hass, data } = fakeHass({ default_panel: "share-space" }, { theme: "dark" });
    await setMyFullHa(hass, true);
    expect(data.user).toEqual({ theme: "dark", default_panel: "lovelace" });
  });

  it("off drops the person's choice when everyone already opens Share Space", async () => {
    const { hass, data } = fakeHass({ default_panel: "share-space" }, { default_panel: "lovelace", theme: "dark" });
    await setMyFullHa(hass, false);
    expect(data.user).toEqual({ theme: "dark" });
    expect(await getDefaultPanel(hass)).toBe("share-space");
  });

  it("off picks Share Space for this person when the system default is another page", async () => {
    const { hass, data } = fakeHass({ default_panel: "energy" }, { default_panel: "lovelace" });
    await setMyFullHa(hass, false);
    expect(data.user).toEqual({ default_panel: "share-space" });
  });
});

describe("where a card is shown", () => {
  it("finds the dashboard view holding the Scheduler card", async () => {
    const configs: Record<string, unknown> = {
      lovelace: { views: [{ title: "Home", cards: [] }] },
      "le-portemine": { views: [{ title: "Home", cards: [{ type: "vertical-stack", cards: [{ type: "custom:scheduler-card" }] }] }] },
    };
    const hass = {
      callWS: vi.fn(async (msg: { type: string; url_path?: string | null }) => {
        if (msg.type === "lovelace/dashboards/list") return [{ url_path: "le-portemine", title: "Le Portemine" }];
        return configs[msg.url_path ?? "lovelace"];
      }),
    } as unknown as HomeAssistant;
    expect(await findCardView(hass, "custom:scheduler-card")).toBe("/le-portemine/0");
    expect(await findCardView(hass, "custom:other-card")).toBeNull();
  });
});
