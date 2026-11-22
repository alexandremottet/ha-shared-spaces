import { describe, expect, it, vi } from "vitest";
import { subscribeTemplatePreview } from "./ws";

const hassWith = (subscribeMessage?: unknown) => ({ connection: { subscribeMessage } }) as never;

describe("subscribeTemplatePreview", () => {
  it("sends render_template and maps events", async () => {
    let handler: (e: unknown) => void = () => undefined;
    const unsub = vi.fn();
    const sub = vi.fn(async (cb: (e: unknown) => void, _msg?: unknown) => {
      handler = cb;
      return unsub;
    });
    const out: unknown[] = [];
    const un = await subscribeTemplatePreview(hassWith(sub), "{{ base }}", { zone: "sensor.z", base: null }, (p) => out.push(p));
    expect(sub.mock.calls[0][1]).toEqual({
      type: "render_template",
      template: "{{ base }}",
      variables: { zone: "sensor.z", base: null },
      strict: true,
      report_errors: true,
      timeout: 3,
    });
    handler({ result: 21, listeners: {} });
    handler({ result: null });
    handler({ error: "boom", level: "ERROR" });
    expect(out).toEqual([{ result: "21" }, { result: "" }, { error: "boom" }]);
    expect(un).toBe(unsub);
  });

  it("rethrows unknown_command, reports other errors", async () => {
    await expect(subscribeTemplatePreview(hassWith(), "x", {}, () => undefined)).rejects.toMatchObject({ code: "unknown_command" });
    const missing = vi.fn(async () => {
      throw { code: "unknown_command", message: "Unknown command." };
    });
    await expect(subscribeTemplatePreview(hassWith(missing), "x", {}, () => undefined)).rejects.toMatchObject({ code: "unknown_command" });
    const bad = vi.fn(async () => {
      throw { code: "template_error", message: "bad template" };
    });
    const out: unknown[] = [];
    await subscribeTemplatePreview(hassWith(bad), "x", {}, (p) => out.push(p));
    expect(out).toEqual([{ error: "bad template" }]);
  });
});
