import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = "http://localhost:5000";

async function api(method: string, path: string, body?: any) {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  return { status: res.status, data: await res.json().catch(() => null) };
}

let supplierId: string;
let warehouseId: string;
let itemId: string;
let accountDebitId: string;
let accountCreditId: string;

beforeAll(async () => {
  const suppliers = await api("GET", "/api/suppliers?page=1&pageSize=1");
  if (suppliers.data?.suppliers?.length) {
    supplierId = suppliers.data.suppliers[0].id;
  }

  const warehouses = await api("GET", "/api/warehouses");
  if (warehouses.data?.length) {
    warehouseId = warehouses.data[0].id;
  }

  const items = await api("GET", "/api/items?page=1&limit=1");
  if (items.data?.items?.length) {
    itemId = items.data.items[0].id;
  }

  const accounts = await api("GET", "/api/accounts");
  if (accounts.data?.length >= 2) {
    accountDebitId = accounts.data[0].id;
    accountCreditId = accounts.data[1].id;
  }
});

describe("Fiscal Period Enforcement", () => {
  let closedPeriodId: string;
  const closedPeriodDate = "2020-01-15";

  beforeAll(async () => {
    const createRes = await api("POST", "/api/fiscal-periods", {
      name: `فترة اختبار مغلقة ${Date.now()}`,
      startDate: "2020-01-01",
      endDate: "2020-12-31",
      isClosed: false,
    });
    if (createRes.status === 201 && createRes.data?.id) {
      closedPeriodId = createRes.data.id;
      await api("POST", `/api/fiscal-periods/${closedPeriodId}/close`);
    }
  });

  it("should reject posting a journal entry dated in a closed period", async () => {
    if (!closedPeriodId || !accountDebitId || !accountCreditId) return;

    const createRes = await api("POST", "/api/journal-entries", {
      entryDate: closedPeriodDate,
      description: "اختبار فترة مغلقة",
      lines: [
        { accountId: accountDebitId, debit: "100", credit: "0", description: "مدين", lineNumber: 1 },
        { accountId: accountCreditId, debit: "0", credit: "100", description: "دائن", lineNumber: 2 },
      ],
    });
    expect(createRes.status).toBe(201);
    const entryId = createRes.data?.id;

    const postRes = await api("POST", `/api/journal-entries/${entryId}/post`);
    expect(postRes.status).toBe(400);
    expect(postRes.data?.message).toContain("الفترة المحاسبية");
  });

  it("should reject posting a receiving dated in a closed period", async () => {
    if (!closedPeriodId || !supplierId || !warehouseId || !itemId) return;

    const createRes = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `FP-TEST-${Date.now()}`,
        warehouseId,
        receiveDate: closedPeriodDate,
      },
      lines: [{
        itemId,
        unitLevel: "minor",
        qtyEntered: "5",
        qtyInMinor: "5",
        purchasePrice: "10",
        lineTotal: "50",
        bonusQty: "0",
        bonusQtyInMinor: "0",
        expiryMonth: 12,
        expiryYear: 2028,
      }],
    });
    if (createRes.status !== 201) return;
    const docId = createRes.data?.id;

    const postRes = await api("POST", `/api/receivings/${docId}/post`);
    expect(postRes.status).toBe(400);
    expect(postRes.data?.message).toContain("الفترة المحاسبية");
  });

  it("should reject posting a transfer dated in a closed period", async () => {
    if (!closedPeriodId || !warehouseId || !itemId) return;

    const warehouses = await api("GET", "/api/warehouses");
    if (!warehouses.data || warehouses.data.length < 2) return;

    const createRes = await api("POST", "/api/transfers", {
      header: {
        sourceWarehouseId: warehouses.data[0].id,
        destinationWarehouseId: warehouses.data[1].id,
        transferDate: closedPeriodDate,
        notes: "اختبار فترة مغلقة",
      },
      lines: [{
        itemId,
        unitLevel: "minor",
        qtyEntered: "1",
        qtyInMinor: "1",
      }],
    });
    if (createRes.status !== 201) return;
    const docId = createRes.data?.id;

    const postRes = await api("POST", `/api/transfers/${docId}/post`);
    expect(postRes.status).toBe(400);
    expect(postRes.data?.message).toContain("الفترة المحاسبية");
  });

  it("should reject finalizing a sales invoice dated in a closed period", async () => {
    if (!closedPeriodId || !warehouseId || !itemId) return;

    const createRes = await api("POST", "/api/sales-invoices", {
      header: {
        warehouseId,
        invoiceDate: closedPeriodDate,
        customerType: "cash",
      },
      lines: [{
        itemId,
        unitLevel: "minor",
        qty: "1",
        qtyInMinor: "1",
        salePrice: "50",
        lineTotal: "50",
      }],
    });
    if (createRes.status !== 201) return;
    const docId = createRes.data?.id;

    const finalizeRes = await api("POST", `/api/sales-invoices/${docId}/finalize`);
    expect(finalizeRes.status).toBe(400);
    expect(finalizeRes.data?.message).toContain("الفترة المحاسبية");
  });

  it("should reject finalizing a patient invoice dated in a closed period", async () => {
    if (!closedPeriodId) return;

    const createRes = await api("POST", "/api/patient-invoices", {
      header: {
        invoiceDate: closedPeriodDate,
        patientName: "مريض اختبار",
        patientType: "cash",
      },
      lines: [],
      payments: [],
    });
    if (createRes.status !== 201) return;
    const docId = createRes.data?.id;

    const finalizeRes = await api("POST", `/api/patient-invoices/${docId}/finalize`);
    expect(finalizeRes.status).toBe(400);
    expect(finalizeRes.data?.message).toContain("الفترة المحاسبية");
  });

  it("should reject approving a purchase invoice dated in a closed period", async () => {
    if (!closedPeriodId || !supplierId || !warehouseId || !itemId) return;

    const rcvRes = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `FP-PI-${Date.now()}`,
        warehouseId,
        receiveDate: closedPeriodDate,
      },
      lines: [{
        itemId,
        unitLevel: "minor",
        qtyEntered: "2",
        qtyInMinor: "2",
        purchasePrice: "20",
        lineTotal: "40",
        bonusQty: "0",
        bonusQtyInMinor: "0",
        expiryMonth: 12,
        expiryYear: 2028,
      }],
    });
    if (rcvRes.status !== 201) return;

    const convRes = await api("POST", `/api/receivings/${rcvRes.data.id}/convert-to-invoice`);
    if (convRes.status !== 201 && convRes.status !== 200) return;
    const purInvId = convRes.data?.id;
    if (!purInvId) return;

    const approveRes = await api("POST", `/api/purchase-invoices/${purInvId}/approve`);
    expect(approveRes.status).toBe(400);
    expect(approveRes.data?.message).toContain("الفترة المحاسبية");
  });
});

describe("Document Immutability", () => {
  it("should reject updating a posted journal entry", async () => {
    if (!accountDebitId || !accountCreditId) return;

    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/journal-entries", {
      entryDate: today,
      description: "اختبار ثبات القيود",
      lines: [
        { accountId: accountDebitId, debit: "500", credit: "0", description: "مدين", lineNumber: 1 },
        { accountId: accountCreditId, debit: "0", credit: "500", description: "دائن", lineNumber: 2 },
      ],
    });
    expect(createRes.status).toBe(201);
    const entryId = createRes.data?.id;

    const postRes = await api("POST", `/api/journal-entries/${entryId}/post`);
    expect(postRes.status).toBe(200);

    const updateRes = await api("PATCH", `/api/journal-entries/${entryId}`, {
      description: "تعديل بعد الترحيل",
    });
    expect(updateRes.status).toBe(409);
  });

  it("should reject deleting a posted journal entry", async () => {
    if (!accountDebitId || !accountCreditId) return;

    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/journal-entries", {
      entryDate: today,
      description: "اختبار حذف مُرحّل",
      lines: [
        { accountId: accountDebitId, debit: "200", credit: "0", description: "مدين", lineNumber: 1 },
        { accountId: accountCreditId, debit: "0", credit: "200", description: "دائن", lineNumber: 2 },
      ],
    });
    expect(createRes.status).toBe(201);
    const entryId = createRes.data?.id;

    await api("POST", `/api/journal-entries/${entryId}/post`);

    const deleteRes = await api("DELETE", `/api/journal-entries/${entryId}`);
    expect(deleteRes.status).toBe(400);
  });

  it("should soft-cancel a draft sales invoice instead of hard-deleting", async () => {
    if (!warehouseId || !itemId) return;

    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/sales-invoices", {
      header: {
        warehouseId,
        invoiceDate: today,
        customerType: "cash",
      },
      lines: [{
        itemId,
        unitLevel: "minor",
        qty: "1",
        qtyInMinor: "1",
        salePrice: "100",
        lineTotal: "100",
      }],
    });
    expect(createRes.status).toBe(201);
    const docId = createRes.data?.id;

    const deleteRes = await api("DELETE", `/api/sales-invoices/${docId}`);
    expect(deleteRes.status).toBe(200);

    const getRes = await api("GET", `/api/sales-invoices/${docId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data?.status).toBe("cancelled");
  });

  it("should reject finalizing a cancelled sales invoice", async () => {
    if (!warehouseId || !itemId) return;

    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/sales-invoices", {
      header: {
        warehouseId,
        invoiceDate: today,
        customerType: "cash",
      },
      lines: [{
        itemId,
        unitLevel: "minor",
        qty: "1",
        qtyInMinor: "1",
        salePrice: "50",
        lineTotal: "50",
      }],
    });
    expect(createRes.status).toBe(201);
    const docId = createRes.data?.id;

    await api("DELETE", `/api/sales-invoices/${docId}`);

    const finalizeRes = await api("POST", `/api/sales-invoices/${docId}/finalize`);
    expect(finalizeRes.status).toBe(409);
  });
});

describe("FormattedNumber in API Responses", () => {
  it("should include formattedNumber in journal entry list", async () => {
    const res = await api("GET", "/api/journal-entries");
    expect(res.status).toBe(200);
    if (res.data?.length > 0) {
      expect(res.data[0]).toHaveProperty("formattedNumber");
      expect(res.data[0].formattedNumber).toMatch(/^JE-\d+$/);
    }
  });

  it("should include formattedNumber in sales invoice list", async () => {
    const res = await api("GET", "/api/sales-invoices?page=1&pageSize=5");
    expect(res.status).toBe(200);
    if (res.data?.data?.length > 0) {
      expect(res.data.data[0]).toHaveProperty("formattedNumber");
      expect(res.data.data[0].formattedNumber).toMatch(/^SI-\d+$/);
    }
  });

  it("should include formattedNumber in receiving list", async () => {
    const res = await api("GET", "/api/receivings?page=1&pageSize=5");
    expect(res.status).toBe(200);
    if (res.data?.data?.length > 0) {
      expect(res.data.data[0]).toHaveProperty("formattedNumber");
      expect(res.data.data[0].formattedNumber).toMatch(/^RCV-\d+$/);
    }
  });

  it("should include formattedNumber in patient invoice list", async () => {
    const res = await api("GET", "/api/patient-invoices?page=1&pageSize=5");
    expect(res.status).toBe(200);
    if (res.data?.data?.length > 0) {
      expect(res.data.data[0]).toHaveProperty("formattedNumber");
      expect(res.data.data[0].formattedNumber).toMatch(/^PI-/);
    }
  });

  it("should include formattedNumber in transfer list", async () => {
    const res = await api("GET", "/api/transfers?page=1&pageSize=5");
    expect(res.status).toBe(200);
    if (res.data?.data?.length > 0) {
      expect(res.data.data[0]).toHaveProperty("formattedNumber");
      expect(res.data.data[0].formattedNumber).toMatch(/^TRF-\d+$/);
    }
  });
});

describe("Concurrency / Idempotency Guards", () => {
  it("should reject double-posting a journal entry", async () => {
    if (!accountDebitId || !accountCreditId) return;

    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/journal-entries", {
      entryDate: today,
      description: "اختبار الترحيل المزدوج",
      lines: [
        { accountId: accountDebitId, debit: "300", credit: "0", description: "مدين", lineNumber: 1 },
        { accountId: accountCreditId, debit: "0", credit: "300", description: "دائن", lineNumber: 2 },
      ],
    });
    expect(createRes.status).toBe(201);
    const entryId = createRes.data?.id;

    const [post1, post2] = await Promise.all([
      api("POST", `/api/journal-entries/${entryId}/post`),
      api("POST", `/api/journal-entries/${entryId}/post`),
    ]);

    const successCount = [post1, post2].filter(r => r.status === 200).length;
    const rejectCount = [post1, post2].filter(r => r.status === 409).length;

    expect(successCount).toBe(1);
    expect(rejectCount).toBe(1);
  });

  it("should reject double-finalizing a sales invoice", async () => {
    if (!warehouseId || !itemId) return;

    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/sales-invoices", {
      header: {
        warehouseId,
        invoiceDate: today,
        customerType: "cash",
      },
      lines: [{
        itemId,
        unitLevel: "minor",
        qty: "1",
        qtyInMinor: "1",
        salePrice: "200",
        lineTotal: "200",
      }],
    });
    expect(createRes.status).toBe(201);
    const docId = createRes.data?.id;

    const [fin1, fin2] = await Promise.all([
      api("POST", `/api/sales-invoices/${docId}/finalize`),
      api("POST", `/api/sales-invoices/${docId}/finalize`),
    ]);

    const successCount = [fin1, fin2].filter(r => r.status === 200).length;
    const rejectCount = [fin1, fin2].filter(r => r.status === 409 || r.status === 400).length;

    expect(successCount).toBeLessThanOrEqual(1);
    expect(rejectCount).toBeGreaterThanOrEqual(1);
  });
});
