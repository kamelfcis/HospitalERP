import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Save,
  Plus,
  Trash2,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
  Search,
} from "lucide-react";
import { formatCurrency, formatDateForInput } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { Account, CostCenter, JournalEntryWithLines, JournalTemplate } from "@shared/schema";

interface JournalLineInput {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  costCenterId: string | null;
  description: string;
  debit: string;
  credit: string;
}

export default function JournalEntryForm() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = useParams<{ id?: string }>();
  const isEditing = !!params.id && params.id !== "new";

  const [entryDate, setEntryDate] = useState(formatDateForInput(new Date()));
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<JournalLineInput[]>([
    { id: "1", accountId: "", accountCode: "", accountName: "", costCenterId: null, description: "", debit: "", credit: "" },
    { id: "2", accountId: "", accountCode: "", accountName: "", costCenterId: null, description: "", debit: "", credit: "" },
  ]);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: costCenters } = useQuery<CostCenter[]>({
    queryKey: ["/api/cost-centers"],
  });

  const { data: existingEntry, isLoading: isLoadingEntry } = useQuery<JournalEntryWithLines>({
    queryKey: ["/api/journal-entries", params.id],
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingEntry) {
      setEntryDate(formatDateForInput(existingEntry.entryDate));
      setDescription(existingEntry.description);
      setReference(existingEntry.reference || "");
      if (existingEntry.lines && existingEntry.lines.length > 0) {
        setLines(
          existingEntry.lines.map((line, index) => {
            const account = accounts?.find(a => a.id === line.accountId);
            return {
              id: line.id || `line-${index}`,
              accountId: line.accountId,
              accountCode: account?.code || "",
              accountName: account?.name || "",
              costCenterId: line.costCenterId,
              description: line.description || "",
              debit: line.debit || "",
              credit: line.credit || "",
            };
          })
        );
      }
    }
  }, [existingEntry, accounts]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/journal-entries", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "تم إنشاء القيد بنجاح" });
      navigate("/journal-entries");
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PATCH", `/api/journal-entries/${params.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "تم تحديث القيد بنجاح" });
      navigate("/journal-entries");
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const totals = useMemo(() => {
    const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
    const difference = Math.abs(totalDebit - totalCredit);
    const isBalanced = difference < 0.01;
    return { totalDebit, totalCredit, difference, isBalanced };
  }, [lines]);

  const addLine = () => {
    setLines([
      ...lines,
      {
        id: `new-${Date.now()}`,
        accountId: "",
        accountCode: "",
        accountName: "",
        costCenterId: null,
        description: "",
        debit: "",
        credit: "",
      },
    ]);
  };

  const removeLine = (id: string) => {
    if (lines.length > 2) {
      setLines(lines.filter((line) => line.id !== id));
    }
  };

  const updateLine = (id: string, field: keyof JournalLineInput, value: string) => {
    setLines(
      lines.map((line) => {
        if (line.id === id) {
          const updated = { ...line, [field]: value };
          if (field === "debit" && value) {
            updated.credit = "";
          } else if (field === "credit" && value) {
            updated.debit = "";
          }
          return updated;
        }
        return line;
      })
    );
  };

  const selectAccount = (lineId: string, account: Account) => {
    setLines(
      lines.map((line) => {
        if (line.id === lineId) {
          return {
            ...line,
            accountId: account.id,
            accountCode: account.code,
            accountName: account.name,
          };
        }
        return line;
      })
    );
    setShowAccountDropdown(false);
    setSearchQuery("");
    setActiveLineId(null);
  };

  const matchesPattern = (text: string, pattern: string): boolean => {
    if (!pattern) return true;
    const lowerText = text.toLowerCase();
    const lowerPattern = pattern.toLowerCase();
    if (lowerPattern.includes("%")) {
      const parts = lowerPattern.split("%").filter(p => p.length > 0);
      let lastIndex = 0;
      for (const part of parts) {
        const index = lowerText.indexOf(part, lastIndex);
        if (index === -1) return false;
        lastIndex = index + part.length;
      }
      return true;
    }
    return lowerText.includes(lowerPattern);
  };

  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    if (!searchQuery.trim()) {
      return accounts.filter(a => a.isActive);
    }
    return accounts.filter((account) => {
      if (!account.isActive) return false;
      const searchText = `${account.code} ${account.name}`;
      return matchesPattern(searchText, searchQuery);
    });
  }, [accounts, searchQuery]);

  const getAccountById = (id: string) => accounts?.find((a) => a.id === id);

  const validateEntry = () => {
    if (!entryDate) {
      toast({ title: "خطأ", description: "يرجى تحديد تاريخ القيد", variant: "destructive" });
      return false;
    }
    if (!description.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال بيان القيد", variant: "destructive" });
      return false;
    }
    
    const validLines = lines.filter(
      (line) => line.accountId && (parseFloat(line.debit) > 0 || parseFloat(line.credit) > 0)
    );
    
    if (validLines.length < 2) {
      toast({ title: "خطأ", description: "يجب إدخال سطرين على الأقل", variant: "destructive" });
      return false;
    }

    for (const line of validLines) {
      const account = getAccountById(line.accountId);
      if (account?.requiresCostCenter && !line.costCenterId) {
        toast({
          title: "خطأ",
          description: `الحساب "${account.name}" يتطلب مركز تكلفة`,
          variant: "destructive",
        });
        return false;
      }
    }

    if (!totals.isBalanced) {
      toast({ title: "خطأ", description: "القيد غير متوازن", variant: "destructive" });
      return false;
    }

    return true;
  };

  const handleSave = (andPost: boolean = false) => {
    if (!validateEntry()) return;

    const validLines = lines
      .filter((line) => line.accountId && (parseFloat(line.debit) > 0 || parseFloat(line.credit) > 0))
      .map((line, index) => ({
        lineNumber: index + 1,
        accountId: line.accountId,
        costCenterId: line.costCenterId || null,
        description: line.description,
        debit: line.debit || "0",
        credit: line.credit || "0",
      }));

    const entryData = {
      entryDate,
      description,
      reference: reference || null,
      templateId: null,
      totalDebit: totals.totalDebit.toFixed(2),
      totalCredit: totals.totalCredit.toFixed(2),
      lines: validLines,
    };

    if (isEditing) {
      updateMutation.mutate(entryData);
    } else {
      createMutation.mutate({ ...entryData, postAfterSave: andPost });
    }
  };

  if (isEditing && isLoadingEntry) {
    return (
      <div className="p-4">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isEditing && existingEntry?.status !== "draft") {
    return (
      <div className="p-4">
        <div className="peachtree-grid p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">لا يمكن تعديل هذا القيد</h2>
          <p className="text-muted-foreground mb-4">
            هذا القيد {existingEntry?.status === "posted" ? "مُرحّل" : "ملغي"} ولا يمكن تعديله
          </p>
          <Button onClick={() => navigate("/journal-entries")}>
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة للقيود
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Peachtree-style Toolbar */}
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/journal-entries")} data-testid="button-back">
            <ArrowRight className="h-4 w-4 ml-1" />
            رجوع
          </Button>
          <div className="h-6 w-px bg-border" />
          <h1 className="text-base font-bold">
            {isEditing ? `تعديل قيد #${existingEntry?.entryNumber}` : "قيد يومي جديد"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSave(false)}
            disabled={createMutation.isPending || updateMutation.isPending}
            data-testid="button-save-draft"
          >
            <Save className="h-4 w-4 ml-1" />
            حفظ مسودة
          </Button>
          <Button
            size="sm"
            onClick={() => handleSave(true)}
            disabled={createMutation.isPending || updateMutation.isPending || !totals.isBalanced}
            className="bg-emerald-600 hover:bg-emerald-700"
            data-testid="button-save-and-post"
          >
            <CheckCircle className="h-4 w-4 ml-1" />
            حفظ وترحيل
          </Button>
        </div>
      </div>

      {/* Entry Header - Compact */}
      <div className="peachtree-toolbar flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Label htmlFor="entryDate" className="text-xs font-semibold whitespace-nowrap">التاريخ:</Label>
          <Input
            id="entryDate"
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="peachtree-input w-36"
            data-testid="input-entry-date"
          />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Label htmlFor="description" className="text-xs font-semibold whitespace-nowrap">البيان:</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="بيان القيد"
            className="peachtree-input flex-1"
            data-testid="input-entry-description"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="reference" className="text-xs font-semibold whitespace-nowrap">المرجع:</Label>
          <Input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="اختياري"
            className="peachtree-input w-28"
            data-testid="input-entry-reference"
          />
        </div>
      </div>

      {/* Journal Lines Grid - Peachtree Style */}
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
                        }}
                        onFocus={() => {
                          setActiveLineId(line.id);
                          setShowAccountDropdown(true);
                          setSearchQuery("");
                        }}
                        placeholder="كود"
                        className="peachtree-input w-full font-mono text-xs"
                        data-testid={`input-account-code-${index}`}
                      />
                      {isActiveRow && showAccountDropdown && (
                        <div className="absolute z-50 top-full right-0 mt-1 w-80 bg-popover border rounded shadow-lg max-h-48 overflow-auto">
                          <div className="px-2 py-1 text-xs text-muted-foreground bg-muted border-b">
                            استخدم % للبحث المتقدم
                          </div>
                          {filteredAccounts.length === 0 ? (
                            <div className="p-2 text-center text-xs text-muted-foreground">لا توجد نتائج</div>
                          ) : (
                            filteredAccounts.slice(0, 10).map((acc) => (
                              <div
                                key={acc.id}
                                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent text-xs"
                                onClick={() => selectAccount(line.id, acc)}
                              >
                                <span className="font-mono w-14 text-muted-foreground">{acc.code}</span>
                                <span className="flex-1 truncate">{acc.name}</span>
                              </div>
                            ))
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
                    <td>
                      <select
                        value={line.costCenterId || ""}
                        onChange={(e) => updateLine(line.id, "costCenterId", e.target.value)}
                        disabled={!requiresCostCenter}
                        className={`peachtree-select w-full text-xs ${requiresCostCenter && !line.costCenterId ? "border-amber-400" : ""}`}
                        data-testid={`select-cost-center-${index}`}
                      >
                        <option value="">{requiresCostCenter ? "مطلوب *" : "اختياري"}</option>
                        {costCenters?.filter((c) => c.isActive).map((cc) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.code} - {cc.name}
                          </option>
                        ))}
                      </select>
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

        {/* Add Line Button */}
        <div className="mt-2">
          <Button variant="outline" size="sm" onClick={addLine} data-testid="button-add-line">
            <Plus className="h-3.5 w-3.5 ml-1" />
            سطر جديد
          </Button>
        </div>
      </div>

      {/* Totals Bar - Peachtree Style */}
      <div className={`p-3 flex items-center justify-between ${totals.isBalanced ? "peachtree-totals peachtree-totals-balanced" : "peachtree-totals peachtree-totals-unbalanced"}`}>
        <div className="flex items-center gap-2">
          {totals.isBalanced ? (
            <>
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <span className="text-emerald-800 font-semibold">القيد متوازن</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span className="text-red-800 font-semibold">
                الفرق: {formatCurrency(totals.difference)}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-8">
          <div className="text-left">
            <span className="text-xs text-muted-foreground ml-2">إجمالي المدين:</span>
            <span className="font-mono font-bold text-lg peachtree-amount-debit">
              {formatCurrency(totals.totalDebit)}
            </span>
          </div>
          <div className="text-left">
            <span className="text-xs text-muted-foreground ml-2">إجمالي الدائن:</span>
            <span className="font-mono font-bold text-lg peachtree-amount-credit">
              {formatCurrency(totals.totalCredit)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
