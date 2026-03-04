import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2, Plus, Building2, Users, FileText, Eye } from "lucide-react";
import { formatNumber } from "@/lib/formatters";

interface Treasury {
  id: string;
  name: string;
  glAccountId: string;
  glAccountCode: string;
  glAccountName: string;
  isActive: boolean;
  notes: string | null;
}

interface Account {
  id: string;
  code: string;
  nameAr: string;
  accountType: string;
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
  treasuryId: string;
  type: string;
  amount: string;
  description: string | null;
  sourceType: string | null;
  sourceId: string | null;
  transactionDate: string;
  createdAt: string;
}

interface Statement {
  transactions: TreasuryTransaction[];
  totalIn: string;
  totalOut: string;
  balance: string;
}

const emptyForm = { name: "", glAccountId: "", isActive: true, notes: "" };

export default function TreasuriesPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"treasuries" | "users" | "statement">("treasuries");
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTreasuryId, setSelectedTreasuryId] = useState<string>("");
  const [stmtDateFrom, setStmtDateFrom] = useState("");
  const [stmtDateTo, setStmtDateTo] = useState("");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignTreasuryId, setAssignTreasuryId] = useState("");

  const { data: treasuries = [], isLoading } = useQuery<Treasury[]>({
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

  const cashAccounts = accounts.filter(a => a.accountType === "asset" || true);

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
    if (!form.name.trim() || !form.glAccountId) {
      toast({ title: "يجب إدخال الاسم والحساب", variant: "destructive" });
      return;
    }
    if (editId) updateMut.mutate({ id: editId, data: form });
    else createMut.mutate(form);
  };

  const runningBalance = (txns: TreasuryTransaction[]) => {
    let bal = 0;
    return txns.map(t => {
      if (t.type === "in") bal += parseFloat(t.amount);
      else bal -= parseFloat(t.amount);
      return bal;
    });
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">إدارة الخزن</h1>
        <div className="flex gap-2">
          <Button
            variant={tab === "treasuries" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("treasuries")}
            data-testid="tab-treasuries"
          >
            <Building2 className="h-4 w-4 ml-1" />
            الخزن
          </Button>
          <Button
            variant={tab === "users" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("users")}
            data-testid="tab-users"
          >
            <Users className="h-4 w-4 ml-1" />
            تعيين المستخدمين
          </Button>
          <Button
            variant={tab === "statement" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("statement")}
            data-testid="tab-statement"
          >
            <FileText className="h-4 w-4 ml-1" />
            كشف حساب الخزنة
          </Button>
        </div>
      </div>

      {/* ───── TAB: Treasuries ───── */}
      {tab === "treasuries" && (
        <div className="space-y-3">
          <Button size="sm" onClick={openCreate} data-testid="button-add-treasury">
            <Plus className="h-4 w-4 ml-1" />
            إضافة خزنة
          </Button>
          <div className="border rounded-md overflow-hidden">
            <table className="peachtree-grid w-full text-sm">
              <thead>
                <tr className="peachtree-grid-header">
                  <th>اسم الخزنة</th>
                  <th>حساب ح/ع</th>
                  <th className="text-center">الحالة</th>
                  <th>ملاحظات</th>
                  <th className="text-center" style={{ width: 100 }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">جار التحميل...</td></tr>
                )}
                {!isLoading && treasuries.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد خزن</td></tr>
                )}
                {treasuries.map(t => (
                  <tr key={t.id} className="peachtree-grid-row" data-testid={`row-treasury-${t.id}`}>
                    <td className="font-medium">{t.name}</td>
                    <td>
                      <span className="font-mono text-xs text-muted-foreground">{t.glAccountCode}</span>
                      {" "}{t.glAccountName}
                    </td>
                    <td className="text-center">
                      <Badge variant={t.isActive ? "default" : "secondary"}>
                        {t.isActive ? "نشط" : "موقف"}
                      </Badge>
                    </td>
                    <td className="text-sm text-muted-foreground">{t.notes ?? "—"}</td>
                    <td className="text-center">
                      <div className="flex gap-1 justify-center">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => { setSelectedTreasuryId(t.id); setTab("statement"); }}
                          title="كشف الحساب"
                          data-testid={`button-view-stmt-${t.id}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => openEdit(t)}
                          data-testid={`button-edit-treasury-${t.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => { if (confirm("هل تريد حذف هذه الخزنة؟")) deleteMut.mutate(t.id); }}
                          data-testid={`button-delete-treasury-${t.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───── TAB: User Assignments ───── */}
      {tab === "users" && (
        <div className="space-y-4">
          {/* Assign form */}
          <div className="border rounded-md p-4 space-y-3 bg-muted/30">
            <h3 className="font-semibold text-sm">تعيين خزنة لمستخدم</h3>
            <div className="flex gap-2 flex-wrap items-end">
              <div className="flex-1 min-w-44">
                <label className="text-xs text-muted-foreground mb-1 block">المستخدم</label>
                <Select value={assignUserId} onValueChange={setAssignUserId}>
                  <SelectTrigger data-testid="select-assign-user">
                    <SelectValue placeholder="اختر مستخدم..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.filter(u => u.isActive).map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.fullName} ({u.username})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-44">
                <label className="text-xs text-muted-foreground mb-1 block">الخزنة</label>
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
                    toast({ title: "يجب اختيار مستخدم وخزنة", variant: "destructive" });
                    return;
                  }
                  assignMut.mutate({ userId: assignUserId, treasuryId: assignTreasuryId });
                }}
                disabled={assignMut.isPending}
                data-testid="button-assign-treasury"
              >
                تعيين
              </Button>
            </div>
          </div>

          {/* Assignments table */}
          <div className="border rounded-md overflow-hidden">
            <table className="peachtree-grid w-full text-sm">
              <thead>
                <tr className="peachtree-grid-header">
                  <th>المستخدم</th>
                  <th>الخزنة المعينة</th>
                  <th className="text-center" style={{ width: 80 }}>إلغاء</th>
                </tr>
              </thead>
              <tbody>
                {userAssignments.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-6 text-muted-foreground">لا توجد تعيينات</td></tr>
                )}
                {userAssignments.map(a => (
                  <tr key={a.userId} className="peachtree-grid-row" data-testid={`row-assign-${a.userId}`}>
                    <td>{a.userName}</td>
                    <td>{a.treasuryName}</td>
                    <td className="text-center">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => removeAssignMut.mutate(a.userId)}
                        data-testid={`button-remove-assign-${a.userId}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───── TAB: Statement ───── */}
      {tab === "statement" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الخزنة</label>
              <Select value={selectedTreasuryId} onValueChange={setSelectedTreasuryId}>
                <SelectTrigger className="w-52" data-testid="select-stmt-treasury">
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
              <label className="text-xs text-muted-foreground mb-1 block">من تاريخ</label>
              <Input type="date" value={stmtDateFrom} onChange={e => setStmtDateFrom(e.target.value)} className="w-36" data-testid="input-stmt-from" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</label>
              <Input type="date" value={stmtDateTo} onChange={e => setStmtDateTo(e.target.value)} className="w-36" data-testid="input-stmt-to" />
            </div>
          </div>

          {/* Summary Cards */}
          {statement && (
            <div className="grid grid-cols-3 gap-3">
              <div className="border rounded-md p-3 text-center bg-green-50 dark:bg-green-950/20">
                <div className="text-xs text-muted-foreground">إجمالي الوارد</div>
                <div className="text-lg font-bold text-green-700 dark:text-green-400" data-testid="text-total-in">
                  {formatNumber(parseFloat(statement.totalIn))} ج.م
                </div>
              </div>
              <div className="border rounded-md p-3 text-center bg-red-50 dark:bg-red-950/20">
                <div className="text-xs text-muted-foreground">إجمالي الصادر</div>
                <div className="text-lg font-bold text-red-700 dark:text-red-400" data-testid="text-total-out">
                  {formatNumber(parseFloat(statement.totalOut))} ج.م
                </div>
              </div>
              <div className="border rounded-md p-3 text-center bg-blue-50 dark:bg-blue-950/20">
                <div className="text-xs text-muted-foreground">الرصيد</div>
                <div className="text-lg font-bold text-blue-700 dark:text-blue-400" data-testid="text-balance">
                  {formatNumber(parseFloat(statement.balance))} ج.م
                </div>
              </div>
            </div>
          )}

          {/* Transactions Table */}
          {!selectedTreasuryId && (
            <div className="text-center text-muted-foreground py-12">اختر خزنة لعرض كشف الحساب</div>
          )}
          {selectedTreasuryId && stmtLoading && (
            <div className="text-center text-muted-foreground py-12">جار التحميل...</div>
          )}
          {selectedTreasuryId && !stmtLoading && statement && (
            <div className="border rounded-md overflow-hidden">
              <table className="peachtree-grid w-full text-sm">
                <thead>
                  <tr className="peachtree-grid-header">
                    <th className="text-center" style={{ width: 40 }}>#</th>
                    <th className="text-center" style={{ width: 120 }}>التاريخ</th>
                    <th>البيان</th>
                    <th className="text-center" style={{ width: 110 }}>وارد</th>
                    <th className="text-center" style={{ width: 110 }}>صادر</th>
                    <th className="text-center" style={{ width: 120 }}>الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.transactions.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">لا توجد حركات</td></tr>
                  )}
                  {(() => {
                    const balances = runningBalance(statement.transactions);
                    return statement.transactions.map((txn, i) => (
                      <tr key={txn.id} className="peachtree-grid-row" data-testid={`row-txn-${i}`}>
                        <td className="text-center">{i + 1}</td>
                        <td className="text-center">{txn.transactionDate}</td>
                        <td>{txn.description || txn.sourceType || "—"}</td>
                        <td className="text-center text-green-700 dark:text-green-400 font-medium">
                          {txn.type === "in" ? formatNumber(parseFloat(txn.amount)) : "—"}
                        </td>
                        <td className="text-center text-red-700 dark:text-red-400 font-medium">
                          {txn.type === "out" ? formatNumber(parseFloat(txn.amount)) : "—"}
                        </td>
                        <td className={`text-center font-medium ${balances[i] >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700"}`}>
                          {formatNumber(balances[i])}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
                {statement.transactions.length > 0 && (
                  <tfoot>
                    <tr className="peachtree-grid-header font-bold">
                      <td colSpan={3} className="text-left px-3">الإجمالي</td>
                      <td className="text-center text-green-700 dark:text-green-400">{formatNumber(parseFloat(statement.totalIn))}</td>
                      <td className="text-center text-red-700 dark:text-red-400">{formatNumber(parseFloat(statement.totalOut))}</td>
                      <td className={`text-center ${parseFloat(statement.balance) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700"}`}>
                        {formatNumber(parseFloat(statement.balance))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {/* ───── Dialog: Create/Edit Treasury ───── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "تعديل الخزنة" : "إضافة خزنة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">اسم الخزنة *</label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مثال: خزنة الاستقبال"
                data-testid="input-treasury-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">حساب ح/ع في دليل الحسابات *</label>
              <Select
                value={form.glAccountId}
                onValueChange={v => setForm(f => ({ ...f, glAccountId: v }))}
              >
                <SelectTrigger data-testid="select-treasury-account">
                  <SelectValue placeholder="اختر حساب..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {cashAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono text-xs text-muted-foreground">{a.code}</span>
                      {" "}{a.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">ملاحظات</label>
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
                id="isActive"
                checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                data-testid="checkbox-treasury-active"
              />
              <label htmlFor="isActive" className="text-sm">نشط</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button
                onClick={handleSubmit}
                disabled={createMut.isPending || updateMut.isPending}
                data-testid="button-save-treasury"
              >
                {editId ? "تحديث" : "إضافة"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
