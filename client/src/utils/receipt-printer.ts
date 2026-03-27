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

  const autoClose = settings.showPreview ? "" : `window.addEventListener("afterprint", function(){ window.close(); });`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
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
  .xl       { font-size: 19px; }
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
<script>
  window.onload = function() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function() {
        window.print();
        ${autoClose}
      });
    } else {
      setTimeout(function() { window.print(); ${autoClose} }, 600);
    }
  };
</script>
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
    <tbody>
      ${linesHtml}
    </tbody>
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

export function printReceipt(data: ReceiptData, settings: ReceiptSettings): void {
  const html = buildReceiptHtml(data, settings);
  const width  = 350;
  const height = 700;
  const left   = Math.max(0, (window.screen.width  - width)  / 2);
  const top    = Math.max(0, (window.screen.height - height) / 2);

  const popup = window.open(
    "",
    `receipt_${data.invoiceNumber}`,
    `width=${width},height=${height},top=${top},left=${left},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
  );

  if (!popup) {
    console.warn("Popup blocked — cannot print receipt");
    return;
  }

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}
