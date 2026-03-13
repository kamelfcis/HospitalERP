/**
 * ReceptionTicketPrint
 * ---------------------
 * Prints a queue / reception slip on a small thermal printer (80mm / 58mm).
 * Opens a dedicated popup window so nothing on the main page is hidden/affected.
 *
 * Usage:
 *   import { printReceptionTicket } from "@/components/printing/ReceptionTicketPrint";
 *   printReceptionTicket({ ... });
 */

export interface ReceptionTicketData {
  patientName:   string;
  visitType:     "consultation" | "lab" | "radiology" | "admission" | string;
  departmentName: string;
  clinicName?:   string | null;
  doctorName?:   string | null;
  turnNumber?:   number | string | null;
  paymentType?:  "CASH" | "INSURANCE" | "CONTRACT" | string;
  contractName?: string | null;
}

const VISIT_LABELS: Record<string, string> = {
  consultation: "كشف",
  lab:          "تحاليل",
  radiology:    "أشعة",
  admission:    "تسكين",
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH:      "نقدي",
  INSURANCE: "تأمين",
  CONTRACT:  "تعاقد",
};

function formatDate(d: Date): string {
  const day   = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year  = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatTime(d: Date): string {
  let hours   = d.getHours();
  const mins  = String(d.getMinutes()).padStart(2, "0");
  const ampm  = hours >= 12 ? "م" : "ص";
  hours       = hours % 12 || 12;
  return `${hours}:${mins} ${ampm}`;
}

export function printReceptionTicket(data: ReceptionTicketData): void {
  const now        = new Date();
  const dateStr    = formatDate(now);
  const timeStr    = formatTime(now);
  const visitLabel = VISIT_LABELS[data.visitType] ?? data.visitType ?? "زيارة";
  const payLabel   = PAYMENT_LABELS[data.paymentType ?? ""] ?? "";
  const turnNum    = data.turnNumber ?? null;

  const clinicRow = data.clinicName
    ? `<div class="row"><span class="lbl">العيادة</span><span class="val">${data.clinicName}</span></div>`
    : "";

  const doctorRow = data.doctorName
    ? `<div class="row"><span class="lbl">الطبيب</span><span class="val">${data.doctorName}</span></div>`
    : "";

  const queueRow = data.visitType === "consultation" && turnNum != null
    ? `<div class="queue-box"><span class="queue-label">رقم دورك في الطابور</span><span class="queue-num">${turnNum}</span></div>`
    : "";

  const paymentRow = payLabel
    ? `<div class="row"><span class="lbl">الدفع</span><span class="val">${payLabel}${data.contractName ? ` — ${data.contractName}` : ""}</span></div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>تذكرة استقبال</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Cairo', 'Noto Sans Arabic', Tahoma, sans-serif;
      direction: rtl;
      background: #fff;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 8mm 4mm;
    }

    .ticket {
      width: 72mm;
      max-width: 100%;
      padding: 0;
      text-align: center;
    }

    /* ─── Header ─── */
    .header {
      border-top:    2px dashed #333;
      border-bottom: 2px dashed #333;
      padding: 6px 0 5px;
      margin-bottom: 8px;
    }
    .hospital-name-ar {
      font-size: 13pt;
      font-weight: 900;
      line-height: 1.3;
      letter-spacing: 0.02em;
    }
    .hospital-name-en {
      font-size: 7.5pt;
      color: #555;
      margin-top: 2px;
      letter-spacing: 0.04em;
    }

    /* ─── Queue box ─── */
    .queue-box {
      background: #f0f4ff;
      border: 1.5px solid #334;
      border-radius: 6px;
      padding: 8px 6px 6px;
      margin: 8px 0 10px;
      text-align: center;
    }
    .queue-label {
      font-size: 7.5pt;
      color: #444;
      display: block;
      margin-bottom: 2px;
    }
    .queue-num {
      font-size: 28pt;
      font-weight: 900;
      line-height: 1;
      color: #111;
      display: block;
      letter-spacing: 0.05em;
    }

    /* ─── Patient name ─── */
    .patient-name {
      font-size: 12.5pt;
      font-weight: 700;
      margin: 6px 0 10px;
      line-height: 1.3;
    }

    /* ─── Rows ─── */
    .section {
      border-top: 1px dashed #aaa;
      padding-top: 6px;
      margin-top: 4px;
      text-align: right;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 4px;
      margin-bottom: 5px;
      font-size: 9pt;
    }
    .lbl {
      color: #555;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .val {
      font-weight: 700;
      color: #111;
      text-align: left;
      word-break: break-word;
    }

    /* ─── Visit type badge ─── */
    .visit-badge {
      display: inline-block;
      background: #111;
      color: #fff;
      border-radius: 4px;
      padding: 2px 10px;
      font-size: 10pt;
      font-weight: 700;
      margin: 6px 0 8px;
    }

    /* ─── Footer ─── */
    .footer {
      border-top: 2px dashed #333;
      margin-top: 10px;
      padding-top: 6px;
      font-size: 8pt;
      color: #333;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
    }

    /* ─── Print ─── */
    @media print {
      body { padding: 0; }
      .ticket { width: 72mm; }
      @page {
        margin: 4mm;
        size: 80mm auto;
      }
    }
  </style>
</head>
<body>
  <div class="ticket">

    <div class="header">
      <div class="hospital-name-ar">مستشفى النيل التخصصي</div>
      <div class="hospital-name-en">Nile Specialized Hospital</div>
    </div>

    ${queueRow}

    <div class="patient-name">${data.patientName}</div>

    <div class="section">
      <div class="row">
        <span class="lbl">القسم</span>
        <span class="val">${data.departmentName || "غير محدد"}</span>
      </div>
      ${clinicRow}
      ${doctorRow}
      ${paymentRow}
    </div>

    <div style="margin-top:8px;">
      <span class="visit-badge">نوع الزيارة : ${visitLabel}</span>
    </div>

    <div class="footer">
      <span>${dateStr}</span>
      <span>${timeStr}</span>
    </div>

  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 350);
    };
  </script>
</body>
</html>`;

  const popup = window.open("", "_blank", "width=400,height=600,scrollbars=no,toolbar=no,menubar=no");
  if (!popup) {
    console.warn("[ReceptionTicketPrint] Popup blocked — ask user to allow popups.");
    return;
  }
  popup.document.write(html);
  popup.document.close();
}
