/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  useShortageRequest — كشكول النواقص: اختصار Alt+S
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  يُستخدَم في:
 *    - فواتير البيع (sales-invoices)
 *    - فواتير المرضى (patient-invoices)
 *    - أي شاشة فيها "صنف محدد" وتريد تفعيل الإبلاغ عن نقص بـ Alt+S
 *
 *  الاستخدام:
 *    const { triggerShortage } = useShortageRequest({
 *      getSelectedItem: () => ({ itemId: line.itemId, warehouseId: warehouseId }),
 *      sourceScreen: "sales_invoice",
 *    });
 *
 *  ثم يمكن استدعاء triggerShortage() يدوياً أو الاعتماد على الـ global Alt+S.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ShortageRequestItem {
  itemId:      string;
  warehouseId?: string | null;
}

interface UseShortageRequestOptions {
  /** دالة تُعيد الصنف المحدد حالياً — null إذا لم يكن هناك صنف */
  getSelectedItem: () => ShortageRequestItem | null;
  /** اسم الشاشة المصدر — يُخزَّن في shortage_events.source_screen */
  sourceScreen: string;
  /** تفعيل المستمع العالمي لـ Alt+S — افتراضياً true */
  enableGlobalShortcut?: boolean;
}

interface ShortageRequestResponse {
  recorded: boolean;
  reason?:  string;
}

export function useShortageRequest(options: UseShortageRequestOptions) {
  const { getSelectedItem, sourceScreen, enableGlobalShortcut = true } = options;
  const { toast } = useToast();

  // debounce guard من جانب الـ client (500ms) — يمنع إرسال طلبين عند ضغطتين متتاليتين
  const lastSentRef = useRef<number>(0);

  const mutation = useMutation<ShortageRequestResponse, Error, ShortageRequestItem>({
    mutationFn: (item) =>
      apiRequest("POST", "/api/shortage/request", {
        itemId:      item.itemId,
        warehouseId: item.warehouseId ?? null,
        sourceScreen,
      }),
    onSuccess: (data, item) => {
      if (!data.recorded && data.reason === "duplicate") {
        toast({
          title: "⚡ طلب النقص مُسجَّل بالفعل",
          description: "تم تسجيل هذا الصنف كناقص مؤخراً — لا حاجة للتكرار.",
          variant: "default",
        });
      } else {
        toast({
          title: "✓ تم تسجيل النقص",
          description: "تمت إضافة الصنف لكشكول النواقص.",
          variant: "default",
        });
      }
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "تعذّر تسجيل النقص — تحقق من الاتصال.",
        variant: "destructive",
      });
    },
  });

  const triggerShortage = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < 500) return; // client-side debounce

    const item = getSelectedItem();
    if (!item) {
      toast({
        title: "لم يُحدَّد صنف",
        description: "اختر صنفاً أولاً ثم اضغط Alt+S للإبلاغ عن النقص.",
        variant: "default",
      });
      return;
    }

    lastSentRef.current = now;
    mutation.mutate(item);
  }, [getSelectedItem, mutation, toast]);

  // ── Global Alt+S listener ─────────────────────────────────────────────────
  useEffect(() => {
    if (!enableGlobalShortcut) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "s" || e.key === "S" || e.key === "س")) {
        // لا نمنع الـ default هنا — نتركها تعمل فقط إذا لم يكن في مدخل نصي يستخدم Alt+S
        const target = e.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || tagName === "select") {
          // نسمح بـ Alt+S من المدخلات أيضاً (الصيدلاني عادةً في خلية qty)
          // لكن نمنع السلوك الافتراضي لعدم إدراج حرف
        }
        e.preventDefault();
        triggerShortage();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enableGlobalShortcut, triggerShortage]);

  return {
    triggerShortage,
    isPending: mutation.isPending,
  };
}
