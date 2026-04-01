export interface ReceiptSettings {
  header: string;
  footer: string;
  logoText: string;
  autoPrint: boolean;
  showPreview: boolean;
}

export interface ReceiptLine {
  itemName: string;
  qty: number;
  unitName: string;
  salePrice: number;
  lineTotal: number;
}

export interface ReceiptData {
  invoiceId: string;
  invoiceNumber: number;
  receiptNumber: number | null;
  invoiceDate: string;
  invoiceTime: string;
  warehouseName: string;
  cashierName: string;
  customerName: string;
  customerType: string;
  subtotal: number;
  discountValue: number;
  netTotal: number;
  lines: ReceiptLine[];
}

function fmt(n: number): string {
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildReceiptHtml(data: ReceiptData, settings: ReceiptSettings): string {
  const showDiscount = data.discountValue > 0;
  const docNumber = data.receiptNumber
    ? `إيصال #${data.receiptNumber}`
    : `فاتورة #${data.invoiceNumber}`;

  const linesHtml = data.lines.map((line) => `
    <tr>
      <td class="item-name">${line.itemName}</td>
      <td class="tc">${line.qty} ${line.unitName}</td>
      <td class="tl bold">${fmt(line.lineTotal)}</td>
    </tr>
    <tr>
      <td colspan="3" class="sub-line">${line.qty} × ${fmt(line.salePrice)}</td>
    </tr>`).join("");

  const discountHtml = showDiscount ? `
    <tr>
      <td class="lbl">الإجمالي قبل الخصم:</td>
      <td class="val">${fmt(data.subtotal)}</td>
    </tr>
    <tr>
      <td class="lbl">الخصم:</td>
      <td class="val">- ${fmt(data.discountValue)}</td>
    </tr>` : "";

  const footerHtml = settings.footer
    ? `<div class="divider"></div><div class="footer">${settings.footer}</div>`
    : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128&display=swap" rel="stylesheet">
<title>${docNumber}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12.5px;
    width: 80mm;
    color: #000;
    background: #fff;
    direction: rtl;
  }
  body { padding: 4mm 3mm 8mm; }
  .center   { text-align: center; }
  .bold     { font-weight: 700; }
  .big      { font-size: 15px; }
  .lbl      { text-align: right; }
  .val      { text-align: left; font-weight: 700; white-space: nowrap; }
  .tc       { text-align: center; white-space: nowrap; }
  .tl       { text-align: left; }
  .divider  { border-top: 1px dashed #000; margin: 4px 0; }
  .solid    { border-top: 2px solid #000; margin: 5px 0; }
  table     { width: 100%; border-collapse: collapse; }
  td        { vertical-align: top; padding: 1px 2px; }
  .item-name { font-size: 11.5px; max-width: 130px; word-break: break-word; }
  .sub-line  { font-size: 10px; color: #444; padding-right: 6px; padding-bottom: 3px; }
  .total-table td { padding: 2px 2px; font-size: 12.5px; }
  .total-row td   { font-size: 15px; font-weight: 700; }
  .info-row  { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 11.5px; }
  .barcode   { font-family: 'Libre Barcode 128', monospace; font-size: 60px; line-height: 1; letter-spacing: 0; text-align: center; display: block; }
  .barcode-num { text-align: center; font-size: 10px; letter-spacing: 4px; margin-top: 1px; }
  .footer    { font-size: 10.5px; text-align: center; white-space: pre-line; }
  .logo-text { font-size: 10px; text-align: center; margin-bottom: 2px; }
  @page { size: 80mm auto; margin: 0; }
  @media print {
    html, body { width: 80mm; }
  }
</style>
</head>
<body>
  ${settings.logoText ? `<div class="logo-text">${settings.logoText}</div>` : ""}
  <div class="center bold big">${settings.header}</div>
  ${data.warehouseName ? `<div class="center" style="font-size:10.5px;">${data.warehouseName}</div>` : ""}
  <div class="solid"></div>

  <div class="info-row"><span class="bold">${docNumber}</span><span>${data.invoiceDate}</span></div>
  <div class="info-row"><span>الكاشير: ${data.cashierName || "—"}</span><span>${data.invoiceTime}</span></div>
  ${data.customerName ? `<div class="info-row"><span>العميل: ${data.customerName}</span></div>` : ""}

  <div class="divider"></div>

  <table>
    <thead>
      <tr>
        <td class="bold" style="font-size:11px;">الصنف</td>
        <td class="bold tc" style="font-size:11px;">الكمية</td>
        <td class="bold tl" style="font-size:11px;">إجمالي</td>
      </tr>
    </thead>
    <tbody>${linesHtml}</tbody>
  </table>

  <div class="divider"></div>

  <table class="total-table">
    ${discountHtml}
    <tr class="total-row">
      <td class="lbl">الإجمالي:</td>
      <td class="val">${fmt(data.netTotal)} ج.م</td>
    </tr>
  </table>

  <div class="solid"></div>

  <div class="center" style="margin:3px 0 2px;">
    <span class="barcode">${data.invoiceNumber}</span>
    <div class="barcode-num">#${String(data.invoiceNumber).padStart(6, "0")}</div>
  </div>

  ${footerHtml}
  <div style="height:12mm;"></div>
</body>
</html>`;
}

function triggerIframePrint(iframe: HTMLIFrameElement): void {
  const iframeWin = iframe.contentWindow;
  const iframeDoc = iframe.contentDocument;
  if (!iframeWin || !iframeDoc) return;

  const doPrint = () => {
    iframeWin.focus();
    iframeWin.print();
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 5000);
  };

  if (iframeDoc.fonts && iframeDoc.fonts.ready) {
    iframeDoc.fonts.ready.then(doPrint).catch(() => setTimeout(doPrint, 800));
  } else {
    setTimeout(doPrint, 800);
  }
}

// ══════════════════════════════════════════════════════════════════
//  إيصال تسليم الدرج — Shift Handover Receipt
// ══════════════════════════════════════════════════════════════════
export interface ShiftHandoverData {
  receiptNumber: number | null;
  cashierName: string;
  unitName: string;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  cashSales: number;
  creditSales: number;
  creditCollected: number;
  deliveryCollected: number;
  returns: number;
  supplierPaid: number;
  netShift: number;
  closingCash: number;
  variance: number;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-EG", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function buildShiftHandoverHtml(data: ShiftHandoverData, settings: ReceiptSettings): string {
  const varianceLabel = data.variance > 0 ? "زيادة" : data.variance < 0 ? "عجز" : "—";
  const varianceColor = data.variance > 0 ? "#22863a" : data.variance < 0 ? "#c0392b" : "#000";

  function row(label: string, value: string, bold = false, color = "#000") {
    return `<tr>
      <td class="lbl">${label}</td>
      <td class="val" style="color:${color};${bold ? "font-size:14px;" : ""}">${value}</td>
    </tr>`;
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>إيصال تسليم درج</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12.5px;
    width: 80mm;
    color: #000;
    background: #fff;
    direction: rtl;
  }
  body { padding: 4mm 3mm 8mm; }
  .center   { text-align: center; }
  .bold     { font-weight: 700; }
  .big      { font-size: 15px; }
  .lbl      { text-align: right; padding: 2px 2px; }
  .val      { text-align: left; font-weight: 700; white-space: nowrap; padding: 2px 2px; }
  .divider  { border-top: 1px dashed #000; margin: 4px 0; }
  .solid    { border-top: 2px solid #000; margin: 5px 0; }
  table     { width: 100%; border-collapse: collapse; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 11px; }
  .section-title { font-size: 10px; text-align: center; background: #000; color: #fff; padding: 2px 0; margin: 3px 0; }
  .footer   { font-size: 10.5px; text-align: center; white-space: pre-line; }
  @page { size: 80mm auto; margin: 0; }
  @media print { html, body { width: 80mm; } }
</style>
</head>
<body>
  ${settings.logoText ? `<div style="font-size:10px;text-align:center;margin-bottom:2px;">${settings.logoText}</div>` : ""}
  <div class="center bold big">${settings.header}</div>
  <div class="solid"></div>

  <div class="center bold" style="font-size:13px;margin-bottom:1px;">إيصال تسليم درج</div>
  ${data.receiptNumber != null
    ? `<div style="text-align:center;font-size:22px;font-weight:900;letter-spacing:2px;border:2px solid #000;padding:3px 0;margin:3px 0;">
        # ${String(data.receiptNumber).padStart(6, "0")}
      </div>`
    : ""}

  <div class="info-row"><span class="bold">الكاشير:</span><span>${data.cashierName}</span></div>
  <div class="info-row"><span class="bold">الوحدة:</span><span>${data.unitName}</span></div>
  <div class="info-row"><span class="bold">فتح:</span><span style="font-size:10px;">${fmtTime(data.openedAt)}</span></div>
  <div class="info-row"><span class="bold">إغلاق:</span><span style="font-size:10px;">${fmtTime(data.closedAt)}</span></div>

  <div class="divider"></div>

  <!-- الداخل -->
  <div class="section-title">&#x2B07; الداخل</div>
  <table>
    ${data.openingCash > 0 ? row("رصيد الافتتاح:", fmt(data.openingCash)) : ""}
    ${row("تحصيل نقدي:", fmt(data.cashSales))}
    ${data.creditCollected > 0 ? row("تحصيل الآجل:", fmt(data.creditCollected)) : ""}
    ${data.deliveryCollected > 0 ? row("تحصيل التوصيل:", fmt(data.deliveryCollected)) : ""}
  </table>
  <div class="divider"></div>
  <table>
    ${row("إجمالي الداخل:", fmt(data.openingCash + data.cashSales + data.creditCollected + data.deliveryCollected), true)}
  </table>

  <div class="divider"></div>

  <!-- الخارج -->
  <div class="section-title">&#x2B06; الخارج</div>
  <table>
    ${data.returns > 0 ? row("مرتجعات:", fmt(data.returns)) : ""}
    ${data.supplierPaid > 0 ? row("منصرف موردين:", fmt(data.supplierPaid)) : ""}
    ${(data.returns === 0 && data.supplierPaid === 0) ? row("لا توجد مصروفات", "—") : ""}
  </table>
  <div class="divider"></div>
  <table>
    ${row("إجمالي الخارج:", fmt(data.returns + data.supplierPaid), true)}
  </table>

  ${data.creditSales > 0 ? `
  <div class="divider"></div>
  <table>
    ${row("آجل / تعاقد (للإعلام):", fmt(data.creditSales))}
  </table>` : ""}

  <div class="solid"></div>

  <table>
    ${row("إجمالي الخزنة:", fmt(data.netShift), true)}
  </table>

  <div class="solid"></div>

  <table>
    ${row("المحوَّل (الفعلي):", fmt(data.closingCash), true)}
    ${row(`الفرق (${varianceLabel}):`, fmt(Math.abs(data.variance)), false, varianceColor)}
  </table>

  <div class="solid"></div>

  ${settings.footer ? `<div class="footer">${settings.footer}</div>` : ""}
  <div style="height:12mm;"></div>
</body>
</html>`;
}

export function printShiftHandover(data: ShiftHandoverData, settings: ReceiptSettings): void {
  const html = buildShiftHandoverHtml(data, settings);

  const existing = document.getElementById("handover-print-frame");
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  const iframe = document.createElement("iframe");
  iframe.id = "handover-print-frame";
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:100mm;height:300mm;" +
    "border:0;opacity:0;pointer-events:none;z-index:-1;";

  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(html);
  doc.close();

  iframe.onload = () => triggerIframePrint(iframe);
}

export function printReceipt(data: ReceiptData, settings: ReceiptSettings): void {
  const html = buildReceiptHtml(data, settings);

  const existing = document.getElementById("receipt-print-frame");
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  const iframe = document.createElement("iframe");
  iframe.id = "receipt-print-frame";
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:100mm;height:300mm;" +
    "border:0;opacity:0;pointer-events:none;z-index:-1;";

  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(html);
  doc.close();

  iframe.onload = () => triggerIframePrint(iframe);
}
