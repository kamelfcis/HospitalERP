import { describe, it, expect, beforeAll } from "vitest";

const BASE = "http://localhost:5000";

async function api(method: string, path: string, body?: any) {
  const opts: any = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return { status: res.status, data: await res.json() };
}

describe("Receiving Register Filters", () => {
  const today = new Date().toISOString().split("T")[0];

  it("should return receivings filtered by date range (today)", async () => {
    const res = await api("GET", `/api/receivings?page=1&pageSize=50&fromDate=${today}&toDate=${today}`);
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("data");
    expect(res.data).toHaveProperty("total");
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  it("should return all receivings when no date filter", async () => {
    const res = await api("GET", `/api/receivings?page=1&pageSize=50`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  it("should filter by statusFilter=DRAFT (only drafts)", async () => {
    const res = await api("GET", `/api/receivings?page=1&pageSize=50&statusFilter=DRAFT`);
    expect(res.status).toBe(200);
    for (const r of res.data.data) {
      expect(r.status).toBe("draft");
    }
  });

  it("should filter by statusFilter=POSTED (posted_qty_only, not converted)", async () => {
    const res = await api("GET", `/api/receivings?page=1&pageSize=50&statusFilter=POSTED`);
    expect(res.status).toBe(200);
    for (const r of res.data.data) {
      expect(r.status).toBe("posted_qty_only");
      expect(r.convertedToInvoiceId).toBeFalsy();
    }
  });

  it("should filter by statusFilter=CONVERTED (has convertedToInvoiceId)", async () => {
    const res = await api("GET", `/api/receivings?page=1&pageSize=50&statusFilter=CONVERTED`);
    expect(res.status).toBe(200);
    for (const r of res.data.data) {
      expect(r.convertedToInvoiceId).toBeTruthy();
    }
  });

  it("should filter by statusFilter=ALL (no restriction)", async () => {
    const resAll = await api("GET", `/api/receivings?page=1&pageSize=50&statusFilter=ALL`);
    const resNoFilter = await api("GET", `/api/receivings?page=1&pageSize=50`);
    expect(resAll.status).toBe(200);
    expect(resAll.data.total).toBe(resNoFilter.data.total);
  });

  it("should search by supplier invoice number", async () => {
    const all = await api("GET", `/api/receivings?page=1&pageSize=1`);
    if (all.data.data.length > 0) {
      const invoiceNo = all.data.data[0].supplierInvoiceNo;
      const res = await api("GET", `/api/receivings?page=1&pageSize=50&search=${encodeURIComponent(invoiceNo)}`);
      expect(res.status).toBe(200);
      expect(res.data.total).toBeGreaterThanOrEqual(1);
    }
  });

  it("should search by supplier name", async () => {
    const all = await api("GET", `/api/receivings?page=1&pageSize=1`);
    if (all.data.data.length > 0 && all.data.data[0].supplier?.nameAr) {
      const nameAr = all.data.data[0].supplier.nameAr;
      const res = await api("GET", `/api/receivings?page=1&pageSize=50&search=${encodeURIComponent(nameAr)}`);
      expect(res.status).toBe(200);
      expect(res.data.total).toBeGreaterThanOrEqual(1);
    }
  });

  it("should combine search + statusFilter + date range (AND logic)", async () => {
    const res = await api("GET", `/api/receivings?page=1&pageSize=50&fromDate=2020-01-01&toDate=2030-12-31&statusFilter=ALL&search=test`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  it("should paginate correctly", async () => {
    const res1 = await api("GET", `/api/receivings?page=1&pageSize=2`);
    expect(res1.status).toBe(200);
    expect(res1.data.data.length).toBeLessThanOrEqual(2);
    if (res1.data.total > 2) {
      const res2 = await api("GET", `/api/receivings?page=2&pageSize=2`);
      expect(res2.status).toBe(200);
      expect(res2.data.data.length).toBeGreaterThanOrEqual(1);
      if (res2.data.data.length > 0 && res1.data.data.length > 0) {
        expect(res2.data.data[0].id).not.toBe(res1.data.data[0].id);
      }
    }
  });

  it("should return results ordered by receiveDate DESC", async () => {
    const res = await api("GET", `/api/receivings?page=1&pageSize=50`);
    expect(res.status).toBe(200);
    const dates = res.data.data.map((r: any) => r.receiveDate);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] <= dates[i - 1]).toBe(true);
    }
  });
});

describe("Supplier Search API", () => {
  it("should return results for a valid query", async () => {
    const suppliers = await api("GET", "/api/suppliers?page=1&pageSize=1");
    if (suppliers.data.suppliers?.length > 0) {
      const code = suppliers.data.suppliers[0].code;
      const res = await api("GET", `/api/suppliers/search?q=${encodeURIComponent(code)}&limit=10`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThanOrEqual(1);
      expect(res.data[0]).toHaveProperty("id");
      expect(res.data[0]).toHaveProperty("code");
      expect(res.data[0]).toHaveProperty("nameAr");
    }
  });

  it("should return results when searching by Arabic name", async () => {
    const suppliers = await api("GET", "/api/suppliers?page=1&pageSize=1");
    if (suppliers.data.suppliers?.length > 0) {
      const nameAr = suppliers.data.suppliers[0].nameAr;
      const partial = nameAr.substring(0, Math.min(5, nameAr.length));
      const res = await api("GET", `/api/suppliers/search?q=${encodeURIComponent(partial)}&limit=10`);
      expect(res.status).toBe(200);
      expect(res.data.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("should return empty array for empty query", async () => {
    const res = await api("GET", `/api/suppliers/search?q=&limit=10`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBe(0);
  });

  it("should prioritize exact code match for numeric queries", async () => {
    const suppliers = await api("GET", "/api/suppliers?page=1&pageSize=1");
    if (suppliers.data.suppliers?.length > 0) {
      const code = suppliers.data.suppliers[0].code;
      if (/^\d+$/.test(code)) {
        const res = await api("GET", `/api/suppliers/search?q=${encodeURIComponent(code)}&limit=10`);
        expect(res.status).toBe(200);
        expect(res.data.length).toBeGreaterThanOrEqual(1);
        expect(res.data[0].code).toBe(code);
      }
    }
  });

  it("should return minimal fields only (id, code, nameAr, nameEn, phone)", async () => {
    const suppliers = await api("GET", "/api/suppliers?page=1&pageSize=1");
    if (suppliers.data.suppliers?.length > 0) {
      const code = suppliers.data.suppliers[0].code;
      const res = await api("GET", `/api/suppliers/search?q=${encodeURIComponent(code)}&limit=10`);
      expect(res.status).toBe(200);
      if (res.data.length > 0) {
        const keys = Object.keys(res.data[0]);
        expect(keys).toContain("id");
        expect(keys).toContain("code");
        expect(keys).toContain("nameAr");
        expect(keys).not.toContain("address");
        expect(keys).not.toContain("createdAt");
      }
    }
  });

  it("should respect limit parameter", async () => {
    const res = await api("GET", `/api/suppliers/search?q=a&limit=2`);
    expect(res.status).toBe(200);
    expect(res.data.length).toBeLessThanOrEqual(2);
  });

  it("should respond quickly (< 500ms)", async () => {
    const start = Date.now();
    const res = await api("GET", `/api/suppliers/search?q=test&limit=20`);
    const elapsed = Date.now() - start;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(500);
  });
});
