import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronLeft,
  Upload,
  Download,
  Filter,
  Loader2,
} from "lucide-react";
import { formatCurrency, accountTypeLabels } from "@/lib/formatters";
import { Skeleton } from "@/components/ui/skeleton";
import type { Account, InsertAccount } from "@shared/schema";

interface AccountTreeNode extends Account {
  children: AccountTreeNode[];
  isExpanded?: boolean;
}

export default function ChartOfAccounts() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<InsertAccount>>({
    code: "",
    name: "",
    accountType: "asset",
    parentId: null,
    level: 1,
    isActive: true,
    requiresCostCenter: false,
    description: "",
    openingBalance: "0",
  });

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertAccount>) => {
      return apiRequest("POST", "/api/accounts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "تم إنشاء الحساب بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertAccount> }) => {
      return apiRequest("PATCH", `/api/accounts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: "تم تحديث الحساب بنجاح" });
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "تم حذف الحساب بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (account?: Account) => {
    if (account) {
      setEditingAccount(account);
      setFormData({
        code: account.code,
        name: account.name,
        accountType: account.accountType,
        parentId: account.parentId,
        level: account.level,
        isActive: account.isActive,
        requiresCostCenter: account.requiresCostCenter,
        description: account.description || "",
        openingBalance: account.openingBalance,
      });
    } else {
      setEditingAccount(null);
      setFormData({
        code: "",
        name: "",
        accountType: "asset",
        parentId: null,
        level: 1,
        isActive: true,
        requiresCostCenter: false,
        description: "",
        openingBalance: "0",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingAccount(null);
    setFormData({
      code: "",
      name: "",
      accountType: "asset",
      parentId: null,
      level: 1,
      isActive: true,
      requiresCostCenter: false,
      description: "",
      openingBalance: "0",
    });
  };

  const handleSubmit = () => {
    if (!formData.code || !formData.name || !formData.accountType) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }

    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const toggleExpanded = (accountId: string) => {
    setExpandedAccounts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(accountId)) {
        newSet.delete(accountId);
      } else {
        newSet.add(accountId);
      }
      return newSet;
    });
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const response = await fetch("/api/accounts/export");
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "فشل في تصدير الحسابات");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "accounts.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "تم تصدير الحسابات بنجاح" });
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/accounts/import", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || "فشل في استيراد الحسابات");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "تم الاستيراد", description: result.message });
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const buildTree = (accounts: Account[]): AccountTreeNode[] => {
    const accountMap = new Map<string | null, AccountTreeNode[]>();
    
    accounts.forEach((account) => {
      const node: AccountTreeNode = { ...account, children: [] };
      const parentId = account.parentId;
      if (!accountMap.has(parentId)) {
        accountMap.set(parentId, []);
      }
      accountMap.get(parentId)!.push(node);
    });

    const assignChildren = (node: AccountTreeNode): AccountTreeNode => {
      const children = accountMap.get(node.id) || [];
      node.children = children.map(assignChildren);
      return node;
    };

    const rootNodes = accountMap.get(null) || [];
    return rootNodes.map(assignChildren);
  };

  const filteredAccounts = accounts?.filter((account) => {
    const matchesSearch =
      searchQuery === "" ||
      account.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === "all" || account.accountType === filterType;
    
    return matchesSearch && matchesType;
  }) || [];

  const flattenTree = (nodes: AccountTreeNode[], level: number = 0): (AccountTreeNode & { displayLevel: number })[] => {
    const result: (AccountTreeNode & { displayLevel: number })[] = [];
    nodes.forEach((node) => {
      result.push({ ...node, displayLevel: level });
      if (node.children.length > 0 && expandedAccounts.has(node.id)) {
        result.push(...flattenTree(node.children, level + 1));
      }
    });
    return result;
  };

  const tree = buildTree(filteredAccounts);
  const flatTree = flattenTree(tree);

  const getAccountTypeBadgeColor = (type: string) => {
    switch (type) {
      case "asset":
        return "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700";
      case "liability":
        return "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-700";
      case "equity":
        return "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-700";
      case "revenue":
        return "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700";
      case "expense":
        return "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700";
      default:
        return "";
    }
  };

  if (isLoading) {
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-foreground">دليل الحسابات</h1>
          <span className="text-xs text-muted-foreground">
            ({accounts?.length || 0} حساب)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".xlsx,.xls"
            className="hidden"
            data-testid="input-file-import-accounts"
          />
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 text-xs px-2" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            data-testid="button-import-accounts"
          >
            {isImporting ? <Loader2 className="h-3 w-3 ml-1 animate-spin" /> : <Upload className="h-3 w-3 ml-1" />}
            استيراد
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 text-xs px-2" 
            onClick={handleExport}
            disabled={isExporting}
            data-testid="button-export-accounts"
          >
            {isExporting ? <Loader2 className="h-3 w-3 ml-1 animate-spin" /> : <Download className="h-3 w-3 ml-1" />}
            تصدير
          </Button>
          <Button size="sm" className="h-7 text-xs px-2" onClick={() => handleOpenDialog()} data-testid="button-add-account">
            <Plus className="h-3 w-3 ml-1" />
            حساب جديد
          </Button>
        </div>
      </div>

      <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-[300px]">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="بحث برقم أو اسم الحساب..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="peachtree-input pr-7 text-xs h-7"
            data-testid="input-search-accounts"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="peachtree-select w-[140px] text-xs" data-testid="select-account-type-filter">
            <Filter className="h-3 w-3 ml-1" />
            <SelectValue placeholder="نوع الحساب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">جميع الأنواع</SelectItem>
            <SelectItem value="asset" className="text-xs">أصول</SelectItem>
            <SelectItem value="liability" className="text-xs">خصوم</SelectItem>
            <SelectItem value="equity" className="text-xs">حقوق ملكية</SelectItem>
            <SelectItem value="revenue" className="text-xs">إيرادات</SelectItem>
            <SelectItem value="expense" className="text-xs">مصروفات</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="peachtree-grid">
        <table className="w-full">
          <thead className="peachtree-grid-header">
            <tr>
              <th className="text-right w-[140px]">رقم الحساب</th>
              <th className="text-right">اسم الحساب</th>
              <th className="text-center w-[90px]">النوع</th>
              <th className="text-center w-[80px]">م.تكلفة</th>
              <th className="text-left w-[110px]">الرصيد الافتتاحي</th>
              <th className="text-center w-[60px]">الحالة</th>
              <th className="text-center w-[70px]">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {flatTree.length === 0 ? (
              <tr className="peachtree-grid-row">
                <td colSpan={7} className="text-center py-4 text-xs text-muted-foreground">
                  لا توجد حسابات
                </td>
              </tr>
            ) : (
              flatTree.map((account) => {
                const hasChildren = account.children.length > 0;
                const isExpanded = expandedAccounts.has(account.id);

                return (
                  <tr
                    key={account.id}
                    className={`peachtree-grid-row ${!account.isActive ? "opacity-50" : ""}`}
                    data-testid={`row-account-${account.id}`}
                  >
                    <td>
                      <div
                        className="flex items-center gap-1"
                        style={{ paddingRight: `${account.displayLevel * 16}px` }}
                      >
                        {hasChildren && (
                          <button
                            onClick={() => toggleExpanded(account.id)}
                            className="p-0.5 hover:bg-muted rounded"
                            data-testid={`button-expand-${account.id}`}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronLeft className="h-3 w-3" />
                            )}
                          </button>
                        )}
                        <span className="font-mono text-xs font-medium">{account.code}</span>
                      </div>
                    </td>
                    <td className="text-xs">{account.name}</td>
                    <td className="text-center">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${getAccountTypeBadgeColor(account.accountType)}`}
                      >
                        {accountTypeLabels[account.accountType]}
                      </Badge>
                    </td>
                    <td className="text-center text-xs">
                      {account.requiresCostCenter ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">مطلوب</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="peachtree-amount text-xs font-medium">
                      {formatCurrency(account.openingBalance)}
                    </td>
                    <td className="text-center">
                      <Badge 
                        variant={account.isActive ? "default" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {account.isActive ? "نشط" : "معطل"}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleOpenDialog(account)}
                          data-testid={`button-edit-account-${account.id}`}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            if (confirm("هل أنت متأكد من حذف هذا الحساب؟")) {
                              deleteMutation.mutate(account.id);
                            }
                          }}
                          data-testid={`button-delete-account-${account.id}`}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md p-4" dir="rtl">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-sm font-bold">
              {editingAccount ? "تعديل حساب" : "إضافة حساب جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="code" className="text-xs">رقم الحساب *</Label>
                <Input
                  id="code"
                  value={formData.code || ""}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="مثال: 1101"
                  className="peachtree-input text-xs font-mono"
                  data-testid="input-account-code"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="accountType" className="text-xs">نوع الحساب *</Label>
                <Select
                  value={formData.accountType || "asset"}
                  onValueChange={(value: any) => {
                    const requiresCostCenter = value === "revenue" || value === "expense";
                    setFormData({ ...formData, accountType: value, requiresCostCenter });
                  }}
                >
                  <SelectTrigger id="accountType" className="peachtree-select text-xs" data-testid="select-account-type">
                    <SelectValue placeholder="اختر النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asset" className="text-xs">أصول</SelectItem>
                    <SelectItem value="liability" className="text-xs">خصوم</SelectItem>
                    <SelectItem value="equity" className="text-xs">حقوق ملكية</SelectItem>
                    <SelectItem value="revenue" className="text-xs">إيرادات</SelectItem>
                    <SelectItem value="expense" className="text-xs">مصروفات</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs">اسم الحساب *</Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="اسم الحساب بالعربية"
                className="peachtree-input text-xs"
                data-testid="input-account-name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="parentId" className="text-xs">الحساب الرئيسي</Label>
              <Select
                value={formData.parentId || "none"}
                onValueChange={(value) => setFormData({ ...formData, parentId: value === "none" ? null : value })}
              >
                <SelectTrigger id="parentId" className="peachtree-select text-xs" data-testid="select-parent-account">
                  <SelectValue placeholder="اختر الحساب الرئيسي" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">بدون حساب رئيسي</SelectItem>
                  {accounts
                    ?.filter((a) => a.id !== editingAccount?.id)
                    .map((account) => (
                      <SelectItem key={account.id} value={account.id} className="text-xs">
                        <span className="font-mono">{account.code}</span> - {account.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="openingBalance" className="text-xs">الرصيد الافتتاحي</Label>
              <Input
                id="openingBalance"
                type="number"
                step="0.01"
                value={formData.openingBalance || "0"}
                onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
                className="peachtree-input text-xs font-mono text-left"
                dir="ltr"
                data-testid="input-opening-balance"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="description" className="text-xs">الوصف</Label>
              <Textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف إضافي للحساب (اختياري)"
                rows={2}
                className="text-xs resize-none"
                data-testid="input-account-description"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isActive: checked as boolean })
                  }
                  className="h-3.5 w-3.5"
                  data-testid="checkbox-is-active"
                />
                <Label htmlFor="isActive" className="text-xs">حساب نشط</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="requiresCostCenter"
                  checked={formData.requiresCostCenter}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, requiresCostCenter: checked as boolean })
                  }
                  className="h-3.5 w-3.5"
                  data-testid="checkbox-requires-cost-center"
                />
                <Label htmlFor="requiresCostCenter" className="text-xs">يتطلب مركز تكلفة</Label>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-1 pt-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCloseDialog} data-testid="button-cancel">
              إلغاء
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-account"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "جاري الحفظ..."
                : editingAccount
                ? "تحديث"
                : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
