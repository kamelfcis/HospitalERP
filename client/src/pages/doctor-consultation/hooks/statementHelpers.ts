export interface DeptTotal {
  departmentId: string;
  departmentName: string;
  total: number;
}

export interface DeptInfo {
  id: string;
  name: string;
}

export interface StatementTotals {
  consultationFee: number;
  drugsTotal: number;
  secretaryTotal: number;
  deptTotals: Record<string, number>;
}

export interface ExecSummary {
  totalOrders: number;
  executedOrders: number;
}

export interface StatementRow {
  totalOrders?: number | string;
  executedOrders?: number | string;
  consultationFee?: number | string;
  drugsTotal?: number | string;
  secretaryFeeType?: string | null;
  secretaryFeeValue?: string | number | null;
  servicesByDepartment?: string | any[];
}

export function fmt(val: any): string {
  const n = parseFloat(String(val || 0));
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseDeptServices(raw: string | any[] | undefined | null): DeptTotal[] {
  try {
    if (!raw) return [];
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((d: any) => ({
        departmentId: d.departmentId || "__none__",
        departmentName: d.departmentName || "بدون قسم",
        total: parseFloat(String(d.total || 0)),
      }))
      .filter((d: DeptTotal) => d.total > 0);
  } catch {
    return [];
  }
}

export function calcSecretaryFee(consultationFee: number, feeType?: string | null, feeValue?: string | number | null): number {
  if (!feeType || !feeValue) return 0;
  const val = parseFloat(String(feeValue)) || 0;
  if (feeType === "percentage") return (consultationFee * val) / 100;
  if (feeType === "fixed") return val;
  return 0;
}

export function filterRows(rows: StatementRow[], execFilter: string): StatementRow[] {
  if (execFilter === "all") return rows;
  return rows.filter((r) => {
    const total = parseInt(String(r.totalOrders || 0));
    const executed = parseInt(String(r.executedOrders || 0));
    if (execFilter === "executed") return total > 0 && executed >= total;
    if (execFilter === "pending") return total === 0 || executed < total;
    return true;
  });
}

export function collectDeptNames(rows: StatementRow[]): DeptInfo[] {
  const deptSet = new Map<string, string>();
  rows.forEach((r) => {
    const depts = parseDeptServices(r.servicesByDepartment);
    depts.forEach((d) => deptSet.set(d.departmentId, d.departmentName));
  });
  return Array.from(deptSet.entries()).map(([id, name]) => ({ id, name }));
}

export function computeTotals(rows: StatementRow[], deptNames: DeptInfo[]): StatementTotals {
  let consultationFee = 0;
  let drugsTotal = 0;
  let secretaryTotal = 0;
  const deptTotals: Record<string, number> = {};
  deptNames.forEach((d) => (deptTotals[d.id] = 0));

  rows.forEach((r) => {
    const cf = parseFloat(String(r.consultationFee || 0));
    consultationFee += cf;
    drugsTotal += parseFloat(String(r.drugsTotal || 0));
    secretaryTotal += calcSecretaryFee(cf, r.secretaryFeeType, r.secretaryFeeValue);
    const depts = parseDeptServices(r.servicesByDepartment);
    depts.forEach((d) => {
      deptTotals[d.departmentId] = (deptTotals[d.departmentId] || 0) + d.total;
    });
  });
  return { consultationFee, drugsTotal, secretaryTotal, deptTotals };
}

export function computeExecSummary(rows: StatementRow[]): ExecSummary {
  let totalOrders = 0;
  let executedOrders = 0;
  rows.forEach((r) => {
    totalOrders += parseInt(String(r.totalOrders || 0));
    executedOrders += parseInt(String(r.executedOrders || 0));
  });
  return { totalOrders, executedOrders };
}
