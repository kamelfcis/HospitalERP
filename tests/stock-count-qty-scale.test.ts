/**
 * Stock Count Quantity-Scale Regression Tests
 *
 * Guards against reintroduction of the /1000 or *1000 scaling bug.
 *
 * INVARIANT: All qty fields (systemQtyMinor, countedQtyMinor, differenceMinor)
 * are stored and transmitted in ACTUAL minor units (real tablet/unit counts).
 * No scaling factor is applied anywhere in the stack.
 *
 * Example: 7000 قرص is stored as 7000.0000, displayed as "7,000", never as 7
 * or 7000000.
 *
 * SCALE CONTRACT:
 *   differenceMinor  = countedQtyMinor - systemQtyMinor  (actual minor units)
 *   differenceValue  = differenceMinor × unitCost         (EGP, no scaling)
 *   lot qty_in_minor adjusted by differenceMinor directly
 *   GL journal amount = SUM(difference_value)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE_URL = "http://localhost:5000";

// ─── Real warehouse / item from DB (DEMO-DRUG-005 lot in main warehouse) ────
const WAREHOUSE_ID  = "9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0";
const ITEM_ID       = "d3ea2c56-4a92-451d-83c4-20ac8eb951f6";
const LOT_ID        = "de71b916-be19-4201-836f-d95f68f6e2f0";
const SYSTEM_QTY    = "7000.0000";   // actual tablets in the lot
const UNIT_COST     = "1.1332";      // EGP per tablet
const MAJOR_TO_MINOR = 100;          // 100 tablets per box (علبة)
const MEDIUM_TO_MINOR = 10;          // 10 tablets per strip (شريط)

// ─── HTTP helpers ─────────────────────────────────────────────────────────
let cookies = "";

async function api(method: string, path: string, body?: any) {
  const opts: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookies ? { cookie: cookies } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookies = setCookie.split(";")[0];
  return { status: res.status, data: await res.json().catch(() => null) };
}

let sessionId: string;

beforeAll(async () => {
  const { status } = await api("POST", "/api/auth/login", {
    username: "admin",
    password: "admin123",
  });
  expect(status).toBe(200);
});

afterAll(async () => {
  if (sessionId) {
    await api("DELETE", `/api/stock-count/sessions/${sessionId}`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
//  Group 1 — Pure math functions (no network, instant fail on regression)
// ═════════════════════════════════════════════════════════════════════════════

describe("Scale invariant — pure math", () => {

  // Replica of LineTable.tsx calcMinorFromUom
  function calcMinorFromUom(
    maj: number, majorToMinor: number,
    med: number, mediumToMinor: number,
    min: number
  ) {
    return Math.round(
      (isNaN(maj) ? 0 : maj) * majorToMinor +
      (isNaN(med) ? 0 : med) * mediumToMinor +
      (isNaN(min) ? 0 : min)
    );
  }

  // Replica of LineTable.tsx fmtQty (fixed version — no /1000)
  function fmtQtyFixed(minor: string | number) {
    return Number(minor).toLocaleString("ar-EG", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });
  }

  // The old BUGGY fmtQty — should produce different output for non-trivial values
  function fmtQtyBuggy(minor: string | number) {
    return (Number(minor) / 1000).toLocaleString("ar-EG", { minimumFractionDigits: 3 });
  }

  // Replica of SingleQtyCell save (fixed — no *1000)
  function singleCellSave(userInput: string): string {
    const num = parseFloat(userInput.replace(/,/g, "."));
    if (isNaN(num) || num < 0) throw new Error("invalid");
    return num.toFixed(4);
  }

  // Replica of backend upsertStockCountLines math
  function backendUpsertMath(
    countedQtyMinor: string,
    systemQtyMinor: string,
    unitCost: string
  ) {
    const diff  = parseFloat(countedQtyMinor) - parseFloat(systemQtyMinor);
    const value = diff * parseFloat(unitCost);
    return {
      differenceMinor: diff.toFixed(4),
      differenceValue: value.toFixed(2),
    };
  }

  it("fmtQty displays 7000 as '7,000' — not '7'", () => {
    const display = fmtQtyFixed("7000.0000");
    // Arabic locale formats 7000 with comma separator
    expect(Number(display.replace(/[,،٬\u066c]/g, "").replace(/[\u0660-\u0669]/g,
      (c) => String(c.charCodeAt(0) - 0x0660)))).toBeCloseTo(7000, 0);
    // Explicitly NOT equal to buggy display (which would be 7.000 / 1000 = 7)
    expect(display).not.toBe(fmtQtyBuggy("7000.0000"));
  });

  it("fmtQty(360) never equals fmtQty_buggy(360)", () => {
    expect(fmtQtyFixed(360)).not.toBe(fmtQtyBuggy(360));
  });

  it("calcMinorFromUom: 3 علبة × 100 + 2 شريط × 10 + 5 قرص = 325", () => {
    expect(calcMinorFromUom(3, MAJOR_TO_MINOR, 2, MEDIUM_TO_MINOR, 5)).toBe(325);
  });

  it("calcMinorFromUom: 0 input → 0 (no phantom qty)", () => {
    expect(calcMinorFromUom(0, MAJOR_TO_MINOR, 0, MEDIUM_TO_MINOR, 0)).toBe(0);
  });

  it("calcMinorFromUom: major-only (no medium) — 2 boxes = 200 tablets", () => {
    expect(calcMinorFromUom(2, MAJOR_TO_MINOR, 0, 0, 0)).toBe(200);
  });

  it("SingleQtyCell save: user types '120' → saved as '120.0000' (NOT '120000')", () => {
    const saved = singleCellSave("120");
    expect(saved).toBe("120.0000");
    expect(parseFloat(saved)).toBe(120);
    // Regression guard: must NOT be 120000
    expect(parseFloat(saved)).not.toBe(120 * 1000);
  });

  it("SingleQtyCell save: user types '7000' → saved as '7000.0000'", () => {
    const saved = singleCellSave("7000");
    expect(saved).toBe("7000.0000");
    expect(parseFloat(saved)).not.toBe(7000 * 1000);
  });

  it("Backend upsert math: shortage of 100 tablets at 1.1332/tablet = -113.32 EGP", () => {
    const counted = "6900.0000"; // user counted 6900
    const system  = "7000.0000"; // system has 7000
    const result  = backendUpsertMath(counted, system, "1.1332");

    expect(result.differenceMinor).toBe("-100.0000");
    expect(result.differenceValue).toBe("-113.32");
  });

  it("Backend upsert math: surplus 5 tablets at 17/tablet = 85 EGP", () => {
    const result = backendUpsertMath("365.0000", "360.0000", "17.0000");
    expect(result.differenceMinor).toBe("5.0000");
    expect(result.differenceValue).toBe("85.00");
  });

  it("Backend upsert math: no difference → zero diff and zero value", () => {
    const result = backendUpsertMath("360.0000", "360.0000", "17.0000");
    expect(result.differenceMinor).toBe("0.0000");
    expect(result.differenceValue).toBe("0.00");
  });

  it("Scale consistency: MultiUOM save matches backend expectation (no /1000)", () => {
    // User counts 69 boxes = 6900 tablets
    const countedMinor = calcMinorFromUom(69, MAJOR_TO_MINOR, 0, 0, 0); // = 6900
    expect(countedMinor).toBe(6900);

    const saved = String(countedMinor); // "6900" — what MultiUomCell sends
    const result = backendUpsertMath(saved, SYSTEM_QTY, UNIT_COST);
    expect(result.differenceMinor).toBe("-100.0000"); // 6900 - 7000 = -100
    // value = -100 × 1.1332 = -113.32
    expect(result.differenceValue).toBe("-113.32");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Group 2 — API integration (live server)
// ═════════════════════════════════════════════════════════════════════════════

describe("Scale invariant — API round-trip", () => {

  it("Creates a draft stock count session", async () => {
    const { status, data } = await api("POST", "/api/stock-count/sessions", {
      warehouseId: WAREHOUSE_ID,
      countDate:   "2026-03-13",
      notes:       "[REGRESSION TEST] qty-scale",
    });
    expect(status).toBe(201);
    expect(data.id).toBeTruthy();
    sessionId = data.id;
  });

  it("load-items returns actual minor qty (7000 tablets, not 7)", async () => {
    const { status, data } = await api(
      "GET",
      `/api/stock-count/sessions/${sessionId}/load-items?includeAll=true&limit=200`
    );
    expect(status).toBe(200);

    const lot = (data as any[]).find(
      (i: any) => i.lotId === LOT_ID
    );
    expect(lot).toBeTruthy();

    const systemQty = parseFloat(lot.systemQtyMinor);
    // Must be ~7000, NOT ~7 (which would indicate /1000 bug)
    expect(systemQty).toBeGreaterThan(6000);
    expect(systemQty).toBeLessThan(8000);
    expect(systemQty).not.toBeCloseTo(7, 0);

    // Unit conversion fields must be present
    expect(lot.majorUnitName).toBeTruthy();
    expect(lot.majorToMinor).toBeTruthy();
    expect(parseFloat(lot.majorToMinor)).toBe(MAJOR_TO_MINOR);
  });

  it("Upserts a line: counted=6900 (69 boxes), verifies differenceMinor and differenceValue", async () => {
    const countedQtyMinor = "6900.0000"; // 69 boxes × 100 tabs = 6900 tabs

    const { status, data } = await api(
      "POST",
      `/api/stock-count/sessions/${sessionId}/lines`,
      [{
        itemId:          ITEM_ID,
        lotId:           LOT_ID,
        expiryDate:      null,
        systemQtyMinor:  SYSTEM_QTY,
        countedQtyMinor,
        unitCost:        UNIT_COST,
      }]
    );
    expect(status).toBe(200);
    const line = data[0];

    // differenceMinor must be -100 (not -100000 or -0.1)
    expect(parseFloat(line.differenceMinor)).toBeCloseTo(-100, 2);

    // differenceValue = -100 × 1.1332 = -113.32
    expect(parseFloat(line.differenceValue)).toBeCloseTo(-113.32, 1);
  });

  it("GET session returns stored line with correct scale", async () => {
    const { status, data } = await api(
      "GET",
      `/api/stock-count/sessions/${sessionId}`
    );
    expect(status).toBe(200);
    const line = data.lines.find((l: any) => l.lotId === LOT_ID);
    expect(line).toBeTruthy();

    // countedQtyMinor stored as-is (6900), not 6900000
    expect(parseFloat(line.countedQtyMinor)).toBeCloseTo(6900, 1);
    expect(parseFloat(line.countedQtyMinor)).not.toBeCloseTo(6900 * 1000, 0);

    // systemQtyMinor unchanged (7000, not 7)
    expect(parseFloat(line.systemQtyMinor)).toBeCloseTo(7000, 1);

    // difference is -100 (not -100000)
    expect(parseFloat(line.differenceMinor)).toBeCloseTo(-100, 1);

    // value consistent: diff × cost (no hidden factor)
    const expectedValue = parseFloat(line.differenceMinor) * parseFloat(line.unitCost);
    expect(parseFloat(line.differenceValue)).toBeCloseTo(expectedValue, 1);
  });

  it("excludeCountedSinceDate: draft session does NOT cause exclusion", async () => {
    // The session we just created is DRAFT — items in it must NOT be excluded
    // when another new session loads items with excludeCountedSinceDate
    const { status, data } = await api(
      "GET",
      `/api/stock-count/sessions/${sessionId}/load-items` +
      `?includeAll=true&excludeCountedSinceDate=2020-01-01&limit=200`
    );
    expect(status).toBe(200);

    const lot = (data as any[]).find((i: any) => i.lotId === LOT_ID);
    expect(lot).toBeTruthy();
    // alreadyCounted must be false — draft session doesn't count
    expect(lot.alreadyCounted).toBe(false);
  });

  it("Upserts same line again with no change → differenceMinor stays -100", async () => {
    // Idempotency check: re-saving same values must not accumulate
    const { status, data } = await api(
      "POST",
      `/api/stock-count/sessions/${sessionId}/lines`,
      [{
        itemId:          ITEM_ID,
        lotId:           LOT_ID,
        expiryDate:      null,
        systemQtyMinor:  SYSTEM_QTY,
        countedQtyMinor: "6900.0000",
        unitCost:        UNIT_COST,
      }]
    );
    expect(status).toBe(200);
    const line = data[0];
    expect(parseFloat(line.differenceMinor)).toBeCloseTo(-100, 2);
  });

  it("Scale regression: if countedQtyMinor were saved as 6900000 (bug), diff would be >6890000", async () => {
    // Prove the old bug: if * 1000 were applied, countedQtyMinor would be 6,900,000
    // and differenceMinor would be 6,900,000 - 7,000 = 6,893,000 — completely wrong.
    // This test documents what WOULD happen and asserts it does NOT happen.
    const { data } = await api(
      "GET",
      `/api/stock-count/sessions/${sessionId}`
    );
    const line = data.lines.find((l: any) => l.lotId === LOT_ID);
    // The difference MUST be within a plausible physical range (< total warehouse qty)
    expect(Math.abs(parseFloat(line.differenceMinor))).toBeLessThan(parseFloat(SYSTEM_QTY));
    // And must NOT be in the millions (what *1000 scale bug would cause)
    expect(Math.abs(parseFloat(line.differenceMinor))).toBeLessThan(100_000);
  });
});
