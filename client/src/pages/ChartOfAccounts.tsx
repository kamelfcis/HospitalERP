import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  // Build tree structure
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

  // Filter accounts
  const filteredAccounts = accounts?.filter((account) => {
    const matchesSearch =
      searchQuery === "" ||
      account.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === "all" || account.accountType === filterType;
    
    return matchesSearch && matchesType;
  }) || [];

  // Flatten tree for display
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
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "liability":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "equity":
        return "bg-indigo-100 text-indigo-800 border-indigo-200";
      case "revenue":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "expense":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "";
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">دليل الحسابات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة الحسابات المحاسبية ({accounts?.length || 0} حساب)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-testid="button-import-accounts">
            <Upload className="h-4 w-4 ml-2" />
            استيراد
          </Button>
          <Button variant="outline" size="sm" data-testid="button-export-accounts">
            <Download className="h-4 w-4 ml-2" />
            تصدير
          </Button>
          <Button onClick={() => handleOpenDialog()} data-testid="button-add-account">
            <Plus className="h-4 w-4 ml-2" />
            حساب جديد
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم أو اسم الحساب..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
                data-testid="input-search-accounts"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]" data-testid="select-account-type-filter">
                <Filter className="h-4 w-4 ml-2" />
                <SelectValue placeholder="نوع الحساب" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأنواع</SelectItem>
                <SelectItem value="asset">أصول</SelectItem>
                <SelectItem value="liability">خصوم</SelectItem>
                <SelectItem value="equity">حقوق ملكية</SelectItem>
                <SelectItem value="revenue">إيرادات</SelectItem>
                <SelectItem value="expense">مصروفات</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Accounts Table */}
      <Card>
        <ScrollArea className="h-[calc(100vh-320px)]">
          <Table className="accounting-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">رقم الحساب</TableHead>
                <TableHead>اسم الحساب</TableHead>
                <TableHead className="w-[120px]">النوع</TableHead>
                <TableHead className="w-[120px]">مركز تكلفة</TableHead>
                <TableHead className="w-[150px] text-left">الرصيد الافتتاحي</TableHead>
                <TableHead className="w-[80px]">الحالة</TableHead>
                <TableHead className="w-[100px]">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flatTree.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    لا توجد حسابات
                  </TableCell>
                </TableRow>
              ) : (
                flatTree.map((account) => {
                  const hasChildren = account.children.length > 0;
                  const isExpanded = expandedAccounts.has(account.id);

                  return (
                    <TableRow
                      key={account.id}
                      className={!account.isActive ? "opacity-50" : ""}
                      data-testid={`row-account-${account.id}`}
                    >
                      <TableCell>
                        <div
                          className="flex items-center gap-2"
                          style={{ paddingRight: `${account.displayLevel * 24}px` }}
                        >
                          {hasChildren && (
                            <button
                              onClick={() => toggleExpanded(account.id)}
                              className="p-1 hover:bg-muted rounded"
                              data-testid={`button-expand-${account.id}`}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronLeft className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          <span className="font-mono text-sm">{account.code}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{account.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getAccountTypeBadgeColor(account.accountType)}
                        >
                          {accountTypeLabels[account.accountType]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {account.requiresCostCenter ? (
                          <Badge variant="secondary">مطلوب</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="accounting-number font-medium">
                        {formatCurrency(account.openingBalance)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={account.isActive ? "default" : "secondary"}>
                          {account.isActive ? "نشط" : "غير نشط"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(account)}
                            data-testid={`button-edit-account-${account.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("هل أنت متأكد من حذف هذا الحساب؟")) {
                                deleteMutation.mutate(account.id);
                              }
                            }}
                            data-testid={`button-delete-account-${account.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {/* Add/Edit Account Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? "تعديل حساب" : "إضافة حساب جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">رقم الحساب *</Label>
                <Input
                  id="code"
                  value={formData.code || ""}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="مثال: 1101"
                  data-testid="input-account-code"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountType">نوع الحساب *</Label>
                <Select
                  value={formData.accountType || "asset"}
                  onValueChange={(value: any) => {
                    const requiresCostCenter = value === "revenue" || value === "expense";
                    setFormData({ ...formData, accountType: value, requiresCostCenter });
                  }}
                >
                  <SelectTrigger id="accountType" data-testid="select-account-type">
                    <SelectValue placeholder="اختر النوع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asset">أصول</SelectItem>
                    <SelectItem value="liability">خصوم</SelectItem>
                    <SelectItem value="equity">حقوق ملكية</SelectItem>
                    <SelectItem value="revenue">إيرادات</SelectItem>
                    <SelectItem value="expense">مصروفات</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">اسم الحساب *</Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="اسم الحساب بالعربية"
                data-testid="input-account-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parentId">الحساب الرئيسي</Label>
              <Select
                value={formData.parentId || "none"}
                onValueChange={(value) => setFormData({ ...formData, parentId: value === "none" ? null : value })}
              >
                <SelectTrigger id="parentId" data-testid="select-parent-account">
                  <SelectValue placeholder="اختر الحساب الرئيسي" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون حساب رئيسي</SelectItem>
                  {accounts
                    ?.filter((a) => a.id !== editingAccount?.id)
                    .map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="openingBalance">الرصيد الافتتاحي</Label>
              <Input
                id="openingBalance"
                type="number"
                step="0.01"
                value={formData.openingBalance || "0"}
                onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
                className="text-left"
                dir="ltr"
                data-testid="input-opening-balance"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">الوصف</Label>
              <Textarea
                id="description"
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="وصف إضافي للحساب (اختياري)"
                rows={2}
                data-testid="input-account-description"
              />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isActive: checked as boolean })
                  }
                  data-testid="checkbox-is-active"
                />
                <Label htmlFor="isActive" className="text-sm">حساب نشط</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresCostCenter"
                  checked={formData.requiresCostCenter}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, requiresCostCenter: checked as boolean })
                  }
                  data-testid="checkbox-requires-cost-center"
                />
                <Label htmlFor="requiresCostCenter" className="text-sm">يتطلب مركز تكلفة</Label>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCloseDialog} data-testid="button-cancel">
              إلغاء
            </Button>
            <Button
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
