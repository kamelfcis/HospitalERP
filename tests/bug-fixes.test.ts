import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = "http://localhost:5000";

async function api(method: string, path: string, body?: any) {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  return { status: res.status, data: await res.json().catch(() => null) };
}

function makeLine(itemId: string, qty: string, price: string) {
  return {
    itemId,
    unitLevel: "minor",
    qtyEntered: qty,
    qtyInMinor: qty,
    purchasePrice: price,
    lineTotal: String(parseFloat(qty) * parseFloat(price)),
    bonusQty: "0",
    bonusQtyInMinor: "0",
    expiryMonth: 12,
    expiryYear: 2028,
  };
}

let supplierId: string;
let warehouseId: string;
let itemId: string;

beforeAll(async () => {
  const [supRes, whRes, itemRes] = await Promise.all([
    api("GET", "/api/suppliers?page=1&pageSize=5"),
    api("GET", "/api/warehouses"),
    api("GET", "/api/items?page=1&limit=50"),
  ]);
  supplierId = supRes.data?.suppliers?.[0]?.id;
  warehouseId = whRes.data?.[0]?.id;
  itemId = itemRes.data?.items?.[0]?.id;
}, 15000);

describe("Bug Fix: Receiving POST validation", () => {
  it("should reject receiving with missing supplierId", async () => {
    const res = await api("POST", "/api/receivings", {
      header: { receiveDate: "2026-01-01", warehouseId },
      lines: [makeLine(itemId, "5", "10")],
    });
    expect(res.status).toBe(400);
    expect(res.data.message).toContain("المورد مطلوب");
  });

  it("should reject receiving with missing receiveDate", async () => {
    const res = await api("POST", "/api/receivings", {
      header: { supplierId, warehouseId },
      lines: [makeLine(itemId, "5", "10")],
    });
    expect(res.status).toBe(400);
    expect(res.data.message).toContain("تاريخ الاستلام مطلوب");
  });

  it("should reject receiving with empty lines", async () => {
    const res = await api("POST", "/api/receivings", {
      header: { supplierId, receiveDate: "2026-01-01", warehouseId },
      lines: [],
    });
    expect(res.status).toBe(400);
    expect(res.data.message).toContain("صنف واحد على الأقل");
  });

  it("should reject receiving with missing body", async () => {
    const res = await api("POST", "/api/receivings", {});
    expect(res.status).toBe(400);
    expect(res.data.message).toContain("ناقصة");
  });
});

describe("Bug Fix: postReceiving error status codes", () => {
  it("should return 400 (not 500) for posting a non-existent receiving", async () => {
    const res = await api("POST", "/api/receivings/nonexistent-id/post");
    expect(res.status).toBe(400);
    expect(res.data.message).toContain("غير موجود");
  });
});

describe("Bug Fix: Purchase Invoice DELETE endpoint", () => {
  let draftReceivingId: string;
  let invoiceId: string;

  it("should create a draft receiving and post it", async () => {
    const uniqueInvoiceNo = `DEL-TEST-${Date.now()}`;
    const createRes = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        warehouseId,
        receiveDate: "2026-01-01",
        supplierInvoiceNo: uniqueInvoiceNo,
      },
      lines: [makeLine(itemId, "2", "10")],
    });
    expect(createRes.status).toBe(201);
    draftReceivingId = createRes.data.id;

    const postRes = await api("POST", `/api/receivings/${draftReceivingId}/post`);
    expect(postRes.status).toBe(200);
  });

  it("should convert receiving to purchase invoice", async () => {
    const res = await api("POST", `/api/receivings/${draftReceivingId}/convert-to-invoice`);
    expect([200, 201]).toContain(res.status);
    invoiceId = res.data.id;
    expect(invoiceId).toBeTruthy();
  });

  it("should delete a draft purchase invoice successfully", async () => {
    const res = await api("DELETE", `/api/purchase-invoices/${invoiceId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  it("should return 404 for deleting non-existent invoice", async () => {
    const res = await api("DELETE", "/api/purchase-invoices/nonexistent-id");
    expect(res.status).toBe(404);
  });
});

describe("Bug Fix: Receiving delete immutability", () => {
  let postedReceivingId: string;

  it("should create and post a receiving", async () => {
    const uniqueInvoiceNo = `IMM-TEST-${Date.now()}`;
    const createRes = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        warehouseId,
        receiveDate: "2026-01-01",
        supplierInvoiceNo: uniqueInvoiceNo,
      },
      lines: [makeLine(itemId, "1", "5")],
    });
    expect(createRes.status).toBe(201);
    postedReceivingId = createRes.data.id;

    const postRes = await api("POST", `/api/receivings/${postedReceivingId}/post`);
    expect(postRes.status).toBe(200);
  });

  it("should return 409 when trying to delete a posted receiving", async () => {
    const res = await api("DELETE", `/api/receivings/${postedReceivingId}`);
    expect(res.status).toBe(409);
    expect(res.data.code).toBe("DOCUMENT_POSTED");
  });

  it("should return 409 when trying to PATCH a posted receiving", async () => {
    const res = await api("PATCH", `/api/receivings/${postedReceivingId}`, {
      header: { supplierId, warehouseId, receiveDate: "2026-01-01", supplierInvoiceNo: "x" },
      lines: [makeLine(itemId, "1", "5")],
    });
    expect(res.status).toBe(409);
    expect(res.data.code).toBe("DOCUMENT_POSTED");
  });
});

describe("Bug Fix: Purchase Invoice approve immutability", () => {
  let invoiceId: string;

  it("should create a receiving, post, and convert to invoice", async () => {
    const uniqueInvoiceNo = `APPR-TEST-${Date.now()}`;
    const createRes = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        warehouseId,
        receiveDate: "2026-01-01",
        supplierInvoiceNo: uniqueInvoiceNo,
      },
      lines: [makeLine(itemId, "1", "10")],
    });
    expect(createRes.status).toBe(201);

    const postRes = await api("POST", `/api/receivings/${createRes.data.id}/post`);
    expect(postRes.status).toBe(200);

    const convertRes = await api("POST", `/api/receivings/${createRes.data.id}/convert-to-invoice`);
    expect([200, 201]).toContain(convertRes.status);
    invoiceId = convertRes.data.id;
  });

  it("should approve the invoice", async () => {
    const res = await api("POST", `/api/purchase-invoices/${invoiceId}/approve`);
    expect(res.status).toBe(200);
  });

  it("should return 409 when trying to PATCH an approved invoice", async () => {
    const res = await api("PATCH", `/api/purchase-invoices/${invoiceId}`, {
      lines: [],
      discountType: "percent",
      discountValue: 5,
    });
    expect(res.status).toBe(409);
    expect(res.data.code).toBe("INVOICE_APPROVED");
  });

  it("should return 409 when trying to approve again", async () => {
    const res = await api("POST", `/api/purchase-invoices/${invoiceId}/approve`);
    expect(res.status).toBe(409);
    expect(res.data.code).toBe("ALREADY_APPROVED");
  });

  it("should return 409 when trying to DELETE an approved invoice", async () => {
    const res = await api("DELETE", `/api/purchase-invoices/${invoiceId}`);
    expect(res.status).toBe(409);
    expect(res.data.code).toBe("INVOICE_APPROVED");
  });
});

describe("Bug Fix: Transfer delete/post error handling", () => {
  it("should return 404 for non-existent transfer delete", async () => {
    const res = await api("DELETE", "/api/transfers/nonexistent-id");
    expect(res.status).toBe(404);
  });

  it("should return 400 for posting non-existent transfer", async () => {
    const res = await api("POST", "/api/transfers/nonexistent-id/post");
    expect(res.status).toBe(400);
  });
});

describe("Bug Fix: Duplicate supplier invoice number", () => {
  let receivingId: string;
  const uniqueInvoiceNo = `DUP-TEST-${Date.now()}`;

  it("should create first receiving successfully", async () => {
    const res = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        warehouseId,
        receiveDate: "2026-01-01",
        supplierInvoiceNo: uniqueInvoiceNo,
      },
      lines: [makeLine(itemId, "1", "5")],
    });
    expect(res.status).toBe(201);
    receivingId = res.data.id;
  });

  it("should reject duplicate invoice number for same supplier", async () => {
    const res = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        warehouseId,
        receiveDate: "2026-01-01",
        supplierInvoiceNo: uniqueInvoiceNo,
      },
      lines: [makeLine(itemId, "1", "5")],
    });
    expect(res.status).toBe(409);
    expect(res.data.message).toContain("مكرر");
  });

  it("cleanup: delete the test receiving", async () => {
    if (receivingId) {
      await api("DELETE", `/api/receivings/${receivingId}`);
    }
  });
});
