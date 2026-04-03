import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Account, InsertAccount } from "@shared/schema";

export interface AccountTreeNode extends Account {
  children: AccountTreeNode[];
  isExpanded?: boolean;
}

export function useChartOfAccounts() {
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
        defaultCostCenterId: (account as any).defaultCostCenterId ?? null,
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
        defaultCostCenterId: null,
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
      defaultCostCenterId: null,
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
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      toast({ title: "خطأ", description: _em, variant: "destructive" });
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
    } catch (error: unknown) {
      const _em = error instanceof Error ? error.message : String(error);
      toast({ title: "خطأ", description: _em, variant: "destructive" });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const buildTree = (accountsList: Account[]): AccountTreeNode[] => {
    const accountIds = new Set(accountsList.map(a => a.id));
    const accountMap = new Map<string | null, AccountTreeNode[]>();
    
    accountsList.forEach((account) => {
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

    const rootNodes: AccountTreeNode[] = [];
    accountMap.forEach((nodes, parentId) => {
      if (parentId === null || !accountIds.has(parentId)) {
        rootNodes.push(...nodes);
      }
    });
    rootNodes.sort((a, b) => a.code.localeCompare(b.code));
    return rootNodes.map(assignChildren);
  };

  const filteredAccounts = useMemo(() => {
    return accounts?.filter((account) => {
      const matchesSearch =
        searchQuery === "" ||
        account.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        account.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = filterType === "all" || account.accountType === filterType;
      
      return matchesSearch && matchesType;
    }) || [];
  }, [accounts, searchQuery, filterType]);

  const flatTree = useMemo(() => {
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
    return flattenTree(tree);
  }, [filteredAccounts, expandedAccounts]);

  const handleDelete = (id: string) => {
    if (confirm("هل أنت متأكد من حذف هذا الحساب؟")) {
      deleteMutation.mutate(id);
    }
  };

  return {
    accounts,
    isLoading,
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    isDialogOpen,
    setIsDialogOpen,
    editingAccount,
    formData,
    setFormData,
    flatTree,
    expandedAccounts,
    isExporting,
    isImporting,
    fileInputRef,
    handleOpenDialog,
    handleCloseDialog,
    handleSubmit,
    toggleExpanded,
    handleExport,
    handleImport,
    handleDelete,
    createMutation,
    updateMutation,
    deleteMutation
  };
}
