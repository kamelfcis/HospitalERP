/**
 * ContractSelectCombobox — اختيار عقد نشط من قائمة منسدلة
 *
 * يجلب كل العقود النشطة من /api/contracts/active
 * يعرض: اسم العقد + اسم الشركة + نسبة التغطية
 * يُرسل: contractId + companyId + companyName + companyCoveragePct داخلياً
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Building2, ChevronDown, X } from "lucide-react";

export interface ActiveContract {
  id:                 string;
  contractName:       string;
  contractNumber:     string | null;
  companyCoveragePct: string | null;
  startDate:          string;
  endDate:            string;
  companyId:          string;
  companyName:        string;
}

export interface ContractResolved {
  contractId:         string;
  companyId:          string;
  companyName:        string;
  companyCoveragePct: number;
  contractName:       string;
}

interface Props {
  value?:    string;    // contractId المحدد
  onChange:  (resolved: ContractResolved) => void;
  onClear?:  () => void;
  disabled?: boolean;
  "data-testid"?: string;
}

export function ContractSelectCombobox({
  value, onChange, onClear, disabled,
  "data-testid": testId = "contract-select",
}: Props) {
  const { data: contracts = [], isLoading } = useQuery<ActiveContract[]>({
    queryKey: ["/api/contracts/active"],
    queryFn:  () => apiRequest("GET", "/api/contracts/active").then(r => r.json()),
  });

  const selected = contracts.find(c => c.id === value);

  function handleChange(contractId: string) {
    if (!contractId) { onClear?.(); return; }
    const c = contracts.find(x => x.id === contractId);
    if (!c) return;
    onChange({
      contractId:         c.id,
      companyId:          c.companyId,
      companyName:        c.companyName,
      companyCoveragePct: parseFloat(c.companyCoveragePct || "100") || 100,
      contractName:       c.contractName,
    });
  }

  return (
    <div className="flex items-center gap-1" data-testid={testId}>
      <Building2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
      <div className="relative">
        <select
          value={value || ""}
          onChange={e => handleChange(e.target.value)}
          disabled={disabled || isLoading}
          className="peachtree-select min-w-[200px] appearance-none pr-7"
          data-testid={`${testId}-select`}
        >
          <option value="">
            {isLoading ? "جارٍ التحميل..." : "اختر العقد / الجهة..."}
          </option>
          {contracts.map(c => (
            <option key={c.id} value={c.id}>
              {c.contractName} — {c.companyName}
              {c.companyCoveragePct ? ` (${c.companyCoveragePct}%)` : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>
      {value && !disabled && (
        <button
          type="button"
          onClick={onClear}
          className="text-muted-foreground hover:text-red-500 transition-colors"
          data-testid={`${testId}-clear`}
          title="إلغاء تحديد العقد"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {selected && (
        <span className="text-[11px] text-blue-700 dark:text-blue-300 font-medium">
          تغطية {selected.companyCoveragePct ?? "100"}%
        </span>
      )}
    </div>
  );
}
