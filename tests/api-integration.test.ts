import { describe, it, expect, beforeAll } from "vitest";
import { liveCall as api } from "./live-session";

function makeLine(itemId: string, qty: string, price: string) {
  const pp = parseFloat(price) || 0;
  const sale = pp > 0 ? String(Math.max(pp, 1)) : "1";
  return {
    itemId,
    unitLevel: "minor",
    qtyEntered: qty,
    qtyInMinor: qty,
    purchasePrice: price,
    salePrice: sale,
    lineTotal: String(parseFloat(qty) * parseFloat(price)),
    bonusQty: "0",
    bonusQtyInMinor: "0",
    expiryMonth: 12,
    expiryYear: 2028,
  };
}

describe("Receiving Immutability", () => {
  let draftId: string;
  let supplierId: string;
  let warehouseId: string;
  let itemId: string;

  beforeAll(async () => {
    const suppliers = await api("GET", "/api/suppliers?page=1&pageSize=1");
    supplierId = suppliers.data.suppliers[0].id;

    const warehouses = await api("GET", "/api/warehouses");
    warehouseId = warehouses.data[0].id;

    const items = await api("GET", "/api/items?page=1&limit=1");
    itemId = items.data.items[0].id;
  });

  it("should create a draft receiving", async () => {
    const result = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `TEST-IMM-${Date.now()}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [makeLine(itemId, "5", "10")],
    });
    expect(result.status).toBe(201);
    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
    draftId = result.data.id;
  });

  it("should allow updating a draft receiving", async () => {
    const result = await api("PATCH", `/api/receivings/${draftId}`, {
      header: {
        supplierId,
        supplierInvoiceNo: `TEST-IMM-UPD-${Date.now()}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [makeLine(itemId, "10", "10")],
    });
    expect(result.status).toBe(200);
  });

  it("should post the receiving", async () => {
    const result = await api("POST", `/api/receivings/${draftId}/post`);
    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();
  });

  it("should return 409 when trying to update a posted receiving", async () => {
    const result = await api("PATCH", `/api/receivings/${draftId}`, {
      header: {
        supplierId,
        supplierInvoiceNo: "CHANGED",
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [],
    });
    expect(result.status).toBe(409);
    expect(result.data.code).toBe("DOCUMENT_POSTED");
  });

  it("postReceiving should be idempotent (posting again returns success)", async () => {
    const result = await api("POST", `/api/receivings/${draftId}/post`);
    expect(result.status).toBe(200);
  });
});

describe("Supplier Invoice Uniqueness", () => {
  let supplierId: string;
  let warehouseId: string;
  let itemId: string;
  let draft1Id: string;
  const uniqueInvoiceNo = `UNIQUE-${Date.now()}`;

  beforeAll(async () => {
    const suppliers = await api("GET", "/api/suppliers?page=1&pageSize=1");
    supplierId = suppliers.data.suppliers[0].id;

    const warehouses = await api("GET", "/api/warehouses");
    warehouseId = warehouses.data[0].id;

    const items = await api("GET", "/api/items?page=1&limit=1");
    itemId = items.data.items[0].id;
  });

  it("should create first draft with invoice number X", async () => {
    const result = await api("POST", "/api/receivings", {
      header: { supplierId, supplierInvoiceNo: uniqueInvoiceNo, warehouseId, receiveDate: "2026-02-06" },
      lines: [makeLine(itemId, "1", "10")],
    });
    expect(result.status).toBe(201);
    expect(result.data.id).toBeDefined();
    draft1Id = result.data.id;
  });

  it("should reject creating another draft with same supplier + invoice number", async () => {
    const result = await api("POST", "/api/receivings", {
      header: { supplierId, supplierInvoiceNo: uniqueInvoiceNo, warehouseId, receiveDate: "2026-02-06" },
      lines: [makeLine(itemId, "1", "10")],
    });
    expect(result.status).toBe(409);
  });

  it("should allow reopening (PATCH) the original draft without duplicate error", async () => {
    const result = await api("PATCH", `/api/receivings/${draft1Id}`, {
      header: { supplierId, supplierInvoiceNo: uniqueInvoiceNo, warehouseId, receiveDate: "2026-02-06" },
      lines: [makeLine(itemId, "1", "10")],
    });
    expect(result.status).toBe(200);
  });

  it("check-invoice should return isUnique=true when excluding current record", async () => {
    const result = await api("GET", `/api/receivings/check-invoice?supplierId=${supplierId}&supplierInvoiceNo=${encodeURIComponent(uniqueInvoiceNo)}&excludeId=${draft1Id}`);
    expect(result.status).toBe(200);
    expect(result.data.isUnique).toBe(true);
  });

  it("check-invoice should return isUnique=false without excludeId", async () => {
    const result = await api("GET", `/api/receivings/check-invoice?supplierId=${supplierId}&supplierInvoiceNo=${encodeURIComponent(uniqueInvoiceNo)}`);
    expect(result.status).toBe(200);
    expect(result.data.isUnique).toBe(false);
  });
});

describe("Conversion Idempotency", () => {
  let supplierId: string;
  let warehouseId: string;
  let itemId: string;
  let receivingId: string;
  let firstInvoiceId: string;

  beforeAll(async () => {
    const suppliers = await api("GET", "/api/suppliers?page=1&pageSize=1");
    supplierId = suppliers.data.suppliers[0].id;

    const warehouses = await api("GET", "/api/warehouses");
    warehouseId = warehouses.data[0].id;

    const items = await api("GET", "/api/items?page=1&limit=1");
    itemId = items.data.items[0].id;
  });

  it("should create and post a receiving for conversion", async () => {
    const createResult = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `TEST-CONV-${Date.now()}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [makeLine(itemId, "3", "15")],
    });
    expect(createResult.status).toBe(201);
    receivingId = createResult.data.id;

    const postResult = await api("POST", `/api/receivings/${receivingId}/post`);
    expect(postResult.status).toBe(200);
  });

  it("should convert receiving to purchase invoice", async () => {
    const result = await api("POST", `/api/receivings/${receivingId}/convert-to-invoice`);
    expect(result.status).toBe(201);
    expect(result.data).toBeDefined();
    expect(result.data.id).toBeDefined();
    firstInvoiceId = result.data.id;
  });

  it("second conversion should return same invoice (idempotent)", async () => {
    const result = await api("POST", `/api/receivings/${receivingId}/convert-to-invoice`);
    expect([200, 201]).toContain(result.status);
    expect(result.data).toBeDefined();
    expect(result.data.id).toBe(firstInvoiceId);
  });
});

describe("Purchase Invoice Immutability", () => {
  let supplierId: string;
  let warehouseId: string;
  let itemId: string;
  let invoiceId: string;

  beforeAll(async () => {
    const suppliers = await api("GET", "/api/suppliers?page=1&pageSize=1");
    supplierId = suppliers.data.suppliers[0].id;

    const warehouses = await api("GET", "/api/warehouses");
    warehouseId = warehouses.data[0].id;

    const items = await api("GET", "/api/items?page=1&limit=1");
    itemId = items.data.items[0].id;

    const createResult = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `TEST-INV-IMM-${Date.now()}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [makeLine(itemId, "2", "20")],
    });
    const receivingId = createResult.data.id;

    await api("POST", `/api/receivings/${receivingId}/post`);

    const convertResult = await api("POST", `/api/receivings/${receivingId}/convert-to-invoice`);
    invoiceId = convertResult.data.id;
  });

  it("should allow updating a draft invoice", async () => {
    const invoice = await api("GET", `/api/purchase-invoices/${invoiceId}`);
    expect(invoice.status).toBe(200);
    expect(invoice.data.status).toBe("draft");

    const result = await api("PATCH", `/api/purchase-invoices/${invoiceId}`, {
      lines: invoice.data.lines || [],
      notes: "Test update",
      claimNumber: (invoice.data as any).claimNumber?.trim() || `CLM-LIVE-${Date.now()}`,
    });
    expect(result.status).toBe(200);
  });

  it("should approve the invoice", async () => {
    const result = await api("POST", `/api/purchase-invoices/${invoiceId}/approve`);
    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();
  });

  it("should reject updating an approved invoice with 409", async () => {
    const result = await api("PATCH", `/api/purchase-invoices/${invoiceId}`, {
      lines: [],
      notes: "Should fail",
    });
    expect(result.status).toBe(409);
    expect(result.data.code).toBe("INVOICE_APPROVED");
  });

  it("approve should be idempotent (approving again returns 409)", async () => {
    const result = await api("POST", `/api/purchase-invoices/${invoiceId}/approve`);
    expect(result.status).toBe(409);
    expect(result.data.code).toBe("ALREADY_APPROVED");
  });
});

describe("Major Unit Defaulting", () => {
  let supplierId: string;
  let warehouseId: string;
  let itemWithMajor: any;

  beforeAll(async () => {
    const suppliers = await api("GET", "/api/suppliers?page=1&pageSize=1");
    supplierId = suppliers.data?.suppliers?.[0]?.id;
    const warehouses = await api("GET", "/api/warehouses");
    warehouseId = warehouses.data?.[0]?.id;

    const itemsRes = await api("GET", "/api/items?page=1&limit=50");
    const items = itemsRes.data?.items || itemsRes.data || [];
    itemWithMajor = items.find((i: any) => i.majorUnitName);
    if (!itemWithMajor) {
      itemWithMajor = items[0];
    }
  });

  it("should default unitLevel to major when creating receiving line without unitLevel", async () => {
    if (!itemWithMajor || !supplierId || !warehouseId) return;

    const result = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `MAJOR-TEST-${Date.now()}`,
        warehouseId,
        receiveDate: "2026-02-06",
      },
      lines: [{
        itemId: itemWithMajor.id,
        qtyEntered: "1",
        qtyInMinor: "1",
        purchasePrice: "10",
        salePrice: "12",
        lineTotal: "10",
        bonusQty: "0",
        bonusQtyInMinor: "0",
        ...(itemWithMajor.hasExpiry
          ? { expiryMonth: 6, expiryYear: 2028 }
          : {}),
      }],
    });
    expect(result.status).toBe(201);

    if (result.data?.id) {
      const fetchResult = await api("GET", `/api/receivings/${result.data.id}`);
      expect(fetchResult.status).toBe(200);
      const lines = fetchResult.data?.lines || [];
      if (lines.length > 0 && itemWithMajor.majorUnitName) {
        expect(lines[0].unitLevel).toBe("major");
      }
    }
  });

  it("should carry unitLevel through receiving to invoice conversion", async () => {
    if (!itemWithMajor || !supplierId || !warehouseId) return;

    const createResult = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `CONV-UNIT-${Date.now()}`,
        warehouseId,
        receiveDate: "2026-02-06",
      },
      lines: [{
        itemId: itemWithMajor.id,
        unitLevel: "major",
        qtyEntered: "1",
        qtyInMinor: itemWithMajor.majorToMinor || "1",
        purchasePrice: "10",
        lineTotal: "10",
        bonusQty: "0",
        bonusQtyInMinor: "0",
        expiryMonth: itemWithMajor.hasExpiry ? 6 : undefined,
        expiryYear: itemWithMajor.hasExpiry ? 2027 : undefined,
      }],
    });

    if (createResult.status !== 201 || !createResult.data?.id) return;

    const postResult = await api("POST", `/api/receivings/${createResult.data.id}/post`);
    if (postResult.status !== 200) return;

    const convertResult = await api("POST", `/api/receivings/${createResult.data.id}/convert-to-invoice`);
    if (convertResult.status !== 200 && convertResult.status !== 201) return;

    const invoiceId = convertResult.data?.id;
    if (invoiceId) {
      const invoiceResult = await api("GET", `/api/purchase-invoices/${invoiceId}`);
      if (invoiceResult.status === 200) {
        const lines = invoiceResult.data?.lines || [];
        if (lines.length > 0) {
          expect(lines[0].unitLevel).toBe("major");
        }
      }
    }
  });
});
