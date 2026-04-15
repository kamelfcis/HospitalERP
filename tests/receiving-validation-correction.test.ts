import { describe, it, expect, beforeAll } from "vitest";
import { liveCall as api } from "./live-session";

const UNIQUE = Date.now();

let supplierId: string;
let warehouseId: string;
let expiryItemId: string;
let nonExpiryItemId: string;

beforeAll(async () => {
  const sup = await api("POST", "/api/suppliers", {
    code: `VCOR-${UNIQUE}`,
    nameAr: `مورد تصحيح ${UNIQUE}`,
  });
  supplierId = sup.data.id;

  const wh = await api("POST", "/api/warehouses", {
    warehouseCode: `WCR-${UNIQUE}`,
    nameAr: `مستودع تصحيح ${UNIQUE}`,
  });
  warehouseId = wh.data.id;

  const item1 = await api("POST", "/api/items", {
    itemCode: `VCOREXP-${UNIQUE}`,
    nameAr: `صنف صلاحية ${UNIQUE}`,
    category: "drug",
    hasExpiry: true,
    majorUnitName: "علبة",
    minorUnitName: "قرص",
    majorToMinor: "10",
  });
  expiryItemId = item1.data.id;

  const item2 = await api("POST", "/api/items", {
    itemCode: `VCORNOEXP-${UNIQUE}`,
    nameAr: `صنف بدون صلاحية ${UNIQUE}`,
    category: "drug",
    hasExpiry: false,
    majorUnitName: "علبة",
    minorUnitName: "قرص",
    majorToMinor: "10",
  });
  nonExpiryItemId = item2.data.id;
}, 30000);

describe("Draft Save Validation", () => {
  it("should reject draft save with missing selling price (validation at save time)", async () => {
    const res = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `VAL-NOSP-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: nonExpiryItemId,
        unitLevel: "major",
        qtyEntered: "1",
        qtyInMinor: "10",
        purchasePrice: "5",
        lineTotal: "5",
      }],
    });
    expect(res.status).toBe(400);
    expect(res.data.lineErrors).toBeDefined();
    expect(res.data.lineErrors.length).toBeGreaterThan(0);
    expect(res.data.lineErrors[0].field).toBe("salePrice");
  });

  it("should reject draft save with expiry item missing expiry (validation at save time)", async () => {
    const res = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `VAL-NOEXP-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: expiryItemId,
        unitLevel: "major",
        qtyEntered: "1",
        qtyInMinor: "10",
        purchasePrice: "5",
        lineTotal: "5",
        salePrice: "10",
      }],
    });
    expect(res.status).toBe(400);
    expect(res.data.lineErrors).toBeDefined();
    expect(res.data.lineErrors.some((e: any) => e.field === "expiry")).toBe(true);
  });

  it("should allow draft save for non-expiry item with valid salePrice", async () => {
    const res = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `VAL-OK-NOEXP-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: nonExpiryItemId,
        unitLevel: "major",
        qtyEntered: "1",
        qtyInMinor: "10",
        purchasePrice: "5",
        lineTotal: "5",
        salePrice: "15",
      }],
    });
    expect(res.status).toBe(201);
    expect(res.data.id).toBeDefined();
  });

  it("should allow draft save for expiry item with valid expiry and salePrice", async () => {
    const res = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `VAL-OK-EXP-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: expiryItemId,
        unitLevel: "major",
        qtyEntered: "1",
        qtyInMinor: "10",
        purchasePrice: "5",
        lineTotal: "5",
        salePrice: "15",
        expiryMonth: 12,
        expiryYear: 2028,
      }],
    });
    expect(res.status).toBe(201);
    expect(res.data.id).toBeDefined();
  });

  it("should successfully post non-expiry item with valid salePrice", async () => {
    const create = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `VAL-POST-OK-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: nonExpiryItemId,
        unitLevel: "major",
        qtyEntered: "1",
        qtyInMinor: "10",
        purchasePrice: "5",
        lineTotal: "5",
        salePrice: "15",
      }],
    });
    expect(create.status).toBe(201);

    const post = await api("POST", `/api/receivings/${create.data.id}/post`);
    expect(post.status).toBe(200);
    expect(post.data.status).toBe("posted_qty_only");
  });

  it("should successfully post expiry item with valid salePrice and expiry", async () => {
    const create = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `VAL-POST-EXP-OK-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: expiryItemId,
        unitLevel: "major",
        qtyEntered: "1",
        qtyInMinor: "10",
        purchasePrice: "5",
        lineTotal: "5",
        salePrice: "15",
        expiryMonth: 12,
        expiryYear: 2028,
      }],
    });
    expect(create.status).toBe(201);

    const post = await api("POST", `/api/receivings/${create.data.id}/post`);
    expect(post.status).toBe(200);
    expect(post.data.status).toBe("posted_qty_only");
  });
});

describe("Posted Immutability", () => {
  let postedReceivingId: string;

  it("should post a valid receiving", async () => {
    const create = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `IMM-TEST-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: expiryItemId,
        unitLevel: "major",
        qtyEntered: "10",
        qtyInMinor: "100",
        purchasePrice: "5",
        lineTotal: "50",
        salePrice: "15",
        expiryMonth: 6,
        expiryYear: 2028,
      }],
    });
    expect(create.status).toBe(201);
    postedReceivingId = create.data.id;

    const post = await api("POST", `/api/receivings/${postedReceivingId}/post`);
    expect(post.status).toBe(200);
    expect(post.data.status).toBe("posted_qty_only");
  });

  it("should reject update to posted receiving with 409", async () => {
    const res = await api("PATCH", `/api/receivings/${postedReceivingId}`, {
      header: {
        supplierId,
        supplierInvoiceNo: `IMM-TEST-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: expiryItemId,
        unitLevel: "major",
        qtyEntered: "5",
        qtyInMinor: "50",
        purchasePrice: "5",
        lineTotal: "25",
        salePrice: "15",
        expiryMonth: 6,
        expiryYear: 2028,
      }],
    });
    expect(res.status).toBe(409);
  });

  it("should reject delete of posted receiving", async () => {
    const res = await api("DELETE", `/api/receivings/${postedReceivingId}`);
    expect(res.status).toBe(409);
  });

  it("should handle double post idempotently (returns 200)", async () => {
    const res = await api("POST", `/api/receivings/${postedReceivingId}/post`);
    expect(res.status).toBe(200);
  });
});

describe("Correction Flow", () => {
  let originalId: string;
  let correctionId: string;

  it("should create and post original receiving (qty=10)", async () => {
    const create = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `COR-ORIG-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: expiryItemId,
        unitLevel: "major",
        qtyEntered: "10",
        qtyInMinor: "100",
        purchasePrice: "5",
        lineTotal: "50",
        salePrice: "15",
        expiryMonth: 3,
        expiryYear: 2029,
      }],
    });
    expect(create.status).toBe(201);
    originalId = create.data.id;

    const post = await api("POST", `/api/receivings/${originalId}/post`);
    expect(post.status).toBe(200);
  });

  it("should check initial stock after posting", async () => {
    const stats = await api("GET", `/api/items/${expiryItemId}/warehouse-stats`);
    expect(stats.status).toBe(200);
    const rows = Array.isArray(stats.data) ? stats.data : [];
    const wh = rows.find((s: any) => s.warehouseId === warehouseId) ?? rows[0];
    expect(wh).toBeDefined();
    expect(parseFloat(wh.qtyMinor)).toBeGreaterThanOrEqual(100);
  });

  it("should create correction from posted receiving", async () => {
    const res = await api("POST", `/api/receivings/${originalId}/correct`);
    expect(res.status).toBe(201);
    expect(res.data.correctionOfId).toBe(originalId);
    expect(res.data.correctionStatus).toBe("correction");
    expect(res.data.status).toBe("draft");
    correctionId = res.data.id;
  });

  it("should mark original as corrected", async () => {
    const orig = await api("GET", `/api/receivings/${originalId}`);
    expect(orig.status).toBe(200);
    expect(orig.data.correctedById).toBe(correctionId);
    expect(orig.data.correctionStatus).toBe("corrected");
  });

  it("should not allow double correction", async () => {
    const res = await api("POST", `/api/receivings/${originalId}/correct`);
    expect(res.status).toBe(400);
    expect(res.data.message).toContain("مسبقاً");
  });

  it("should reject correction of draft receiving", async () => {
    const draft = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `COR-DRAFT-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: nonExpiryItemId,
        unitLevel: "major",
        qtyEntered: "1",
        qtyInMinor: "10",
        purchasePrice: "5",
        lineTotal: "5",
        salePrice: "15",
      }],
    });
    expect(draft.status).toBe(201);

    const res = await api("POST", `/api/receivings/${draft.data.id}/correct`);
    expect(res.status).toBe(400);
  });

  it("should verify stock exists in warehouse after posting", async () => {
    const stats = await api("GET", `/api/items/${expiryItemId}/warehouse-stats`);
    expect(stats.status).toBe(200);
    const rows = Array.isArray(stats.data) ? stats.data : [];
    const wh = rows.find((s: any) => s.warehouseId === warehouseId) ?? rows[0];
    expect(wh).toBeDefined();
  });
});

describe("Receiving CRUD Operations", () => {
  let draftId: string;

  it("should create a draft receiving", async () => {
    const res = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `CRUD-CREATE-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: nonExpiryItemId,
        unitLevel: "major",
        qtyEntered: "5",
        qtyInMinor: "50",
        purchasePrice: "10",
        lineTotal: "50",
        salePrice: "20",
      }],
    });
    expect(res.status).toBe(201);
    expect(res.data.id).toBeDefined();
    expect(res.data.status).toBe("draft");
    draftId = res.data.id;
  });

  it("should get the created draft receiving with full details", async () => {
    const res = await api("GET", `/api/receivings/${draftId}`);
    expect(res.status).toBe(200);
    expect(res.data.id).toBe(draftId);
    expect(res.data.status).toBe("draft");
    expect(res.data.lines).toBeDefined();
    expect(res.data.lines.length).toBe(1);
    expect(res.data.supplier).toBeDefined();
    expect(res.data.warehouse).toBeDefined();
  });

  it("should update a draft receiving", async () => {
    const res = await api("PATCH", `/api/receivings/${draftId}`, {
      header: {
        supplierId,
        supplierInvoiceNo: `CRUD-UPDATE-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: nonExpiryItemId,
        unitLevel: "major",
        qtyEntered: "3",
        qtyInMinor: "30",
        purchasePrice: "10",
        lineTotal: "30",
        salePrice: "20",
      }],
    });
    expect(res.status).toBe(200);
  });

  it("should delete a draft receiving", async () => {
    const newDraft = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `CRUD-DEL-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: nonExpiryItemId,
        unitLevel: "major",
        qtyEntered: "1",
        qtyInMinor: "10",
        purchasePrice: "5",
        lineTotal: "5",
        salePrice: "10",
      }],
    });
    expect(newDraft.status).toBe(201);

    const del = await api("DELETE", `/api/receivings/${newDraft.data.id}`);
    expect(del.status).toBe(200);
  });

  it("should reject duplicate supplier invoice number for same supplier", async () => {
    const first = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `CRUD-DUP-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: nonExpiryItemId,
        unitLevel: "major",
        qtyEntered: "1",
        qtyInMinor: "10",
        purchasePrice: "5",
        lineTotal: "5",
        salePrice: "10",
      }],
    });
    expect(first.status).toBe(201);

    const second = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `CRUD-DUP-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: nonExpiryItemId,
        unitLevel: "major",
        qtyEntered: "1",
        qtyInMinor: "10",
        purchasePrice: "5",
        lineTotal: "5",
        salePrice: "10",
      }],
    });
    expect(second.status).toBe(409);
  });

  it("should reject receiving with missing header fields", async () => {
    const noSupplier = await api("POST", "/api/receivings", {
      header: {
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [{
        itemId: nonExpiryItemId,
        unitLevel: "major",
        qtyEntered: "1",
        qtyInMinor: "10",
        purchasePrice: "5",
        lineTotal: "5",
        salePrice: "10",
      }],
    });
    expect(noSupplier.status).toBe(400);
  });

  it("should reject receiving with empty lines array", async () => {
    const res = await api("POST", "/api/receivings", {
      header: {
        supplierId,
        supplierInvoiceNo: `CRUD-EMPTY-${UNIQUE}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [],
    });
    expect(res.status).toBe(400);
  });
});

describe("CORRECTED Status Filter", () => {
  it("should return valid response for CORRECTED filter", async () => {
    const res = await api("GET", `/api/receivings?page=1&pageSize=50&statusFilter=CORRECTED`);
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("data");
    expect(res.data).toHaveProperty("total");
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  it("should return valid response for ALL filter", async () => {
    const res = await api("GET", `/api/receivings?page=1&pageSize=50&statusFilter=ALL`);
    expect(res.status).toBe(200);
    expect(res.data.total).toBeGreaterThan(0);
  });

  it("should return valid response for DRAFT filter", async () => {
    const res = await api("GET", `/api/receivings?page=1&pageSize=50&statusFilter=DRAFT`);
    expect(res.status).toBe(200);
    for (const r of res.data.data) {
      expect(r.status).toBe("draft");
    }
  });

  it("should return valid response for POSTED filter", async () => {
    const res = await api("GET", `/api/receivings?page=1&pageSize=50&statusFilter=POSTED`);
    expect(res.status).toBe(200);
    for (const r of res.data.data) {
      expect(r.status).toBe("posted_qty_only");
      expect(r.convertedToInvoiceId).toBeFalsy();
    }
  });
});
