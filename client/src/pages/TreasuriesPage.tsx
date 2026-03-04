import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Pencil, Trash2, Plus, Banknote, Users, FileText, Search, X, Loader2, Eye,
} from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { type Account } from "@shared/schema";

// ─── Interfaces ────────────────────────────────────────────────────────────

interface Treasury {
  id: string;
  name: string;
  glAccountId: string;
  glAccountCode: string;
  glAccountName: string;
  isActive: boolean;
  notes: string | null;
}

interface UserTreasuryRow {
  userId: string;
  treasuryId: string;
  treasuryName: string;
  userName: string;
}

interface UserRow {
  id: string;
  username: string;
  fullName: string;
  isActive: boolean;
}

interface TreasuryTransaction {
  id: string;
  type: string;
  amount: string;
  description: string | null;
  transactionDate: string;
}

interface Statement {
  transactions: TreasuryTransaction[];
  totalIn: string;
  totalOut: string;
  balance: string;
}

const emptyForm = { name: "", glAccountId: "", isActive: true, notes: "" };

// ─── SearchableAccountSelect (same pattern as AccountMappings) ──────────────

function SearchableAccountSelect({
  accounts,
  value,
  onChange,
  placeholder = "اختر حساب...",
  testId,
}: {
  accounts: Account[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
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
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50); }}
      >
        {selectedAccount ? (
          <>
            <span className="truncate flex-1">
              <span className="font-mono text-[10px] text-muted-foreground ml-1">{selectedAccount.code}</span>
              {selectedAccount.name}
            </span>
            <X className="h-3 w-3 text-muted-foreground shrink-0 cursor-pointer" onClick={handleClear} />
          </>
        ) : (
          <span className="text-muted-foreground flex-1">{placeholder}</span>
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full min-w-[300px] bg-popover border border-border rounded-md shadow-lg">
          <div className="flex items-center gap-1 p-2 border-b">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالكود أو الاسم..."
              className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 p-0"
              data-testid={`${testId}-search`}
            />
          </div>
          <ScrollArea className="max-h-[220px]">
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
                  يوجد {filtered.length - 50} حساب إضافي — حسّن البحث
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function TreasuriesPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"treasuries" | "users" | "statement">("treasuries");

  // form state
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Treasury | null>(null);

  // statement state
  const [selectedTreasuryId, setSelectedTreasuryId] = useState<string>("");
  const [stmtDateFrom, setStmtDateFrom] = useState("");
  const [stmtDateTo, setStmtDateTo] = useState("");

  // user-assignment state
  const [assignUserId, setAssignUserId] = useState("");
  const [assignTreasuryId, setAssignTreasuryId] = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: treasuries = [], isLoading: treasuriesLoading } = useQuery<Treasury[]>({
    queryKey: ["/api/treasuries"],
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: userAssignments = [] } = useQuery<UserTreasuryRow[]>({
    queryKey: ["/api/user-treasuries"],
    enabled: tab === "users",
  });

  const { data: users = [] } = useQuery<UserRow[]>({
    queryKey: ["/api/users"],
    enabled: tab === "users",
  });

  const { data: statement, isFetching: stmtLoading } = useQuery<Statement>({
    queryKey: ["/api/treasuries", selectedTreasuryId, "statement", stmtDateFrom, stmtDateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (stmtDateFrom) params.set("dateFrom", stmtDateFrom);
      if (stmtDateTo) params.set("dateTo", stmtDateTo);
      const res = await apiRequest("GET", `/api/treasuries/${selectedTreasuryId}/statement?${params}`);
      return res.json();
    },
    enabled: tab === "statement" && !!selectedTreasuryId,
  });

  const leafAccounts = accounts.filter(a => a.isActive);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const res = await apiRequest("POST", "/api/treasuries", data);
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treasuries"] });
      setDialogOpen(false);
      setForm(emptyForm);
      toast({ title: "تم إنشاء الخزنة بنجاح" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof emptyForm }) => {
      const res = await apiRequest("PATCH", `/api/treasuries/${id}`, data);
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treasuries"] });
      setDialogOpen(false);
      setEditId(null);
      setForm(emptyForm);
      toast({ title: "تم تحديث الخزنة" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/treasuries/${id}`);
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treasuries"] });
      setDeleteTarget(null);
      toast({ title: "تم حذف الخزنة" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const assignMut = useMutation({
    mutationFn: async ({ userId, treasuryId }: { userId: string; treasuryId: string }) => {
      const res = await apiRequest("POST", "/api/user-treasuries", { userId, treasuryId });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-treasuries"] });
      setAssignUserId("");
      setAssignTreasuryId("");
      toast({ title: "تم تعيين الخزنة للمستخدم" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const removeAssignMut = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/user-treasuries/${userId}`);
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-treasuries"] });
      toast({ title: "تم إلغاء تعيين الخزنة" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (t: Treasury) => {
    setEditId(t.id);
    setForm({ name: t.name, glAccountId: t.glAccountId, isActive: t.isActive, notes: t.notes ?? "" });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "يجب إدخال اسم الخزنة", variant: "destructive" }); return;
    }
    if (!form.glAccountId) {
      toast({ title: "يجب اختيار حساب من دليل الحسابات", variant: "destructive" }); return;
    }
    if (editId) updateMut.mutate({ id: editId, data: form });
    else createMut.mutate(form);
  };

  const runningBalances = (txns: TreasuryTransaction[]) => {
    let bal = 0;
    return txns.map(t => {
      bal += t.type === "in" ? parseFloat(t.amount) : -parseFloat(t.amount);
      return bal;
    });
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" dir="rtl">

      {/* Page Header */}
      <div className="flex items-center gap-3">
        <Banknote className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">إدارة الخزن</h1>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={tab === "treasuries" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("treasuries")}
          data-testid="tab-treasuries"
        >
          <Banknote className="h-4 w-4 ml-1" />
          الخزن
        </Button>
        <Button
          variant={tab === "users" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("users")}
          data-testid="tab-users"
        >
          <Users className="h-4 w-4 ml-1" />
          تعيين المستخدمين
        </Button>
        <Button
          variant={tab === "statement" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("statement")}
          data-testid="tab-statement"
        >
          <FileText className="h-4 w-4 ml-1" />
          كشف حساب الخزنة
        </Button>
      </div>

      {/* ─── TAB: Treasuries ─────────────────────────────────────────────── */}
      {tab === "treasuries" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-right">قائمة الخزن</CardTitle>
            <Button size="sm" onClick={openCreate} data-testid="button-add-treasury">
              <Plus className="h-4 w-4 ml-1" />
              إضافة خزنة
            </Button>
          </CardHeader>
          <CardContent>
            {treasuriesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : treasuries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد خزن مضافة</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم الخزنة</TableHead>
                    <TableHead className="text-right">الحساب في دليل الحسابات</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-right">ملاحظات</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treasuries.map(t => (
                    <TableRow key={t.id} data-testid={`row-treasury-${t.id}`}>
                      <TableCell className="text-right font-medium">{t.name}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-xs text-muted-foreground ml-2">{t.glAccountCode}</span>
                        {t.glAccountName}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={t.isActive ? "default" : "secondary"}>
                          {t.isActive ? "نشط" : "موقف"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {t.notes || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedTreasuryId(t.id); setTab("statement"); }}
                            title="كشف الحساب"
                            data-testid={`button-view-stmt-${t.id}`}
                          >
                            <Eye className="h-4 w-4 ml-1" />
                            كشف
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(t)}
                            data-testid={`button-edit-treasury-${t.id}`}
                          >
                            <Pencil className="h-4 w-4 ml-1" />
                            تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteTarget(t)}
                            data-testid={`button-delete-treasury-${t.id}`}
                          >
                            <Trash2 className="h-4 w-4 ml-1" />
                            حذف
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── TAB: User Assignments ───────────────────────────────────────── */}
      {tab === "users" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-right">تعيين خزنة لمستخدم</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-52">
                  <label className="text-sm font-medium mb-1.5 block">المستخدم</label>
                  <Select value={assignUserId} onValueChange={setAssignUserId}>
                    <SelectTrigger data-testid="select-assign-user">
                      <SelectValue placeholder="اختر مستخدم..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.filter(u => u.isActive).map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.fullName}
                          <span className="text-xs text-muted-foreground mr-2">({u.username})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-52">
                  <label className="text-sm font-medium mb-1.5 block">الخزنة</label>
                  <Select value={assignTreasuryId} onValueChange={setAssignTreasuryId}>
                    <SelectTrigger data-testid="select-assign-treasury">
                      <SelectValue placeholder="اختر خزنة..." />
                    </SelectTrigger>
                    <SelectContent>
                      {treasuries.filter(t => t.isActive).map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => {
                    if (!assignUserId || !assignTreasuryId) {
                      toast({ title: "يجب اختيار مستخدم وخزنة", variant: "destructive" }); return;
                    }
                    assignMut.mutate({ userId: assignUserId, treasuryId: assignTreasuryId });
                  }}
                  disabled={assignMut.isPending}
                  data-testid="button-assign-treasury"
                >
                  {assignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Plus className="h-4 w-4 ml-1" />}
                  تعيين
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-right">التعيينات الحالية</CardTitle>
            </CardHeader>
            <CardContent>
              {userAssignments.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">لا توجد تعيينات</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">المستخدم</TableHead>
                      <TableHead className="text-right">الخزنة المعينة</TableHead>
                      <TableHead className="text-center">إلغاء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userAssignments.map(a => (
                      <TableRow key={a.userId} data-testid={`row-assign-${a.userId}`}>
                        <TableCell className="text-right">{a.userName}</TableCell>
                        <TableCell className="text-right">{a.treasuryName}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeAssignMut.mutate(a.userId)}
                            disabled={removeAssignMut.isPending}
                            data-testid={`button-remove-assign-${a.userId}`}
                          >
                            <Trash2 className="h-4 w-4 ml-1" />
                            إلغاء
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── TAB: Statement ──────────────────────────────────────────────── */}
      {tab === "statement" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-right">كشف حساب الخزنة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-52">
                  <label className="text-sm font-medium mb-1.5 block">الخزنة</label>
                  <Select value={selectedTreasuryId} onValueChange={setSelectedTreasuryId}>
                    <SelectTrigger data-testid="select-stmt-treasury">
                      <SelectValue placeholder="اختر خزنة..." />
                    </SelectTrigger>
                    <SelectContent>
                      {treasuries.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">من تاريخ</label>
                  <Input
                    type="date"
                    value={stmtDateFrom}
                    onChange={e => setStmtDateFrom(e.target.value)}
                    className="w-40"
                    data-testid="input-stmt-from"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">إلى تاريخ</label>
                  <Input
                    type="date"
                    value={stmtDateTo}
                    onChange={e => setStmtDateTo(e.target.value)}
                    className="w-40"
                    data-testid="input-stmt-to"
                  />
                </div>
              </div>

              {!selectedTreasuryId && (
                <p className="text-center text-muted-foreground py-10">اختر خزنة لعرض كشف الحساب</p>
              )}

              {selectedTreasuryId && stmtLoading && (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {selectedTreasuryId && !stmtLoading && statement && (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="border rounded-md p-3 text-center bg-green-50 dark:bg-green-950/20">
                      <div className="text-xs text-muted-foreground mb-1">إجمالي الوارد</div>
                      <div className="text-lg font-bold text-green-700 dark:text-green-400" data-testid="text-total-in">
                        {formatNumber(parseFloat(statement.totalIn))}
                        <span className="text-xs font-normal mr-1">ج.م</span>
                      </div>
                    </div>
                    <div className="border rounded-md p-3 text-center bg-red-50 dark:bg-red-950/20">
                      <div className="text-xs text-muted-foreground mb-1">إجمالي الصادر</div>
                      <div className="text-lg font-bold text-red-700 dark:text-red-400" data-testid="text-total-out">
                        {formatNumber(parseFloat(statement.totalOut))}
                        <span className="text-xs font-normal mr-1">ج.م</span>
                      </div>
                    </div>
                    <div className="border rounded-md p-3 text-center bg-blue-50 dark:bg-blue-950/20">
                      <div className="text-xs text-muted-foreground mb-1">الرصيد الحالي</div>
                      <div
                        className={`text-lg font-bold ${parseFloat(statement.balance) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700 dark:text-red-400"}`}
                        data-testid="text-balance"
                      >
                        {formatNumber(parseFloat(statement.balance))}
                        <span className="text-xs font-normal mr-1">ج.م</span>
                      </div>
                    </div>
                  </div>

                  {/* Transactions Table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-center w-12">#</TableHead>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">البيان</TableHead>
                        <TableHead className="text-center">وارد (ج.م)</TableHead>
                        <TableHead className="text-center">صادر (ج.م)</TableHead>
                        <TableHead className="text-center">الرصيد (ج.م)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statement.transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            لا توجد حركات في هذه الفترة
                          </TableCell>
                        </TableRow>
                      ) : (() => {
                        const balances = runningBalances(statement.transactions);
                        return statement.transactions.map((txn, i) => (
                          <TableRow key={txn.id} data-testid={`row-txn-${i}`}>
                            <TableCell className="text-center">{i + 1}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{txn.transactionDate}</TableCell>
                            <TableCell className="text-right">{txn.description || "—"}</TableCell>
                            <TableCell className="text-center font-medium text-green-700 dark:text-green-400">
                              {txn.type === "in" ? formatNumber(parseFloat(txn.amount)) : "—"}
                            </TableCell>
                            <TableCell className="text-center font-medium text-red-700 dark:text-red-400">
                              {txn.type === "out" ? formatNumber(parseFloat(txn.amount)) : "—"}
                            </TableCell>
                            <TableCell className={`text-center font-medium ${balances[i] >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700"}`}>
                              {formatNumber(balances[i])}
                            </TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                    {statement.transactions.length > 0 && (
                      <tfoot>
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={3} className="text-right px-4">الإجمالي</TableCell>
                          <TableCell className="text-center text-green-700 dark:text-green-400">
                            {formatNumber(parseFloat(statement.totalIn))}
                          </TableCell>
                          <TableCell className="text-center text-red-700 dark:text-red-400">
                            {formatNumber(parseFloat(statement.totalOut))}
                          </TableCell>
                          <TableCell className={`text-center ${parseFloat(statement.balance) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700"}`}>
                            {formatNumber(parseFloat(statement.balance))}
                          </TableCell>
                        </TableRow>
                      </tfoot>
                    )}
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Dialog: Create / Edit Treasury ─────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={open => { if (!isSaving) setDialogOpen(open); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">
              {editId ? "تعديل الخزنة" : "إضافة خزنة جديدة"}
            </DialogTitle>
            {editId && (
              <DialogDescription className="text-right">
                تعديل بيانات الخزنة — التغييرات تسري فوراً
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium block">اسم الخزنة *</label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مثال: خزنة الاستقبال"
                data-testid="input-treasury-name"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium block">الحساب في دليل الحسابات *</label>
              <SearchableAccountSelect
                accounts={leafAccounts}
                value={form.glAccountId}
                onChange={v => setForm(f => ({ ...f, glAccountId: v }))}
                placeholder="ابحث عن الحساب بالكود أو الاسم..."
                testId="select-treasury-account"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium block">ملاحظات</label>
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="اختياري..."
                data-testid="input-treasury-notes"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="chk-active"
                checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                data-testid="checkbox-treasury-active"
              />
              <label htmlFor="chk-active" className="text-sm">خزنة نشطة</label>
            </div>
          </div>

          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleSubmit} disabled={isSaving} data-testid="button-save-treasury">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
              {editId ? "تحديث" : "إضافة"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Confirm Delete ──────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">حذف الخزنة</DialogTitle>
            <DialogDescription className="text-right">
              هل أنت متأكد من حذف الخزنة «{deleteTarget?.name}»؟
              لا يمكن التراجع عن هذه العملية.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Trash2 className="h-4 w-4 ml-1" />}
              حذف
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
