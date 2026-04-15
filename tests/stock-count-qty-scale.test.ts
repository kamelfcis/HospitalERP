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
import { liveCall as api } from "./live-session";

// ─── Optional: fixed demo UUIDs from a seed DB; tests fall back to any heavy lot ────
const WAREHOUSE_ID  = "9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0";
const ITEM_ID       = "d3ea2c56-4a92-451d-83c4-20ac8eb951f6";
const LOT_ID        = "de71b916-be19-4201-836f-d95f68f6e2f0";
const SYSTEM_QTY    = "7000.0000";   // expected minor qty when demo lot exists
const UNIT_COST     = "1.1332";      // EGP per tablet
const MAJOR_TO_MINOR = 100;          // 100 tablets per box (علبة)
const MEDIUM_TO_MINOR = 10;          // 10 tablets per strip (شريط)

let sessionId: string;

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
  /** Bound after load-items so tests work across DB restores (UUIDs differ). */
  let apiItemId = ITEM_ID;
  let apiLotId = LOT_ID;
  let apiSystemQty = SYSTEM_QTY;
  let apiUnitCost = UNIT_COST;

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

  it("load-items binds a real lot and asserts minor qty is not /1000-scaled", async () => {
    const { status, data } = await api(
      "GET",
      `/api/stock-count/sessions/${sessionId}/load-items?includeAll=true&limit=200`
    );
    expect(status).toBe(200);

    const rows = data as any[];
    const lot =
      rows.find((i: any) => i.lotId === LOT_ID) ??
      rows.find((i: any) => parseFloat(String(i.systemQtyMinor ?? 0)) >= 500) ??
      rows[0];
    expect(lot).toBeTruthy();

    apiItemId = lot.itemId;
    apiLotId = lot.lotId;
    apiSystemQty = String(lot.systemQtyMinor);
    apiUnitCost = String(lot.unitCost ?? UNIT_COST);

    const systemQty = parseFloat(apiSystemQty);
    expect(systemQty).toBeGreaterThan(500);
    expect(systemQty).toBeLessThan(100_000_000);

    expect(lot.majorUnitName).toBeTruthy();
    expect(lot.majorToMinor).toBeTruthy();
    const m2m = parseFloat(String(lot.majorToMinor));
    if (lot.lotId === LOT_ID) {
      expect(m2m).toBe(MAJOR_TO_MINOR);
    } else {
      expect(m2m).toBeGreaterThan(0);
    }
  });

  it("Upserts a line: counted = system − 100; verifies differenceMinor and differenceValue", async () => {
    const countedQtyMinor = (parseFloat(apiSystemQty) - 100).toFixed(4);

    const { status, data } = await api(
      "POST",
      `/api/stock-count/sessions/${sessionId}/lines`,
      [{
        itemId:          apiItemId,
        lotId:           apiLotId,
        expiryDate:      null,
        systemQtyMinor:  apiSystemQty,
        countedQtyMinor,
        unitCost:        apiUnitCost,
      }]
    );
    expect(status).toBe(200);
    const line = data[0];

    expect(parseFloat(line.differenceMinor)).toBeCloseTo(-100, 2);

    const expectedValue = -100 * parseFloat(apiUnitCost);
    expect(parseFloat(line.differenceValue)).toBeCloseTo(expectedValue, 1);
  });

  it("GET session returns stored line with correct scale", async () => {
    const { status, data } = await api(
      "GET",
      `/api/stock-count/sessions/${sessionId}`
    );
    expect(status).toBe(200);
    const line = data.lines.find((l: any) => l.lotId === apiLotId);
    expect(line).toBeTruthy();

    const countedExpected = parseFloat(apiSystemQty) - 100;
    expect(parseFloat(line.countedQtyMinor)).toBeCloseTo(countedExpected, 1);
    expect(parseFloat(line.countedQtyMinor)).not.toBeCloseTo(countedExpected * 1000, 0);

    expect(parseFloat(line.systemQtyMinor)).toBeCloseTo(parseFloat(apiSystemQty), 1);

    expect(parseFloat(line.differenceMinor)).toBeCloseTo(-100, 1);

    const expectedValue = parseFloat(line.differenceMinor) * parseFloat(line.unitCost);
    expect(parseFloat(line.differenceValue)).toBeCloseTo(expectedValue, 1);
  });

  it("excludeCountedSinceDate: draft session does NOT cause exclusion", async () => {
    const { status, data } = await api(
      "GET",
      `/api/stock-count/sessions/${sessionId}/load-items` +
      `?includeAll=true&excludeCountedSinceDate=2020-01-01&limit=200`
    );
    expect(status).toBe(200);

    const lot = (data as any[]).find((i: any) => i.lotId === apiLotId);
    expect(lot).toBeTruthy();
    expect(lot.alreadyCounted).toBe(false);
  });

  it("Upserts same line again with no change → differenceMinor stays -100", async () => {
    const countedQtyMinor = (parseFloat(apiSystemQty) - 100).toFixed(4);
    const { status, data } = await api(
      "POST",
      `/api/stock-count/sessions/${sessionId}/lines`,
      [{
        itemId:          apiItemId,
        lotId:           apiLotId,
        expiryDate:      null,
        systemQtyMinor:  apiSystemQty,
        countedQtyMinor,
        unitCost:        apiUnitCost,
      }]
    );
    expect(status).toBe(200);
    const line = data[0];
    expect(parseFloat(line.differenceMinor)).toBeCloseTo(-100, 2);
  });

  it("Scale regression: difference stays in plausible range (no *1000 explosion)", async () => {
    const { data } = await api(
      "GET",
      `/api/stock-count/sessions/${sessionId}`
    );
    const line = data.lines.find((l: any) => l.lotId === apiLotId);
    expect(Math.abs(parseFloat(line.differenceMinor))).toBeLessThan(parseFloat(apiSystemQty));
    expect(Math.abs(parseFloat(line.differenceMinor))).toBeLessThan(100_000);
  });
});
