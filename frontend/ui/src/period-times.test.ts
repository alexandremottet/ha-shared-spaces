import { describe, expect, it } from "vitest";
import { layoutTimes } from "./period-times";

const day = [
  { start: "09:00", end: "12:30" },
  { start: "13:30", end: "18:00" },
];

describe("layoutTimes", () => {
  it("puts the day's first start and last end outside, the times between blocks inside", () => {
    const [start, end1, start2, end] = layoutTimes(day, 1200);
    expect([start, end1, start2, end].map((b) => b.text)).toEqual(["9:00", "12:30", "13:30", "18:00"]);
    expect(start.left + start.width).toBeCloseTo((9 / 24) * 1200 - 3);
    expect(end1.left + end1.width).toBeCloseTo((12.5 / 24) * 1200 - 3);
    expect(start2.left).toBeCloseTo((13.5 / 24) * 1200 + 3);
    expect(end.left).toBeCloseTo((18 / 24) * 1200 + 3);
  });

  it("puts a single block's times outside it", () => {
    const [start, end] = layoutTimes([{ start: "10:00", end: "18:00" }], 1200);
    expect(start.left + start.width).toBeCloseTo((10 / 24) * 1200 - 3);
    expect(end.left).toBeCloseTo((18 / 24) * 1200 + 3);
  });

  it("puts the times beside a block too short to hold them", () => {
    const [start, end] = layoutTimes([{ start: "09:00", end: "10:00" }], 480);
    expect(start.left + start.width).toBeLessThanOrEqual((9 / 24) * 480);
    expect(end.left).toBeGreaterThanOrEqual((10 / 24) * 480);
  });

  it("alternates top and bottom rows when labels would touch", () => {
    const boxes = layoutTimes(day, 207);
    expect(boxes.map((b) => b.text).sort()).toEqual(["12:30", "13:30", "18:00", "9:00"]);
    for (const row of [0, 1]) {
      const r = boxes.filter((b) => b.row === row).sort((a, b) => a.left - b.left);
      for (let i = 1; i < r.length; i++) expect(r[i].left).toBeGreaterThanOrEqual(r[i - 1].left + r[i - 1].width);
    }
    expect(boxes.map((b) => b.row)).toEqual([0, 1, 0, 1]);
  });

  it("keeps one centred row when everything fits", () => {
    expect(layoutTimes(day, 1200).every((b) => b.row === undefined)).toBe(true);
  });
  it("leaves out the times that fit on neither row, never overlapping", () => {
    const many = ["07", "08", "09", "10", "11"].map((h) => ({ start: `${h}:00`, end: `${h}:30` }));
    const boxes = layoutTimes(many, 260);
    expect(boxes.length).toBeLessThan(10);
    for (const row of [0, 1]) {
      const r = boxes.filter((b) => b.row === row);
      for (let i = 1; i < r.length; i++) expect(r[i].left).toBeGreaterThanOrEqual(r[i - 1].left + r[i - 1].width);
    }
  });
});
