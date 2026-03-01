import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BedDouble, LogOut, Layers, FileText, Printer, Search, Loader2, Plus, ChevronRight } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import type { Admission, Department, Patient } from "@shared/schema";

interface AdmFormData {
  patientName: string;
  patientPhone: string;
  patientId: string;
  admissionDate: string;
  doctorName: string;
  notes: string;
  admissionNumber: string;
}

interface AdmissionsTabProps {
  admSelectedAdmission: Admission | null;
  setAdmSelectedAdmission: (a: Admission | null) => void;
  admDetail: Admission | undefined;
  admDischargeMutation: { mutate: (id: string) => void; isPending: boolean };
  admConsolidateMutation: { mutate: (id: string) => void; isPending: boolean };
  admInvoicesLoading: boolean;
  admInvoices: any[] | undefined;
  admPrintDeptId: string;
  setAdmPrintDeptId: (v: string) => void;
  departments: Department[] | undefined;
  admReportLoading: boolean;
  admReportData: any;
  admInvoicesByDepartment: Record<string, any[]>;
  admTotalAllInvoices: number;
  admFilteredPrintInvoices: Record<string, any[]>;
  admPrintRef: React.RefObject<HTMLDivElement>;
  admAllAdmissions: Admission[] | undefined;
  admListLoading: boolean;
  admSearchQuery: string;
  setAdmSearchQuery: (v: string) => void;
  admStatusFilter: string;
  setAdmStatusFilter: (v: string) => void;
  admIsCreateOpen: boolean;
  setAdmIsCreateOpen: (v: boolean) => void;
  admFormData: AdmFormData;
  setAdmFormData: (v: AdmFormData) => void;
  admPatientSearch: string;
  setAdmPatientSearch: (v: string) => void;
  admPatientResults: Patient[];
  admSearchingPatients: boolean;
  admShowPatientDropdown: boolean;
  setAdmShowPatientDropdown: (v: boolean) => void;
  admPatientSearchRef: React.RefObject<HTMLInputElement>;
  admPatientDropdownRef: React.RefObject<HTMLDivElement>;
  admHandleSelectPatient: (patient: Patient) => void;
  admHandleCloseCreate: () => void;
  admHandleCreateSubmit: () => void;
  admCreateMutation: { isPending: boolean };
  admGetStatusBadgeClass: (s: string) => string;
  admStatusLabels: Record<string, string>;
}

export function AdmissionsTab({
  admSelectedAdmission, setAdmSelectedAdmission,
  admDetail, admDischargeMutation, admConsolidateMutation,
  admInvoicesLoading, admInvoices,
  admPrintDeptId, setAdmPrintDeptId,
  departments,
  admReportLoading, admReportData,
  admInvoicesByDepartment, admTotalAllInvoices, admFilteredPrintInvoices,
  admPrintRef,
  admAllAdmissions, admListLoading,
  admSearchQuery, setAdmSearchQuery,
  admStatusFilter, setAdmStatusFilter,
  admIsCreateOpen, setAdmIsCreateOpen,
  admFormData, setAdmFormData,
  admPatientSearch, setAdmPatientSearch,
  admPatientResults, admSearchingPatients,
  admShowPatientDropdown, setAdmShowPatientDropdown,
  admPatientSearchRef, admPatientDropdownRef,
  admHandleSelectPatient, admHandleCloseCreate, admHandleCreateSubmit,
  admCreateMutation,
  admGetStatusBadgeClass, admStatusLabels,
}: AdmissionsTabProps) {
  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #adm-print-area, #adm-print-area * { visibility: visible !important; }
          #adm-print-area {
            position: absolute !important; left: 0 !important; top: 0 !important;
            width: 210mm !important; padding: 10mm !important; font-size: 11pt !important; direction: rtl !important;
          }
          #adm-print-area table { width: 100% !important; border-collapse: collapse !important; }
          #adm-print-area th, #adm-print-area td { border: 1px solid #333 !important; padding: 4px 8px !important; text-align: right !important; font-size: 10pt !important; }
          #adm-print-area th { background: #eee !important; font-weight: bold !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {admSelectedAdmission ? (() => {
        const adm = admDetail || admSelectedAdmission;
        return (
          <div className="space-y-3">
            <div className="no-print flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setAdmSelectedAdmission(null)} data-testid="button-adm-back">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div>
                  <h2 className="text-sm font-bold flex items-center gap-1">
                    <BedDouble className="h-4 w-4" />
                    تفاصيل الإقامة - {adm.admissionNumber}
                  </h2>
                  <p className="text-xs text-muted-foreground">{adm.patientName}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {adm.status === "active" && (
                  <Button size="sm" variant="outline" onClick={() => { if (confirm("هل أنت متأكد من خروج المريض؟")) admDischargeMutation.mutate(adm.id); }} disabled={admDischargeMutation.isPending} data-testid="button-adm-discharge">
                    <LogOut className="h-3 w-3 ml-1" />
                    خروج المريض
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => admConsolidateMutation.mutate(adm.id)} disabled={admConsolidateMutation.isPending} data-testid="button-adm-consolidate">
                  <Layers className="h-3 w-3 ml-1" />
                  تجميع الفواتير
                </Button>
              </div>
            </div>

            <Card className="no-print">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">بيانات الإقامة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-muted-foreground">رقم الإقامة:</span><p className="font-medium" data-testid="text-adm-number">{adm.admissionNumber}</p></div>
                  <div><span className="text-muted-foreground">اسم المريض:</span><p className="font-medium" data-testid="text-adm-patient">{adm.patientName}</p></div>
                  <div><span className="text-muted-foreground">التليفون:</span><p className="font-medium">{adm.patientPhone || "—"}</p></div>
                  <div><span className="text-muted-foreground">الحالة:</span><Badge className={admGetStatusBadgeClass(adm.status)} data-testid="badge-adm-status">{admStatusLabels[adm.status] || adm.status}</Badge></div>
                  <div><span className="text-muted-foreground">تاريخ الإقامة:</span><p className="font-medium">{formatDateShort(adm.admissionDate)}</p></div>
                  <div><span className="text-muted-foreground">تاريخ الخروج:</span><p className="font-medium">{adm.dischargeDate ? formatDateShort(adm.dischargeDate) : "—"}</p></div>
                  <div><span className="text-muted-foreground">الطبيب:</span><p className="font-medium">{adm.doctorName || "—"}</p></div>
                  <div><span className="text-muted-foreground">ملاحظات:</span><p className="font-medium">{adm.notes || "—"}</p></div>
                </div>
              </CardContent>
            </Card>

            <Card className="no-print">
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-sm">فواتير الإقامة</CardTitle>
              </CardHeader>
              <CardContent>
                {admInvoicesLoading ? (
                  <div className="space-y-2"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>
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
                        {admInvoices.map((inv: any) => (
                          <TableRow key={inv.id} data-testid={`row-adm-invoice-${inv.id}`}>
                            <TableCell className="text-xs">{inv.invoiceNumber}</TableCell>
                            <TableCell className="text-xs">{inv.departmentName || "—"}</TableCell>
                            <TableCell className="text-xs">{formatDateShort(inv.invoiceDate)}</TableCell>
                            <TableCell className="text-xs">{formatCurrency(inv.netAmount || inv.totalAmount)}</TableCell>
                            <TableCell>
                              <Badge className={inv.status === "draft" ? "bg-yellow-500 text-white no-default-hover-elevate no-default-active-elevate" : inv.status === "finalized" ? "bg-green-600 text-white no-default-hover-elevate no-default-active-elevate" : "bg-red-600 text-white no-default-hover-elevate no-default-active-elevate"}>
                                {inv.status === "draft" ? "مسودة" : inv.status === "finalized" ? "نهائي" : "ملغي"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

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
                      {departments?.map((dept) => (
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
                  <div className="space-y-2"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>
                ) : !admReportData?.invoices || admReportData.invoices.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">لا توجد فواتير للتقرير</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(admInvoicesByDepartment).map(([deptName, invs]) => (
                      <div key={deptName} className="space-y-1">
                        <h4 className="text-xs font-bold text-foreground">{deptName}</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-right">رقم الفاتورة</TableHead>
                              <TableHead className="text-right">التاريخ</TableHead>
                              <TableHead className="text-right">الإجمالي</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(invs as any[]).map((inv: any) => (
                              <TableRow key={inv.id}>
                                <TableCell className="text-xs">{inv.invoiceNumber}</TableCell>
                                <TableCell className="text-xs">{formatDateShort(inv.invoiceDate)}</TableCell>
                                <TableCell className="text-xs">{formatCurrency(inv.netAmount || inv.totalAmount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <p className="text-xs font-medium text-left">
                          إجمالي القسم: {formatCurrency((invs as any[]).reduce((s: number, inv: any) => s + parseFloat(inv.netAmount || inv.totalAmount || "0"), 0))}
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
                          <strong>فاتورة رقم:</strong> {inv.invoiceNumber} | <strong>التاريخ:</strong> {inv.invoiceDate}
                        </p>
                        {inv.lines && inv.lines.length > 0 && (
                          <table>
                            <thead><tr><th>البيان</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                            <tbody>
                              {inv.lines.map((line: any, idx: number) => (
                                <tr key={idx}><td>{line.description}</td><td>{line.quantity}</td><td>{line.unitPrice}</td><td>{line.totalPrice}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <p style={{ textAlign: "left", fontSize: "10pt", fontWeight: "bold" }}>إجمالي الفاتورة: {inv.netAmount || inv.totalAmount}</p>
                      </div>
                    ))}
                    <p style={{ textAlign: "left", fontSize: "11pt", fontWeight: "bold", borderTop: "1px solid #999", paddingTop: "3px" }}>
                      إجمالي {deptName}: {(invs as any[]).reduce((s: number, inv: any) => s + parseFloat(inv.netAmount || inv.totalAmount || "0"), 0).toFixed(2)}
                    </p>
                  </div>
                ))}
                <div style={{ borderTop: "3px double #333", paddingTop: "8px", marginTop: "10px" }}>
                  <h3 style={{ textAlign: "left" }}>
                    الإجمالي الكلي: {Object.values(admFilteredPrintInvoices).flat().reduce((s: number, inv: any) => s + parseFloat(inv.netAmount || inv.totalAmount || "0"), 0).toFixed(2)}
                  </h3>
                </div>
              </div>
            </div>
          </div>
        );
      })() : (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-bold flex items-center gap-1" data-testid="text-adm-title">
                <BedDouble className="h-4 w-4" />
                إقامات المرضى
              </h2>
              <p className="text-xs text-muted-foreground">إدارة إقامات المرضى ({admAllAdmissions?.length || 0})</p>
            </div>
            <Button size="sm" onClick={() => setAdmIsCreateOpen(true)} data-testid="button-adm-add">
              <Plus className="h-3 w-3 ml-1" />
              إقامة جديدة
            </Button>
          </div>

          <div className="border rounded-md p-2 flex items-center gap-2 flex-wrap">
            <Search className="h-3 w-3 text-muted-foreground" />
            <Input
              type="text"
              placeholder="بحث عن إقامة..."
              value={admSearchQuery}
              onChange={(e) => setAdmSearchQuery(e.target.value)}
              className="flex-1 max-w-xs h-7 text-xs"
              data-testid="input-adm-search"
            />
            <Select value={admStatusFilter} onValueChange={setAdmStatusFilter}>
              <SelectTrigger className="w-[140px] h-7 text-xs" data-testid="select-adm-status-filter">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="active">نشطة</SelectItem>
                <SelectItem value="discharged">خرج</SelectItem>
                <SelectItem value="cancelled">ملغاة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-md">
            {admListLoading ? (
              <div className="p-3 space-y-2"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-full" /></div>
            ) : (
              <ScrollArea className="h-[calc(100vh-320px)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم الإقامة</TableHead>
                      <TableHead className="text-right">اسم المريض</TableHead>
                      <TableHead className="text-right">التليفون</TableHead>
                      <TableHead className="text-right">تاريخ الإقامة</TableHead>
                      <TableHead className="text-right">الطبيب</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!admAllAdmissions || admAllAdmissions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">لا توجد إقامات</TableCell>
                      </TableRow>
                    ) : (
                      admAllAdmissions.map((a) => (
                        <TableRow key={a.id} className="cursor-pointer hover-elevate" onClick={() => setAdmSelectedAdmission(a)} data-testid={`row-adm-${a.id}`}>
                          <TableCell className="text-xs font-medium">{a.admissionNumber}</TableCell>
                          <TableCell className="text-xs">{a.patientName}</TableCell>
                          <TableCell className="text-xs font-mono">{a.patientPhone || "—"}</TableCell>
                          <TableCell className="text-xs">{formatDateShort(a.admissionDate)}</TableCell>
                          <TableCell className="text-xs">{a.doctorName || "—"}</TableCell>
                          <TableCell className="text-center">
                            <Badge className={admGetStatusBadgeClass(a.status)}>{admStatusLabels[a.status] || a.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>
        </div>
      )}

      <Dialog open={admIsCreateOpen} onOpenChange={setAdmIsCreateOpen}>
        <DialogContent className="max-w-md p-4" dir="rtl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-bold">إقامة جديدة</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1 relative">
              <Label className="text-xs">اسم المريض *</Label>
              <Input
                ref={admPatientSearchRef}
                type="text"
                value={admPatientSearch}
                onChange={(e) => { setAdmPatientSearch(e.target.value); setAdmShowPatientDropdown(true); setAdmFormData({ ...admFormData, patientName: e.target.value, patientId: "" }); }}
                onFocus={() => { if (admPatientSearch.length > 0) setAdmShowPatientDropdown(true); }}
                placeholder="ابحث عن مريض..."
                className="h-7 text-xs"
                data-testid="input-adm-patient-search"
              />
              {admShowPatientDropdown && (admPatientResults.length > 0 || admSearchingPatients) && (
                <div ref={admPatientDropdownRef} className="absolute z-50 w-full bg-popover border rounded-md shadow-md mt-1 max-h-[200px] overflow-y-auto">
                  {admSearchingPatients && (
                    <div className="p-2 text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />جاري البحث...</div>
                  )}
                  {admPatientResults.map((patient) => (
                    <div key={patient.id} className="p-2 text-xs cursor-pointer hover-elevate" onClick={() => admHandleSelectPatient(patient)} data-testid={`option-adm-patient-${patient.id}`}>
                      <span className="font-medium">{patient.fullName}</span>
                      {patient.phone && <span className="text-muted-foreground mr-2 font-mono">{patient.phone}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">رقم الإقامة *</Label>
              <Input type="text" value={admFormData.admissionNumber} onChange={(e) => setAdmFormData({ ...admFormData, admissionNumber: e.target.value })} placeholder="رقم الإقامة" className="h-7 text-xs" data-testid="input-adm-number" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">تاريخ الإقامة *</Label>
              <Input type="date" value={admFormData.admissionDate} onChange={(e) => setAdmFormData({ ...admFormData, admissionDate: e.target.value })} className="h-7 text-xs" data-testid="input-adm-date" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الطبيب</Label>
              <Input type="text" value={admFormData.doctorName} onChange={(e) => setAdmFormData({ ...admFormData, doctorName: e.target.value })} placeholder="اسم الطبيب (اختياري)" className="h-7 text-xs" data-testid="input-adm-doctor" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ملاحظات</Label>
              <Input type="text" value={admFormData.notes} onChange={(e) => setAdmFormData({ ...admFormData, notes: e.target.value })} placeholder="ملاحظات (اختياري)" className="h-7 text-xs" data-testid="input-adm-notes" />
            </div>
          </div>
          <DialogFooter className="gap-1 pt-2">
            <Button variant="outline" size="sm" onClick={admHandleCloseCreate} data-testid="button-adm-cancel">إلغاء</Button>
            <Button size="sm" onClick={admHandleCreateSubmit} disabled={admCreateMutation.isPending} data-testid="button-adm-save">
              {admCreateMutation.isPending ? "جاري الحفظ..." : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
