import { useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit2, Trash2, FileText, FolderOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { AmountCell, PatientTypeBadge, InvoiceStatusBadge, TotalsRow } from "./PatientCells";
import type { PatientGridProps, PatientRowProps } from "./types";

function PatientRow({ patient: p, index, dimmed, canViewInvoice, canEdit, canAdmit, onEdit, onDelete, onOpenInvoice, onViewFile }: PatientRowProps) {
  const rowClass = `peachtree-grid-row${dimmed ? " opacity-50" : ""}`;

  return (
    <tr className={rowClass} data-testid={`row-patient-${p.id}`}>
      <td className="sticky-col-right text-center text-muted-foreground" style={{ right: 0, width: 36 }}>{index}</td>
      <td className="sticky-col-right sticky-name-shadow font-medium whitespace-nowrap px-3" style={{ right: 36, minWidth: 160 }} data-testid={`text-name-${p.id}`}>{p.fullName}</td>
      <td className="text-muted-foreground whitespace-nowrap px-3" style={{ minWidth: 120 }} data-testid={`text-doctor-${p.id}`}>{p.latestDoctorName || "—"}</td>
      <td className="font-mono whitespace-nowrap px-3" style={{ minWidth: 110 }} data-testid={`text-phone-${p.id}`}>{p.phone || "—"}</td>
      <td className="font-mono whitespace-nowrap px-3 text-muted-foreground" style={{ minWidth: 120 }} data-testid={`text-national-id-${p.id}`}>{p.nationalId || "—"}</td>
      <td className="text-center px-2" style={{ minWidth: 44 }} data-testid={`text-age-${p.id}`}>{p.age ?? "—"}</td>
      <PatientTypeBadge type={p.latestPatientType} />
      <AmountCell value={+p.servicesTotal} />
      <AmountCell value={+p.orRoomTotal} />
      <AmountCell value={+p.equipmentTotal} />
      <AmountCell value={+p.drugsTotal} />
      <AmountCell value={+p.consumablesTotal} />
      <AmountCell value={+p.gasTotal} />
      <AmountCell value={+p.stayTotal} />
      <td className="text-center font-bold tabular-nums px-2" style={{ minWidth: 100 }} data-testid={`text-total-${p.id}`}>
        {+p.grandTotal > 0 ? formatNumber(+p.grandTotal) : "—"}
      </td>
      <td className="text-center tabular-nums text-blue-700 px-2" style={{ minWidth: 90 }} data-testid={`text-company-share-${p.id}`}>
        {+p.companyShareTotal > 0 ? formatNumber(+p.companyShareTotal) : "—"}
      </td>
      <td className="text-center tabular-nums text-orange-700 px-2" style={{ minWidth: 90 }} data-testid={`text-patient-share-${p.id}`}>
        {+p.patientShareTotal > 0 ? formatNumber(+p.patientShareTotal) : "—"}
      </td>
      <td className="text-center tabular-nums text-green-700 px-2" style={{ minWidth: 90 }} data-testid={`text-paid-${p.id}`}>
        {+p.paidTotal > 0 ? formatNumber(+p.paidTotal) : "—"}
      </td>
      <td className="text-center tabular-nums text-red-600 px-2" style={{ minWidth: 90 }} data-testid={`text-outstanding-${p.id}`}>
        {+p.outstandingTotal > 0 ? formatNumber(+p.outstandingTotal) : "—"}
      </td>
      <td className="text-center tabular-nums text-purple-700 px-2" style={{ minWidth: 90 }} data-testid={`text-transferred-${p.id}`}>
        {+p.transferredTotal > 0 ? formatNumber(+p.transferredTotal) : "—"}
      </td>
      <InvoiceStatusBadge status={p.latestInvoiceStatus} isFinalClosed={p.latestIsFinalClosed} />

      <td className="sticky-col-left" style={{ minWidth: 80 }}>
        <div className="flex items-center justify-center gap-0.5">
          <Button
            variant="ghost" size="icon" className="h-6 w-6 text-purple-600"
            title="ملف المريض"
            onClick={() => onViewFile(p.id)}
            data-testid={`button-view-file-${p.id}`}
          >
            <FolderOpen className="h-3 w-3" />
          </Button>

          {canViewInvoice && p.latestInvoiceId && (
            <Button
              variant="ghost" size="icon" className="h-6 w-6 text-blue-600"
              title={`فتح الفاتورة ${p.latestInvoiceNumber || ""}`}
              onClick={() => onOpenInvoice(p.latestInvoiceId!)}
              data-testid={`button-open-invoice-${p.id}`}
            >
              <FileText className="h-3 w-3" />
            </Button>
          )}

          {canEdit && (
            <>
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                title="تعديل بيانات المريض"
                onClick={() => onEdit(p)}
                data-testid={`button-edit-patient-${p.id}`}
              >
                <Edit2 className="h-3 w-3" />
              </Button>

              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                disabled={+p.grandTotal > 0}
                title={
                  +p.grandTotal > 0
                    ? "لا يمكن حذف المريض لوجود فواتير بقيمة غير صفرية"
                    : "حذف المريض"
                }
                onClick={() => onDelete(p)}
                data-testid={`button-delete-patient-${p.id}`}
              >
                <Trash2 className={`h-3 w-3 ${+p.grandTotal > 0 ? "text-muted-foreground" : "text-destructive"}`} />
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function PatientGrid({ rows, isLoading, hasDeptFilter, canViewInvoice, canEdit, canAdmit, onEdit, onDelete, onOpenInvoice, onViewFile }: PatientGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback((dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 320;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  }, []);

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
      </div>
    );
  }

  const activeRows   = hasDeptFilter ? rows.filter(r => +r.grandTotal > 0) : rows;
  const inactiveRows = hasDeptFilter ? rows.filter(r => +r.grandTotal === 0) : [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/30">
        <span className="text-xs text-muted-foreground">اسحب الجدول أو استخدم الأسهم للتنقل</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline" size="sm" className="h-6 w-6 p-0"
            onClick={() => scroll("right")}
            title="تمرير لليمين"
            data-testid="button-scroll-right"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline" size="sm" className="h-6 w-6 p-0"
            onClick={() => scroll("left")}
            title="تمرير لليسار"
            data-testid="button-scroll-left"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        style={{ maxHeight: "calc(100vh - 250px)" }}
      >
        <table className="text-xs border-collapse" style={{ minWidth: 1920 }}>

          <thead className="peachtree-grid-header sticky top-0 z-20">
            <tr>
              <th className="sticky-header-right text-center" style={{ right: 0, width: 36 }}>#</th>
              <th className="sticky-header-right sticky-header-name-shadow text-right px-3" style={{ right: 36, minWidth: 160 }}>الاسم</th>
              <th className="text-right px-3" style={{ minWidth: 120 }}>الطبيب</th>
              <th className="text-right px-3" style={{ minWidth: 110 }}>التليفون</th>
              <th className="text-right px-3" style={{ minWidth: 120 }}>الرقم القومي</th>
              <th className="text-center px-2" style={{ minWidth: 44 }}>السن</th>
              <th className="text-center px-2" style={{ minWidth: 70 }}>النوع</th>
              <th className="text-center px-2" style={{ minWidth: 88 }}>خدمات</th>
              <th className="text-center px-2" style={{ minWidth: 88 }}>عمليات</th>
              <th className="text-center px-2" style={{ minWidth: 88 }}>أجهزة</th>
              <th className="text-center px-2" style={{ minWidth: 88 }}>أدوية</th>
              <th className="text-center px-2" style={{ minWidth: 88 }}>مستهلكات</th>
              <th className="text-center px-2" style={{ minWidth: 88 }}>غازات</th>
              <th className="text-center px-2" style={{ minWidth: 88 }}>إقامة</th>
              <th className="text-center px-2 font-bold" style={{ minWidth: 100 }}>الإجمالي</th>
              <th className="text-center px-2 text-blue-300" style={{ minWidth: 90 }}>حصة شركة</th>
              <th className="text-center px-2 text-orange-300" style={{ minWidth: 90 }}>حصة مريض</th>
              <th className="text-center px-2 text-green-300" style={{ minWidth: 90 }}>المسدد</th>
              <th className="text-center px-2 text-red-300" style={{ minWidth: 90 }}>المتبقي</th>
              <th className="text-center px-2 text-purple-300" style={{ minWidth: 90 }}>محول طبيب</th>
              <th className="text-center px-2" style={{ minWidth: 80 }}>الحالة</th>
              <th className="sticky-header-left text-center" style={{ minWidth: 80 }}>إجراءات</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr className="peachtree-grid-row">
                <td colSpan={22} className="text-center py-6 text-muted-foreground">
                  لا يوجد مرضى
                </td>
              </tr>
            ) : (
              <>
                {activeRows.map((p, idx) => (
                  <PatientRow
                    key={p.id}
                    patient={p}
                    index={idx + 1}
                    dimmed={false}
                    canViewInvoice={canViewInvoice}
                    canEdit={canEdit}
                    canAdmit={canAdmit}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onOpenInvoice={onOpenInvoice}
                    onViewFile={onViewFile}
                  />
                ))}

                {inactiveRows.length > 0 && (
                  <>
                    <tr>
                      <td
                        colSpan={22}
                        className="py-1 px-2 text-xs text-muted-foreground bg-muted/20 border-y"
                      >
                        المرضى التاليون لا توجد لهم فواتير في هذا القسم ({inactiveRows.length})
                      </td>
                    </tr>
                    {inactiveRows.map((p, idx) => (
                      <PatientRow
                        key={p.id}
                        patient={p}
                        index={activeRows.length + idx + 1}
                        dimmed={true}
                        canViewInvoice={canViewInvoice}
                        canEdit={canEdit}
                        canAdmit={canAdmit}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onOpenInvoice={onOpenInvoice}
                        onViewFile={onViewFile}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </tbody>

          {activeRows.length > 0 && (
            <tfoot className="sticky bottom-0 z-10">
              <TotalsRow rows={activeRows} />
            </tfoot>
          )}

        </table>
      </div>
    </div>
  );
}
