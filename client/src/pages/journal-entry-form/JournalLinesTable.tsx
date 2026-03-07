import { Plus, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Account, CostCenter } from "@shared/schema";
import type { JournalLineInput } from "./types";

interface Props {
  lines: JournalLineInput[];
  activeLineId: string | null;
  setActiveLineId: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  costCenterSearchQuery: string;
  setCostCenterSearchQuery: (q: string) => void;
  showAccountDropdown: boolean;
  setShowAccountDropdown: (v: boolean) => void;
  showCostCenterDropdown: boolean;
  setShowCostCenterDropdown: (v: boolean) => void;
  filteredAccounts: Account[];
  filteredCostCenters: CostCenter[];
  getAccountById: (id: string) => Account | undefined;
  getCostCenterById: (id: string | null) => CostCenter | undefined;
  selectAccount: (lineId: string, account: Account) => void;
  updateLine: (id: string, field: keyof JournalLineInput, value: string) => void;
  removeLine: (id: string) => void;
  addLine: () => void;
}

export default function JournalLinesTable({
  lines,
  activeLineId,
  setActiveLineId,
  searchQuery,
  setSearchQuery,
  costCenterSearchQuery,
  setCostCenterSearchQuery,
  showAccountDropdown,
  setShowAccountDropdown,
  showCostCenterDropdown,
  setShowCostCenterDropdown,
  filteredAccounts,
  filteredCostCenters,
  getAccountById,
  getCostCenterById,
  selectAccount,
  updateLine,
  removeLine,
  addLine,
}: Props) {
  return (
    <div className="flex-1 overflow-auto p-2">
      <div className="peachtree-grid rounded-none">
        <table className="w-full">
          <thead>
            <tr className="peachtree-grid-header">
              <th style={{ width: "35px" }}>#</th>
              <th style={{ width: "80px" }}>كود</th>
              <th style={{ width: "200px" }}>اسم الحساب</th>
              <th style={{ width: "120px" }}>مركز التكلفة</th>
              <th>البيان</th>
              <th style={{ width: "120px" }}>مدين</th>
              <th style={{ width: "120px" }}>دائن</th>
              <th style={{ width: "40px" }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const account = getAccountById(line.accountId);
              const requiresCostCenter = account?.requiresCostCenter;
              const isActiveRow = activeLineId === line.id;

              return (
                <tr key={line.id} className="peachtree-grid-row" data-testid={`row-line-${index}`}>
                  <td className="text-center font-mono text-muted-foreground text-xs">
                    {index + 1}
                  </td>
                  <td className="relative">
                    <input
                      type="text"
                      value={isActiveRow && showAccountDropdown ? searchQuery : line.accountCode}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setActiveLineId(line.id);
                        setShowAccountDropdown(true);
                        setShowCostCenterDropdown(false);
                      }}
                      onFocus={() => {
                        setActiveLineId(line.id);
                        setShowAccountDropdown(true);
                        setShowCostCenterDropdown(false);
                        setSearchQuery("");
                      }}
                      placeholder="كود"
                      className="peachtree-input w-full font-mono text-xs"
                      data-testid={`input-account-code-${index}`}
                    />
                    {isActiveRow && showAccountDropdown && (
                      <div className="absolute z-50 top-full right-0 mt-1 w-96 bg-popover border rounded shadow-lg max-h-64 overflow-auto">
                        <div className="sticky top-0 px-2 py-1.5 text-xs text-muted-foreground bg-muted border-b flex items-center justify-between">
                          <span>استخدم % للبحث المتقدم (مثال: خصم%مكتسب)</span>
                          <span className="text-primary font-medium">{filteredAccounts.length} نتيجة</span>
                        </div>
                        {filteredAccounts.length === 0 ? (
                          <div className="p-3 text-center text-xs text-muted-foreground">
                            لا توجد نتائج للبحث "{searchQuery}"
                          </div>
                        ) : (
                          filteredAccounts.slice(0, 50).map((acc) => (
                            <div
                              key={acc.id}
                              className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent text-xs border-b border-muted/50 last:border-0"
                              onClick={() => selectAccount(line.id, acc)}
                            >
                              <span className="font-mono w-16 text-muted-foreground flex-shrink-0">{acc.code}</span>
                              <span className="flex-1">{acc.name}</span>
                            </div>
                          ))
                        )}
                        {filteredAccounts.length > 50 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground bg-muted text-center">
                            +{filteredAccounts.length - 50} نتيجة أخرى - حدد البحث أكثر
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      value={line.accountName}
                      readOnly
                      placeholder="اختر الحساب"
                      className="peachtree-input w-full bg-muted/30 text-xs"
                      data-testid={`input-account-name-${index}`}
                    />
                  </td>
                  <td className="relative">
                    <input
                      type="text"
                      value={isActiveRow && showCostCenterDropdown ? costCenterSearchQuery : (getCostCenterById(line.costCenterId)?.code || "")}
                      onChange={(e) => {
                        setCostCenterSearchQuery(e.target.value);
                        setActiveLineId(line.id);
                        setShowCostCenterDropdown(true);
                        setShowAccountDropdown(false);
                      }}
                      onFocus={() => {
                        setActiveLineId(line.id);
                        setShowCostCenterDropdown(true);
                        setShowAccountDropdown(false);
                        setCostCenterSearchQuery("");
                      }}
                      placeholder={requiresCostCenter ? "مطلوب *" : "اختياري"}
                      className={`peachtree-input w-full font-mono text-xs ${requiresCostCenter && !line.costCenterId ? "border-amber-400" : ""}`}
                      data-testid={`input-cost-center-${index}`}
                    />
                    {isActiveRow && showCostCenterDropdown && (
                      <div className="absolute z-50 top-full right-0 mt-1 w-80 bg-popover border rounded shadow-lg max-h-56 overflow-auto">
                        <div className="sticky top-0 px-2 py-1.5 text-xs text-muted-foreground bg-muted border-b flex items-center justify-between">
                          <span>ابحث بالكود أو الاسم</span>
                          <span className="text-primary font-medium">{filteredCostCenters.length} نتيجة</span>
                        </div>
                        <div
                          className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent text-xs border-b border-muted/50"
                          onClick={() => {
                            updateLine(line.id, "costCenterId", "");
                            setShowCostCenterDropdown(false);
                            setCostCenterSearchQuery("");
                          }}
                        >
                          <span className="text-muted-foreground">بدون مركز تكلفة</span>
                        </div>
                        {filteredCostCenters.length === 0 ? (
                          <div className="p-3 text-center text-xs text-muted-foreground">
                            لا توجد نتائج للبحث "{costCenterSearchQuery}"
                          </div>
                        ) : (
                          filteredCostCenters.slice(0, 30).map((cc) => (
                            <div
                              key={cc.id}
                              className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent text-xs border-b border-muted/50 last:border-0"
                              onClick={() => {
                                updateLine(line.id, "costCenterId", cc.id);
                                setShowCostCenterDropdown(false);
                                setCostCenterSearchQuery("");
                              }}
                            >
                              <span className="font-mono w-12 text-muted-foreground flex-shrink-0">{cc.code}</span>
                              <span className="flex-1">{cc.name}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(line.id, "description", e.target.value)}
                      placeholder="بيان السطر"
                      className="peachtree-input w-full text-xs"
                      data-testid={`input-line-description-${index}`}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.debit}
                      onChange={(e) => updateLine(line.id, "debit", e.target.value)}
                      className="peachtree-input peachtree-amount peachtree-amount-debit w-full text-xs"
                      dir="ltr"
                      placeholder="0.00"
                      data-testid={`input-debit-${index}`}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.credit}
                      onChange={(e) => updateLine(line.id, "credit", e.target.value)}
                      className="peachtree-input peachtree-amount peachtree-amount-credit w-full text-xs"
                      dir="ltr"
                      placeholder="0.00"
                      data-testid={`input-credit-${index}`}
                    />
                  </td>
                  <td className="text-center">
                    <button
                      onClick={() => removeLine(line.id)}
                      disabled={lines.length <= 2}
                      className="text-destructive hover:text-destructive/80 disabled:opacity-30 p-1"
                      data-testid={`button-remove-line-${index}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2">
        <Button variant="outline" size="sm" onClick={addLine} data-testid="button-add-line">
          <Plus className="h-3.5 w-3.5 ml-1" />
          سطر جديد
        </Button>
      </div>
    </div>
  );
}
