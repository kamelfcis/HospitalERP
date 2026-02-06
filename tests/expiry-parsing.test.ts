import { describe, it, expect } from 'vitest';

function parseExpiry(text: string): { month: number | null; year: number | null } {
  const cleaned = text.replace(/[^\d\/]/g, "");

  if (cleaned.includes("/")) {
    const parts = cleaned.split("/");
    const monthStr = parts[0];
    const yearStr = parts[1] || "";
    const month = parseInt(monthStr);

    if (!month || month < 1 || month > 12) return { month: null, year: null };

    if (yearStr.length === 4) {
      const year = parseInt(yearStr);
      if (year >= 2020 && year <= 2099) return { month, year };
    } else if (yearStr.length === 2) {
      const year = 2000 + parseInt(yearStr);
      if (year >= 2020 && year <= 2099) return { month, year };
    }
    return { month, year: null };
  }

  const digits = cleaned.replace(/\D/g, "");

  if (digits.length <= 2) {
    const month = parseInt(digits);
    if (digits.length === 2 && month >= 1 && month <= 12) return { month, year: null };
    return { month: null, year: null };
  }

  if (digits.length === 4) {
    const month = parseInt(digits.slice(0, 2));
    const yearShort = parseInt(digits.slice(2, 4));
    const year = 2000 + yearShort;
    if (month >= 1 && month <= 12 && year >= 2020 && year <= 2099) return { month, year };
  }

  if (digits.length >= 5 && digits.length <= 6) {
    const month = parseInt(digits.slice(0, 2));
    const yearStr = digits.slice(2);
    const year = parseInt(yearStr);
    if (month >= 1 && month <= 12 && year >= 2020 && year <= 2099) return { month, year };
  }

  return { month: null, year: null };
}

describe("Expiry Parsing", () => {
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
