import { describe, expect, it } from "vitest";
import { TIME_RE, normalizeTime } from "./strategy-editor";

describe("time validation", () => {
  it("accepts HH:MM and HH:MM:SS, normalizes to HH:MM", () => {
    expect(TIME_RE.test("11:00:00")).toBe(true);
    expect(TIME_RE.test("11:00")).toBe(true);
    expect(TIME_RE.test("25:00")).toBe(false);
    expect(normalizeTime("11:00:00")).toBe("11:00");
  });
});
