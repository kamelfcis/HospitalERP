import { useEffect, useRef } from "react";
import type { UseMutationResult } from "@tanstack/react-query";

type TabId = "sales" | "returns";

function isTextFieldTarget(t: EventTarget | null): boolean {
  if (!t || !(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(t.closest("[data-hotkey-ignore]"));
}

interface InvoiceTabNav {
  filtered: { id: string }[];
  selected: Set<string>;
  toggleAll: () => void;
  clearAll: () => void;
  clearSelection: () => void;
  selectRelative: (delta: number) => void;
  selectFirst: () => void;
  selectLast: () => void;
}

interface UseCashierKeyboardParams {
  enabled: boolean;
  isStale: boolean;
  hasActiveShift: boolean;
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;
  salesTab: InvoiceTabNav;
  returnsTab: InvoiceTabNav;
  collectMutation: UseMutationResult<unknown, Error, void, unknown>;
  refundMutation: UseMutationResult<unknown, Error, void, unknown>;
}

/**
 * اختصارات شاشة تحصيل الكاشير.
 *
 * | الاختصار              | الإجراء                            |
 * |-----------------------|------------------------------------|
 * | Alt+1 / Alt+ق (١)     | تاب تحصيل المبيعات                 |
 * | Alt+2 / Alt+ر (٢)     | تاب المرتجعات                      |
 * | /                     | تركيز البحث (خارج حقول النص)       |
 * | Escape                | مسح الاختيار والبحث (خارج الحوار)  |
 * | Shift+Alt+A           | تحديد كل الفواتير المفلترة         |
 * | ↑ / ↓                 | تنقّل بين الفواتير (صف واحد)       |
 * | Home / End            | أول / آخر فاتورة                   |
 * | Ctrl+Enter أو F9      | تحصيل / صرف حسب التاب              |
 * | F4                    | تركيز زر «إغلاق الوردية»           |
 */
export function useCashierKeyboard({
  enabled,
  isStale,
  hasActiveShift,
  activeTab,
  setActiveTab,
  salesTab,
  returnsTab,
  collectMutation,
  refundMutation,
}: UseCashierKeyboardParams) {
  const stateRef = useRef({
    enabled,
    isStale,
    hasActiveShift,
    activeTab,
    setActiveTab,
    salesTab,
    returnsTab,
    collectMutation,
    refundMutation,
  });
  stateRef.current = {
    enabled,
    isStale,
    hasActiveShift,
    activeTab,
    setActiveTab,
    salesTab,
    returnsTab,
    collectMutation,
    refundMutation,
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s.enabled || !s.hasActiveShift) return;
      if (e.defaultPrevented || !e.isTrusted) return;

      const typing = isTextFieldTarget(e.target);
      const inDialog = (e.target as HTMLElement).closest('[role="dialog"]');

      const active = s.activeTab === "sales" ? s.salesTab : s.returnsTab;

      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.code === "Digit1" || e.code === "Numpad1" || e.key === "١") {
          e.preventDefault();
          s.setActiveTab("sales");
          return;
        }
        if (e.code === "Digit2" || e.code === "Numpad2" || e.key === "٢") {
          e.preventDefault();
          s.setActiveTab("returns");
          return;
        }
      }

      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const id = s.activeTab === "sales" ? "input-sales-search" : "input-returns-search";
        const el = document.querySelector<HTMLInputElement>(`[data-testid="${id}"]`);
        el?.focus();
        el?.select?.();
        return;
      }

      if (e.key === "F4" && !typing) {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>('[data-testid="button-close-shift"]')?.focus();
        return;
      }

      if (e.key === "Escape" && !inDialog) {
        active.clearAll();
        return;
      }

      if (e.altKey && e.shiftKey && (e.key === "a" || e.key === "A") && !e.ctrlKey && !e.metaKey) {
        if (typing) return;
        e.preventDefault();
        active.toggleAll();
        return;
      }

      if (!typing) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          active.selectRelative(+1);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          active.selectRelative(-1);
          return;
        }
        if (e.key === "Home") {
          e.preventDefault();
          active.selectFirst();
          return;
        }
        if (e.key === "End") {
          e.preventDefault();
          active.selectLast();
          return;
        }
      }

      if (((e.ctrlKey || e.metaKey) && e.key === "Enter") || e.key === "F9") {
        if (typing) return;
        e.preventDefault();
        if (s.isStale) return;
        if (s.activeTab === "sales") {
          if (s.salesTab.selected.size === 0 || s.collectMutation.isPending) return;
          s.collectMutation.mutate();
        } else {
          if (s.returnsTab.selected.size === 0 || s.refundMutation.isPending) return;
          s.refundMutation.mutate();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
