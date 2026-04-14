/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  شاشة سداد الموردين — Supplier Payments
 *  Layout: header (title + tabs) → supplier row → controls bar → TABLE (hero)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState } from "react";
import { CircleDollarSign, Banknote } from "lucide-react";
import { SupplierCombobox } from "@/components/SupplierCombobox";
import { BalanceStrip } from "./components/BalanceStrip";
import { PaymentTab } from "./components/PaymentTab";
import { StatementTab } from "./components/StatementTab";

function cx(...cls: (string | false | undefined | null)[]) {
  return cls.filter(Boolean).join(" ");
}

type ActiveTab = "payment" | "statement";

export default function SupplierPaymentsPage() {
  const [supplierId, setSupplierId] = useState("");
  const [activeTab,  setActiveTab]  = useState<ActiveTab>("payment");

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">

      <div className="flex items-center justify-between gap-4 px-4 py-2 border-b shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <CircleDollarSign className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-base font-bold">سداد الموردين</h1>
        </div>

        {supplierId && (
          <div className="flex items-center border rounded-lg overflow-hidden text-sm">
            <button
              onClick={() => setActiveTab("payment")}
              className={cx(
                "px-4 py-1.5 transition-colors font-medium",
                activeTab === "payment"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              )}
              data-testid="tab-payment"
            >
              سداد الفواتير
            </button>
            <button
              onClick={() => setActiveTab("statement")}
              className={cx(
                "px-4 py-1.5 transition-colors font-medium border-r",
                activeTab === "statement"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              )}
              data-testid="tab-statement"
            >
              كشف الحساب
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 px-4 py-2 gap-2">

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <div className="w-[300px]">
            <SupplierCombobox
              value={supplierId}
              onChange={setSupplierId}
              placeholder="اختر المورد…"
              clearable
            />
          </div>
          {supplierId && <BalanceStrip supplierId={supplierId} />}
        </div>

        {!supplierId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground border-2 border-dashed rounded-xl">
            <Banknote className="h-12 w-12 opacity-30" />
            <p className="text-sm">اختر مورداً لعرض فواتيره وإجراء السداد</p>
          </div>
        ) : activeTab === "payment" ? (
          <PaymentTab supplierId={supplierId} />
        ) : (
          <StatementTab supplierId={supplierId} />
        )}
      </div>
    </div>
  );
}
