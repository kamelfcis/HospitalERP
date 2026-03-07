/**
 * AdmissionsTab — تبويب إقامات المرضى داخل شاشة فاتورة المريض.
 *
 * الوضع الأول (قائمة): جدول مدمج يعرض جميع الإقامات مع فلاتر متعددة.
 * الوضع الثاني (تفاصيل): عند اختيار إقامة يُعرض كارد التفاصيل + فواتير + تقرير.
 *
 * المكونات الفرعية:
 *   - AdmissionList   → القائمة + AdmissionRow    (./AdmissionList.tsx)
 *   - AdmissionDetail → وضع التفاصيل             (./AdmissionDetail.tsx)
 *   - admission-types → الأنواع والثوابت المشتركة  (./admission-types.ts)
 */
import type { Department, PatientInvoiceHeader } from "@shared/schema";
import type { AdmissionWithLatestInvoice } from "./admission-types";
import { AdmissionList }   from "./AdmissionList";
import { AdmissionDetail } from "./AdmissionDetail";

// ─── Props Interface ───────────────────────────────────────────────────────────

interface AdmissionsTabProps {
  // ── الإقامة المختارة (وضع التفاصيل) ──────────────────
  admSelectedAdmission: AdmissionWithLatestInvoice | null;
  setAdmSelectedAdmission: (a: AdmissionWithLatestInvoice | null) => void;
  admDetail: AdmissionWithLatestInvoice | undefined;

  // ── العمليات على الإقامة ──────────────────────────────
  admDischargeMutation:    { mutate: (id: string) => void; isPending: boolean };
  admConsolidateMutation:  { mutate: (id: string) => void; isPending: boolean };

  // ── فواتير الإقامة (وضع التفاصيل) ────────────────────
  admInvoicesLoading: boolean;
  admInvoices: PatientInvoiceHeader[] | undefined;

  // ── تقرير الطباعة ─────────────────────────────────────
  admPrintDeptId: string;
  setAdmPrintDeptId: (v: string) => void;
  departments: Department[] | undefined;
  admReportLoading: boolean;
  admReportData: any;
  admInvoicesByDepartment: Record<string, PatientInvoiceHeader[]>;
  admTotalAllInvoices: number;
  admFilteredPrintInvoices: Record<string, PatientInvoiceHeader[]>;
  admPrintRef: React.RefObject<HTMLDivElement>;

  // ── قائمة الإقامات (وضع القائمة) ─────────────────────
  admAllAdmissions: AdmissionWithLatestInvoice[] | undefined;
  admListLoading: boolean;

  // ── فلاتر القائمة ──────────────────────────────────────
  admSearchQuery:   string;
  setAdmSearchQuery: (v: string) => void;
  admStatusFilter:   string;
  setAdmStatusFilter: (v: string) => void;
  admDeptFilter:     string;
  setAdmDeptFilter:  (v: string) => void;
  admDateFrom:       string;
  setAdmDateFrom:    (v: string) => void;
  admDateTo:         string;
  setAdmDateTo:      (v: string) => void;

  // ── props غير مستخدمة حالياً (محفوظة للتوافق) ─────────
  admIsCreateOpen: boolean;
  setAdmIsCreateOpen: (v: boolean) => void;
  admFormData: any;
  setAdmFormData: (v: any) => void;
  admPatientSearch: string;
  setAdmPatientSearch: (v: string) => void;
  admPatientResults: any[];
  admSearchingPatients: boolean;
  admShowPatientDropdown: boolean;
  setAdmShowPatientDropdown: (v: boolean) => void;
  admPatientSearchRef: React.RefObject<HTMLInputElement>;
  admPatientDropdownRef: React.RefObject<HTMLDivElement>;
  admHandleSelectPatient: (patient: any) => void;
  admHandleCloseCreate: () => void;
  admHandleCreateSubmit: () => void;
  admCreateMutation: { isPending: boolean };

  // ── دوال مساعدة قديمة (محفوظة للتوافق مع وضع التفاصيل) ─
  admGetStatusBadgeClass: (s: string) => string;
  admStatusLabels: Record<string, string>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdmissionsTab({
  admSelectedAdmission, setAdmSelectedAdmission,
  admDetail, admDischargeMutation, admConsolidateMutation,
  admInvoicesLoading, admInvoices,
  admPrintDeptId, setAdmPrintDeptId, departments,
  admReportLoading, admReportData,
  admInvoicesByDepartment, admTotalAllInvoices, admFilteredPrintInvoices,
  admPrintRef,
  admAllAdmissions, admListLoading,
  admSearchQuery, setAdmSearchQuery,
  admStatusFilter, setAdmStatusFilter,
  admDeptFilter, setAdmDeptFilter,
  admDateFrom, setAdmDateFrom,
  admDateTo, setAdmDateTo,
  admGetStatusBadgeClass, admStatusLabels,
}: AdmissionsTabProps) {

  return (
    <>
      {/* ── Print CSS (مخفي في الشاشة، يظهر عند الطباعة فقط) ── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #adm-print-area, #adm-print-area * { visibility: visible !important; }
          #adm-print-area {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 210mm !important; padding: 10mm !important;
            font-size: 11pt !important; direction: rtl !important;
          }
          #adm-print-area table { width: 100% !important; border-collapse: collapse !important; }
          #adm-print-area th, #adm-print-area td {
            border: 1px solid #333 !important; padding: 4px 8px !important;
            text-align: right !important; font-size: 10pt !important;
          }
          #adm-print-area th {
            background: #eee !important; font-weight: bold !important;
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {admSelectedAdmission
        ? <AdmissionDetail
            adm={admDetail || admSelectedAdmission}
            onBack={() => setAdmSelectedAdmission(null)}
            admDischargeMutation={admDischargeMutation}
            admConsolidateMutation={admConsolidateMutation}
            admInvoicesLoading={admInvoicesLoading}
            admInvoices={admInvoices}
            admPrintDeptId={admPrintDeptId}
            setAdmPrintDeptId={setAdmPrintDeptId}
            departments={departments}
            admReportLoading={admReportLoading}
            admReportData={admReportData}
            admInvoicesByDepartment={admInvoicesByDepartment}
            admTotalAllInvoices={admTotalAllInvoices}
            admFilteredPrintInvoices={admFilteredPrintInvoices}
            admPrintRef={admPrintRef}
            admGetStatusBadgeClass={admGetStatusBadgeClass}
            admStatusLabels={admStatusLabels}
          />
        : <AdmissionList
            rows={admAllAdmissions}
            loading={admListLoading}
            searchQuery={admSearchQuery}
            onSearchChange={setAdmSearchQuery}
            statusFilter={admStatusFilter}
            onStatusChange={setAdmStatusFilter}
            deptFilter={admDeptFilter}
            onDeptChange={setAdmDeptFilter}
            departments={departments}
            dateFrom={admDateFrom}
            onDateFromChange={setAdmDateFrom}
            dateTo={admDateTo}
            onDateToChange={setAdmDateTo}
            onSelect={setAdmSelectedAdmission}
          />
      }
    </>
  );
}
