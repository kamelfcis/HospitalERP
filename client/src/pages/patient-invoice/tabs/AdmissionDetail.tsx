import { Button }     from "@/components/ui/button";
import { Badge }      from "@/components/ui/badge";
import { Skeleton }   from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BedDouble, LogOut, Layers, FileText, Printer, ChevronRight } from "lucide-react";
import { formatCurrency, formatDateShort, formatDateTime } from "@/lib/formatters";
import type { Department, PatientInvoiceHeader } from "@shared/schema";
import { AdmissionWithLatestInvoice, InvoiceStatusBadge } from "./admission-types";

interface AdmissionDetailProps {
  adm: AdmissionWithLatestInvoice;
  onBack: () => void;
  admDischargeMutation:   { mutate: (id: string) => void; isPending: boolean };
  admConsolidateMutation: { mutate: (id: string) => void; isPending: boolean };
  admInvoicesLoading: boolean;
  admInvoices: PatientInvoiceHeader[] | undefined;
  admPrintDeptId: string;
  setAdmPrintDeptId: (v: string) => void;
  departments: Department[] | undefined;
  admReportLoading: boolean;
  admReportData: any;
  admInvoicesByDepartment: Record<string, PatientInvoiceHeader[]>;
  admTotalAllInvoices: number;
  admFilteredPrintInvoices: Record<string, PatientInvoiceHeader[]>;
  admPrintRef: React.RefObject<HTMLDivElement>;
  admGetStatusBadgeClass: (s: string) => string;
  admStatusLabels: Record<string, string>;
}

function AdmissionDetail({
  adm, onBack,
  admDischargeMutation, admConsolidateMutation,
  admInvoicesLoading, admInvoices,
  admPrintDeptId, setAdmPrintDeptId, departments,
  admReportLoading, admReportData,
  admInvoicesByDepartment, admTotalAllInvoices, admFilteredPrintInvoices,
  admPrintRef,
  admGetStatusBadgeClass, admStatusLabels,
}: AdmissionDetailProps) {
  return (
    <div className="space-y-3">
      {/* ── شريط العنوان + أزرار العمليات ── */}
      <div className="no-print flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-adm-back">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-sm font-bold flex items-center gap-1">
              <BedDouble className="h-4 w-4" />
              تفاصيل الإقامة — {adm.admissionNumber}
            </h2>
            <p className="text-xs text-muted-foreground">{adm.patientName}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {adm.status === "active" && (
            <Button
              size="sm" variant="outline"
              data-testid="button-adm-discharge"
              disabled={admDischargeMutation.isPending}
              onClick={() => {
                if (confirm("هل أنت متأكد من خروج المريض؟"))
                  admDischargeMutation.mutate(adm.id);
              }}
            >
              <LogOut className="h-3 w-3 ml-1" />
              خروج المريض
            </Button>
          )}
          <Button
            size="sm" variant="outline"
            data-testid="button-adm-consolidate"
            disabled={admConsolidateMutation.isPending}
            onClick={() => admConsolidateMutation.mutate(adm.id)}
          >
            <Layers className="h-3 w-3 ml-1" />
            تجميع الفواتير
          </Button>
        </div>
      </div>

      {/* ── كارد بيانات الإقامة ── */}
      <Card className="no-print">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">بيانات الإقامة</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">رقم الإقامة:</span>
              <p className="font-medium" data-testid="text-adm-number">{adm.admissionNumber}</p>
            </div>
            <div>
              <span className="text-muted-foreground">اسم المريض:</span>
              <p className="font-medium" data-testid="text-adm-patient">{adm.patientName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">التليفون:</span>
              <p className="font-medium">{adm.patientPhone || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">الحالة:</span>
              <Badge
                className={admGetStatusBadgeClass(adm.status)}
                data-testid="badge-adm-status"
              >
                {admStatusLabels[adm.status] || adm.status}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">تاريخ الإقامة:</span>
              <p className="font-medium">{formatDateShort(adm.admissionDate)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">تاريخ الخروج:</span>
              <p className="font-medium">
                {adm.dischargeDate ? formatDateShort(adm.dischargeDate) : "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">الطبيب:</span>
              <p className="font-medium">{adm.doctorName || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">ملاحظات:</span>
              <p className="font-medium">{adm.notes || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── كارد فواتير الإقامة ── */}
      <Card className="no-print">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">فواتير الإقامة</CardTitle>
        </CardHeader>
        <CardContent>
          {admInvoicesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : !admInvoices || admInvoices.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد فواتير</p>
          ) : (
            <ScrollArea className="max-h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم الفاتورة</TableHead>
                    <TableHead className="text-right">القسم</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admInvoices.map((inv: PatientInvoiceHeader) => (
                    <TableRow key={inv.id} data-testid={`row-adm-invoice-${inv.id}`}>
                      <TableCell className="text-xs">{inv.invoiceNumber}</TableCell>
                      <TableCell className="text-xs">{(inv as PatientInvoiceHeader & { departmentName?: string }).departmentName || "—"}</TableCell>
                      <TableCell className="text-xs">{formatDateShort(inv.invoiceDate)}</TableCell>
                      <TableCell className="text-xs">{formatCurrency(parseFloat(String(inv.netAmount || inv.totalAmount)))}</TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={inv.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* ── كارد تقرير الإقامة (للطباعة) ── */}
      <Card className="no-print">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-1">
            <FileText className="h-4 w-4" />
            تقرير الإقامة
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={admPrintDeptId} onValueChange={setAdmPrintDeptId}>
              <SelectTrigger className="w-[180px]" data-testid="select-adm-print-dept">
                <SelectValue placeholder="اختر القسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأقسام</SelectItem>
                {departments?.map(dept => (
                  <SelectItem key={dept.id} value={dept.id}>{dept.nameAr}</SelectItem>
                ))}
                <SelectItem value="none">بدون قسم</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => window.print()} data-testid="button-adm-print">
              <Printer className="h-3 w-3 ml-1" />
              {admPrintDeptId === "all" ? "طباعة الكل" : "طباعة قسم"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {admReportLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : !admReportData?.invoices || admReportData.invoices.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد فواتير للتقرير</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(admInvoicesByDepartment).map(([deptName, invs]) => (
                <div key={deptName} className="space-y-1">
                  <h4 className="text-xs font-bold">{deptName}</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">رقم الفاتورة</TableHead>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">الإجمالي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(invs as PatientInvoiceHeader[]).map((inv: PatientInvoiceHeader) => (
                        <TableRow key={inv.id}>
                          <TableCell className="text-xs">{inv.invoiceNumber}</TableCell>
                          <TableCell className="text-xs">{formatDateShort(inv.invoiceDate)}</TableCell>
                          <TableCell className="text-xs">{formatCurrency(parseFloat(String(inv.netAmount || inv.totalAmount)))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs font-medium text-left">
                    إجمالي القسم:{" "}
                    {formatCurrency(
                      (invs as PatientInvoiceHeader[]).reduce(
                        (s, inv) => s + parseFloat(String(inv.netAmount || inv.totalAmount || "0")), 0
                      )
                    )}
                  </p>
                </div>
              ))}
              <div className="border-t pt-2">
                <p className="text-sm font-bold">الإجمالي الكلي: {formatCurrency(admTotalAllInvoices)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── منطقة الطباعة (مخفية في الشاشة) ── */}
      <div id="adm-print-area" ref={admPrintRef} style={{ display: "none" }} dir="rtl">
        <div style={{ visibility: "visible" }}>
          <h2 style={{ textAlign: "center", marginBottom: "10px" }}>تقرير إقامة مريض</h2>
          <table style={{ width: "100%", marginBottom: "15px" }}>
            <tbody>
              <tr>
                <td style={{ border: "none", padding: "2px 8px" }}><strong>رقم الإقامة:</strong> {adm.admissionNumber}</td>
                <td style={{ border: "none", padding: "2px 8px" }}><strong>اسم المريض:</strong> {adm.patientName}</td>
              </tr>
              <tr>
                <td style={{ border: "none", padding: "2px 8px" }}><strong>التليفون:</strong> {adm.patientPhone || "—"}</td>
                <td style={{ border: "none", padding: "2px 8px" }}><strong>الطبيب:</strong> {adm.doctorName || "—"}</td>
              </tr>
              <tr>
                <td style={{ border: "none", padding: "2px 8px" }}><strong>تاريخ الإقامة:</strong> {adm.admissionDate}</td>
                <td style={{ border: "none", padding: "2px 8px" }}><strong>تاريخ الخروج:</strong> {adm.dischargeDate || "—"}</td>
              </tr>
            </tbody>
          </table>

          {Object.entries(admFilteredPrintInvoices).map(([deptName, invs]) => (
            <div key={deptName} style={{ marginBottom: "15px" }}>
              <h3 style={{ borderBottom: "2px solid #333", paddingBottom: "3px" }}>{deptName}</h3>
              {(invs as any[]).map((inv: any) => (
                <div key={inv.id} style={{ marginBottom: "10px" }}>
                  <p style={{ fontSize: "10pt", marginBottom: "4px" }}>
                    <strong>فاتورة رقم:</strong> {inv.invoiceNumber} |{" "}
                    <strong>التاريخ:</strong> {inv.invoiceDate}
                  </p>
                  {inv.lines?.length > 0 && (
                    <table>
                      <thead>
                        <tr><th>البيان</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
                      </thead>
                      <tbody>
                        {inv.lines.map((line: any, idx: number) => (
                          <tr key={idx}>
                            <td>{line.description}</td>
                            <td>{line.quantity}</td>
                            <td>{line.unitPrice}</td>
                            <td>{line.totalPrice}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <p style={{ textAlign: "left", fontSize: "10pt", fontWeight: "bold" }}>
                    إجمالي الفاتورة: {inv.netAmount || inv.totalAmount}
                  </p>
                </div>
              ))}
              <p style={{ textAlign: "left", fontSize: "11pt", fontWeight: "bold", borderTop: "1px solid #999", paddingTop: "3px" }}>
                إجمالي {deptName}:{" "}
                {(invs as any[]).reduce(
                  (s, inv) => s + parseFloat(inv.netAmount || inv.totalAmount || "0"), 0
                ).toFixed(2)}
              </p>
            </div>
          ))}

          <div style={{ borderTop: "3px double #333", paddingTop: "8px", marginTop: "10px" }}>
            <h3 style={{ textAlign: "left" }}>
              الإجمالي الكلي:{" "}
              {Object.values(admFilteredPrintInvoices)
                .flat()
                .reduce((s, inv: any) => s + parseFloat(inv.netAmount || inv.totalAmount || "0"), 0)
                .toFixed(2)}
            </h3>
          </div>
        </div>
      </div>
    </div>
  );
}

export { AdmissionDetail };
export type { AdmissionDetailProps };
