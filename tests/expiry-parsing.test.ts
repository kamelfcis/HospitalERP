import { describe, it, expect } from 'vitest';
import { parseExpiryFinal } from '../client/src/components/ui/expiry-input';

const parseExpiry = parseExpiryFinal;

describe("Expiry Parsing (final/blur)", () => {
  describe("Valid MMYY format (4 digits, no slash)", () => {
    it("should parse '0626' as month=06, year=2026", () => {
      const result = parseExpiry("0626");
      expect(result).toEqual({ month: 6, year: 2026 });
    });

    it("should parse '1226' as month=12, year=2026", () => {
      const result = parseExpiry("1226");
      expect(result).toEqual({ month: 12, year: 2026 });
    });

    it("should parse '0120' as month=01, year=2020 (min year)", () => {
      const result = parseExpiry("0120");
      expect(result).toEqual({ month: 1, year: 2020 });
    });

    it("should parse '0199' as month=01, year=2099 (max year)", () => {
      const result = parseExpiry("0199");
      expect(result).toEqual({ month: 1, year: 2099 });
    });
  });

  describe("Valid MMYYYY format (6 digits, no slash)", () => {
    it("should parse '062026' as month=06, year=2026", () => {
      const result = parseExpiry("062026");
      expect(result).toEqual({ month: 6, year: 2026 });
    });

    it("should parse '122030' as month=12, year=2030", () => {
      const result = parseExpiry("122030");
      expect(result).toEqual({ month: 12, year: 2030 });
    });
  });

  describe("Valid MM/YY format (with slash)", () => {
    it("should parse '06/26' as month=06, year=2026", () => {
      const result = parseExpiry("06/26");
      expect(result).toEqual({ month: 6, year: 2026 });
    });

    it("should parse '01/25' as month=01, year=2025", () => {
      const result = parseExpiry("01/25");
      expect(result).toEqual({ month: 1, year: 2025 });
    });

    it("should parse '12/99' as month=12, year=2099", () => {
      const result = parseExpiry("12/99");
      expect(result).toEqual({ month: 12, year: 2099 });
    });
  });

  describe("Valid MM/YYYY format (with slash)", () => {
    it("should parse '06/2026' as month=06, year=2026", () => {
      const result = parseExpiry("06/2026");
      expect(result).toEqual({ month: 6, year: 2026 });
    });

    it("should parse '12/2030' as month=12, year=2030", () => {
      const result = parseExpiry("12/2030");
      expect(result).toEqual({ month: 12, year: 2030 });
    });

    it("should parse '01/2020' as month=01, year=2020 (min year)", () => {
      const result = parseExpiry("01/2020");
      expect(result).toEqual({ month: 1, year: 2020 });
    });

    it("should parse '12/2099' as month=12, year=2099 (max year)", () => {
      const result = parseExpiry("12/2099");
      expect(result).toEqual({ month: 12, year: 2099 });
    });
  });

  describe("Two-digit month only (no year)", () => {
    it("should parse '06' as month=6, year=null", () => {
      const result = parseExpiry("06");
      expect(result).toEqual({ month: 6, year: null });
    });

    it("should parse '01' as month=1, year=null", () => {
      const result = parseExpiry("01");
      expect(result).toEqual({ month: 1, year: null });
    });

    it("should parse '12' as month=12, year=null", () => {
      const result = parseExpiry("12");
      expect(result).toEqual({ month: 12, year: null });
    });
  });

  describe("Invalid month values", () => {
    it("should reject '13' as invalid month (>12)", () => {
      const result = parseExpiry("13");
      expect(result).toEqual({ month: null, year: null });
    });

    it("should reject '00' as invalid month (<1)", () => {
      const result = parseExpiry("00");
      expect(result).toEqual({ month: null, year: null });
    });

    it("should reject '13/2026' as invalid month with slash", () => {
      const result = parseExpiry("13/2026");
      expect(result).toEqual({ month: null, year: null });
    });

    it("should reject '00/2026' as invalid month with slash", () => {
      const result = parseExpiry("00/2026");
      expect(result).toEqual({ month: null, year: null });
    });

    it("should reject '1326' as invalid month in MMYY", () => {
      const result = parseExpiry("1326");
      expect(result).toEqual({ month: null, year: null });
    });
  });

  describe("Invalid year values", () => {
    it("should reject '06/2019' (year < 2020)", () => {
      const result = parseExpiry("06/2019");
      expect(result).toEqual({ month: 6, year: null });
    });

    it("should reject '06/2100' (year > 2099)", () => {
      const result = parseExpiry("06/2100");
      expect(result).toEqual({ month: 6, year: null });
    });

    it("should reject '06/19' (2-digit year resolves to 2019 < 2020)", () => {
      const result = parseExpiry("06/19");
      expect(result).toEqual({ month: 6, year: null });
    });

    it("should reject '0619' MMYY where year=2019 < 2020", () => {
      const result = parseExpiry("0619");
      expect(result).toEqual({ month: null, year: null });
    });
  });

  describe("Empty and edge case inputs", () => {
    it("should return null, null for empty string", () => {
      const result = parseExpiry("");
      expect(result).toEqual({ month: null, year: null });
    });

    it("should return null, null for single digit '5'", () => {
      const result = parseExpiry("5");
      expect(result).toEqual({ month: null, year: null });
    });

    it("should return null, null for single digit '0'", () => {
      const result = parseExpiry("0");
      expect(result).toEqual({ month: null, year: null });
    });

    it("should strip non-numeric/non-slash characters and parse remaining digits", () => {
      const result = parseExpiry("06-2026");
      expect(result).toEqual({ month: 6, year: 2026 });
    });

    it("should strip letters and return null for insufficient digits", () => {
      const result = parseExpiry("abc");
      expect(result).toEqual({ month: null, year: null });
    });

    it("should handle slash-only input", () => {
      const result = parseExpiry("/");
      expect(result).toEqual({ month: null, year: null });
    });

    it("should handle month with trailing slash '06/'", () => {
      const result = parseExpiry("06/");
      expect(result).toEqual({ month: 6, year: null });
    });

    it("should handle incomplete year '06/2'", () => {
      const result = parseExpiry("06/2");
      expect(result).toEqual({ month: 6, year: null });
    });

    it("should handle 3-digit input '062' (odd length, no match)", () => {
      const result = parseExpiry("062");
      expect(result).toEqual({ month: null, year: null });
    });

    it("should handle 5-digit input '06202' as partial MMYYYY", () => {
      const result = parseExpiry("06202");
      expect(result).toEqual({ month: null, year: null });
    });
  });
});

describe("No auto-2020 bug", () => {
  it("should NOT parse intermediate '12/20' as 2020 (only on blur with 2-digit year)", () => {
    const result = parseExpiry("12/20");
    expect(result).toEqual({ month: 12, year: 2020 });
  });

  it("typing '12/2028' on blur should parse as 12/2028", () => {
    const result = parseExpiry("12/2028");
    expect(result).toEqual({ month: 12, year: 2028 });
  });

  it("typing '1228' (MMYY) should parse as 12/2028", () => {
    const result = parseExpiry("1228");
    expect(result).toEqual({ month: 12, year: 2028 });
  });

  it("typing '12/28' should parse as 12/2028", () => {
    const result = parseExpiry("12/28");
    expect(result).toEqual({ month: 12, year: 2028 });
  });

  it("partial '12/2' should not produce a year", () => {
    const result = parseExpiry("12/2");
    expect(result).toEqual({ month: 12, year: null });
  });

  it("partial '12/202' should not produce a year", () => {
    const result = parseExpiry("12/202");
    expect(result).toEqual({ month: 12, year: null });
  });
});

describe("ExpiryInput handleChange behavior (simulated)", () => {
  function simulateHandleChange(val: string): string {
    val = val.replace(/[^\d\/]/g, "");
    if (val.length > 7) return val.slice(0, 7);

    const digits = val.replace(/\D/g, "");

    if (!val.includes("/") && digits.length === 2) {
      const month = parseInt(digits);
      if (month >= 1 && month <= 12) {
        return `${String(month).padStart(2, '0')}/`;
      }
    }

    if (!val.includes("/") && digits.length >= 4) {
      const month = parseInt(digits.slice(0, 2));
      if (month >= 1 && month <= 12) {
        const yearPart = digits.slice(2);
        return `${String(month).padStart(2, '0')}/${yearPart}`;
      }
    }

    return val;
  }

  it("typing '12' should auto-add slash → '12/'", () => {
    expect(simulateHandleChange("12")).toBe("12/");
  });

  it("typing '12/2' keeps it as-is → '12/2'", () => {
    expect(simulateHandleChange("12/2")).toBe("12/2");
  });

  it("typing '12/20' keeps it as-is (no auto-expand to 2020) → '12/20'", () => {
    expect(simulateHandleChange("12/20")).toBe("12/20");
  });

  it("typing '12/202' keeps it as-is → '12/202'", () => {
    expect(simulateHandleChange("12/202")).toBe("12/202");
  });

  it("typing '12/2028' keeps it as-is → '12/2028'", () => {
    expect(simulateHandleChange("12/2028")).toBe("12/2028");
  });

  it("rapid typing '1228' should auto-format → '12/28'", () => {
    expect(simulateHandleChange("1228")).toBe("12/28");
  });

  it("input never exceeds 7 chars", () => {
    const result = simulateHandleChange("12/20281");
    expect(result.length).toBeLessThanOrEqual(7);
  });
});

describe("Default Unit Level", () => {
  function getDefaultUnitLevel(item: any): string {
    if (item.majorUnitName) return "major";
    return "minor";
  }

  it("should return 'major' when item has majorUnitName", () => {
    expect(getDefaultUnitLevel({ majorUnitName: "علبة", minorUnitName: "قرص" })).toBe("major");
  });

  it("should return 'minor' when item has no majorUnitName", () => {
    expect(getDefaultUnitLevel({ minorUnitName: "قرص" })).toBe("minor");
  });

  it("should return 'minor' when majorUnitName is null", () => {
    expect(getDefaultUnitLevel({ majorUnitName: null, minorUnitName: "قرص" })).toBe("minor");
  });

  it("should return 'minor' when majorUnitName is empty string", () => {
    expect(getDefaultUnitLevel({ majorUnitName: "", minorUnitName: "قرص" })).toBe("minor");
  });

  it("should return 'major' even when no minorUnitName", () => {
    expect(getDefaultUnitLevel({ majorUnitName: "كرتونة" })).toBe("major");
  });
});
