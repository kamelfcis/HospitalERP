import { describe, it, expect, beforeAll } from "vitest";

const BASE = "http://localhost:5000";
const UNIQUE = Date.now();

async function api(method: string, path: string, body?: any) {
  const opts: any = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

let supplierId: string;
let warehouseId: string;
let itemId: string;
let invoiceId: string;
let approveInvoiceId: string;

async function createInvoiceFromReceiving(invoiceSuffix: string): Promise<string> {
  const recv = await api("POST", "/api/receivings", {
    header: {
      supplierId,
      supplierInvoiceNo: `DINV-${UNIQUE}-${invoiceSuffix}`,
      warehouseId,
      receiveDate: new Date().toISOString().split("T")[0],
    },
    lines: [{
      itemId,
      unitLevel: "major",
      qtyEntered: "5",
      qtyInMinor: "50",
      purchasePrice: "90",
      salePrice: "100",
      lineTotal: "450",
    }],
  });
  expect(recv.status).toBe(201);
  const postRes = await api("POST", `/api/receivings/${recv.data.id}/post`);
  expect(postRes.status).toBe(200);
  const conv = await api("POST", `/api/receivings/${recv.data.id}/convert-to-invoice`);
  expect([200, 201]).toContain(conv.status);
  return conv.data.id;
}

beforeAll(async () => {
  const sup = await api("POST", "/api/suppliers", {
    code: `DISC-${UNIQUE}`,
    nameAr: `مورد خصم ${UNIQUE}`,
  });
  supplierId = sup.data.id;

  const wh = await api("POST", "/api/warehouses", {
    warehouseCode: `WD-${UNIQUE}`,
    nameAr: `مستودع خصم ${UNIQUE}`,
  });
  warehouseId = wh.data.id;

  const itm = await api("POST", "/api/items", {
    itemCode: `ITD-${UNIQUE}`,
    nameAr: `صنف خصم ${UNIQUE}`,
    category: "drug",
    majorUnitName: "علبة",
    minorUnitName: "قرص",
    majorToMinor: "10",
    hasExpiry: false,
  });
  itemId = itm.data.id;

  invoiceId = await createInvoiceFromReceiving("A");
  approveInvoiceId = await createInvoiceFromReceiving("B");
}, 30000);

async function getLine(invId: string) {
  const inv = await api("GET", `/api/purchase-invoices/${invId}`);
  return { line: inv.data.lines[0], invoiceDate: inv.data.invoiceDate };
}

describe("Bidirectional Discount - Backend Validation", () => {
  it("should accept consistent discount values (selling=100, percent=10, value=10, purchase=90)", async () => {
    const { line, invoiceDate } = await getLine(invoiceId);
    const res = await api("PATCH", `/api/purchase-invoices/${invoiceId}`, {
      lines: [{ ...line, sellingPrice: 100, purchasePrice: 90, lineDiscountPct: 10, lineDiscountValue: 10 }],
      invoiceDate,
    });
    expect(res.status).toBe(200);
  });

  it("should reject negative purchasePrice", async () => {
    const { line, invoiceDate } = await getLine(invoiceId);
    const res = await api("PATCH", `/api/purchase-invoices/${invoiceId}`, {
      lines: [{ ...line, sellingPrice: 100, purchasePrice: -5, lineDiscountPct: 10, lineDiscountValue: 10 }],
      invoiceDate,
    });
    expect(res.status).toBe(400);
    expect(res.data.lineErrors).toBeDefined();
    expect(res.data.lineErrors.some((e: any) => e.field === "purchasePrice")).toBe(true);
  });

  it("should reject discountPercent >= 100", async () => {
    const { line, invoiceDate } = await getLine(invoiceId);
    const res = await api("PATCH", `/api/purchase-invoices/${invoiceId}`, {
      lines: [{ ...line, sellingPrice: 100, purchasePrice: 0, lineDiscountPct: 100, lineDiscountValue: 100 }],
      invoiceDate,
    });
    expect(res.status).toBe(400);
    expect(res.data.lineErrors.some((e: any) => e.field === "lineDiscountPct")).toBe(true);
  });

  it("should reject discountValue > sellingPrice", async () => {
    const { line, invoiceDate } = await getLine(invoiceId);
    const res = await api("PATCH", `/api/purchase-invoices/${invoiceId}`, {
      lines: [{ ...line, sellingPrice: 100, purchasePrice: 90, lineDiscountPct: 10, lineDiscountValue: 110 }],
      invoiceDate,
    });
    expect(res.status).toBe(400);
    expect(res.data.lineErrors.some((e: any) => e.field === "lineDiscountValue")).toBe(true);
  });

  it("should reject inconsistent discount values (value doesn't match percent)", async () => {
    const { line, invoiceDate } = await getLine(invoiceId);
    const res = await api("PATCH", `/api/purchase-invoices/${invoiceId}`, {
      lines: [{ ...line, sellingPrice: 100, purchasePrice: 90, lineDiscountPct: 10, lineDiscountValue: 50 }],
      invoiceDate,
    });
    expect(res.status).toBe(400);
    expect(res.data.lineErrors.some((e: any) => e.messageAr.includes("غير متوافقة"))).toBe(true);
  });

  it("should reject inconsistent purchasePrice (doesn't match discountValue)", async () => {
    const { line, invoiceDate } = await getLine(invoiceId);
    const res = await api("PATCH", `/api/purchase-invoices/${invoiceId}`, {
      lines: [{ ...line, sellingPrice: 100, purchasePrice: 50, lineDiscountPct: 10, lineDiscountValue: 10 }],
      invoiceDate,
    });
    expect(res.status).toBe(400);
    expect(res.data.lineErrors.some((e: any) => e.field === "purchasePrice" && e.messageAr.includes("غير متوافق"))).toBe(true);
  });

  it("should accept values within rounding tolerance (0.01 drift)", async () => {
    const { line, invoiceDate } = await getLine(invoiceId);
    const res = await api("PATCH", `/api/purchase-invoices/${invoiceId}`, {
      lines: [{ ...line, sellingPrice: 100, purchasePrice: 90.01, lineDiscountPct: 10, lineDiscountValue: 10 }],
      invoiceDate,
    });
    expect(res.status).toBe(200);
  });

  it("should accept zero discount (no discount applied)", async () => {
    const { line, invoiceDate } = await getLine(invoiceId);
    const res = await api("PATCH", `/api/purchase-invoices/${invoiceId}`, {
      lines: [{ ...line, sellingPrice: 100, purchasePrice: 100, lineDiscountPct: 0, lineDiscountValue: 0 }],
      invoiceDate,
    });
    expect(res.status).toBe(200);
  });
});

describe("Bidirectional Discount - Calculation Consistency", () => {
  it("editing percent=10 on selling=100 => value=10, purchase=90", async () => {
    const sp = 100, pct = 10;
    const dv = +(sp * (pct / 100)).toFixed(2);
    const pp = +(sp - dv).toFixed(4);
    expect(dv).toBe(10);
    expect(pp).toBe(90);

    const { line, invoiceDate } = await getLine(invoiceId);
    const res = await api("PATCH", `/api/purchase-invoices/${invoiceId}`, {
      lines: [{ ...line, sellingPrice: sp, purchasePrice: pp, lineDiscountPct: pct, lineDiscountValue: dv }],
      invoiceDate,
    });
    expect(res.status).toBe(200);
  });

  it("editing value=10 on selling=100 => percent=10, purchase=90", () => {
    const sp = 100, dv = 10;
    const pct = +((dv / sp) * 100).toFixed(2);
    const pp = +(sp - dv).toFixed(4);
    expect(pct).toBe(10);
    expect(pp).toBe(90);
  });

  it("editing purchase=90 on selling=100 => value=10, percent=10", () => {
    const sp = 100, pp = 90;
    const dv = +(sp - pp).toFixed(2);
    const pct = +((dv / sp) * 100).toFixed(2);
    expect(dv).toBe(10);
    expect(pct).toBe(10);
  });

  it("handles fractional discounts: selling=99.50, percent=15.5", async () => {
    const sp = 99.50, pct = 15.5;
    const dv = +(sp * (pct / 100)).toFixed(2);
    const pp = +(sp - dv).toFixed(4);
    expect(dv).toBe(15.42);
    expect(pp).toBe(84.08);

    const { line, invoiceDate } = await getLine(invoiceId);
    const res = await api("PATCH", `/api/purchase-invoices/${invoiceId}`, {
      lines: [{ ...line, sellingPrice: sp, purchasePrice: pp, lineDiscountPct: pct, lineDiscountValue: dv }],
      invoiceDate,
    });
    expect(res.status).toBe(200);
  });
});

describe("Bidirectional Discount - Approve Validation", () => {
  it("should approve successfully with consistent discount values", async () => {
    const { line, invoiceDate } = await getLine(approveInvoiceId);
    await api("PATCH", `/api/purchase-invoices/${approveInvoiceId}`, {
      lines: [{ ...line, sellingPrice: 100, purchasePrice: 90, lineDiscountPct: 10, lineDiscountValue: 10 }],
      invoiceDate,
    });
    const approveRes = await api("POST", `/api/purchase-invoices/${approveInvoiceId}/approve`);
    expect(approveRes.status).toBe(200);
  });

  it("should reject modification of approved invoice", async () => {
    const { line, invoiceDate } = await getLine(approveInvoiceId);
    const res = await api("PATCH", `/api/purchase-invoices/${approveInvoiceId}`, {
      lines: [{ ...line, sellingPrice: 100, purchasePrice: 80, lineDiscountPct: 20, lineDiscountValue: 20 }],
      invoiceDate,
    });
    expect(res.status).toBe(409);
  });
});
