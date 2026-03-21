/**
 * ContractMemberLookup
 *
 * Self-contained lookup UI for booking contract/insurance patients.
 * Renders only when paymentType = "INSURANCE" or "CONTRACT".
 *
 * Responsibilities:
 *   - Card number input + search button
 *   - Shows spinner while looking up
 *   - Shows clear error when not found or invalid
 *   - Delegates resolved state display to ResolvedContractSummary
 *   - Never duplicates lookup logic (owned by useContractResolution hook)
 */

import { useCallback, useRef } from "react";
import { Input }  from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label }  from "@/components/ui/label";
import { Loader2, Search, AlertCircle } from "lucide-react";
import { ResolvedContractSummary } from "./ResolvedContractSummary";
import type { UseContractResolutionReturn } from "../hooks/useContractResolution";

interface Props {
  paymentType: "INSURANCE" | "CONTRACT";
  resolution: UseContractResolutionReturn;
  appointmentDate?: string;
}

export function ContractMemberLookup({ paymentType, resolution, appointmentDate }: Props) {
  const { state, setCardNumber, lookup, clear } = resolution;
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async () => {
    await lookup(appointmentDate);
  }, [lookup, appointmentDate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch]);

  const isContract  = paymentType === "CONTRACT";
  const label       = isContract ? "بطاقة المنتسب / رقم العضوية *" : "رقم بطاقة التأمين (اختياري)";
  const placeholder = isContract ? "أدخل رقم البطاقة للبحث" : "أدخل رقم بطاقة التأمين للتحقق";

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>

      {state.resolved ? (
        <ResolvedContractSummary resolved={state.resolved} onClear={clear} />
      ) : (
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              value={state.cardNumber}
              onChange={e => setCardNumber(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={[
                "h-7 text-xs font-mono pl-2",
                state.error ? "border-red-400 focus-visible:ring-red-400" : "",
              ].join(" ")}
              autoComplete="off"
              dir="ltr"
              data-testid="input-member-card-number"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 shrink-0"
            onClick={handleSearch}
            disabled={state.isLooking || state.cardNumber.trim().length < 3}
            data-testid="button-lookup-member"
          >
            {state.isLooking
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Search className="h-3.5 w-3.5" />
            }
          </Button>
        </div>
      )}

      {state.error && !state.resolved && (
        <div
          className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5"
          data-testid="text-contract-lookup-error"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      {!isContract && !state.resolved && (
        <p className="text-xs text-muted-foreground px-0.5">
          اختياري — يمكن إدخال البطاقة للتحقق والربط الفعلي، أو اترك فارغاً وسيتم التسجيل كتأمين نصي
        </p>
      )}
      {isContract && !state.resolved && (
        <p className="text-xs text-muted-foreground px-0.5">
          سيتم إنشاء فاتورة آجلة بشروط التعاقد — يجب تحديد المنتسب
        </p>
      )}
    </div>
  );
}
