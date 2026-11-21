import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce, entityRef, insertSnippet } from "./template-hooks";

describe("insertSnippet", () => {
  it("appends without a cursor", () => {
    expect(insertSnippet("ab", "X")).toEqual({ value: "abX", cursor: 3 });
  });
  it("inserts at the cursor", () => {
    expect(insertSnippet("abcd", "X", 2)).toEqual({ value: "abXcd", cursor: 3 });
  });
  it("replaces the selection and clamps", () => {
    expect(insertSnippet("abcd", "X", 1, 3).value).toBe("aXd");
    expect(insertSnippet("ab", "X", 9, 12).value).toBe("abX");
  });
  it("builds an entity ref", () => {
    expect(entityRef("sensor.t")).toBe("states('sensor.t')");
  });
});

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it("fires once with the last args", () => {
    const fn = vi.fn();
    const d = debounce(fn, 400);
    d(1);
    vi.advanceTimersByTime(300);
    d(2);
    vi.advanceTimersByTime(399);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(2);
  });
  it("cancel drops the pending call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 400);
    d();
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
