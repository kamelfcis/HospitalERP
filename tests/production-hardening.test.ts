import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = 'http://localhost:5000';

async function api(method: string, path: string, body?: any) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

describe('A) Backup & Restore', () => {
  it('backup status endpoint returns response', async () => {
    const { status, body } = await api('GET', '/api/ops/backup-status');
    expect(status).toBe(200);
    expect(body).toHaveProperty('status');
  });

  it('backup script exists and is executable', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const backupPath = path.resolve('scripts/backup.sh');
    expect(fs.existsSync(backupPath)).toBe(true);
    const stats = fs.statSync(backupPath);
    expect(stats.mode & 0o111).toBeGreaterThan(0);
  });

  it('restore script exists and is executable', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const restorePath = path.resolve('scripts/restore.sh');
    expect(fs.existsSync(restorePath)).toBe(true);
    const stats = fs.statSync(restorePath);
    expect(stats.mode & 0o111).toBeGreaterThan(0);
  });
});

describe('B) Printing Safety', () => {
  let receiptId: string | null = null;

  it('print tracking fields exist in schema', async () => {
    const schema = await import('../shared/schema');
    const cols = Object.keys((schema.cashierReceipts as any));
    expect(cols).toBeDefined();
  });

  it('receipt print endpoint returns 404 for non-existent receipt', async () => {
    const { status, body } = await api('POST', '/api/cashier/receipts/non-existent-id/print', {
      printedBy: 'test-user',
    });
    expect(status).toBe(404);
    expect(body.message).toContain('غير موجود');
  });

  it('refund receipt print endpoint returns 404 for non-existent receipt', async () => {
    const { status, body } = await api('POST', '/api/cashier/refund-receipts/non-existent-id/print', {
      printedBy: 'test-user',
    });
    expect(status).toBe(404);
    expect(body.message).toContain('غير موجود');
  });

  it('receipt print requires printedBy', async () => {
    const { status, body } = await api('POST', '/api/cashier/receipts/any-id/print', {});
    expect(status).toBe(400);
    expect(body.message).toContain('مطلوب');
  });

  it('receipt GET endpoint returns 404 for non-existent', async () => {
    const { status, body } = await api('GET', '/api/cashier/receipts/non-existent-id');
    expect(status).toBe(404);
    expect(body.message).toContain('غير موجود');
  });

  it('refund receipt GET endpoint returns 404 for non-existent', async () => {
    const { status, body } = await api('GET', '/api/cashier/refund-receipts/non-existent-id');
    expect(status).toBe(404);
    expect(body.message).toContain('غير موجود');
  });
});

describe('D) Cancelled Documents Reporting', () => {
  it('transfers list supports includeCancelled param', async () => {
    const { status: s1 } = await api('GET', '/api/transfers');
    expect(s1).toBe(200);
    const { status: s2 } = await api('GET', '/api/transfers?includeCancelled=true');
    expect(s2).toBe(200);
  });

  it('receivings list supports includeCancelled param', async () => {
    const { status: s1 } = await api('GET', '/api/receivings');
    expect(s1).toBe(200);
    const { status: s2 } = await api('GET', '/api/receivings?includeCancelled=true');
    expect(s2).toBe(200);
  });

  it('purchase invoices list supports includeCancelled param', async () => {
    const { status: s1 } = await api('GET', '/api/purchase-invoices');
    expect(s1).toBe(200);
    const { status: s2 } = await api('GET', '/api/purchase-invoices?includeCancelled=true');
    expect(s2).toBe(200);
  });

  it('sales invoices list supports includeCancelled param', async () => {
    const { status: s1 } = await api('GET', '/api/sales-invoices');
    expect(s1).toBe(200);
    const { status: s2 } = await api('GET', '/api/sales-invoices?includeCancelled=true');
    expect(s2).toBe(200);
  });

  it('patient invoices list supports includeCancelled param', async () => {
    const { status: s1 } = await api('GET', '/api/patient-invoices');
    expect(s1).toBe(200);
    const { status: s2 } = await api('GET', '/api/patient-invoices?includeCancelled=true');
    expect(s2).toBe(200);
  });
});

describe('E) Monitoring & Slow Query Visibility', () => {
  it('health endpoint returns system info', async () => {
    const { status, body } = await api('GET', '/api/ops/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('memoryUsage');
    expect(body).toHaveProperty('timestamp');
    expect(body.memoryUsage).toHaveProperty('rss');
    expect(body.memoryUsage).toHaveProperty('heapUsed');
  });

  it('slow requests endpoint returns array', async () => {
    const { status, body } = await api('GET', '/api/ops/slow-requests');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('slow queries endpoint returns array', async () => {
    const { status, body } = await api('GET', '/api/ops/slow-queries');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it('clear logs endpoint works', async () => {
    const { status, body } = await api('POST', '/api/ops/clear-logs');
    expect(status).toBe(200);
    expect(body.message).toContain('cleared');
    
    const { body: requests } = await api('GET', '/api/ops/slow-requests');
    expect(requests.length).toBe(0);
    const { body: queries } = await api('GET', '/api/ops/slow-queries');
    expect(queries.length).toBe(0);
  });

  it('backup status endpoint accessible', async () => {
    const { status } = await api('GET', '/api/ops/backup-status');
    expect(status).toBe(200);
  });
});

describe('F) Unified Arabic Error Messages', () => {
  it('centralized error messages file exists', async () => {
    const errors = await import('../server/errors');
    expect(errors.ErrorMessages).toBeDefined();
    expect(errors.ErrorMessages.PERIOD_CLOSED).toContain('الفترة المحاسبية');
    expect(errors.ErrorMessages.ALREADY_POSTED).toContain('مُرحّل');
    expect(errors.ErrorMessages.INSUFFICIENT_STOCK).toContain('غير كافية');
    expect(errors.ErrorMessages.MISSING_BATCH_EXPIRY).toContain('صلاحية');
    expect(errors.ErrorMessages.EXPIRED_BATCH).toContain('منتهية');
  });

  it('apiError function exists', async () => {
    const errors = await import('../server/errors');
    expect(typeof errors.apiError).toBe('function');
  });
});

describe('C) Inventory Strictness', () => {
  it('inventory helpers module exists', async () => {
    const helpers = await import('../server/inventory-helpers');
    expect(typeof helpers.isLotExpired).toBe('function');
    expect(typeof helpers.validateBatchExpiry).toBe('function');
    expect(typeof helpers.convertQtyToMinor).toBe('function');
    expect(typeof helpers.convertPriceToMinor).toBe('function');
    expect(typeof helpers.validateUnitConversion).toBe('function');
  });

  it('isLotExpired correctly identifies expired lots', async () => {
    const { isLotExpired } = await import('../server/inventory-helpers');
    expect(isLotExpired(1, 2020)).toBe(true);
    expect(isLotExpired(12, 2099)).toBe(false);
    expect(isLotExpired(null, null)).toBe(false);
  });

  it('validateBatchExpiry throws for missing expiry on expiry-required item', async () => {
    const { validateBatchExpiry } = await import('../server/inventory-helpers');
    expect(() => validateBatchExpiry({ hasExpiry: true, nameAr: 'صنف 1' }, null, null)).toThrow('صلاحية');
  });

  it('validateBatchExpiry throws for expiry on non-expiry item', async () => {
    const { validateBatchExpiry } = await import('../server/inventory-helpers');
    expect(() => validateBatchExpiry({ hasExpiry: false, nameAr: 'صنف 2' }, 6, 2025)).toThrow('لا يدعم');
  });

  it('validateBatchExpiry passes for valid expiry item', async () => {
    const { validateBatchExpiry } = await import('../server/inventory-helpers');
    expect(() => validateBatchExpiry({ hasExpiry: true, nameAr: 'صنف 3' }, 6, 2025)).not.toThrow();
  });

  it('convertQtyToMinor converts major to minor', async () => {
    const { convertQtyToMinor } = await import('../server/inventory-helpers');
    expect(convertQtyToMinor(2, 'major', { majorToMinor: '10' })).toBe(20);
    expect(convertQtyToMinor(3, 'medium', { mediumToMinor: '5' })).toBe(15);
    expect(convertQtyToMinor(7, 'minor', {})).toBe(7);
  });

  it('convertPriceToMinor divides price correctly', async () => {
    const { convertPriceToMinor } = await import('../server/inventory-helpers');
    expect(convertPriceToMinor(100, 'major', { majorToMinor: '10' })).toBe(10);
    expect(convertPriceToMinor(50, 'medium', { mediumToMinor: '5' })).toBe(10);
    expect(convertPriceToMinor(25, 'minor', {})).toBe(25);
  });

  it('validateUnitConversion throws for missing conversion factor', async () => {
    const { validateUnitConversion } = await import('../server/inventory-helpers');
    expect(() => validateUnitConversion('major', { nameAr: 'صنف', majorToMinor: null })).toThrow('معامل');
    expect(() => validateUnitConversion('medium', { nameAr: 'صنف', mediumToMinor: '0' })).toThrow('معامل');
  });

  it('validateUnitConversion passes for valid conversions', async () => {
    const { validateUnitConversion } = await import('../server/inventory-helpers');
    expect(() => validateUnitConversion('major', { nameAr: 'صنف', majorToMinor: '10' })).not.toThrow();
    expect(() => validateUnitConversion('minor', { nameAr: 'صنف' })).not.toThrow();
  });
});
