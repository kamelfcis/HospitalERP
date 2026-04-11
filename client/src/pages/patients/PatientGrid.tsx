import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit2, Trash2, FileText, FolderOpen } from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { AmountCell, PatientTypeBadge, InvoiceStatusBadge, TotalsRow } from "./PatientCells";
import type { PatientGridProps, PatientRowProps } from "./types";

function PatientRow({ patient: p, index, dimmed, canViewInvoice, canEdit, canAdmit, onEdit, onDelete, onOpenInvoice, onViewFile }: PatientRowProps) {
  const rowClass = `peachtree-grid-row${dimmed ? " opacity-50" : ""}`;

  return (
    <tr className={rowClass} data-testid={`row-patient-${p.id}`}>
      <td className="text-center text-muted-foreground">{index}</td>
      <td className="font-medium"  data-testid={`text-name-${p.id}`}>{p.fullName}</td>
      <td className="text-muted-foreground text-xs truncate max-w-[8rem]" data-testid={`text-doctor-${p.id}`}>{p.latestDoctorName || "—"}</td>
      <td className="font-mono"    data-testid={`text-phone-${p.id}`}>{p.phone || "—"}</td>
      <td className="text-center"  data-testid={`text-age-${p.id}`}>{p.age ?? "—"}</td>
      <PatientTypeBadge type={p.latestPatientType} />
      <AmountCell value={+p.servicesTotal} />
      <AmountCell value={+p.orRoomTotal} />
      <AmountCell value={+p.equipmentTotal} />
      <AmountCell value={+p.drugsTotal} />
      <AmountCell value={+p.consumablesTotal} />
      <AmountCell value={+p.gasTotal} />
      <AmountCell value={+p.stayTotal} />
      <td className="text-center font-bold tabular-nums" data-testid={`text-total-${p.id}`}>
        {+p.grandTotal > 0 ? formatNumber(+p.grandTotal) : "—"}
      </td>
      <td className="text-center tabular-nums text-blue-700" data-testid={`text-company-share-${p.id}`}>
        {+p.companyShareTotal > 0 ? formatNumber(+p.companyShareTotal) : "—"}
      </td>
      <td className="text-center tabular-nums text-orange-700" data-testid={`text-patient-share-${p.id}`}>
        {+p.patientShareTotal > 0 ? formatNumber(+p.patientShareTotal) : "—"}
      </td>
      <td className="text-center tabular-nums text-green-700" data-testid={`text-paid-${p.id}`}>
        {+p.paidTotal > 0 ? formatNumber(+p.paidTotal) : "—"}
      </td>
      <td className="text-center tabular-nums text-red-600" data-testid={`text-outstanding-${p.id}`}>
        {+p.outstandingTotal > 0 ? formatNumber(+p.outstandingTotal) : "—"}
      </td>
      <td className="text-center tabular-nums text-purple-700" data-testid={`text-transferred-${p.id}`}>
        {+p.transferredTotal > 0 ? formatNumber(+p.transferredTotal) : "—"}
      </td>
      <InvoiceStatusBadge status={p.latestInvoiceStatus} isFinalClosed={p.latestIsFinalClosed} />

      <td>
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
    <ScrollArea className="h-[calc(100vh-210px)]">
      <table className="w-full text-xs">

        <thead className="peachtree-grid-header sticky top-0 z-10">
          <tr>
            <th className="w-8  text-center">#</th>
            <th className="text-right">الاسم</th>
            <th className="w-28 text-right">الطبيب</th>
            <th className="w-24 text-right">التليفون</th>
            <th className="w-10 text-center">السن</th>
            <th className="w-16 text-center">النوع</th>
            <th className="w-20 text-center">خدمات</th>
            <th className="w-20 text-center">عمليات</th>
            <th className="w-20 text-center">أجهزة</th>
            <th className="w-20 text-center">أدوية</th>
            <th className="w-20 text-center">مستهلكات</th>
            <th className="w-20 text-center">غازات</th>
            <th className="w-20 text-center">إقامة</th>
            <th className="w-24 text-center font-bold">الإجمالي</th>
            <th className="w-20 text-center text-blue-700">حصة شركة</th>
            <th className="w-20 text-center text-orange-700">حصة مريض</th>
            <th className="w-20 text-center text-green-700">المسدد</th>
            <th className="w-20 text-center text-red-600">المتبقي</th>
            <th className="w-20 text-center text-purple-700">محول طبيب</th>
            <th className="w-20 text-center">الحالة</th>
            <th className="w-20 text-center">إجراءات</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr className="peachtree-grid-row">
              <td colSpan={21} className="text-center py-6 text-muted-foreground">
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
                      colSpan={21}
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
          <tfoot>
            <TotalsRow rows={activeRows} />
          </tfoot>
        )}

      </table>
    </ScrollArea>
  );
}
