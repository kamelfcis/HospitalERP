import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = "http://localhost:5000";

async function api(method: string, path: string, body?: any) {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

let seedData: any;
let warehouseId: string;
let fefoItemId: string;
let fefoItemBarcode: string;
let supplyItemId: string;
let supplyItemBarcode: string;
let drugItem2Id: string;

describe("Sales Invoice Workflow", () => {

  beforeAll(async () => {
    const result = await api("POST", "/api/seed/pharmacy-sales-demo");
    expect(result.status).toBe(200);
    expect(result.data.success).toBe(true);
    seedData = result.data;
    warehouseId = seedData.warehouseId;
    fefoItemId = seedData.items[0].id;
    fefoItemBarcode = seedData.items[0].barcode;
    drugItem2Id = seedData.items[1].id;
    supplyItemId = seedData.items[8].id;
    supplyItemBarcode = seedData.items[8].barcode;
  });

  describe("FEFO Auto-Split Allocation", () => {
    it("should auto-split expiry item qty=7 into 2 lines (5+2) using FEFO", async () => {
      const result = await api("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: new Date().toISOString().split("T")[0],
          warehouseId,
          customerType: "cash",
          customerName: "Test FEFO Customer",
        },
        lines: [{
          itemId: fefoItemId,
          unitLevel: "minor",
          qty: "7",
          salePrice: "1.50",
        }],
      });

      expect(result.status).toBe(201);
      const invoiceId = result.data.id;

      const detail = await api("GET", `/api/sales-invoices/${invoiceId}`);
      expect(detail.status).toBe(200);

      const lines = detail.data.lines;
      expect(lines.length).toBeGreaterThanOrEqual(2);

      const sortedLines = [...lines].sort((a: any, b: any) => {
        if (a.expiryYear !== b.expiryYear) return a.expiryYear - b.expiryYear;
        return a.expiryMonth - b.expiryMonth;
      });

      expect(sortedLines[0].expiryMonth).toBe(3);
      expect(sortedLines[0].expiryYear).toBe(2026);

      const totalQty = lines.reduce((sum: number, l: any) => sum + parseFloat(l.qty), 0);
      expect(totalQty).toBe(7);

      for (const ln of lines) {
        expect(ln.expiryMonth).toBeDefined();
        expect(ln.expiryYear).toBeDefined();
        expect(ln.lotId).toBeDefined();
      }

      await api("DELETE", `/api/sales-invoices/${invoiceId}`);
    });

    it("should NOT split non-expiry items", async () => {
      const result = await api("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: new Date().toISOString().split("T")[0],
          warehouseId,
          customerType: "cash",
          customerName: "Test Non-Expiry",
        },
        lines: [{
          itemId: supplyItemId,
          unitLevel: "minor",
          qty: "10",
          salePrice: "0.50",
        }],
      });

      expect(result.status).toBe(201);
      const invoiceId = result.data.id;

      const detail = await api("GET", `/api/sales-invoices/${invoiceId}`);
      expect(detail.data.lines.length).toBe(1);
      expect(parseFloat(detail.data.lines[0].qty)).toBe(10);

      await api("DELETE", `/api/sales-invoices/${invoiceId}`);
    });

    it("should keep line as-is when expiry is already specified", async () => {
      const result = await api("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: new Date().toISOString().split("T")[0],
          warehouseId,
          customerType: "cash",
          customerName: "Test Specified Expiry",
        },
        lines: [{
          itemId: fefoItemId,
          unitLevel: "minor",
          qty: "3",
          salePrice: "1.50",
          expiryMonth: 6,
          expiryYear: 2026,
        }],
      });

      expect(result.status).toBe(201);
      const invoiceId = result.data.id;

      const detail = await api("GET", `/api/sales-invoices/${invoiceId}`);
      expect(detail.data.lines.length).toBe(1);
      expect(detail.data.lines[0].expiryMonth).toBe(6);
      expect(detail.data.lines[0].expiryYear).toBe(2026);

      await api("DELETE", `/api/sales-invoices/${invoiceId}`);
    });
  });

  describe("Selling Price Immutability", () => {
    it("should override client-sent salePrice with server-computed price", async () => {
      const result = await api("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: new Date().toISOString().split("T")[0],
          warehouseId,
          customerType: "cash",
          customerName: "Test Price Override",
        },
        lines: [{
          itemId: supplyItemId,
          unitLevel: "major",
          qty: "1",
          salePrice: "999.99",
        }],
      });

      expect(result.status).toBe(201);
      const invoiceId = result.data.id;

      const detail = await api("GET", `/api/sales-invoices/${invoiceId}`);
      const line = detail.data.lines[0];

      expect(parseFloat(line.salePrice)).toBe(50);

      await api("DELETE", `/api/sales-invoices/${invoiceId}`);
    });

    it("should compute per-unit price correctly for medium unit", async () => {
      const result = await api("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: new Date().toISOString().split("T")[0],
          warehouseId,
          customerType: "cash",
          customerName: "Test Medium Price",
        },
        lines: [{
          itemId: supplyItemId,
          unitLevel: "medium",
          qty: "1",
          salePrice: "0",
        }],
      });

      expect(result.status).toBe(201);
      const invoiceId = result.data.id;

      const detail = await api("GET", `/api/sales-invoices/${invoiceId}`);
      const line = detail.data.lines[0];

      expect(parseFloat(line.salePrice)).toBe(5);

      await api("DELETE", `/api/sales-invoices/${invoiceId}`);
    });

    it("should compute per-unit price correctly for minor unit", async () => {
      const result = await api("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: new Date().toISOString().split("T")[0],
          warehouseId,
          customerType: "cash",
          customerName: "Test Minor Price",
        },
        lines: [{
          itemId: supplyItemId,
          unitLevel: "minor",
          qty: "1",
          salePrice: "0",
        }],
      });

      expect(result.status).toBe(201);
      const invoiceId = result.data.id;

      const detail = await api("GET", `/api/sales-invoices/${invoiceId}`);
      const line = detail.data.lines[0];

      expect(parseFloat(line.salePrice)).toBe(0.5);

      await api("DELETE", `/api/sales-invoices/${invoiceId}`);
    });
  });

  describe("Discount Linkage", () => {
    it("should correctly compute net total with percent discount", async () => {
      const result = await api("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: new Date().toISOString().split("T")[0],
          warehouseId,
          customerType: "cash",
          customerName: "Test Discount",
          discountType: "percent",
          discountPercent: "10",
        },
        lines: [{
          itemId: supplyItemId,
          unitLevel: "major",
          qty: "2",
          salePrice: "50",
        }],
      });

      expect(result.status).toBe(201);
      const invoiceId = result.data.id;

      const detail = await api("GET", `/api/sales-invoices/${invoiceId}`);
      const header = detail.data;

      expect(parseFloat(header.subtotal)).toBe(100);
      expect(parseFloat(header.discountPercent)).toBe(10);
      expect(parseFloat(header.discountValue)).toBe(10);
      expect(parseFloat(header.netTotal)).toBe(90);

      await api("DELETE", `/api/sales-invoices/${invoiceId}`);
    });

    it("should correctly compute net total with value discount", async () => {
      const result = await api("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: new Date().toISOString().split("T")[0],
          warehouseId,
          customerType: "cash",
          customerName: "Test Value Discount",
          discountType: "value",
          discountValue: "25",
        },
        lines: [{
          itemId: supplyItemId,
          unitLevel: "major",
          qty: "2",
          salePrice: "50",
        }],
      });

      expect(result.status).toBe(201);
      const invoiceId = result.data.id;

      const detail = await api("GET", `/api/sales-invoices/${invoiceId}`);
      expect(parseFloat(detail.data.netTotal)).toBe(75);

      await api("DELETE", `/api/sales-invoices/${invoiceId}`);
    });

    it("should recompute totals on update with new discount", async () => {
      const createResult = await api("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: new Date().toISOString().split("T")[0],
          warehouseId,
          customerType: "cash",
          customerName: "Test Update Discount",
        },
        lines: [{
          itemId: supplyItemId,
          unitLevel: "major",
          qty: "2",
          salePrice: "50",
        }],
      });

      const invoiceId = createResult.data.id;

      const updateResult = await api("PATCH", `/api/sales-invoices/${invoiceId}`, {
        header: {
          discountType: "percent",
          discountPercent: "15",
        },
        lines: [{
          itemId: supplyItemId,
          unitLevel: "major",
          qty: "2",
          salePrice: "50",
        }],
      });

      expect(updateResult.status).toBe(200);

      const detail = await api("GET", `/api/sales-invoices/${invoiceId}`);
      expect(parseFloat(detail.data.subtotal)).toBe(100);
      expect(parseFloat(detail.data.discountValue)).toBe(15);
      expect(parseFloat(detail.data.netTotal)).toBe(85);

      await api("DELETE", `/api/sales-invoices/${invoiceId}`);
    });
  });

  describe("Unit Selection Readonly Pricing", () => {
    it("should store correct price per unit based on conversion when switching units", async () => {
      const today = new Date().toISOString().split("T")[0];
      const majorResult = await api("POST", "/api/sales-invoices", {
        header: { invoiceDate: today, warehouseId, customerType: "cash", customerName: "Unit Test" },
        lines: [{ itemId: supplyItemId, unitLevel: "major", qty: "1", salePrice: "0" }],
      });
      const majorId = majorResult.data.id;
      const majorDetail = await api("GET", `/api/sales-invoices/${majorId}`);
      const majorPrice = parseFloat(majorDetail.data.lines[0].salePrice);
      expect(majorPrice).toBe(50);

      const mediumResult = await api("POST", "/api/sales-invoices", {
        header: { invoiceDate: today, warehouseId, customerType: "cash", customerName: "Unit Test Med" },
        lines: [{ itemId: supplyItemId, unitLevel: "medium", qty: "1", salePrice: "0" }],
      });
      const mediumId = mediumResult.data.id;
      const mediumDetail = await api("GET", `/api/sales-invoices/${mediumId}`);
      const mediumPrice = parseFloat(mediumDetail.data.lines[0].salePrice);
      expect(mediumPrice).toBe(5);

      const minorResult = await api("POST", "/api/sales-invoices", {
        header: { invoiceDate: today, warehouseId, customerType: "cash", customerName: "Unit Test Min" },
        lines: [{ itemId: supplyItemId, unitLevel: "minor", qty: "1", salePrice: "0" }],
      });
      const minorId = minorResult.data.id;
      const minorDetail = await api("GET", `/api/sales-invoices/${minorId}`);
      const minorPrice = parseFloat(minorDetail.data.lines[0].salePrice);
      expect(minorPrice).toBe(0.5);

      expect(majorPrice).toBe(mediumPrice * 10);
      expect(majorPrice).toBe(minorPrice * 100);

      await api("DELETE", `/api/sales-invoices/${majorId}`);
      await api("DELETE", `/api/sales-invoices/${mediumId}`);
      await api("DELETE", `/api/sales-invoices/${minorId}`);
    });
  });

  describe("Stock Validation", () => {
    it("should reject finalization when qty exceeds available stock", async () => {
      const result = await api("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: new Date().toISOString().split("T")[0],
          warehouseId,
          customerType: "cash",
          customerName: "Test Stock Fail",
        },
        lines: [{
          itemId: fefoItemId,
          unitLevel: "minor",
          qty: "99999",
          salePrice: "1.50",
          expiryMonth: 3,
          expiryYear: 2026,
        }],
      });

      expect(result.status).toBe(201);
      const invoiceId = result.data.id;

      const finalizeResult = await api("POST", `/api/sales-invoices/${invoiceId}/finalize`);
      expect(finalizeResult.status).toBe(400);
      expect(finalizeResult.data.message).toContain("رصيد غير كاف");

      await api("DELETE", `/api/sales-invoices/${invoiceId}`);
    });
  });

  describe("Status Rules", () => {
    it("should allow editing a draft invoice", async () => {
      const result = await api("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: new Date().toISOString().split("T")[0],
          warehouseId,
          customerType: "cash",
          customerName: "Test Draft Edit",
        },
        lines: [{
          itemId: supplyItemId,
          unitLevel: "minor",
          qty: "5",
          salePrice: "0.50",
        }],
      });

      const invoiceId = result.data.id;

      const updateResult = await api("PATCH", `/api/sales-invoices/${invoiceId}`, {
        header: { customerName: "Updated Name" },
        lines: [{
          itemId: supplyItemId,
          unitLevel: "minor",
          qty: "10",
          salePrice: "0.50",
        }],
      });

      expect(updateResult.status).toBe(200);

      await api("DELETE", `/api/sales-invoices/${invoiceId}`);
    });

    it("should reject editing a finalized invoice", async () => {
      const result = await api("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: new Date().toISOString().split("T")[0],
          warehouseId,
          customerType: "cash",
          customerName: "Test Finalize Lock",
        },
        lines: [{
          itemId: supplyItemId,
          unitLevel: "minor",
          qty: "1",
          salePrice: "0.50",
          expiryMonth: null,
          expiryYear: null,
        }],
      });

      const invoiceId = result.data.id;

      const finalizeResult = await api("POST", `/api/sales-invoices/${invoiceId}/finalize`);
      expect(finalizeResult.status).toBe(200);

      const updateResult = await api("PATCH", `/api/sales-invoices/${invoiceId}`, {
        header: { customerName: "Hacker" },
        lines: [{
          itemId: supplyItemId,
          unitLevel: "minor",
          qty: "1",
          salePrice: "0.50",
        }],
      });

      expect([400, 409]).toContain(updateResult.status);
    });

    it("should reject deleting a finalized invoice", async () => {
      const result = await api("POST", "/api/sales-invoices", {
        header: {
          invoiceDate: new Date().toISOString().split("T")[0],
          warehouseId,
          customerType: "cash",
          customerName: "Test Delete Final",
        },
        lines: [{
          itemId: supplyItemId,
          unitLevel: "minor",
          qty: "1",
          salePrice: "0.50",
        }],
      });

      const invoiceId = result.data.id;

      await api("POST", `/api/sales-invoices/${invoiceId}/finalize`);

      const deleteResult = await api("DELETE", `/api/sales-invoices/${invoiceId}`);
      expect([400, 409]).toContain(deleteResult.status);
    });
  });
});
