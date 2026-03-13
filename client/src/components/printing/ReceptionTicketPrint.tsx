/**
 * ReceptionTicketPrint
 * ---------------------
 * Prints a queue / reception slip on a small thermal printer (80mm / 58mm).
 * Opens a dedicated popup window so nothing on the main page is hidden/affected.
 *
 * Used in two contexts:
 *  1. PatientFormDialog (OPD consultation / lab / radiology)
 *  2. ReceptionSheet (inpatient admission)
 *
 * Usage:
 *   import { printReceptionTicket } from "@/components/printing/ReceptionTicketPrint";
 *   printReceptionTicket({ ... });
 */

export interface ReceptionTicketData {
  patientName:    string;
  visitType:      "consultation" | "lab" | "radiology" | "admission" | string;
  departmentName: string;

  /* OPD-specific */
  clinicName?:    string | null;
  doctorName?:    string | null;
  turnNumber?:    number | string | null;

  /* Admission-specific */
  floorName?:     string | null;
  roomName?:      string | null;
  roomNumber?:    string | null;
  roomGrade?:     string | null;   /* درجة الغرفة */
  bedNumber?:     string | null;
  surgeryType?:   string | null;

  /* Shared */
  paymentType?:   "CASH" | "INSURANCE" | "CONTRACT" | "cash" | "contract" | string;
  contractName?:  string | null;
}

const VISIT_LABELS: Record<string, string> = {
  consultation: "كشف",
  lab:          "تحاليل",
  radiology:    "أشعة",
  admission:    "تسكين",
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH:     "نقدي",
  cash:     "نقدي",
  INSURANCE: "تأمين",
  CONTRACT:  "تعاقد",
  contract:  "تعاقد / تأمين",
};

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(d: Date): string {
  const day   = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year  = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatTime(d: Date): string {
  let hours  = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "م" : "ص";
  hours      = hours % 12 || 12;
  return `${hours}:${mins} ${ampm}`;
}

function row(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<div class="row"><span class="lbl">${label}</span><span class="val">${esc(value)}</span></div>`;
}

export function printReceptionTicket(data: ReceptionTicketData): void {
  const now        = new Date();
  const dateStr    = formatDate(now);
  const timeStr    = formatTime(now);
  const visitLabel = VISIT_LABELS[data.visitType] ?? data.visitType ?? "زيارة";
  const payLabel   = PAYMENT_LABELS[data.paymentType ?? ""] ?? "";

  /* ── OPD queue box (only for consultation with turn number) ── */
  const queueRow = data.visitType === "consultation" && data.turnNumber != null
    ? `<div class="queue-box">
         <span class="queue-label">رقم دورك في الطابور</span>
         <span class="queue-num">${esc(String(data.turnNumber))}</span>
       </div>`
    : "";

  /* ── Admission bed box ── */
  const bedBox = data.visitType === "admission" && (data.roomName || data.bedNumber)
    ? `<div class="bed-box">
         <span class="bed-label">السرير المخصص</span>
         <span class="bed-num">${esc(data.bedNumber ?? "—")}</span>
         ${data.roomName
           ? `<span class="bed-room">${esc(data.roomName)}${data.roomNumber ? ` (${esc(data.roomNumber)})` : ""}</span>`
           : ""}
       </div>`
    : "";

  /* ── Details section rows ── */
  const detailsRows = data.visitType === "admission"
    ? [
        row("الطابق",       data.floorName),
        row("الغرفة",       data.roomName
              ? `${data.roomName}${data.roomNumber ? ` (${data.roomNumber})` : ""}`
              : null),
        row("درجة الغرفة",  data.roomGrade ?? (data.roomGrade === null ? "بدون درجة" : null)),
        row("الطبيب",       data.doctorName),
        row("نوع العملية",  data.surgeryType),
        row("الدفع",        payLabel
              ? `${payLabel}${data.contractName ? ` — ${esc(data.contractName)}` : ""}`
              : null),
      ].join("")
    : [
        row("القسم",        data.departmentName),
        row("العيادة",      data.clinicName),
        row("الطبيب",       data.doctorName),
        row("الدفع",        payLabel
              ? `${payLabel}${data.contractName ? ` — ${esc(data.contractName)}` : ""}`
              : null),
      ].join("");

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
      text-align: center;
    }

    /* ─── Hospital header ─── */
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
    }
    .hospital-name-en {
      font-size: 7.5pt;
      color: #555;
      margin-top: 2px;
      letter-spacing: 0.04em;
    }

    /* ─── OPD queue box ─── */
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
    }

    /* ─── Admission bed box ─── */
    .bed-box {
      background: #fff8f0;
      border: 1.5px solid #a05a00;
      border-radius: 6px;
      padding: 8px 6px 6px;
      margin: 8px 0 10px;
      text-align: center;
    }
    .bed-label {
      font-size: 7.5pt;
      color: #7a4500;
      display: block;
      margin-bottom: 2px;
    }
    .bed-num {
      font-size: 26pt;
      font-weight: 900;
      line-height: 1;
      color: #7a4500;
      display: block;
    }
    .bed-room {
      font-size: 8pt;
      color: #7a4500;
      display: block;
      margin-top: 3px;
      font-weight: 600;
    }

    /* ─── Patient name ─── */
    .patient-name {
      font-size: 12.5pt;
      font-weight: 700;
      margin: 6px 0 10px;
      line-height: 1.3;
    }

    /* ─── Details rows ─── */
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

    @media print {
      body { padding: 0; }
      .ticket { width: 72mm; }
      @page { margin: 4mm; size: 80mm auto; }
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
    ${bedBox}

    <div class="patient-name">${esc(data.patientName)}</div>

    <div class="section">
      ${detailsRows}
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

  const popup = window.open("", "_blank", "width=400,height=650,scrollbars=no,toolbar=no,menubar=no");
  if (!popup) {
    console.warn("[ReceptionTicketPrint] Popup blocked — allow popups for this site.");
    return;
  }
  popup.document.write(html);
  popup.document.close();
}
