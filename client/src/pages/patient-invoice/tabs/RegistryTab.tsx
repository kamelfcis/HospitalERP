import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { formatNumber, formatDateShort } from "@/lib/formatters";
import { patientInvoiceStatusLabels } from "@shared/schema";

interface RegistryTabProps {
  regDateFrom: string;
  setRegDateFrom: (v: string) => void;
  regDateTo: string;
  setRegDateTo: (v: string) => void;
  regPatientName: string;
  setRegPatientName: (v: string) => void;
  regDoctorName: string;
  setRegDoctorName: (v: string) => void;
  regStatus: string;
  setRegStatus: (v: string) => void;
  regPage: number;
  setRegPage: (fn: (p: number) => number) => void;
  regTotalPages: number;
  regLoading: boolean;
  registryData: { data: any[]; total: number } | undefined;
  regPageSize: number;
  loadInvoice: (id: string) => void;
  getStatusBadgeClass: (status: string) => string;
}

export function RegistryTab({
  regDateFrom, setRegDateFrom,
  regDateTo, setRegDateTo,
  regPatientName, setRegPatientName,
  regDoctorName, setRegDoctorName,
  regStatus, setRegStatus,
  regPage, setRegPage,
  regTotalPages, regLoading,
  registryData, regPageSize,
  loadInvoice, getStatusBadgeClass,
}: RegistryTabProps) {
  return (
    <div className="border rounded-md p-2 space-y-2">
      <div className="flex flex-row-reverse items-center gap-3 flex-wrap">
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">من:</Label>
          <Input
            type="date"
            value={regDateFrom}
            onChange={(e) => { setRegDateFrom(e.target.value); setRegPage(() => 1); }}
            className="h-7 text-xs w-36"
            data-testid="input-reg-date-from"
          />
        </div>
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">إلى:</Label>
          <Input
            type="date"
            value={regDateTo}
            onChange={(e) => { setRegDateTo(e.target.value); setRegPage(() => 1); }}
            className="h-7 text-xs w-36"
            data-testid="input-reg-date-to"
          />
        </div>
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">المريض:</Label>
          <Input
            value={regPatientName}
            onChange={(e) => { setRegPatientName(e.target.value); setRegPage(() => 1); }}
            placeholder="بحث..."
            className="h-7 text-xs w-36"
            data-testid="input-reg-patient-name"
          />
        </div>
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">الطبيب:</Label>
          <Input
            value={regDoctorName}
            onChange={(e) => { setRegDoctorName(e.target.value); setRegPage(() => 1); }}
            placeholder="بحث..."
            className="h-7 text-xs w-32"
            data-testid="input-reg-doctor-name"
          />
        </div>
        <div className="flex flex-row-reverse items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">الحالة:</Label>
          <Select value={regStatus} onValueChange={(v) => { setRegStatus(v); setRegPage(() => 1); }}>
            <SelectTrigger className="h-7 text-xs w-24" data-testid="select-reg-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="draft">مسودة</SelectItem>
              <SelectItem value="finalized">نهائي</SelectItem>
              <SelectItem value="cancelled">ملغي</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {regLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-md" dir="rtl">
          <table className="peachtree-grid w-full text-sm">
            <thead>
              <tr className="peachtree-grid-header">
                <th className="text-center" style={{ width: 40 }}>#</th>
                <th className="text-center">رقم الفاتورة</th>
                <th className="text-center">التاريخ</th>
                <th>اسم المريض</th>
                <th className="text-center">القسم</th>
                <th>الطبيب</th>
                <th className="text-center">الإجمالي</th>
                <th className="text-center">الحالة</th>
                <th className="text-center" style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {(registryData?.data || []).map((inv: any, i: number) => (
                <tr
                  key={inv.id}
                  className="peachtree-grid-row cursor-pointer"
                  onClick={() => loadInvoice(inv.id)}
                  data-testid={`row-registry-${inv.id}`}
                >
                  <td className="text-center">{(regPage - 1) * regPageSize + i + 1}</td>
                  <td className="text-center font-mono">{inv.invoiceNumber}</td>
                  <td className="text-center">{formatDateShort(inv.invoiceDate)}</td>
                  <td>{inv.patientName}</td>
                  <td className="text-center">{inv.department?.nameAr || ""}</td>
                  <td>{inv.doctorName || ""}</td>
                  <td className="text-center">{formatNumber(inv.netAmount)}</td>
                  <td className="text-center">
                    <Badge
                      className={getStatusBadgeClass(inv.status)}
                      data-testid={`badge-reg-status-${inv.id}`}
                    >
                      {patientInvoiceStatusLabels[inv.status] || inv.status}
                    </Badge>
                  </td>
                  <td className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        loadInvoice(inv.id);
                      }}
                      data-testid={`button-view-reg-${inv.id}`}
                    >
                      <Eye className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
              {(registryData?.data || []).length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-muted-foreground py-4">
                    لا توجد فواتير
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {regTotalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-1">
          <Button
            variant="outline"
            size="sm"
            disabled={regPage <= 1}
            onClick={() => setRegPage((p) => p - 1)}
            data-testid="button-reg-prev-page"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
          <span className="text-xs text-muted-foreground">
            صفحة {regPage} من {regTotalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={regPage >= regTotalPages}
            onClick={() => setRegPage((p) => p + 1)}
            data-testid="button-reg-next-page"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
