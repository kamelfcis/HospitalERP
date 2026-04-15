import { describe, it, expect } from "vitest";
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

describe("Multi-line Qty Editability", () => {
  let supplierId: string;
  let warehouseId: string;
  let itemIds: string[] = [];

  it("should fetch test data (suppliers, warehouses, items)", async () => {
    const [supRes, whRes, itemRes] = await Promise.all([
      api("GET", "/api/suppliers?page=1&pageSize=5"),
      api("GET", "/api/warehouses"),
      api("GET", "/api/items?page=1&limit=50"),
    ]);
    expect(supRes.status).toBe(200);
    expect(whRes.status).toBe(200);
    expect(itemRes.status).toBe(200);
    supplierId = (supRes.data.suppliers || supRes.data.data)?.[0]?.id;
    warehouseId = whRes.data[0]?.id;
    const items = itemRes.data.items || itemRes.data.data || itemRes.data || [];
    itemIds = items.slice(0, 3).map((i: any) => i.id);
    expect(supplierId).toBeTruthy();
    expect(warehouseId).toBeTruthy();
    expect(itemIds.length).toBeGreaterThanOrEqual(2);
  });

  it("should save a draft with 2 lines and both have correct quantities", async () => {
    const payload = {
      header: {
        supplierId,
        supplierInvoiceNo: `QTY-TEST-${Date.now()}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [
        makeLine(itemIds[0], "10", "0"),
        makeLine(itemIds[1], "20", "0"),
      ],
    };

    const res = await api("POST", "/api/receivings", payload);
    expect([200, 201]).toContain(res.status);
    expect(res.data.id).toBeTruthy();

    const loaded = await api("GET", `/api/receivings/${res.data.id}`);
    expect(loaded.status).toBe(200);
    expect(loaded.data.status).toBe("draft");
    expect(loaded.data.lines.length).toBe(2);
    expect(parseFloat(loaded.data.lines[0].qtyEntered)).toBe(10);
    expect(parseFloat(loaded.data.lines[1].qtyEntered)).toBe(20);
  });

  it("should update qty on first line after adding a third line", async () => {
    const payload = {
      header: {
        supplierId,
        supplierInvoiceNo: `QTY-EDIT-${Date.now()}`,
        warehouseId,
        receiveDate: new Date().toISOString().split("T")[0],
      },
      lines: [
        makeLine(itemIds[0], "5", "0"),
        makeLine(itemIds[1], "7", "0"),
      ],
    };

    const createRes = await api("POST", "/api/receivings", payload);
    expect([200, 201]).toContain(createRes.status);
    const draftId = createRes.data.id;

    const updatedPayload = {
      header: {
        supplierId,
        supplierInvoiceNo: payload.header.supplierInvoiceNo,
        warehouseId,
        receiveDate: payload.header.receiveDate,
      },
      lines: [
        makeLine(itemIds[0], "15", "0"),
        makeLine(itemIds[1], "7", "0"),
        makeLine(itemIds.length >= 3 ? itemIds[2] : itemIds[0], "3", "0"),
      ],
    };

    const updateRes = await api("PATCH", `/api/receivings/${draftId}`, updatedPayload);
    expect(updateRes.status).toBe(200);

    const reloaded = await api("GET", `/api/receivings/${draftId}`);
    expect(reloaded.status).toBe(200);
    expect(reloaded.data.lines.length).toBe(3);
    expect(parseFloat(reloaded.data.lines[0].qtyEntered)).toBe(15);
    expect(parseFloat(reloaded.data.lines[1].qtyEntered)).toBe(7);
    expect(parseFloat(reloaded.data.lines[2].qtyEntered)).toBe(3);
  });

  it("should allow editing any line qty in draft via PATCH", async () => {
    const invoiceNo = `QTY-PATCH-${Date.now()}`;
    const payload = {
      header: { supplierId, supplierInvoiceNo: invoiceNo, warehouseId, receiveDate: new Date().toISOString().split("T")[0] },
      lines: [
        makeLine(itemIds[0], "1", "0"),
        makeLine(itemIds[1], "1", "0"),
      ],
    };

    const createRes = await api("POST", "/api/receivings", payload);
    expect([200, 201]).toContain(createRes.status);
    const draftId = createRes.data.id;

    for (let round = 0; round < 3; round++) {
      const newQty1 = 10 + round * 5;
      const newQty2 = 20 + round * 3;
      const patchPayload = {
        header: { supplierId, supplierInvoiceNo: invoiceNo, warehouseId, receiveDate: payload.header.receiveDate },
        lines: [
          makeLine(itemIds[0], String(newQty1), "0"),
          makeLine(itemIds[1], String(newQty2), "0"),
        ],
      };
      const patchRes = await api("PATCH", `/api/receivings/${draftId}`, patchPayload);
      expect(patchRes.status).toBe(200);

      const loaded = await api("GET", `/api/receivings/${draftId}`);
      expect(parseFloat(loaded.data.lines[0].qtyEntered)).toBe(newQty1);
      expect(parseFloat(loaded.data.lines[1].qtyEntered)).toBe(newQty2);
    }
  });

  it("should not allow editing qty after posting (qty locked on posted docs)", async () => {
    const invoiceNo = `QTY-POST-${Date.now()}`;
    const payload = {
      header: { supplierId, supplierInvoiceNo: invoiceNo, warehouseId, receiveDate: new Date().toISOString().split("T")[0] },
      lines: [
        makeLine(itemIds[0], "5", "0"),
      ],
    };

    const createRes = await api("POST", "/api/receivings", payload);
    expect([200, 201]).toContain(createRes.status);
    const draftId = createRes.data.id;

    const postRes = await api("POST", `/api/receivings/${draftId}/post`);
    expect(postRes.status).toBe(200);

    const patchRes = await api("PATCH", `/api/receivings/${draftId}`, {
      header: { supplierId, supplierInvoiceNo: invoiceNo, warehouseId, receiveDate: payload.header.receiveDate },
      lines: [makeLine(itemIds[0], "999", "0")],
    });
    expect(patchRes.status).toBe(409);
  });
});
