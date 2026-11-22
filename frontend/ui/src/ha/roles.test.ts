import { describe, expect, it } from "vitest";
import { isAdminRole, spaceRole } from "./roles";

const h = (is_admin: boolean | undefined) =>
  ({ user: is_admin === undefined ? null : { id: "u", name: "n", is_admin } }) as never;

describe("spaceRole", () => {
  it("non-admin is user even with technical pref", () => {
    expect(spaceRole(h(false), { technical: true })).toBe("user");
  });
  it("admin without technical pref is space_admin", () => {
    expect(spaceRole(h(true))).toBe("space_admin");
    expect(spaceRole(h(true), null)).toBe("space_admin");
    expect(spaceRole(h(true), { technical: false })).toBe("space_admin");
  });
  it("admin with technical pref is technical_admin", () => {
    expect(spaceRole(h(true), { technical: true })).toBe("technical_admin");
  });
  it("missing hass or user is user", () => {
    expect(spaceRole(undefined)).toBe("user");
    expect(spaceRole(h(undefined))).toBe("user");
  });
  it("isAdminRole", () => {
    expect(isAdminRole("user")).toBe(false);
    expect(isAdminRole("space_admin")).toBe(true);
  });
});
