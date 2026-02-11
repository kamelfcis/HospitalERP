import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings, Save, Loader2, Check, Plus, Trash2, Search, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  transactionTypeLabels,
  mappingLineTypeLabels,
  type Account,
  type AccountMapping,
} from "@shared/schema";

const transactionTypes = Object.keys(transactionTypeLabels);

const suggestedLineTypes: Record<string, string[]> = {
  sales_invoice: ["cash", "revenue_drugs", "cogs", "inventory", "returns"],
  patient_invoice: ["cash", "receivables", "revenue_services", "revenue_drugs", "revenue_consumables", "revenue_equipment", "cogs", "inventory"],
  receiving: ["inventory", "payables"],
  purchase_invoice: ["inventory", "vat_input", "discount_earned", "payables_drugs", "payables_consumables"],
  cashier_collection: ["cash", "receivables", "revenue_drugs", "revenue_general"],
  cashier_refund: ["cash", "returns", "revenue_drugs", "inventory"],
  warehouse_transfer: ["inventory"],
};

const allLineTypeOptions = Object.entries(mappingLineTypeLabels);

interface MappingRow {
  key: string;
  lineType: string;
  debitAccountId: string;
  creditAccountId: string;
}

function SearchableAccountSelect({
  accounts,
  value,
  onChange,
  placeholder,
  testId,
}: {
  accounts: Account[];
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = accounts.find(a => a.id === value);

  const filtered = search.trim()
    ? accounts.filter(a => {
        const q = search.trim().toLowerCase();
        return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
      })
    : accounts;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = useCallback((id: string) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  }, [onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearch("");
  }, [onChange]);

  return (
    <div ref={containerRef} className="relative" data-testid={testId}>
      <div
        className="flex items-center h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs cursor-pointer gap-1"
        onClick={() => {
          setOpen(!open);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
      >
        {selectedAccount ? (
          <>
            <span className="truncate flex-1">{selectedAccount.code} - {selectedAccount.name}</span>
            <X className="h-3 w-3 text-muted-foreground shrink-0 cursor-pointer" onClick={handleClear} />
          </>
        ) : (
          <span className="text-muted-foreground flex-1">{placeholder}</span>
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full min-w-[280px] bg-popover border border-border rounded-md shadow-lg">
          <div className="flex items-center gap-1 p-2 border-b">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالكود أو الاسم..."
              className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 p-0"
              data-testid={`${testId}-search`}
            />
          </div>
          <ScrollArea className="max-h-[200px]">
            <div className="p-1">
              {filtered.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-3">لا توجد نتائج</div>
              ) : (
                filtered.slice(0, 50).map(a => (
                  <div
                    key={a.id}
                    className={`text-xs px-2 py-1.5 cursor-pointer rounded-sm hover-elevate ${a.id === value ? "bg-primary/10 font-medium" : ""}`}
                    onClick={() => handleSelect(a.id)}
                    data-testid={`${testId}-option-${a.id}`}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground ml-2">{a.code}</span>
                    {a.name}
                  </div>
                ))
              )}
              {filtered.length > 50 && (
                <div className="text-[10px] text-muted-foreground text-center py-1">
                  يوجد {filtered.length - 50} حساب إضافي - حسّن البحث
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

export default function AccountMappings() {
  const { toast } = useToast();
  const [selectedTxType, setSelectedTxType] = useState<string>(transactionTypes[0]);
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  let keyCounter = useRef(0);

  const { data: accounts, isLoading: accountsLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: mappings, isLoading: mappingsLoading } = useQuery<AccountMapping[]>({
    queryKey: ["/api/account-mappings", selectedTxType],
    queryFn: async () => {
      const res = await fetch(`/api/account-mappings?transactionType=${selectedTxType}`);
      if (!res.ok) throw new Error("فشل في تحميل الإعدادات");
      return res.json();
    },
  });

  useEffect(() => {
    if (mappingsLoading) return;
    const savedMappings = mappings || [];
    const suggested = suggestedLineTypes[selectedTxType] || [];

    const combined = savedMappings.map(m => m.lineType).concat(suggested);
    const allLineTypes = Array.from(new Set(combined));

    const newRows: MappingRow[] = allLineTypes.map(lt => {
      const existing = savedMappings.find(m => m.lineType === lt);
      return {
        key: `row-${keyCounter.current++}`,
        lineType: lt,
        debitAccountId: existing?.debitAccountId || "",
        creditAccountId: existing?.creditAccountId || "",
      };
    });

    setRows(newRows);
    setHasChanges(false);
  }, [mappings, mappingsLoading, selectedTxType]);

  const saveMutation = useMutation({
    mutationFn: async (data: any[]) => {
      return apiRequest("POST", "/api/account-mappings/bulk", { mappings: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account-mappings", selectedTxType] });
      toast({ title: "تم حفظ إعدادات ربط الحسابات بنجاح" });
      setHasChanges(false);
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const updateRow = (key: string, field: keyof MappingRow, value: string) => {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r));
    setHasChanges(true);
  };

  const addRow = () => {
    const usedTypes = new Set(rows.map(r => r.lineType));
    const nextType = allLineTypeOptions.find(([k]) => !usedTypes.has(k))?.[0] || "";
    setRows(prev => [
      ...prev,
      { key: `row-${keyCounter.current++}`, lineType: nextType, debitAccountId: "", creditAccountId: "" },
    ]);
    setHasChanges(true);
  };

  const removeRow = (key: string) => {
    setRows(prev => prev.filter(r => r.key !== key));
    setHasChanges(true);
  };

  const handleSave = () => {
    const validRows = rows.filter(r => r.lineType && (r.debitAccountId || r.creditAccountId));
    if (validRows.length === 0) {
      toast({ title: "لا توجد إعدادات للحفظ", variant: "destructive" });
      return;
    }
    const toSave = validRows.map(r => ({
      transactionType: selectedTxType,
      lineType: r.lineType,
      debitAccountId: r.debitAccountId || null,
      creditAccountId: r.creditAccountId || null,
      isActive: true,
    }));
    saveMutation.mutate(toSave);
  };

  const handleTxTypeChange = (value: string) => {
    setSelectedTxType(value);
  };

  const leafAccounts = accounts?.filter(a => a.isActive) || [];
  const isLoading = accountsLoading || mappingsLoading;
  const usedLineTypes = new Set(rows.map(r => r.lineType));

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-page-title">ربط الحسابات بالعمليات</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={addRow}
            data-testid="button-add-row"
          >
            <Plus className="h-4 w-4" />
            <span className="mr-1">إضافة سطر</span>
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
            data-testid="button-save-mappings"
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="mr-1">حفظ</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4 flex-wrap">
            <CardTitle className="text-base">نوع العملية</CardTitle>
            <Select value={selectedTxType} onValueChange={handleTxTypeChange}>
              <SelectTrigger className="w-[250px]" data-testid="select-transaction-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {transactionTypes.map(t => (
                  <SelectItem key={t} value={t} data-testid={`option-tx-type-${t}`}>
                    {transactionTypeLabels[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <ScrollArea className="max-h-[calc(100vh-320px)]">
              <div className="space-y-1">
                <div className="grid grid-cols-[1fr_2fr_2fr_auto] gap-3 px-2 py-2 bg-muted/50 rounded-md text-sm font-medium text-muted-foreground">
                  <div>نوع البند</div>
                  <div>حساب المدين</div>
                  <div>حساب الدائن</div>
                  <div className="w-9"></div>
                </div>
                {rows.map(row => {
                  const isConfigured = row.debitAccountId && row.creditAccountId;
                  return (
                    <div
                      key={row.key}
                      className="grid grid-cols-[1fr_2fr_2fr_auto] gap-3 px-2 py-2 border-b last:border-b-0 items-center"
                      data-testid={`mapping-row-${row.lineType || row.key}`}
                    >
                      <div className="flex items-center gap-1">
                        {isConfigured && <Check className="h-3 w-3 text-green-500 shrink-0" />}
                        <Select
                          value={row.lineType}
                          onValueChange={(v) => updateRow(row.key, "lineType", v)}
                        >
                          <SelectTrigger className="h-9 text-xs" data-testid={`select-linetype-${row.key}`}>
                            <SelectValue placeholder="اختر نوع البند" />
                          </SelectTrigger>
                          <SelectContent>
                            {allLineTypeOptions.map(([k, label]) => (
                              <SelectItem
                                key={k}
                                value={k}
                                disabled={usedLineTypes.has(k) && k !== row.lineType}
                              >
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <SearchableAccountSelect
                        accounts={leafAccounts}
                        value={row.debitAccountId}
                        onChange={(v) => updateRow(row.key, "debitAccountId", v)}
                        placeholder="اختر حساب المدين"
                        testId={`select-debit-${row.lineType || row.key}`}
                      />
                      <SearchableAccountSelect
                        accounts={leafAccounts}
                        value={row.creditAccountId}
                        onChange={(v) => updateRow(row.key, "creditAccountId", v)}
                        placeholder="اختر حساب الدائن"
                        testId={`select-credit-${row.lineType || row.key}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeRow(row.key)}
                        data-testid={`button-remove-${row.key}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
                {rows.length === 0 && (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    لا توجد سطور - اضغط "إضافة سطر" لإضافة ربط حسابات
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">كيف يعمل ربط الحسابات</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>عند اعتماد أو ترحيل أي عملية، يتم إنشاء قيد يومية تلقائي بحالة "مسودة" بناءً على الإعدادات المحددة هنا.</p>
          <p>يمكنك إضافة أي عدد من السطور لكل نوع عملية، واختيار الحسابات بالبحث بالكود أو الاسم.</p>
          <p>القيد التلقائي لا يؤثر على أرصدة الحسابات حتى يتم ترحيله يدوياً من شاشة القيود اليومية.</p>
        </CardContent>
      </Card>
    </div>
  );
}
