import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Save,
  Plus,
  Trash2,
  ArrowRight,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency, formatDateForInput } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountSearchSelect } from "@/components/AccountSearchSelect";
import type { Account, CostCenter, JournalEntryWithLines, JournalTemplate } from "@shared/schema";

interface JournalLineInput {
  id: string;
  accountId: string;
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
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [lines, setLines] = useState<JournalLineInput[]>([
    { id: "1", accountId: "", costCenterId: null, description: "", debit: "", credit: "" },
    { id: "2", accountId: "", costCenterId: null, description: "", debit: "", credit: "" },
  ]);

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

  // Load existing entry data
  useEffect(() => {
    if (existingEntry) {
      setEntryDate(formatDateForInput(existingEntry.entryDate));
      setDescription(existingEntry.description);
      setReference(existingEntry.reference || "");
      if (existingEntry.lines && existingEntry.lines.length > 0) {
        setLines(
          existingEntry.lines.map((line, index) => ({
            id: line.id || `line-${index}`,
            accountId: line.accountId,
            costCenterId: line.costCenterId,
            description: line.description || "",
            debit: line.debit || "",
            credit: line.credit || "",
          }))
        );
      }
    }
  }, [existingEntry]);

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

  const postMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/journal-entries/${id}/post`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "تم ترحيل القيد بنجاح" });
      navigate("/journal-entries");
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  // Calculate totals
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
          // If entering debit, clear credit and vice versa
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

    // Check cost center requirements
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
      templateId: templateId || null,
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
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Cannot edit posted entries
  if (isEditing && existingEntry?.status !== "draft") {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">لا يمكن تعديل هذا القيد</h2>
            <p className="text-muted-foreground mb-4">
              هذا القيد {existingEntry?.status === "posted" ? "مُرحّل" : "ملغي"} ولا يمكن تعديله
            </p>
            <Button onClick={() => navigate("/journal-entries")}>
              <ArrowRight className="h-4 w-4 ml-2" />
              العودة للقيود
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/journal-entries")} data-testid="button-back">
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isEditing ? "تعديل قيد" : "قيد يومي جديد"}
            </h1>
            {isEditing && existingEntry && (
              <p className="text-sm text-muted-foreground mt-1">
                قيد رقم {existingEntry.entryNumber}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={createMutation.isPending || updateMutation.isPending}
            data-testid="button-save-draft"
          >
            <Save className="h-4 w-4 ml-2" />
            حفظ كمسودة
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={createMutation.isPending || updateMutation.isPending || !totals.isBalanced}
            className="bg-emerald-600 hover:bg-emerald-700"
            data-testid="button-save-and-post"
          >
            <CheckCircle className="h-4 w-4 ml-2" />
            حفظ وترحيل
          </Button>
        </div>
      </div>

      {/* Entry Header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">بيانات القيد</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entryDate">تاريخ القيد *</Label>
              <Input
                id="entryDate"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                data-testid="input-entry-date"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">بيان القيد *</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="أدخل بيان القيد"
                data-testid="input-entry-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference">المرجع</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="رقم المرجع (اختياري)"
                data-testid="input-entry-reference"
              />
            </div>
          </div>
          {templates && templates.length > 0 && (
            <div className="mt-4">
              <Label>استخدام نموذج</Label>
              <Select value={templateId || ""} onValueChange={setTemplateId}>
                <SelectTrigger className="w-[300px] mt-2" data-testid="select-template">
                  <SelectValue placeholder="اختر نموذج (اختياري)" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entry Lines */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg">سطور القيد</CardTitle>
          <Button variant="outline" size="sm" onClick={addLine} data-testid="button-add-line">
            <Plus className="h-4 w-4 ml-2" />
            إضافة سطر
          </Button>
        </CardHeader>
        <CardContent>
          <Table className="accounting-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead className="w-[250px]">الحساب *</TableHead>
                <TableHead className="w-[180px]">مركز التكلفة</TableHead>
                <TableHead>البيان</TableHead>
                <TableHead className="w-[150px] text-left">مدين</TableHead>
                <TableHead className="w-[150px] text-left">دائن</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => {
                const account = getAccountById(line.accountId);
                const requiresCostCenter = account?.requiresCostCenter;

                return (
                  <TableRow key={line.id} data-testid={`row-line-${index}`}>
                    <TableCell className="font-mono text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <AccountSearchSelect
                        accounts={accounts || []}
                        value={line.accountId}
                        onChange={(value) => updateLine(line.id, "accountId", value)}
                        placeholder="ابحث عن الحساب (استخدم % للبحث المتقدم)"
                        data-testid={`select-account-${index}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={line.costCenterId || ""}
                        onValueChange={(value) =>
                          updateLine(line.id, "costCenterId", value || "")
                        }
                        disabled={!requiresCostCenter}
                      >
                        <SelectTrigger
                          className={requiresCostCenter && !line.costCenterId ? "border-amber-400" : ""}
                          data-testid={`select-cost-center-${index}`}
                        >
                          <SelectValue
                            placeholder={requiresCostCenter ? "مطلوب *" : "اختياري"}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {costCenters?.filter((c) => c.isActive).map((cc) => (
                            <SelectItem key={cc.id} value={cc.id}>
                              {cc.code} - {cc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(line.id, "description", e.target.value)}
                        placeholder="بيان السطر"
                        data-testid={`input-line-description-${index}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.debit}
                        onChange={(e) => updateLine(line.id, "debit", e.target.value)}
                        className="text-left debit-amount"
                        dir="ltr"
                        placeholder="0.00"
                        data-testid={`input-debit-${index}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.credit}
                        onChange={(e) => updateLine(line.id, "credit", e.target.value)}
                        className="text-left credit-amount"
                        dir="ltr"
                        placeholder="0.00"
                        data-testid={`input-credit-${index}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(line.id)}
                        disabled={lines.length <= 2}
                        data-testid={`button-remove-line-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card className={!totals.isBalanced ? "border-amber-400 bg-amber-50" : ""}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              {totals.isBalanced ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-base px-4 py-1">
                  <CheckCircle className="h-4 w-4 ml-2" />
                  القيد متوازن
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-base px-4 py-1">
                  <AlertTriangle className="h-4 w-4 ml-2" />
                  القيد غير متوازن - الفرق: {formatCurrency(totals.difference)}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-8">
              <div className="text-left">
                <p className="text-sm text-muted-foreground">إجمالي المدين</p>
                <p className="text-xl font-bold accounting-number debit-amount">
                  {formatCurrency(totals.totalDebit)}
                </p>
              </div>
              <div className="text-left">
                <p className="text-sm text-muted-foreground">إجمالي الدائن</p>
                <p className="text-xl font-bold accounting-number credit-amount">
                  {formatCurrency(totals.totalCredit)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
