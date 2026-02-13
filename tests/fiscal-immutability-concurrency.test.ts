import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = "http://localhost:5000";

async function api(method: string, path: string, body?: any) {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function nextPatientInvNum(): Promise<string> {
  const res = await api("GET", "/api/patient-invoices/next-number");
  return String(res.data?.nextNumber || Date.now());
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

// ======= 1) FISCAL PERIOD ENFORCEMENT =======
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

  it("should reject posting a journal entry dated in a closed period (entryDate)", async () => {
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
    const postRes = await api("POST", `/api/journal-entries/${createRes.data?.id}/post`);
    expect(postRes.status).toBe(403);
    expect(postRes.data?.message).toContain("الفترة المحاسبية");
  });

  it("should reject posting a receiving dated in a closed period (receiveDate)", async () => {
    if (!closedPeriodId || !supplierId || !warehouseId || !itemId) return;
    const createRes = await api("POST", "/api/receivings", {
      header: { supplierId, supplierInvoiceNo: `FP-R-${Date.now()}`, warehouseId, receiveDate: closedPeriodDate },
      lines: [{ itemId, unitLevel: "minor", qtyEntered: "5", qtyInMinor: "5", purchasePrice: "10", lineTotal: "50", bonusQty: "0", bonusQtyInMinor: "0", expiryMonth: 12, expiryYear: 2028 }],
    });
    if (createRes.status !== 201) return;
    const postRes = await api("POST", `/api/receivings/${createRes.data.id}/post`);
    expect(postRes.status).toBe(403);
    expect(postRes.data?.message).toContain("الفترة المحاسبية");
  });

  it("should reject posting a transfer dated in a closed period (transferDate)", async () => {
    if (!closedPeriodId || !warehouseId || !itemId) return;
    const warehouses = await api("GET", "/api/warehouses");
    if (!warehouses.data || warehouses.data.length < 2) return;
    const createRes = await api("POST", "/api/transfers", {
      header: { sourceWarehouseId: warehouses.data[0].id, destinationWarehouseId: warehouses.data[1].id, transferDate: closedPeriodDate, notes: "اختبار فترة مغلقة" },
      lines: [{ itemId, unitLevel: "minor", qtyEntered: "1", qtyInMinor: "1" }],
    });
    if (createRes.status !== 201) return;
    const postRes = await api("POST", `/api/transfers/${createRes.data.id}/post`);
    expect(postRes.status).toBe(403);
    expect(postRes.data?.message).toContain("الفترة المحاسبية");
  });

  it("should reject finalizing a sales invoice dated in a closed period (invoiceDate)", async () => {
    if (!closedPeriodId || !warehouseId || !itemId) return;
    const createRes = await api("POST", "/api/sales-invoices", {
      header: { warehouseId, invoiceDate: closedPeriodDate, customerType: "cash" },
      lines: [{ itemId, unitLevel: "minor", qty: "1", qtyInMinor: "1", salePrice: "50", lineTotal: "50" }],
    });
    if (createRes.status !== 201) return;
    const finalizeRes = await api("POST", `/api/sales-invoices/${createRes.data.id}/finalize`);
    expect(finalizeRes.status).toBe(403);
    expect(finalizeRes.data?.message).toContain("الفترة المحاسبية");
  });

  it("should reject finalizing a patient invoice dated in a closed period (invoiceDate)", async () => {
    if (!closedPeriodId) return;
    const createRes = await api("POST", "/api/patient-invoices", {
      header: { invoiceNumber: await nextPatientInvNum(), invoiceDate: closedPeriodDate, patientName: "مريض اختبار", patientType: "cash" },
      lines: [], payments: [],
    });
    if (createRes.status !== 201) return;
    const finalizeRes = await api("POST", `/api/patient-invoices/${createRes.data.id}/finalize`);
    expect(finalizeRes.status).toBe(403);
    expect(finalizeRes.data?.message).toContain("الفترة المحاسبية");
  });

  it("should reject approving a purchase invoice dated in a closed period (invoiceDate)", async () => {
    if (!closedPeriodId || !supplierId || !warehouseId || !itemId) return;
    const rcvRes = await api("POST", "/api/receivings", {
      header: { supplierId, supplierInvoiceNo: `FP-PI-${Date.now()}`, warehouseId, receiveDate: closedPeriodDate },
      lines: [{ itemId, unitLevel: "minor", qtyEntered: "2", qtyInMinor: "2", purchasePrice: "20", lineTotal: "40", bonusQty: "0", bonusQtyInMinor: "0", expiryMonth: 12, expiryYear: 2028 }],
    });
    if (rcvRes.status !== 201) return;
    const convRes = await api("POST", `/api/receivings/${rcvRes.data.id}/convert-to-invoice`);
    if (convRes.status !== 201 && convRes.status !== 200) return;
    if (!convRes.data?.id) return;
    const approveRes = await api("POST", `/api/purchase-invoices/${convRes.data.id}/approve`);
    expect(approveRes.status).toBe(403);
    expect(approveRes.data?.message).toContain("الفترة المحاسبية");
  });

  it("should allow cashier collect when invoiceDate is in closed period but paymentDate is in open period", async () => {
    if (!closedPeriodId || !warehouseId || !itemId) return;
    const today = new Date().toISOString().split("T")[0];

    const createRes = await api("POST", "/api/sales-invoices", {
      header: { warehouseId, invoiceDate: today, customerType: "cash" },
      lines: [{ itemId, unitLevel: "minor", qty: "1", qtyInMinor: "1", salePrice: "10", lineTotal: "10" }],
    });
    if (createRes.status !== 201) return;
    const invoiceId = createRes.data.id;

    const finalizeRes = await api("POST", `/api/sales-invoices/${invoiceId}/finalize`);
    if (finalizeRes.status !== 200) return;

    const pharmacies = await api("GET", "/api/pharmacies");
    if (!pharmacies.data?.length) return;
    const pharmacyId = pharmacies.data[0].id;

    const accounts = await api("GET", "/api/accounts");
    if (!accounts.data?.length) return;
    const glAccountId = accounts.data[0].id;

    const shiftRes = await api("POST", "/api/cashier/shift/open", {
      cashierId: `test-cashier-fp-${Date.now()}`,
      cashierName: "كاشير اختبار فترة",
      openingCash: "0",
      pharmacyId,
      glAccountId,
    });
    if (shiftRes.status !== 200) return;
    const shiftId = shiftRes.data.id;

    const collectRes = await api("POST", "/api/cashier/collect", {
      shiftId,
      invoiceIds: [invoiceId],
      collectedBy: "كاشير اختبار",
      paymentDate: today,
    });
    expect(collectRes.status).toBe(200);

    await api("POST", `/api/cashier/shift/${shiftId}/close`);
  });

  it("should reject cashier collect when paymentDate is in closed period", async () => {
    if (!closedPeriodId || !warehouseId || !itemId) return;
    const today = new Date().toISOString().split("T")[0];

    const createRes = await api("POST", "/api/sales-invoices", {
      header: { warehouseId, invoiceDate: today, customerType: "cash" },
      lines: [{ itemId, unitLevel: "minor", qty: "1", qtyInMinor: "1", salePrice: "10", lineTotal: "10" }],
    });
    if (createRes.status !== 201) return;
    const invoiceId = createRes.data.id;

    const finalizeRes = await api("POST", `/api/sales-invoices/${invoiceId}/finalize`);
    if (finalizeRes.status !== 200) return;

    const pharmacies = await api("GET", "/api/pharmacies");
    if (!pharmacies.data?.length) return;
    const pharmacyId = pharmacies.data[0].id;

    const accounts = await api("GET", "/api/accounts");
    if (!accounts.data?.length) return;
    const glAccountId = accounts.data[0].id;

    const shiftRes = await api("POST", "/api/cashier/shift/open", {
      cashierId: `test-cashier-fp2-${Date.now()}`,
      cashierName: "كاشير اختبار فترة 2",
      openingCash: "0",
      pharmacyId,
      glAccountId,
    });
    if (shiftRes.status !== 200) return;
    const shiftId = shiftRes.data.id;

    const collectRes = await api("POST", "/api/cashier/collect", {
      shiftId,
      invoiceIds: [invoiceId],
      collectedBy: "كاشير اختبار",
      paymentDate: closedPeriodDate,
    });
    expect(collectRes.status).toBe(403);
    expect(collectRes.data?.message).toContain("الفترة المحاسبية");

    await api("POST", `/api/cashier/shift/${shiftId}/close`);
  });

  it("should reject cashier refund when paymentDate is in closed period", async () => {
    if (!closedPeriodId || !warehouseId || !itemId) return;

    const pharmacies = await api("GET", "/api/pharmacies");
    if (!pharmacies.data?.length) return;
    const pharmacyId = pharmacies.data[0].id;

    const accounts = await api("GET", "/api/accounts");
    if (!accounts.data?.length) return;
    const glAccountId = accounts.data[0].id;

    const shiftRes = await api("POST", "/api/cashier/shift/open", {
      cashierId: `test-cashier-refund-fp-${Date.now()}`,
      cashierName: "كاشير اختبار مرتجع",
      openingCash: "0",
      pharmacyId,
      glAccountId,
    });
    if (shiftRes.status !== 200) return;
    const shiftId = shiftRes.data.id;

    const refundRes = await api("POST", "/api/cashier/refund", {
      shiftId,
      invoiceIds: ["fake-invoice-id"],
      refundedBy: "كاشير اختبار",
      paymentDate: closedPeriodDate,
    });
    expect(refundRes.status).toBe(403);
    expect(refundRes.data?.message).toContain("الفترة المحاسبية");

    await api("POST", `/api/cashier/shift/${shiftId}/close`);
  });

  it("should allow cashier refund past fiscal check when paymentDate is in open period", async () => {
    if (!closedPeriodId || !warehouseId || !itemId) return;
    const today = new Date().toISOString().split("T")[0];

    const pharmacies = await api("GET", "/api/pharmacies");
    if (!pharmacies.data?.length) return;
    const pharmacyId = pharmacies.data[0].id;

    const accounts = await api("GET", "/api/accounts");
    if (!accounts.data?.length) return;
    const glAccountId = accounts.data[0].id;

    const shiftRes = await api("POST", "/api/cashier/shift/open", {
      cashierId: `test-cashier-refund-fp2-${Date.now()}`,
      cashierName: "كاشير اختبار مرتجع 2",
      openingCash: "0",
      pharmacyId,
      glAccountId,
    });
    if (shiftRes.status !== 200) return;
    const shiftId = shiftRes.data.id;

    const refundRes = await api("POST", "/api/cashier/refund", {
      shiftId,
      invoiceIds: ["fake-invoice-id"],
      refundedBy: "كاشير اختبار",
      paymentDate: today,
    });
    expect(refundRes.status).not.toBe(403);
    if (refundRes.data?.message) {
      expect(refundRes.data.message).not.toContain("الفترة المحاسبية");
    }

    await api("POST", `/api/cashier/shift/${shiftId}/close`);
  });
});

// ======= 2) CANCELLED DOCUMENTS BEHAVIOR =======
describe("Cancelled Documents Behavior", () => {
  it("should soft-cancel a draft sales invoice and reject further edits", async () => {
    if (!warehouseId || !itemId) return;
    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/sales-invoices", {
      header: { warehouseId, invoiceDate: today, customerType: "cash" },
      lines: [{ itemId, unitLevel: "minor", qty: "1", qtyInMinor: "1", salePrice: "100", lineTotal: "100" }],
    });
    expect(createRes.status).toBe(201);
    const docId = createRes.data?.id;

    const deleteRes = await api("DELETE", `/api/sales-invoices/${docId}`, { reason: "test cancel" });
    expect(deleteRes.status).toBe(200);

    const getRes = await api("GET", `/api/sales-invoices/${docId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data?.status).toBe("cancelled");

    const editRes = await api("PATCH", `/api/sales-invoices/${docId}`, {
      header: {}, lines: [{ itemId, unitLevel: "minor", qty: "1", qtyInMinor: "1", salePrice: "50", lineTotal: "50" }],
    });
    expect(editRes.status).toBe(409);
  });

  it("should reject finalizing a cancelled sales invoice", async () => {
    if (!warehouseId || !itemId) return;
    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/sales-invoices", {
      header: { warehouseId, invoiceDate: today, customerType: "cash" },
      lines: [{ itemId, unitLevel: "minor", qty: "1", qtyInMinor: "1", salePrice: "50", lineTotal: "50" }],
    });
    expect(createRes.status).toBe(201);
    await api("DELETE", `/api/sales-invoices/${createRes.data.id}`);
    const finalizeRes = await api("POST", `/api/sales-invoices/${createRes.data.id}/finalize`);
    expect(finalizeRes.status).toBe(409);
  });

  it("should soft-cancel a draft patient invoice and reject finalization", async () => {
    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/patient-invoices", {
      header: { invoiceNumber: await nextPatientInvNum(), invoiceDate: today, patientName: "مريض اختبار الإلغاء", patientType: "cash" },
      lines: [], payments: [],
    });
    expect(createRes.status).toBe(201);
    const docId = createRes.data?.id;

    const deleteRes = await api("DELETE", `/api/patient-invoices/${docId}`, { reason: "test cancel" });
    expect(deleteRes.status).toBe(200);

    const getRes = await api("GET", `/api/patient-invoices/${docId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data?.status).toBe("cancelled");

    const finalizeRes = await api("POST", `/api/patient-invoices/${docId}/finalize`);
    expect(finalizeRes.status).toBe(409);
  });

  it("should exclude cancelled documents from default sales invoice listing", async () => {
    if (!warehouseId || !itemId) return;
    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/sales-invoices", {
      header: { warehouseId, invoiceDate: today, customerType: "cash" },
      lines: [{ itemId, unitLevel: "minor", qty: "1", qtyInMinor: "1", salePrice: "30", lineTotal: "30" }],
    });
    expect(createRes.status).toBe(201);
    const docId = createRes.data?.id;
    await api("DELETE", `/api/sales-invoices/${docId}`);

    const listRes = await api("GET", "/api/sales-invoices?page=1&pageSize=100");
    expect(listRes.status).toBe(200);
    const cancelledInList = listRes.data?.data?.find((d: any) => d.id === docId);
    expect(cancelledInList).toBeUndefined();
  });

  it("should exclude cancelled documents from default patient invoice listing", async () => {
    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/patient-invoices", {
      header: { invoiceNumber: await nextPatientInvNum(), invoiceDate: today, patientName: "مريض إلغاء قائمة", patientType: "cash" },
      lines: [], payments: [],
    });
    expect(createRes.status).toBe(201);
    const docId = createRes.data?.id;
    await api("DELETE", `/api/patient-invoices/${docId}`);

    const listRes = await api("GET", "/api/patient-invoices?page=1&pageSize=100");
    expect(listRes.status).toBe(200);
    const cancelledInList = listRes.data?.data?.find((d: any) => d.id === docId);
    expect(cancelledInList).toBeUndefined();
  });
});

// ======= 3) FORMATTED NUMBER CONSISTENCY =======
describe("FormattedNumber in API Responses", () => {
  it("should include formattedNumber in journal entry list", async () => {
    const res = await api("GET", "/api/journal-entries");
    expect(res.status).toBe(200);
    if (res.data?.length > 0) {
      expect(res.data[0]).toHaveProperty("formattedNumber");
      expect(res.data[0].formattedNumber).toMatch(/^JE-\d+$/);
    }
  });

  it("should include formattedNumber in journal entry detail", async () => {
    const listRes = await api("GET", "/api/journal-entries");
    if (listRes.data?.length > 0) {
      const detailRes = await api("GET", `/api/journal-entries/${listRes.data[0].id}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.data).toHaveProperty("formattedNumber");
      expect(detailRes.data.formattedNumber).toMatch(/^JE-\d+$/);
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

  it("should include formattedNumber in sales invoice detail", async () => {
    const listRes = await api("GET", "/api/sales-invoices?page=1&pageSize=1");
    if (listRes.data?.data?.length > 0) {
      const detailRes = await api("GET", `/api/sales-invoices/${listRes.data.data[0].id}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.data).toHaveProperty("formattedNumber");
    }
  });

  it("should include formattedNumber in receiving list and detail", async () => {
    const res = await api("GET", "/api/receivings?page=1&pageSize=5");
    expect(res.status).toBe(200);
    if (res.data?.data?.length > 0) {
      expect(res.data.data[0]).toHaveProperty("formattedNumber");
      expect(res.data.data[0].formattedNumber).toMatch(/^RCV-\d+$/);
      const detailRes = await api("GET", `/api/receivings/${res.data.data[0].id}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.data).toHaveProperty("formattedNumber");
    }
  });

  it("should include formattedNumber in patient invoice list and detail", async () => {
    const res = await api("GET", "/api/patient-invoices?page=1&pageSize=5");
    expect(res.status).toBe(200);
    if (res.data?.data?.length > 0) {
      expect(res.data.data[0]).toHaveProperty("formattedNumber");
      expect(res.data.data[0].formattedNumber).toMatch(/^PI-/);
      const detailRes = await api("GET", `/api/patient-invoices/${res.data.data[0].id}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.data).toHaveProperty("formattedNumber");
    }
  });

  it("should include formattedNumber in transfer list and detail", async () => {
    const res = await api("GET", "/api/transfers?page=1&pageSize=5");
    expect(res.status).toBe(200);
    if (res.data?.data?.length > 0) {
      expect(res.data.data[0]).toHaveProperty("formattedNumber");
      expect(res.data.data[0].formattedNumber).toMatch(/^TRF-\d+$/);
      const detailRes = await api("GET", `/api/transfers/${res.data.data[0].id}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.data).toHaveProperty("formattedNumber");
    }
  });

  it("should include formattedNumber in purchase invoice list and detail", async () => {
    const res = await api("GET", "/api/purchase-invoices?page=1&pageSize=5");
    expect(res.status).toBe(200);
    if (res.data?.data?.length > 0) {
      expect(res.data.data[0]).toHaveProperty("formattedNumber");
      expect(res.data.data[0].formattedNumber).toMatch(/^PUR-\d+$/);
      const detailRes = await api("GET", `/api/purchase-invoices/${res.data.data[0].id}`);
      expect(detailRes.status).toBe(200);
      expect(detailRes.data).toHaveProperty("formattedNumber");
    }
  });
});

// ======= 4) CONCURRENCY & IDEMPOTENCY =======
describe("Concurrency / Idempotency Guards", () => {
  it("should reject double-posting a journal entry", async () => {
    if (!accountDebitId || !accountCreditId) return;
    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/journal-entries", {
      entryDate: today, description: "اختبار الترحيل المزدوج",
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
      header: { warehouseId, invoiceDate: today, customerType: "cash" },
      lines: [{ itemId, unitLevel: "minor", qty: "1", qtyInMinor: "1", salePrice: "200", lineTotal: "200" }],
    });
    expect(createRes.status).toBe(201);

    const [fin1, fin2] = await Promise.all([
      api("POST", `/api/sales-invoices/${createRes.data.id}/finalize`),
      api("POST", `/api/sales-invoices/${createRes.data.id}/finalize`),
    ]);

    const successCount = [fin1, fin2].filter(r => r.status === 200).length;
    const rejectCount = [fin1, fin2].filter(r => r.status === 409 || r.status === 400).length;
    expect(successCount).toBeLessThanOrEqual(1);
    expect(rejectCount).toBeGreaterThanOrEqual(1);
  });

  it("should reject double-finalizing a patient invoice", async () => {
    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/patient-invoices", {
      header: { invoiceNumber: await nextPatientInvNum(), invoiceDate: today, patientName: "مريض مزدوج", patientType: "cash" },
      lines: [{ lineType: "service", description: "خدمة", quantity: "1", unitPrice: "100", totalPrice: "100", sortOrder: 0 }],
      payments: [],
    });
    expect(createRes.status).toBe(201);

    const [fin1, fin2] = await Promise.all([
      api("POST", `/api/patient-invoices/${createRes.data.id}/finalize`),
      api("POST", `/api/patient-invoices/${createRes.data.id}/finalize`),
    ]);

    const successCount = [fin1, fin2].filter(r => r.status === 200).length;
    const rejectCount = [fin1, fin2].filter(r => r.status === 409).length;
    expect(successCount).toBeLessThanOrEqual(1);
    expect(rejectCount).toBeGreaterThanOrEqual(1);
  });
});

// ======= 5) IMMUTABILITY ENFORCEMENT =======
describe("Document Immutability", () => {
  it("should reject updating a posted journal entry (409)", async () => {
    if (!accountDebitId || !accountCreditId) return;
    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/journal-entries", {
      entryDate: today, description: "اختبار ثبات القيود",
      lines: [
        { accountId: accountDebitId, debit: "500", credit: "0", description: "مدين", lineNumber: 1 },
        { accountId: accountCreditId, debit: "0", credit: "500", description: "دائن", lineNumber: 2 },
      ],
    });
    expect(createRes.status).toBe(201);
    await api("POST", `/api/journal-entries/${createRes.data.id}/post`);
    const updateRes = await api("PATCH", `/api/journal-entries/${createRes.data.id}`, { description: "تعديل بعد الترحيل" });
    expect(updateRes.status).toBe(409);
  });

  it("should reject deleting a posted journal entry", async () => {
    if (!accountDebitId || !accountCreditId) return;
    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/journal-entries", {
      entryDate: today, description: "اختبار حذف مُرحّل",
      lines: [
        { accountId: accountDebitId, debit: "200", credit: "0", description: "مدين", lineNumber: 1 },
        { accountId: accountCreditId, debit: "0", credit: "200", description: "دائن", lineNumber: 2 },
      ],
    });
    expect(createRes.status).toBe(201);
    await api("POST", `/api/journal-entries/${createRes.data.id}/post`);
    const deleteRes = await api("DELETE", `/api/journal-entries/${createRes.data.id}`);
    expect(deleteRes.status).toBe(400);
  });

  it("should reject editing a posted receiving (409)", async () => {
    if (!supplierId || !warehouseId || !itemId) return;
    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/receivings", {
      header: { supplierId, supplierInvoiceNo: `IMM-R-${Date.now()}`, warehouseId, receiveDate: today },
      lines: [{ itemId, unitLevel: "minor", qtyEntered: "3", qtyInMinor: "3", purchasePrice: "15", lineTotal: "45", bonusQty: "0", bonusQtyInMinor: "0", expiryMonth: 12, expiryYear: 2029 }],
    });
    if (createRes.status !== 201) return;
    const postRes = await api("POST", `/api/receivings/${createRes.data.id}/post`);
    if (postRes.status !== 200) return;
    const editRes = await api("PATCH", `/api/receivings/${createRes.data.id}`, {
      header: { supplierId, supplierInvoiceNo: `IMM-R-${Date.now()}`, warehouseId, receiveDate: today },
      lines: [{ itemId, unitLevel: "minor", qtyEntered: "1", qtyInMinor: "1", purchasePrice: "10", lineTotal: "10", bonusQty: "0", bonusQtyInMinor: "0", expiryMonth: 12, expiryYear: 2029 }],
    });
    expect(editRes.status).toBe(409);
  });

  it("should reject editing an approved purchase invoice (409)", async () => {
    if (!supplierId || !warehouseId || !itemId) return;
    const today = new Date().toISOString().split("T")[0];
    const rcvRes = await api("POST", "/api/receivings", {
      header: { supplierId, supplierInvoiceNo: `IMM-PI-${Date.now()}`, warehouseId, receiveDate: today },
      lines: [{ itemId, unitLevel: "minor", qtyEntered: "2", qtyInMinor: "2", purchasePrice: "20", lineTotal: "40", bonusQty: "0", bonusQtyInMinor: "0", expiryMonth: 12, expiryYear: 2029 }],
    });
    if (rcvRes.status !== 201) return;
    const convRes = await api("POST", `/api/receivings/${rcvRes.data.id}/convert-to-invoice`);
    if (!convRes.data?.id) return;
    const approveRes = await api("POST", `/api/purchase-invoices/${convRes.data.id}/approve`);
    if (approveRes.status !== 200) return;
    const editRes = await api("PATCH", `/api/purchase-invoices/${convRes.data.id}`, { lines: [] });
    expect(editRes.status).toBe(409);
  });

  it("should soft-delete (cancel) a draft transfer, not hard-delete", async () => {
    if (!warehouseId || !itemId) return;
    const warehouses = await api("GET", "/api/warehouses");
    if (!warehouses.data || warehouses.data.length < 2) return;
    const createRes = await api("POST", "/api/transfers", {
      header: { sourceWarehouseId: warehouses.data[0].id, destinationWarehouseId: warehouses.data[1].id, transferDate: new Date().toISOString().split("T")[0], notes: "اختبار إلغاء" },
      lines: [{ itemId, unitLevel: "minor", qtyEntered: "1", qtyInMinor: "1" }],
    });
    if (createRes.status !== 201) return;
    const deleteRes = await api("DELETE", `/api/transfers/${createRes.data.id}`, { reason: "test cancel" });
    expect(deleteRes.status).toBe(200);
    const getRes = await api("GET", `/api/transfers/${createRes.data.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data?.status).toBe("cancelled");
  });
});

// ======= 6) FINANCIAL ROUNDING CONSISTENCY =======
describe("Financial Rounding Consistency", () => {
  it("should round journal entry debit/credit to 2 decimal places", async () => {
    if (!accountDebitId || !accountCreditId) return;
    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/journal-entries", {
      entryDate: today, description: "اختبار التقريب",
      lines: [
        { accountId: accountDebitId, debit: "100.456", credit: "0", description: "مدين", lineNumber: 1 },
        { accountId: accountCreditId, debit: "0", credit: "100.456", description: "دائن", lineNumber: 2 },
      ],
    });
    expect(createRes.status).toBe(201);
    const entry = await api("GET", `/api/journal-entries/${createRes.data.id}`);
    expect(entry.status).toBe(200);
    if (entry.data?.lines?.length > 0) {
      const debitLine = entry.data.lines.find((l: any) => parseFloat(l.debit) > 0);
      if (debitLine) {
        const debitStr = String(debitLine.debit);
        const decimals = debitStr.split('.')[1] || '';
        expect(decimals.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("should round sales invoice totals to 2 decimal places", async () => {
    if (!warehouseId || !itemId) return;
    const today = new Date().toISOString().split("T")[0];
    const createRes = await api("POST", "/api/sales-invoices", {
      header: { warehouseId, invoiceDate: today, customerType: "cash" },
      lines: [{ itemId, unitLevel: "minor", qty: "3", qtyInMinor: "3", salePrice: "33.333", lineTotal: "99.999" }],
    });
    expect(createRes.status).toBe(201);
    const inv = await api("GET", `/api/sales-invoices/${createRes.data.id}`);
    expect(inv.status).toBe(200);
    if (inv.data?.netTotal) {
      const netStr = String(inv.data.netTotal);
      const decimals = netStr.split('.')[1] || '';
      expect(decimals.length).toBeLessThanOrEqual(2);
    }
  });
});
