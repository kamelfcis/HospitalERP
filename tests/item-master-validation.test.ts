import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = "http://localhost:5000";

async function api(method: string, path: string, body?: any) {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  return { status: res.status, data: await res.json().catch(() => null) };
}

describe("UOM Master", () => {
  const uomCode = `TST-${Date.now().toString(36).toUpperCase()}`;

  it("should create a new UOM", async () => {
    const result = await api("POST", "/api/uoms", {
      code: uomCode,
      nameAr: `وحدة تست ${uomCode}`,
      nameEn: `Test Unit ${uomCode}`,
    });
    expect(result.status).toBe(201);
    expect(result.data.code).toBe(uomCode);
    expect(result.data.nameAr).toContain("وحدة تست");
  });

  it("should reject duplicate UOM code", async () => {
    const result = await api("POST", "/api/uoms", {
      code: uomCode,
      nameAr: "وحدة أخرى",
    });
    expect(result.status).toBe(409);
  });

  it("should list UOMs including the created one", async () => {
    const result = await api("GET", "/api/uoms");
    expect(result.status).toBe(200);
    expect(Array.isArray(result.data)).toBe(true);
    const found = result.data.find((u: any) => u.code === uomCode);
    expect(found).toBeTruthy();
  });
});

describe("Item Uniqueness Check", () => {
  let existingItem: any;

  beforeAll(async () => {
    const items = await api("GET", "/api/items?page=1&limit=1");
    existingItem = items.data.items[0];
  });

  it("should report existing item code as not unique", async () => {
    const result = await api("GET", `/api/items/check-unique?code=${encodeURIComponent(existingItem.itemCode)}`);
    expect(result.status).toBe(200);
    expect(result.data.codeUnique).toBe(false);
  });

  it("should report new code as unique", async () => {
    const result = await api("GET", "/api/items/check-unique?code=NONEXISTENT_XYZ_99");
    expect(result.status).toBe(200);
    expect(result.data.codeUnique).toBe(true);
  });

  it("should exclude self when checking uniqueness", async () => {
    const result = await api("GET", `/api/items/check-unique?code=${encodeURIComponent(existingItem.itemCode)}&excludeId=${existingItem.id}`);
    expect(result.status).toBe(200);
    expect(result.data.codeUnique).toBe(true);
  });

  it("should be case-insensitive", async () => {
    const code = existingItem.itemCode;
    const flipped = code.toUpperCase() === code ? code.toLowerCase() : code.toUpperCase();
    const result = await api("GET", `/api/items/check-unique?code=${encodeURIComponent(flipped)}`);
    expect(result.status).toBe(200);
    expect(result.data.codeUnique).toBe(false);
  });
});

describe("Item Creation Validation", () => {
  let formTypeId: string;

  beforeAll(async () => {
    const fts = await api("GET", "/api/form-types");
    formTypeId = fts.data[0]?.id;
    if (!formTypeId) {
      const created = await api("POST", "/api/form-types", { nameAr: "أقراص تست", sortOrder: 0, isActive: true });
      formTypeId = created.data.id;
    }
  });

  it("should reject item without required fields", async () => {
    const result = await api("POST", "/api/items", {
      itemCode: "MISSING-FIELDS",
      nameAr: "صنف ناقص",
    });
    expect(result.status).toBe(400);
    expect(result.data.message).toBeTruthy();
  });

  it("should reject item with zero conversion factors", async () => {
    const unique = Date.now().toString(36);
    const result = await api("POST", "/api/items", {
      itemCode: `Z-${unique}`,
      nameAr: `صنف صفر ${unique}`,
      nameEn: `Zero Item ${unique}`,
      category: "drug",
      formTypeId,
      majorUnitName: "علبة",
      mediumUnitName: "شريط",
      minorUnitName: "قرص",
      majorToMedium: "0",
      majorToMinor: "0",
      mediumToMinor: "0",
    });
    expect(result.status).toBe(400);
    expect(result.data.message).toContain("أكبر من صفر");
  });

  it("should reject duplicate item code", async () => {
    const items = await api("GET", "/api/items?page=1&limit=1");
    const existingCode = items.data.items[0].itemCode;
    const unique = Date.now().toString(36);

    const result = await api("POST", "/api/items", {
      itemCode: existingCode,
      nameAr: `صنف مكرر ${unique}`,
      nameEn: `Dup Item ${unique}`,
      category: "drug",
      formTypeId,
      majorUnitName: "علبة",
      mediumUnitName: "شريط",
      minorUnitName: "قرص",
      majorToMedium: "3",
      majorToMinor: "30",
      mediumToMinor: "10",
    });
    expect(result.status).toBe(409);
    expect(result.data.message).toContain("كود الصنف");
  });

  it("should create item with all required fields", async () => {
    const unique = Date.now().toString(36);
    const result = await api("POST", "/api/items", {
      itemCode: `T-${unique}`,
      nameAr: `صنف اختبار ${unique}`,
      nameEn: `Test Item ${unique}`,
      category: "drug",
      formTypeId,
      majorUnitName: "علبة",
      mediumUnitName: "شريط",
      minorUnitName: "قرص",
      majorToMedium: "3",
      majorToMinor: "30",
      mediumToMinor: "10",
      hasExpiry: true,
      isToxic: false,
    });
    expect(result.status).toBe(201);
    expect(result.data.itemCode).toBe(`T-${unique}`);
  });
});
