import type { AggregatedViewData, AggregatedInvoice, VisitGroup, DepartmentGroup, ClassificationGroup } from "../../shared/types";
import type { ConsolidatedViewMode } from "../../shared/types";

function money(v: number): string {
  return v.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function printHtml(html: string, title: string) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { window.print(); return; }
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Cairo', 'Segoe UI', Arial, sans-serif; font-size: 10pt; color: #111; direction: rtl; }
    h1 { font-size: 14pt; margin: 0 0 4px 0; }
    h2 { font-size: 11pt; margin: 12px 0 4px 0; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
    .header-block { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .patient-info { font-size: 9pt; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: right; }
    th { background: #f3f4f6; font-weight: 600; font-size: 9pt; }
    td { font-size: 9pt; }
    .num { text-align: center; font-variant-numeric: tabular-nums; }
    tfoot td { background: #f9fafb; font-weight: 700; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 8pt; border: 1px solid #ddd; }
    .badge-green { background: #f0fdf4; color: #166534; border-color: #bbf7d0; }
    .badge-amber  { background: #fffbeb; color: #92400e; border-color: #fde68a; }
    .balance-red  { color: #dc2626; font-weight: 700; }
    .balance-ok   { color: #16a34a; font-weight: 700; }
    .totals-block { margin-top: 16px; border: 1.5px solid #374151; border-radius: 4px; padding: 10px 14px; }
    .totals-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
    .total-item { text-align: center; }
    .total-label { font-size: 8pt; color: #6b7280; }
    .total-value { font-size: 11pt; font-weight: 700; }
    @media print { button { display: none !important; } }
  </style>
</head>
<body>${html}<br/><div style="text-align:center;font-size:8pt;color:#999;margin-top:20px">طُبع بتاريخ: ${new Date().toLocaleString("ar-EG")}</div>
<script>window.onload=()=>window.print()</script>
</body></html>`);
  w.document.close();
}

function buildTotalsBlock(totals: AggregatedViewData["totals"], showPaid: boolean): string {
  return `<div class="totals-block">
    <div class="totals-grid">
      <div class="total-item"><div class="total-label">إجمالي الفواتير</div><div class="total-value">${money(totals.totalAmount)}</div></div>
      <div class="total-item"><div class="total-label">إجمالي الخصومات</div><div class="total-value">${money(totals.discountAmount)}</div></div>
      <div class="total-item"><div class="total-label">الصافي المستحق</div><div class="total-value">${money(totals.netAmount)}</div></div>
      ${showPaid ? `<div class="total-item"><div class="total-label">المدفوع</div><div class="total-value">${money(totals.paidAmount)}</div></div>` : ""}
      ${showPaid ? `<div class="total-item"><div class="total-label">المتبقي</div><div class="total-value ${totals.remaining > 0.01 ? "balance-red" : "balance-ok"}">${money(totals.remaining)}</div></div>` : ""}
    </div>
  </div>`;
}

function buildPatientHeader(patientName: string, invoiceCount: number): string {
  return `<div class="header-block">
    <div>
      <h1>${patientName}</h1>
      <div class="patient-info">إجمالي الفواتير: ${invoiceCount}</div>
    </div>
    <div class="patient-info">${new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</div>
  </div>`;
}

export function printByVisit(
  data: AggregatedViewData,
  patientName: string,
  showPaid: boolean,
) {
  const rows = data.byVisit.map(v => `
    <tr>
      <td>${v.visitLabel}</td>
      <td>${v.visitType === "inpatient" ? "داخلي" : v.visitType === "outpatient" ? "خارجي" : "مستقل"}</td>
      <td>${v.departments.join("، ")}</td>
      <td class="num">${v.invoiceCount}</td>
      <td class="num">${money(v.totalAmount)}</td>
      <td class="num">${v.discountAmount > 0 ? `(${money(v.discountAmount)})` : "—"}</td>
      <td class="num">${money(v.netAmount)}</td>
      ${showPaid ? `<td class="num">${money(v.paidAmount)}</td>
      <td class="num ${v.remaining > 0.01 ? "balance-red" : "balance-ok"}">${money(v.remaining)}</td>` : ""}
    </tr>`).join("");

  const html = buildPatientHeader(patientName, data.totals.invoiceCount)
    + `<h2>ملخص الفاتورة المجمعة — حسب الزيارة</h2>
    <table>
      <thead><tr>
        <th>الزيارة</th><th>النوع</th><th>الأقسام</th><th class="num">الفواتير</th>
        <th class="num">الإجمالي</th><th class="num">الخصم</th><th class="num">الصافي</th>
        ${showPaid ? "<th class=\"num\">المدفوع</th><th class=\"num\">المتبقي</th>" : ""}
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="4">الإجمالي</td>
        <td class="num">${money(data.byVisit.reduce((s,v)=>s+v.totalAmount,0))}</td>
        <td class="num">(${money(data.byVisit.reduce((s,v)=>s+v.discountAmount,0))})</td>
        <td class="num">${money(data.byVisit.reduce((s,v)=>s+v.netAmount,0))}</td>
        ${showPaid ? `<td class="num">${money(data.byVisit.reduce((s,v)=>s+v.paidAmount,0))}</td><td class="num ${data.totals.remaining>0.01?"balance-red":"balance-ok"}">${money(data.totals.remaining)}</td>` : ""}
      </tr></tfoot>
    </table>`
    + buildTotalsBlock(data.totals, showPaid);

  printHtml(html, `ملف المريض — ${patientName}`);
}

export function printByDepartment(
  data: AggregatedViewData,
  patientName: string,
  showPaid: boolean,
) {
  const rows = data.byDepartment.map(d => `
    <tr>
      <td>${d.departmentName}</td>
      <td class="num">${d.invoiceCount}</td>
      <td class="num">${money(d.totalAmount)}</td>
      <td class="num">${d.discountAmount > 0 ? `(${money(d.discountAmount)})` : "—"}</td>
      <td class="num">${money(d.netAmount)}</td>
      ${showPaid ? `<td class="num">${money(d.paidAmount)}</td><td class="num ${d.remaining > 0.01 ? "balance-red" : "balance-ok"}">${money(d.remaining)}</td>` : ""}
    </tr>`).join("");

  const html = buildPatientHeader(patientName, data.totals.invoiceCount)
    + `<h2>ملخص الفاتورة المجمعة — حسب القسم</h2>
    <table>
      <thead><tr>
        <th>القسم</th><th class="num">الفواتير</th><th class="num">الإجمالي</th>
        <th class="num">الخصم</th><th class="num">الصافي</th>
        ${showPaid ? "<th class=\"num\">المدفوع</th><th class=\"num\">المتبقي</th>" : ""}
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td colspan="2">الإجمالي</td>
        <td class="num">${money(data.byDepartment.reduce((s,d)=>s+d.totalAmount,0))}</td>
        <td class="num">(${money(data.byDepartment.reduce((s,d)=>s+d.discountAmount,0))})</td>
        <td class="num">${money(data.totals.netAmount)}</td>
        ${showPaid ? `<td class="num">${money(data.totals.paidAmount)}</td><td class="num ${data.totals.remaining>0.01?"balance-red":"balance-ok"}">${money(data.totals.remaining)}</td>` : ""}
      </tr></tfoot>
    </table>`
    + buildTotalsBlock(data.totals, showPaid);

  printHtml(html, `ملف المريض — ${patientName}`);
}

export function printByClassification(
  data: AggregatedViewData,
  patientName: string,
  showPaid: boolean,
) {
  const labelMap: Record<string, string> = { service: "خدمات", drug: "أدوية", consumable: "مستهلكات", equipment: "أجهزة" };
  const rows = data.byClassification.map(c => `
    <tr>
      <td>${labelMap[c.lineType] ?? c.lineTypeLabel}</td>
      <td class="num">${c.lineCount}</td>
      <td class="num">${money(c.totalAmount)}</td>
      <td class="num">${c.discountAmount > 0 ? `(${money(c.discountAmount)})` : "—"}</td>
      <td class="num">${money(c.netAmount)}</td>
      ${showPaid ? `<td class="num">${money(c.paidAmount)}</td><td class="num ${c.remaining > 0.01 ? "balance-red" : "balance-ok"}">${money(c.remaining)}</td>` : ""}
    </tr>`).join("");

  const html = buildPatientHeader(patientName, data.totals.invoiceCount)
    + `<h2>ملخص الفاتورة المجمعة — حسب التصنيف</h2>
    <table>
      <thead><tr>
        <th>التصنيف</th><th class="num">البنود</th><th class="num">الإجمالي</th>
        <th class="num">الخصم</th><th class="num">الصافي</th>
        ${showPaid ? "<th class=\"num\">المدفوع</th><th class=\"num\">المتبقي</th>" : ""}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    + buildTotalsBlock(data.totals, showPaid);

  printHtml(html, `ملف المريض — ${patientName}`);
}

export function printDetailed(
  patientName: string,
  invoiceCount: number,
) {
  alert("لطباعة التفصيلي الكامل، استخدم زر طباعة الصفحة بعد الانتقال لوضع العرض التفصيلي");
  void invoiceCount;
  void patientName;
}

export function dispatchPrint(
  mode: ConsolidatedViewMode,
  data: AggregatedViewData,
  patientName: string,
  showPaid: boolean,
) {
  switch (mode) {
    case "visit":          return printByVisit(data, patientName, showPaid);
    case "department":     return printByDepartment(data, patientName, showPaid);
    case "classification": return printByClassification(data, patientName, showPaid);
    case "detailed":       return printDetailed(patientName, data.totals.invoiceCount);
  }
}
