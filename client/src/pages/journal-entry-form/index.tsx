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
  ArrowRight,
  CheckCircle,
  FileText,
  Download,
  ChevronDown,
} from "lucide-react";
import { formatDateForInput } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertTriangle } from "lucide-react";
import type { Account, CostCenter, JournalEntryWithLines, JournalTemplate, TemplateLine } from "@shared/schema";
import type { JournalLineInput } from "./types";
import JournalLinesTable from "./JournalLinesTable";
import JournalTotalsBar from "./JournalTotalsBar";
import SaveTemplateDialog from "./SaveTemplateDialog";

const emptyLine = (id: string): JournalLineInput => ({
  id,
  accountId: "",
  accountCode: "",
  accountName: "",
  costCenterId: null,
  description: "",
  debit: "",
  credit: "",
});

export default function JournalEntryForm() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = useParams<{ id?: string }>();
  const isEditing = !!params.id && params.id !== "new";

  const [entryDate, setEntryDate] = useState(formatDateForInput(new Date()));
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<JournalLineInput[]>([
    emptyLine("1"),
    emptyLine("2"),
  ]);

  const [searchQuery, setSearchQuery] = useState("");
  const [costCenterSearchQuery, setCostCenterSearchQuery] = useState("");
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showCostCenterDropdown, setShowCostCenterDropdown] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: costCenters } = useQuery<CostCenter[]>({
    queryKey: ["/api/cost-centers"],
  });

  const { data: templates } = useQuery<JournalTemplate[]>({
    queryKey: ["/api/templates"],
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
    mutationFn: async (data: any) => apiRequest("POST", "/api/journal-entries", data),
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
    mutationFn: async (data: any) => apiRequest("PATCH", `/api/journal-entries/${params.id}`, data),
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

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "تم حفظ النموذج بنجاح" });
      setShowSaveTemplateDialog(false);
      setTemplateName("");
      setTemplateDescription("");
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveAsTemplate = () => {
    const validLines = lines.filter(
      (line) => line.accountId && (parseFloat(line.debit) > 0 || parseFloat(line.credit) > 0)
    );
    if (validLines.length < 2) {
      toast({ title: "خطأ", description: "يجب إدخال سطرين على الأقل لحفظ النموذج", variant: "destructive" });
      return;
    }
    if (!templateName.trim()) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم النموذج", variant: "destructive" });
      return;
    }
    const templateLines = validLines.map((line, index) => ({
      lineNumber: index + 1,
      accountId: line.accountId,
      costCenterId: line.costCenterId || null,
      description: line.description,
      debit: line.debit || "0",
      credit: line.credit || "0",
    }));
    saveTemplateMutation.mutate({
      name: templateName.trim(),
      description: templateDescription.trim() || null,
      isActive: true,
      lines: templateLines,
    });
  };

  const loadTemplate = async (templateId: string) => {
    try {
      const response = await fetch(`/api/templates/${templateId}`);
      if (!response.ok) throw new Error("فشل تحميل النموذج");
      const template = await response.json();
      if (template.lines && template.lines.length > 0) {
        const newLines = template.lines.map((line: TemplateLine, index: number) => {
          const account = accounts?.find(a => a.id === line.accountId);
          return {
            id: `template-${index}-${Date.now()}`,
            accountId: line.accountId || "",
            accountCode: account?.code || "",
            accountName: account?.name || "",
            costCenterId: line.costCenterId,
            description: line.description || "",
            debit: line.debitPercent || "",
            credit: line.creditPercent || "",
          };
        });
        setLines(newLines);
        setDescription(template.description || template.name);
        toast({ title: "تم تحميل النموذج بنجاح" });
      } else {
        toast({ title: "تنبيه", description: "النموذج لا يحتوي على سطور", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  };

  const totals = useMemo(() => {
    const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
    const difference = Math.abs(totalDebit - totalCredit);
    const isBalanced = difference < 0.01;
    return { totalDebit, totalCredit, difference, isBalanced };
  }, [lines]);

  const addLine = () => {
    setLines([...lines, emptyLine(`new-${Date.now()}`)]);
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
          if (field === "debit" && value) updated.credit = "";
          else if (field === "credit" && value) updated.debit = "";
          return updated;
        }
        return line;
      })
    );
  };

  const selectAccount = (lineId: string, account: Account) => {
    setLines(
      lines.map((line) =>
        line.id === lineId
          ? { ...line, accountId: account.id, accountCode: account.code, accountName: account.name }
          : line
      )
    );
    setShowAccountDropdown(false);
    setShowCostCenterDropdown(false);
    setSearchQuery("");
    setCostCenterSearchQuery("");
    setActiveLineId(null);
  };

  const matchesPattern = (text: string, pattern: string): boolean => {
    if (!pattern) return true;
    const normalizedText = text.toLowerCase().trim();
    const normalizedPattern = pattern.toLowerCase().trim();
    if (normalizedPattern.includes("%")) {
      const parts = normalizedPattern.split("%").filter(p => p.length > 0);
      let lastIndex = 0;
      for (const part of parts) {
        const index = normalizedText.indexOf(part, lastIndex);
        if (index === -1) return false;
        lastIndex = index + part.length;
      }
      return true;
    }
    return normalizedText.includes(normalizedPattern);
  };

  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    if (!searchQuery.trim()) return accounts.filter(a => a.isActive).slice(0, 50);
    const query = searchQuery.trim();
    const results = accounts.filter((account) => {
      if (!account.isActive) return false;
      if (matchesPattern(account.code, query)) return true;
      if (matchesPattern(account.name, query)) return true;
      return matchesPattern(`${account.code} ${account.name}`, query);
    });
    results.sort((a, b) => {
      const aCode = a.code.startsWith(query);
      const bCode = b.code.startsWith(query);
      if (aCode && !bCode) return -1;
      if (!aCode && bCode) return 1;
      const aName = a.name.startsWith(query);
      const bName = b.name.startsWith(query);
      if (aName && !bName) return -1;
      if (!aName && bName) return 1;
      return a.code.localeCompare(b.code);
    });
    return results;
  }, [accounts, searchQuery]);

  const filteredCostCenters = useMemo(() => {
    if (!costCenters) return [];
    if (!costCenterSearchQuery.trim()) return costCenters.filter(c => c.isActive).slice(0, 30);
    const query = costCenterSearchQuery.trim();
    const results = costCenters.filter((cc) => {
      if (!cc.isActive) return false;
      if (matchesPattern(cc.code, query)) return true;
      if (matchesPattern(cc.name, query)) return true;
      return matchesPattern(`${cc.code} ${cc.name}`, query);
    });
    results.sort((a, b) => {
      const aCode = a.code.startsWith(query);
      const bCode = b.code.startsWith(query);
      if (aCode && !bCode) return -1;
      if (!aCode && bCode) return 1;
      return a.code.localeCompare(b.code);
    });
    return results;
  }, [costCenters, costCenterSearchQuery]);

  const getAccountById = (id: string) => accounts?.find((a) => a.id === id);
  const getCostCenterById = (id: string | null) => costCenters?.find((c) => c.id === id);

  const validateEntry = (): boolean => {
    if (!entryDate) {
      toast({ title: "خطأ", description: "يجب إدخال تاريخ القيد", variant: "destructive" });
      return false;
    }
    if (!description.trim()) {
      toast({ title: "خطأ", description: "يجب إدخال بيان القيد", variant: "destructive" });
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

  const validLineCount = lines.filter(
    l => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0)
  ).length;

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
      {/* Toolbar */}
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
          {!isEditing && templates && templates.filter(t => t.isActive).length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-load-template">
                  <Download className="h-4 w-4 ml-1" />
                  استدعاء نموذج
                  <ChevronDown className="h-3 w-3 mr-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {templates.filter(t => t.isActive).map((template) => (
                  <DropdownMenuItem
                    key={template.id}
                    onClick={() => loadTemplate(template.id)}
                    className="text-right"
                    data-testid={`menu-template-${template.id}`}
                  >
                    <FileText className="h-4 w-4 ml-2" />
                    {template.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSaveTemplateDialog(true)}
            disabled={validLineCount < 2}
            data-testid="button-save-as-template"
          >
            <FileText className="h-4 w-4 ml-1" />
            حفظ كنموذج
          </Button>
          <div className="h-6 w-px bg-border" />
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

      {/* Entry Header */}
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

      <JournalLinesTable
        lines={lines}
        activeLineId={activeLineId}
        setActiveLineId={setActiveLineId}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        costCenterSearchQuery={costCenterSearchQuery}
        setCostCenterSearchQuery={setCostCenterSearchQuery}
        showAccountDropdown={showAccountDropdown}
        setShowAccountDropdown={setShowAccountDropdown}
        showCostCenterDropdown={showCostCenterDropdown}
        setShowCostCenterDropdown={setShowCostCenterDropdown}
        filteredAccounts={filteredAccounts}
        filteredCostCenters={filteredCostCenters}
        getAccountById={getAccountById}
        getCostCenterById={getCostCenterById}
        selectAccount={selectAccount}
        updateLine={updateLine}
        removeLine={removeLine}
        addLine={addLine}
      />

      <JournalTotalsBar totals={totals} />

      <SaveTemplateDialog
        open={showSaveTemplateDialog}
        onOpenChange={setShowSaveTemplateDialog}
        templateName={templateName}
        setTemplateName={setTemplateName}
        templateDescription={templateDescription}
        setTemplateDescription={setTemplateDescription}
        validLineCount={validLineCount}
        isSaving={saveTemplateMutation.isPending}
        onSave={handleSaveAsTemplate}
      />
    </div>
  );
}
