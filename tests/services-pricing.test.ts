import { describe, it, expect } from "vitest";
import { computeAdjustedPrice } from "../shared/pricing";

describe("Bulk Adjustment Math", () => {
  it("PCT INCREASE: oldPrice=100, value=10 → 110", () => {
    expect(computeAdjustedPrice(100, "PCT", "INCREASE", 10)).toBe(110);
  });

  it("PCT DECREASE: oldPrice=100, value=10 → 90", () => {
    expect(computeAdjustedPrice(100, "PCT", "DECREASE", 10)).toBe(90);
  });

  it("FIXED INCREASE: oldPrice=100, value=25 → 125", () => {
    expect(computeAdjustedPrice(100, "FIXED", "INCREASE", 25)).toBe(125);
  });

  it("FIXED DECREASE: oldPrice=100, value=25 → 75", () => {
    expect(computeAdjustedPrice(100, "FIXED", "DECREASE", 25)).toBe(75);
  });

  it("PCT INCREASE with decimal: oldPrice=33.33, value=15 → 38.33", () => {
    expect(computeAdjustedPrice(33.33, "PCT", "INCREASE", 15)).toBe(38.33);
  });

  it("Large percentage: oldPrice=100, value=200 → 300", () => {
    expect(computeAdjustedPrice(100, "PCT", "INCREASE", 200)).toBe(300);
  });
});

describe("Rounding", () => {
  it("PCT INCREASE 33.333% on 100 → 133.33", () => {
    expect(computeAdjustedPrice(100, "PCT", "INCREASE", 33.333)).toBe(133.33);
  });

  it("FIXED INCREASE 0.006 on 7.77 → 7.78 (standard rounding)", () => {
    expect(computeAdjustedPrice(7.77, "FIXED", "INCREASE", 0.006)).toBe(7.78);
  });
});

describe("Negative Price Prevention", () => {
  it("FIXED DECREASE: oldPrice=10, value=15 → throws (result would be -5)", () => {
    expect(() => computeAdjustedPrice(10, "FIXED", "DECREASE", 15)).toThrow(
      "Adjusted price cannot be negative",
    );
  });

  it("PCT DECREASE: oldPrice=10, value=150 → throws (result would be -5)", () => {
    expect(() => computeAdjustedPrice(10, "PCT", "DECREASE", 150)).toThrow(
      "Adjusted price cannot be negative",
    );
  });

  it("FIXED DECREASE: oldPrice=0, value=1 → throws", () => {
    expect(() => computeAdjustedPrice(0, "FIXED", "DECREASE", 1)).toThrow(
      "Adjusted price cannot be negative",
    );
  });

  it("FIXED DECREASE: oldPrice=10, value=10 → exactly 0, should be OK", () => {
    expect(computeAdjustedPrice(10, "FIXED", "DECREASE", 10)).toBe(0);
  });
});

describe("Zero and Edge Cases", () => {
  it("oldPrice=0, PCT INCREASE 10% → 0", () => {
    expect(computeAdjustedPrice(0, "PCT", "INCREASE", 10)).toBe(0);
  });

  it("oldPrice=0, FIXED INCREASE 5 → 5", () => {
    expect(computeAdjustedPrice(0, "FIXED", "INCREASE", 5)).toBe(5);
  });
});
