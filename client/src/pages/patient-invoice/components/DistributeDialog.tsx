/**
 * DistributeDialog — نافذة توزيع الفاتورة على حالات عمليات متعددة
 *
 * التوزيع:
 *  - الأدوية والمستهلكات تُقسَّم بالتساوي على عدد المرضى (مع كسر الباقي على المريض الأخير)
 *  - سطور STAY_ENGINE وOR_ROOM تذهب بالكامل لكل مريض (لا تُقسَّم)
 *  - تحذير فوري في المعاينة لو كمية أي صنف مش كافية (نصيب < 1 وحدة لكل مريض)
 */

import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useDebounce } from "../utils/debounce";
import { isDirectDistributionLine } from "../utils/distributeHelpers";
import type { LineLocal } from "../types";
import type { Patient, PatientInvoiceHeader } from "@shared/schema";

// ─── Types ─────────────────────────────────────────────────────────────────

interface DistPatient {
  name: string;
  phone: string;
}

/** Context from the parent invoice form needed for the API call */
export interface InvoiceContext {
  invoiceDate: string;
  departmentId?: string | null;
  warehouseId?: string | null;
  doctorName?: string | null;
  patientType?: string;
  contractName?: string | null;
  notes?: string | null;
  admissionId?: string | null;
  invoiceId?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  lines: LineLocal[];
  invoiceContext: InvoiceContext;
  onSuccess: (newInvoices: PatientInvoiceHeader[]) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a line's quantity to the smallest unit and return {qty, unitLevel, unitName} */
function convertToSmallest(
  origQty: number,
  origLevel: string,
  item: LineLocal["item"],
): { qty: number; level: string; unitName: string } {
  if (!item || origLevel === "minor") {
    const unitName = item?.minorUnitName || item?.mediumUnitName || "وحدة";
    return { qty: origQty, level: "minor", unitName };
  }

  const majorToMedium = parseFloat(String(item.majorToMedium)) || 0;
  const mediumToMinor = parseFloat(String(item.mediumToMinor)) || 0;
  let majorToMinor = parseFloat(String(item.majorToMinor)) || 0;
  if (majorToMinor <= 0 && majorToMedium > 0 && mediumToMinor > 0) {
    majorToMinor = majorToMedium * mediumToMinor;
  }

  if (origLevel === "major") {
    if (item.minorUnitName && majorToMinor > 1) {
      return { qty: origQty * majorToMinor, level: "minor", unitName: item.minorUnitName };
    }
    if (item.mediumUnitName && majorToMedium > 1) {
      return { qty: origQty * majorToMedium, level: "medium", unitName: item.mediumUnitName };
    }
  } else if (origLevel === "medium") {
    if (item.minorUnitName && mediumToMinor > 1) {
      return { qty: origQty * mediumToMinor, level: "minor", unitName: item.minorUnitName };
    }
  }

  const unitName =
    origLevel === "major" ? (item.majorUnitName || "وحدة")
    : origLevel === "medium" ? (item.mediumUnitName || "وحدة")
    : (item.minorUnitName || "وحدة");
  return { qty: origQty, level: origLevel, unitName };
}

/** Compute the per-patient share for a given total qty and patient count */
function computeShare(totalQty: number, patientIdx: number, numPatients: number): number {
  const intQty = Math.round(totalQty);
  const isInt = Math.abs(totalQty - intQty) < 0.0001 && intQty > 0;

  if (isInt && intQty >= numPatients) {
    const baseShare = Math.floor(intQty / numPatients);
    const remainder = intQty - baseShare * numPatients;
    return patientIdx < remainder ? baseShare + 1 : baseShare;
  }
  if (patientIdx === numPatients - 1) {
    // Last patient absorbs rounding difference — use approximation here for preview
    return +(totalQty / numPatients).toFixed(4);
  }
  return +(Math.round((totalQty / numPatients) * 10000) / 10000);
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * DistributeDialog
 * Renders the full distribution dialog: patient list, preview, warnings, and API call.
 */
export function DistributeDialog({ open, onClose, lines, invoiceContext, onSuccess }: Props) {
  const { toast } = useToast();

  // ── 1. Local State ──────────────────────────────────────────────────────
  const [distCount, setDistCount] = useState(2);
  const [distPatients, setDistPatients] = useState<DistPatient[]>([
    { name: "", phone: "" },
    { name: "", phone: "" },
  ]);
  const [loading, setLoading] = useState(false);

  const [searchIdx, setSearchIdx] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const debouncedSearch = useDebounce(searchText, 200);

  // ── 2. Reset state when dialog opens ────────────────────────────────────
  useEffect(() => {
    if (open) {
      setDistCount(2);
      setDistPatients([{ name: "", phone: "" }, { name: "", phone: "" }]);
      setLoading(false);
      setSearchIdx(null);
      setSearchText("");
      setSearchResults([]);
    }
  }, [open]);

  // ── 3. Patient search ───────────────────────────────────────────────────
  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.length < 1 || searchIdx === null) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    fetch(`/api/patients?search=${encodeURIComponent(debouncedSearch)}&limit=8`)
      .then(r => r.json())
      .then((data: any) => setSearchResults(Array.isArray(data) ? data : (data.patients ?? [])))
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false));
  }, [debouncedSearch, searchIdx]);

  // ── 4. Count change handler ─────────────────────────────────────────────
  const handleCountChange = useCallback((newCount: number) => {
    const count = Math.max(2, Math.min(50, newCount));
    setDistCount(count);
    setDistPatients(prev => {
      const updated = [...prev];
      while (updated.length < count) updated.push({ name: "", phone: "" });
      return updated.slice(0, count);
    });
  }, []);

  // ── 5. Preview computation ──────────────────────────────────────────────
  interface PreviewLine {
    tempId: string;
    description: string;
    origQty: number;
    origUnitName: string;
    convertedQty: number;
    convertedLevel: string;
    convertedUnitName: string;
    showConversion: boolean;
    baseShare: number;
    maxShare: number;
    insufficient: boolean;
  }

  const previewLines: PreviewLine[] = lines
    .filter(l => l.lineType === "drug" || l.lineType === "consumable")
    .map(l => {
      const origQty = l.quantity;
      const origLevel = l.unitLevel || "minor";
      const item = l.item;

      const origUnitName =
        origLevel === "major" ? (item?.majorUnitName || "وحدة")
        : origLevel === "medium" ? (item?.mediumUnitName || "وحدة")
        : (item?.minorUnitName || item?.mediumUnitName || "وحدة");

      const { qty: convertedQty, level: convertedLevel, unitName: convertedUnitName } =
        convertToSmallest(origQty, origLevel, item);

      const roundedConv = +convertedQty.toFixed(4);
      const baseShare = computeShare(roundedConv, 0, distCount);
      const maxShare = computeShare(roundedConv, 0, distCount); // first patient, possibly +1
      // Check if any patient would get < 1 (for integer quantities only — fractions are fine)
      const intTotal = Math.round(roundedConv);
      const isInt = Math.abs(roundedConv - intTotal) < 0.0001 && intTotal > 0;
      const insufficient = isInt ? intTotal < distCount : roundedConv / distCount < 0.01;

      const showConversion = convertedLevel !== origLevel;

      return {
        tempId: l.tempId,
        description: l.description,
        origQty,
        origUnitName,
        convertedQty: roundedConv,
        convertedLevel,
        convertedUnitName,
        showConversion,
        baseShare,
        maxShare,
        insufficient,
      };
    });

  const hasInsufficientItems = previewLines.some(pl => pl.insufficient);
  const directLines = lines.filter(isDirectDistributionLine);
  const serviceLines = lines.filter(l => l.lineType === "service" && !isDirectDistributionLine(l));

  // ── 6. Distribute handler ───────────────────────────────────────────────
  const handleDistribute = useCallback(async () => {
    const selectedPatients = distPatients.slice(0, distCount);
    const emptyNames = selectedPatients.filter(p => !p.name.trim());
    if (emptyNames.length > 0) {
      toast({ title: "تنبيه", description: "يجب إدخال اسم كل مريض", variant: "destructive" });
      return;
    }
    if (lines.length === 0) {
      toast({ title: "تنبيه", description: "لا توجد بنود للتوزيع", variant: "destructive" });
      return;
    }

    // ⚡ افتح النوافذ هنا قبل أي await — المتصفح يسمح بـ window.open فقط
    // أثناء سياق الـ user gesture المباشر. بعد الـ await يُبلوك.
    const preOpenedWindows = Array.from({ length: distCount }, () =>
      window.open("about:blank", "_blank")
    );

    setLoading(true);
    try {
      const linesToSend = lines.map(l => ({
        lineType: l.lineType,
        serviceId: l.serviceId,
        itemId: l.itemId,
        description: l.description,
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
        discountPercent: String(l.discountPercent),
        discountAmount: String(l.discountAmount),
        totalPrice: String(l.totalPrice),
        unitLevel: l.unitLevel,
        lotId: l.lotId,
        expiryMonth: l.expiryMonth,
        expiryYear: l.expiryYear,
        priceSource: l.priceSource,
        doctorName: l.doctorName,
        nurseName: l.nurseName,
        notes: l.notes,
        sortOrder: l.sortOrder,
        sourceType: l.sourceType,
        sourceId: l.sourceId,
        serviceType: l.serviceType || "",   // ← مطلوب للسيرفر لتصنيف الإقامة/العمليات
      }));

      const res = await apiRequest("POST", `/api/patient-invoices/distribute-direct`, {
        patients: selectedPatients.map(p => ({ name: p.name.trim(), phone: p.phone.trim() || undefined })),
        lines: linesToSend,
        invoiceDate: invoiceContext.invoiceDate,
        departmentId: invoiceContext.departmentId || null,
        warehouseId: invoiceContext.warehouseId || null,
        doctorName: invoiceContext.doctorName || null,
        patientType: invoiceContext.patientType,
        contractName: invoiceContext.contractName || null,
        notes: invoiceContext.notes || null,
        admissionId: invoiceContext.admissionId || null,
      });

      const data = await res.json();
      const newInvoices: PatientInvoiceHeader[] = data.invoices;

      onClose();

      // Delete the source (shared) invoice if it exists
      if (invoiceContext.invoiceId) {
        try { await apiRequest("DELETE", `/api/patient-invoices/${invoiceContext.invoiceId}`); } catch {}
      }

      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices/next-number"] });
      queryClient.invalidateQueries({ queryKey: ["/api/patients/stats"] });

      const skipped = distCount - newInvoices.length;
      const desc = skipped > 0
        ? `تم إنشاء ${newInvoices.length} فاتورة (${skipped} مريض لم يحصل على كمية كافية)`
        : `تم إنشاء ${newInvoices.length} فاتورة بنجاح`;
      toast({ title: "تم التوزيع", description: desc });

      onSuccess(newInvoices);

      // وجّه كل نافذة مفتوحة مسبقاً للفاتورة المقابلة
      newInvoices.forEach((inv, i) => {
        const win = preOpenedWindows[i];
        if (win) win.location.href = `/patient-invoices?loadId=${inv.id}`;
      });
      // أغلق النوافذ الزيادة (مريض لم تُنشأ له فاتورة بسبب نقص الكميات)
      preOpenedWindows.slice(newInvoices.length).forEach(win => win?.close());

    } catch (error: unknown) {
      // أغلق كل النوافذ المفتوحة في حالة الخطأ
      preOpenedWindows.forEach(win => win?.close());
      toast({ title: "خطأ في التوزيع", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [distPatients, distCount, lines, invoiceContext, onClose, onSuccess, toast]);

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl" dir="rtl" data-testid="dialog-distribute">
        <DialogHeader>
          <DialogTitle className="text-right flex flex-row-reverse items-center gap-2">
            <Users className="h-4 w-4" />
            <span>توزيع على حالات عمليات</span>
          </DialogTitle>
          <DialogDescription className="text-right">
            سيتم تقسيم الأدوية والمستهلكات بالتساوي على المرضى المحددين وحذف الفاتورة الأصلية
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

          {/* ── Count Input ── */}
          <div className="flex flex-row-reverse items-center gap-3">
            <Label className="text-sm whitespace-nowrap">عدد الحالات:</Label>
            <Input
              type="number"
              min={2}
              max={50}
              value={distCount}
              onChange={(e) => handleCountChange(parseInt(e.target.value) || 2)}
              className="w-24 text-center"
              data-testid="input-dist-count"
            />
          </div>

          {/* ── Patient List ── */}
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground w-12">#</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground">اسم المريض</th>
                  <th className="text-right py-2 px-3 font-medium text-muted-foreground w-40">رقم التليفون</th>
                </tr>
              </thead>
              <tbody>
                {distPatients.slice(0, distCount).map((p, idx) => (
                  <tr key={idx} className="border-b last:border-b-0">
                    <td className="py-1.5 px-3 text-muted-foreground text-center">{idx + 1}</td>
                    <td className="py-1.5 px-3 relative">
                      <Input
                        value={p.name}
                        onChange={(e) => {
                          const updated = [...distPatients];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setDistPatients(updated);
                          setSearchIdx(idx);
                          setSearchText(e.target.value);
                        }}
                        onFocus={() => {
                          if (p.name.length >= 1) {
                            setSearchIdx(idx);
                            setSearchText(p.name);
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            if (searchIdx === idx) {
                              setSearchIdx(null);
                              setSearchResults([]);
                            }
                          }, 200);
                        }}
                        placeholder={`ابحث عن مريض ${idx + 1}...`}
                        className="h-8 text-sm"
                        data-testid={`input-dist-name-${idx}`}
                      />
                      {searchIdx === idx && (searchResults.length > 0 || searching) && (
                        <div
                          className="absolute top-full right-0 left-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-40 overflow-y-auto"
                          data-testid={`dropdown-dist-patient-${idx}`}
                        >
                          {searching && (
                            <div className="flex items-center justify-center gap-2 p-2 text-xs text-muted-foreground">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>جاري البحث...</span>
                            </div>
                          )}
                          {searchResults.map((pt) => (
                            <div
                              key={pt.id}
                              className="px-3 py-1.5 text-xs cursor-pointer hover-elevate flex flex-row-reverse items-center justify-between gap-2 border-b last:border-b-0"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                const updated = [...distPatients];
                                updated[idx] = { name: pt.fullName, phone: pt.phone || "" };
                                setDistPatients(updated);
                                setSearchIdx(null);
                                setSearchResults([]);
                                setSearchText("");
                              }}
                              data-testid={`option-dist-patient-${idx}-${pt.id}`}
                            >
                              <span className="font-medium truncate">{pt.fullName}</span>
                              <span className="text-muted-foreground whitespace-nowrap">
                                {pt.phone || ""}{(pt as any).age ? ` | ${(pt as any).age} سنة` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-3">
                      <Input
                        value={p.phone}
                        onChange={(e) => {
                          const updated = [...distPatients];
                          updated[idx] = { ...updated[idx], phone: e.target.value };
                          setDistPatients(updated);
                        }}
                        placeholder="اختياري"
                        className="h-8 text-sm"
                        data-testid={`input-dist-phone-${idx}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Distribution Preview ── */}
          <div className="border rounded-md p-3 bg-muted/30 space-y-2">
            <p className="text-xs font-medium text-muted-foreground text-right">معاينة التوزيع:</p>

            {/* Insufficient quantity warning banner */}
            {hasInsufficientItems && (
              <div
                className="flex flex-row-reverse items-start gap-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-2"
                data-testid="banner-insufficient-qty"
              >
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700 dark:text-red-400 text-right">
                  تحذير: بعض الأصناف كميتها لا تكفي لتوزيعها على {distCount} مرضى — سيحذف الصنف من فاتورة المرضى الزائدين
                </p>
              </div>
            )}

            <div className="space-y-1 max-h-40 overflow-y-auto">
              {/* Drug / Consumable lines */}
              {previewLines.map((pl) => (
                <div
                  key={pl.tempId}
                  className={`flex flex-row-reverse items-center justify-between text-xs gap-2 rounded px-1 py-0.5 ${pl.insufficient ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                  data-testid={`preview-line-${pl.tempId}`}
                >
                  <span className="truncate flex-1 text-right font-medium">{pl.description}</span>
                  <div className="flex flex-row-reverse items-center gap-1.5 whitespace-nowrap shrink-0">
                    <span className="text-muted-foreground">
                      {pl.showConversion
                        ? `${pl.origQty} ${pl.origUnitName} → ${pl.convertedQty} ${pl.convertedUnitName}`
                        : `${pl.origQty} ${pl.origUnitName}`}
                      {" = "}
                      {pl.baseShare < pl.maxShare
                        ? `${pl.baseShare}~${pl.maxShare}`
                        : pl.baseShare}{" "}
                      {pl.convertedUnitName} لكل حالة
                    </span>
                    {pl.insufficient && (
                      <Badge
                        variant="destructive"
                        className="text-[10px] px-1 py-0 h-4 no-default-hover-elevate no-default-active-elevate"
                        data-testid={`badge-insufficient-${pl.tempId}`}
                      >
                        كمية غير كافية
                      </Badge>
                    )}
                  </div>
                </div>
              ))}

              {/* Direct lines (STAY_ENGINE, OR_ROOM) */}
              {directLines.length > 0 && (
                <div className="text-xs text-indigo-700 dark:text-indigo-300 text-right mt-1 border-t pt-1">
                  الإقامة والغرف ({directLines.length}) تذهب بالكامل لكل مريض
                </div>
              )}

              {/* Other service lines */}
              {serviceLines.length > 0 && (
                <div className="text-xs text-muted-foreground text-right mt-1 border-t pt-1">
                  الخدمات ({serviceLines.length}) ستوزع أيضاً
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            data-testid="button-dist-cancel"
          >
            إلغاء
          </Button>
          <Button
            onClick={handleDistribute}
            disabled={loading}
            data-testid="button-dist-confirm"
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin ml-1" />
              : <Users className="h-4 w-4 ml-1" />}
            تنفيذ التوزيع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
