import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Settings, Save, Loader2, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  transactionTypeLabels,
  mappingLineTypeLabels,
  type Account,
  type AccountMapping,
} from "@shared/schema";

const transactionTypes = Object.keys(transactionTypeLabels);

const lineTypesForTransaction: Record<string, string[]> = {
  sales_invoice: ["cash", "revenue_drugs", "cogs", "inventory", "returns"],
  patient_invoice: ["cash", "receivables", "revenue_services", "revenue_drugs", "revenue_consumables", "revenue_equipment", "cogs", "inventory"],
  receiving: ["inventory", "payables"],
  purchase_invoice: ["payables", "expense_general", "inventory"],
};

export default function AccountMappings() {
  const { toast } = useToast();
  const [selectedTxType, setSelectedTxType] = useState<string>(transactionTypes[0]);
  const [localMappings, setLocalMappings] = useState<Record<string, { debitAccountId: string; creditAccountId: string }>>({});
  const [hasChanges, setHasChanges] = useState(false);

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

  const saveMutation = useMutation({
    mutationFn: async (data: any[]) => {
      return apiRequest("POST", "/api/account-mappings/bulk", { mappings: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account-mappings", selectedTxType] });
      toast({ title: "تم حفظ إعدادات ربط الحسابات بنجاح" });
      setHasChanges(false);
      setLocalMappings({});
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const getMappingValue = (lineType: string, field: "debitAccountId" | "creditAccountId"): string => {
    if (localMappings[lineType]?.[field] !== undefined) {
      return localMappings[lineType][field];
    }
    const existing = mappings?.find(m => m.lineType === lineType);
    return existing?.[field] || "";
  };

  const handleChange = (lineType: string, field: "debitAccountId" | "creditAccountId", value: string) => {
    setLocalMappings(prev => ({
      ...prev,
      [lineType]: {
        ...prev[lineType],
        debitAccountId: prev[lineType]?.debitAccountId ?? (mappings?.find(m => m.lineType === lineType)?.debitAccountId || ""),
        creditAccountId: prev[lineType]?.creditAccountId ?? (mappings?.find(m => m.lineType === lineType)?.creditAccountId || ""),
        [field]: value,
      },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const lineTypes = lineTypesForTransaction[selectedTxType] || [];
    const toSave = lineTypes.map(lt => ({
      transactionType: selectedTxType,
      lineType: lt,
      debitAccountId: getMappingValue(lt, "debitAccountId") || null,
      creditAccountId: getMappingValue(lt, "creditAccountId") || null,
      isActive: true,
    })).filter(m => m.debitAccountId || m.creditAccountId);
    
    if (toSave.length === 0) {
      toast({ title: "لا توجد إعدادات للحفظ", variant: "destructive" });
      return;
    }
    saveMutation.mutate(toSave);
  };

  const handleTxTypeChange = (value: string) => {
    setSelectedTxType(value);
    setLocalMappings({});
    setHasChanges(false);
  };

  const leafAccounts = accounts?.filter(a => a.isActive) || [];
  const lineTypes = lineTypesForTransaction[selectedTxType] || [];

  const isLoading = accountsLoading || mappingsLoading;

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-page-title">ربط الحسابات بالعمليات</h1>
        </div>
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
          data-testid="button-save-mappings"
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="mr-2">حفظ</span>
        </Button>
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
            <ScrollArea className="max-h-[calc(100vh-280px)]">
              <div className="space-y-1">
                <div className="grid grid-cols-3 gap-3 px-2 py-2 bg-muted/50 rounded-md text-sm font-medium text-muted-foreground">
                  <div>نوع السطر</div>
                  <div>حساب المدين</div>
                  <div>حساب الدائن</div>
                </div>
                {lineTypes.map(lt => {
                  const debitVal = getMappingValue(lt, "debitAccountId");
                  const creditVal = getMappingValue(lt, "creditAccountId");
                  const isConfigured = debitVal && creditVal;
                  return (
                    <div
                      key={lt}
                      className="grid grid-cols-3 gap-3 px-2 py-2 border-b last:border-b-0 items-center"
                      data-testid={`mapping-row-${lt}`}
                    >
                      <div className="flex items-center gap-2">
                        {isConfigured && <Check className="h-3 w-3 text-green-500" />}
                        <span className="text-sm font-medium">{mappingLineTypeLabels[lt] || lt}</span>
                      </div>
                      <Select
                        value={debitVal}
                        onValueChange={(v) => handleChange(lt, "debitAccountId", v)}
                      >
                        <SelectTrigger className="h-9 text-xs" data-testid={`select-debit-${lt}`}>
                          <SelectValue placeholder="اختر حساب المدين" />
                        </SelectTrigger>
                        <SelectContent>
                          {leafAccounts.map(a => (
                            <SelectItem key={a.id} value={a.id} data-testid={`debit-option-${a.id}`}>
                              {a.code} - {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={creditVal}
                        onValueChange={(v) => handleChange(lt, "creditAccountId", v)}
                      >
                        <SelectTrigger className="h-9 text-xs" data-testid={`select-credit-${lt}`}>
                          <SelectValue placeholder="اختر حساب الدائن" />
                        </SelectTrigger>
                        <SelectContent>
                          {leafAccounts.map(a => (
                            <SelectItem key={a.id} value={a.id} data-testid={`credit-option-${a.id}`}>
                              {a.code} - {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
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
          <p>عند اعتماد أو ترحيل أي عملية (فاتورة بيع، فاتورة مريض، استلام، فاتورة مشتريات)، يتم إنشاء قيد يومية تلقائي بحالة "مسودة" بناءً على الإعدادات المحددة هنا.</p>
          <p>القيد التلقائي لا يؤثر على أرصدة الحسابات حتى يتم ترحيله يدوياً من شاشة القيود اليومية.</p>
          <p>يمكنك مراجعة القيود التلقائية وتعديلها قبل الترحيل، أو ترحيلها دفعة واحدة.</p>
        </CardContent>
      </Card>
    </div>
  );
}
