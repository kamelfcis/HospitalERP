import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Banknote, Users, FileText, Plus, Pencil, Trash2, Loader2,
  KeyRound, Lock, Unlock, Eye,
} from "lucide-react";
import { formatNumber } from "@/lib/formatters";
import { type Account } from "@shared/schema";
import { AccountSearchSelect } from "@/components/AccountSearchSelect";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TreasurySummary {
  id: string;
  name: string;
  glAccountId: string;
  glAccountCode: string;
  glAccountName: string;
  isActive: boolean;
  notes: string | null;
  openingBalance: string;
  totalIn: string;
  totalOut: string;
  balance: string;
  hasPassword: boolean;
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

interface Statement {
  transactions: {
    id: string; type: string; amount: string;
    description: string | null; transactionDate: string;
  }[];
  totalIn: string;
  totalOut: string;
  balance: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab button helper
// ─────────────────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon: Icon, children, testId }: {
  active: boolean; onClick: () => void;
  icon: React.ElementType; children: React.ReactNode; testId: string;
}) {
  return (
    <Button
      variant={active ? "default" : "ghost"}
      size="sm"
      onClick={onClick}
      data-testid={testId}
    >
      <Icon className="h-4 w-4 ml-1" />
      {children}
    </Button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

const emptyForm = { name: "", glAccountId: "", isActive: true, notes: "" };

export default function TreasuriesPage() {
  const { toast } = useToast();

  // Tab
  const [tab, setTab] = useState<"overview" | "users" | "statement">("overview");

  // Treasury form dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<TreasurySummary | null>(null);

  // Password dialog
  const [pwdTarget, setPwdTarget] = useState<TreasurySummary | null>(null);
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");

  // Statement tab
  const [stmtTreasuryId, setStmtTreasuryId] = useState("");
  const [stmtFrom, setStmtFrom] = useState("");
  const [stmtTo, setStmtTo] = useState("");

  // User assignment tab
  const [assignUserId, setAssignUserId] = useState("");
  const [assignTreasuryId, setAssignTreasuryId] = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: summaries = [], isLoading: summariesLoading } = useQuery<TreasurySummary[]>({
    queryKey: ["/api/treasuries/summary"],
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    enabled: formOpen,
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
    queryKey: ["/api/treasuries", stmtTreasuryId, "statement", stmtFrom, stmtTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (stmtFrom) p.set("dateFrom", stmtFrom);
      if (stmtTo)   p.set("dateTo", stmtTo);
      const res = await apiRequest("GET", `/api/treasuries/${stmtTreasuryId}/statement?${p}`);
      return res.json();
    },
    enabled: tab === "statement" && !!stmtTreasuryId,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidateSummary = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/treasuries/summary"] });

  const createMut = useMutation({
    mutationFn: async (data: typeof emptyForm) => {
      const res = await apiRequest("POST", "/api/treasuries", data);
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      invalidateSummary();
      queryClient.invalidateQueries({ queryKey: ["/api/treasuries"] });
      setFormOpen(false); setForm(emptyForm);
      toast({ title: "تم إنشاء الخزنة بنجاح" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof emptyForm }) => {
      const res = await apiRequest("PATCH", `/api/treasuries/${id}`, data);
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      invalidateSummary();
      queryClient.invalidateQueries({ queryKey: ["/api/treasuries"] });
      setFormOpen(false); setEditId(null); setForm(emptyForm);
      toast({ title: "تم تحديث الخزنة" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/treasuries/${id}`);
      if (!res.ok) throw new Error((await res.json()).message);
    },
    onSuccess: () => {
      invalidateSummary();
      queryClient.invalidateQueries({ queryKey: ["/api/treasuries"] });
      setDeleteTarget(null);
      toast({ title: "تم حذف الخزنة" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const setPasswordMut = useMutation({
    mutationFn: async ({ glAccountId, password }: { glAccountId: string; password: string }) => {
      const res = await apiRequest("POST", "/api/drawer-passwords/set", { glAccountId, password });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      invalidateSummary();
      setPwdTarget(null); setPwdNew(""); setPwdConfirm("");
      toast({ title: "تم تعيين كلمة السر بنجاح" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const removePasswordMut = useMutation({
    mutationFn: async (glAccountId: string) => {
      const res = await apiRequest("DELETE", `/api/drawer-passwords/${glAccountId}`);
      if (!res.ok) throw new Error((await res.json()).message);
    },
    onSuccess: () => {
      invalidateSummary();
      setPwdTarget(null);
      toast({ title: "تم إزالة كلمة السر" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const assignMut = useMutation({
    mutationFn: async ({ userId, treasuryId }: { userId: string; treasuryId: string }) => {
      const res = await apiRequest("POST", "/api/user-treasuries", { userId, treasuryId });
      if (!res.ok) throw new Error((await res.json()).message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-treasuries"] });
      setAssignUserId(""); setAssignTreasuryId("");
      toast({ title: "تم تعيين الخزنة للمستخدم" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const removeAssignMut = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/user-treasuries/${userId}`);
      if (!res.ok) throw new Error((await res.json()).message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-treasuries"] });
      toast({ title: "تم إلغاء تعيين الخزنة" });
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditId(null); setForm(emptyForm); setFormOpen(true);
  };

  const openEdit = (t: TreasurySummary) => {
    setEditId(t.id);
    setForm({ name: t.name, glAccountId: t.glAccountId, isActive: t.isActive, notes: t.notes ?? "" });
    setFormOpen(true);
  };

  const handleFormSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "يجب إدخال اسم الخزنة", variant: "destructive" }); return;
    }
    if (!form.glAccountId) {
      toast({ title: "يجب اختيار حساب من دليل الحسابات", variant: "destructive" }); return;
    }
    if (editId) updateMut.mutate({ id: editId, data: form });
    else createMut.mutate(form);
  };

  const handleSetPassword = () => {
    if (!pwdTarget) return;
    if (pwdNew.length < 4) {
      toast({ title: "كلمة السر يجب أن تكون 4 أحرف على الأقل", variant: "destructive" }); return;
    }
    if (pwdNew !== pwdConfirm) {
      toast({ title: "كلمتا السر غير متطابقتين", variant: "destructive" }); return;
    }
    setPasswordMut.mutate({ glAccountId: pwdTarget.glAccountId, password: pwdNew });
  };

  const openStatement = (t: TreasurySummary) => {
    setStmtTreasuryId(t.id);
    setTab("statement");
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  // Running balance for statement
  const runningBalances = (txns: Statement["transactions"]) => {
    let bal = 0;
    return txns.map(t => {
      bal += t.type === "in" ? parseFloat(t.amount) : -parseFloat(t.amount);
      return bal;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5" dir="rtl">

      {/* ── Page header ── */}
      <div className="flex items-center gap-3">
        <Banknote className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">إدارة الخزن</h1>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b pb-3">
        <TabBtn active={tab === "overview"} onClick={() => setTab("overview")} icon={Banknote} testId="tab-overview">
          نظرة عامة على الخزن
        </TabBtn>
        <TabBtn active={tab === "users"} onClick={() => setTab("users")} icon={Users} testId="tab-users">
          تعيين المستخدمين
        </TabBtn>
        <TabBtn active={tab === "statement"} onClick={() => setTab("statement")} icon={FileText} testId="tab-statement">
          كشف حساب الخزنة
        </TabBtn>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1 — نظرة عامة على الخزن
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "overview" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-right">قائمة الخزن</CardTitle>
            <Button size="sm" onClick={openCreate} data-testid="button-add-treasury">
              <Plus className="h-4 w-4 ml-1" />
              إضافة خزنة
            </Button>
          </CardHeader>
          <CardContent>
            {summariesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : summaries.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">
                لا توجد خزن — اضغط «إضافة خزنة» للبدء
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">اسم الخزنة</TableHead>
                    <TableHead className="text-right">الحساب في دليل الحسابات</TableHead>
                    <TableHead className="text-center">رصيد افتتاحي</TableHead>
                    <TableHead className="text-center">وارد</TableHead>
                    <TableHead className="text-center">منصرف</TableHead>
                    <TableHead className="text-center">الرصيد الحالي</TableHead>
                    <TableHead className="text-center">كلمة السر</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map(t => (
                    <TableRow key={t.id} data-testid={`row-treasury-${t.id}`}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground ml-1">{t.glAccountCode}</span>
                        {t.glAccountName}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm">
                        {formatNumber(parseFloat(t.openingBalance))}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm text-green-700 dark:text-green-400">
                        {formatNumber(parseFloat(t.totalIn))}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm text-red-700 dark:text-red-400">
                        {formatNumber(parseFloat(t.totalOut))}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm font-semibold">
                        <span className={parseFloat(t.balance) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700"}>
                          {formatNumber(parseFloat(t.balance))}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {t.hasPassword ? (
                          <Badge className="bg-green-600 text-white">
                            <Lock className="h-3 w-3 ml-1" />
                            محمية
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <Unlock className="h-3 w-3 ml-1" />
                            مفتوحة
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={t.isActive ? "default" : "secondary"}>
                          {t.isActive ? "نشط" : "موقف"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm" variant="outline"
                            onClick={() => openStatement(t)}
                            title="كشف الحساب"
                            data-testid={`button-stmt-${t.id}`}
                          >
                            <Eye className="h-3.5 w-3.5 ml-1" />
                            كشف
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            onClick={() => { setPwdTarget(t); setPwdNew(""); setPwdConfirm(""); }}
                            title={t.hasPassword ? "تغيير كلمة السر" : "تعيين كلمة السر"}
                            data-testid={`button-pwd-${t.id}`}
                          >
                            <KeyRound className="h-3.5 w-3.5 ml-1" />
                            {t.hasPassword ? "تغيير السر" : "تعيين سر"}
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            onClick={() => openEdit(t)}
                            data-testid={`button-edit-${t.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5 ml-1" />
                            تعديل
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            onClick={() => setDeleteTarget(t)}
                            data-testid={`button-delete-${t.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 ml-1" />
                            حذف
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {/* Totals row */}
                {summaries.length > 1 && (
                  <tfoot>
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={2} className="text-right px-4">الإجمالي</TableCell>
                      <TableCell className="text-center font-mono">
                        {formatNumber(summaries.reduce((s, t) => s + parseFloat(t.openingBalance), 0))}
                      </TableCell>
                      <TableCell className="text-center font-mono text-green-700 dark:text-green-400">
                        {formatNumber(summaries.reduce((s, t) => s + parseFloat(t.totalIn), 0))}
                      </TableCell>
                      <TableCell className="text-center font-mono text-red-700 dark:text-red-400">
                        {formatNumber(summaries.reduce((s, t) => s + parseFloat(t.totalOut), 0))}
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {formatNumber(summaries.reduce((s, t) => s + parseFloat(t.balance), 0))}
                      </TableCell>
                      <TableCell colSpan={3} />
                    </TableRow>
                  </tfoot>
                )}
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2 — تعيين المستخدمين
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "users" && (
        <div className="space-y-4">
          {/* Assignment form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-right">تعيين خزنة لمستخدم</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                كل مستخدم يمكن ربطه بخزنة واحدة — يمكن لعدة مستخدمين الارتباط بنفس الخزنة.
              </p>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-48">
                  <label className="text-sm font-medium mb-1.5 block">المستخدم</label>
                  <Select value={assignUserId} onValueChange={setAssignUserId}>
                    <SelectTrigger data-testid="select-assign-user">
                      <SelectValue placeholder="اختر مستخدماً..." />
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
                <div className="flex-1 min-w-48">
                  <label className="text-sm font-medium mb-1.5 block">الخزنة</label>
                  <Select value={assignTreasuryId} onValueChange={setAssignTreasuryId}>
                    <SelectTrigger data-testid="select-assign-treasury">
                      <SelectValue placeholder="اختر خزنة..." />
                    </SelectTrigger>
                    <SelectContent>
                      {summaries.filter(t => t.isActive).map(t => (
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
                  data-testid="button-assign"
                >
                  {assignMut.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin ml-1" />
                    : <Plus className="h-4 w-4 ml-1" />}
                  تعيين
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Current assignments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-right">التعيينات الحالية</CardTitle>
            </CardHeader>
            <CardContent>
              {userAssignments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">لا توجد تعيينات بعد</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">المستخدم</TableHead>
                      <TableHead className="text-right">الخزنة المعينة</TableHead>
                      <TableHead className="text-center">إلغاء التعيين</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userAssignments.map(a => (
                      <TableRow key={a.userId} data-testid={`row-assign-${a.userId}`}>
                        <TableCell className="font-medium">{a.userName}</TableCell>
                        <TableCell>{a.treasuryName}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm" variant="outline"
                            onClick={() => removeAssignMut.mutate(a.userId)}
                            disabled={removeAssignMut.isPending}
                            data-testid={`button-remove-assign-${a.userId}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 ml-1" />
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

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3 — كشف حساب الخزنة
      ══════════════════════════════════════════════════════════════════════ */}
      {tab === "statement" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-right">كشف حساب الخزنة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-48">
                <label className="text-sm font-medium mb-1.5 block">الخزنة</label>
                <Select value={stmtTreasuryId} onValueChange={setStmtTreasuryId}>
                  <SelectTrigger data-testid="select-stmt-treasury">
                    <SelectValue placeholder="اختر خزنة..." />
                  </SelectTrigger>
                  <SelectContent>
                    {summaries.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">من تاريخ</label>
                <Input type="date" value={stmtFrom} onChange={e => setStmtFrom(e.target.value)} className="w-38" data-testid="input-stmt-from" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">إلى تاريخ</label>
                <Input type="date" value={stmtTo} onChange={e => setStmtTo(e.target.value)} className="w-38" data-testid="input-stmt-to" />
              </div>
            </div>

            {!stmtTreasuryId && (
              <p className="text-center text-muted-foreground py-12">اختر خزنة لعرض كشف الحساب</p>
            )}

            {stmtTreasuryId && stmtLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {stmtTreasuryId && !stmtLoading && statement && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="border rounded-md p-3 text-center bg-green-50 dark:bg-green-950/20">
                    <p className="text-xs text-muted-foreground mb-1">إجمالي الوارد</p>
                    <p className="text-xl font-bold text-green-700 dark:text-green-400" data-testid="text-total-in">
                      {formatNumber(parseFloat(statement.totalIn))}
                      <span className="text-xs font-normal mr-1">ج.م</span>
                    </p>
                  </div>
                  <div className="border rounded-md p-3 text-center bg-red-50 dark:bg-red-950/20">
                    <p className="text-xs text-muted-foreground mb-1">إجمالي المنصرف</p>
                    <p className="text-xl font-bold text-red-700 dark:text-red-400" data-testid="text-total-out">
                      {formatNumber(parseFloat(statement.totalOut))}
                      <span className="text-xs font-normal mr-1">ج.م</span>
                    </p>
                  </div>
                  <div className="border rounded-md p-3 text-center bg-blue-50 dark:bg-blue-950/20">
                    <p className="text-xs text-muted-foreground mb-1">الرصيد</p>
                    <p
                      className={`text-xl font-bold ${parseFloat(statement.balance) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700"}`}
                      data-testid="text-balance"
                    >
                      {formatNumber(parseFloat(statement.balance))}
                      <span className="text-xs font-normal mr-1">ج.م</span>
                    </p>
                  </div>
                </div>

                {/* Transactions table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-center w-10">#</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">البيان</TableHead>
                      <TableHead className="text-center">وارد (ج.م)</TableHead>
                      <TableHead className="text-center">منصرف (ج.م)</TableHead>
                      <TableHead className="text-center">الرصيد (ج.م)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statement.transactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                          لا توجد حركات في هذه الفترة
                        </TableCell>
                      </TableRow>
                    ) : (() => {
                      const bals = runningBalances(statement.transactions);
                      return statement.transactions.map((txn, i) => (
                        <TableRow key={txn.id} data-testid={`row-txn-${i}`}>
                          <TableCell className="text-center">{i + 1}</TableCell>
                          <TableCell className="font-mono text-sm">{txn.transactionDate}</TableCell>
                          <TableCell>{txn.description || "—"}</TableCell>
                          <TableCell className="text-center font-medium text-green-700 dark:text-green-400">
                            {txn.type === "in" ? formatNumber(parseFloat(txn.amount)) : "—"}
                          </TableCell>
                          <TableCell className="text-center font-medium text-red-700 dark:text-red-400">
                            {txn.type === "out" ? formatNumber(parseFloat(txn.amount)) : "—"}
                          </TableCell>
                          <TableCell className={`text-center font-medium ${bals[i] >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700"}`}>
                            {formatNumber(bals[i])}
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
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          DIALOG — إضافة / تعديل خزنة
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={formOpen} onOpenChange={open => { if (!isSaving) setFormOpen(open); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right">
              {editId ? "تعديل الخزنة" : "إضافة خزنة جديدة"}
            </DialogTitle>
            {editId && (
              <DialogDescription className="text-right">
                تعديل بيانات الخزنة — التغييرات تُطبَّق فوراً
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium block">اسم الخزنة *</label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="مثال: خزنة الاستقبال الرئيسية"
                data-testid="input-treasury-name"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium block">الحساب في دليل الحسابات *</label>
              <AccountSearchSelect
                accounts={accounts.filter(a => a.isActive)}
                value={form.glAccountId}
                onChange={v => setForm(f => ({ ...f, glAccountId: v }))}
                placeholder="ابحث عن الحساب بالكود أو الاسم..."
                data-testid="select-treasury-account"
              />
              {form.glAccountId && (() => {
                const acc = accounts.find(a => a.id === form.glAccountId);
                return acc ? (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{acc.code}</span> — {acc.name}
                  </p>
                ) : null;
              })()}
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

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                data-testid="checkbox-treasury-active"
              />
              <span className="text-sm">خزنة نشطة</span>
            </label>
          </div>

          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleFormSubmit} disabled={isSaving} data-testid="button-save-treasury">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              {editId ? "تحديث" : "إضافة"}
            </Button>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={isSaving}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════
          DIALOG — تعيين / تغيير كلمة السر
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!pwdTarget} onOpenChange={open => { if (!open) setPwdTarget(null); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">
              {pwdTarget?.hasPassword ? "تغيير كلمة سر الخزنة" : "تعيين كلمة سر الخزنة"}
            </DialogTitle>
            <DialogDescription className="text-right">
              {pwdTarget?.glAccountCode} — {pwdTarget?.name}
              <br />
              <span className="text-xs">الحساب: {pwdTarget?.glAccountCode} {pwdTarget?.glAccountName}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium block">كلمة السر الجديدة</label>
              <Input
                type="password"
                value={pwdNew}
                onChange={e => setPwdNew(e.target.value)}
                placeholder="أدخل كلمة السر (4 أحرف على الأقل)..."
                data-testid="input-pwd-new"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium block">تأكيد كلمة السر</label>
              <Input
                type="password"
                value={pwdConfirm}
                onChange={e => setPwdConfirm(e.target.value)}
                placeholder="أعد إدخال كلمة السر..."
                data-testid="input-pwd-confirm"
              />
            </div>
          </div>

          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              onClick={handleSetPassword}
              disabled={setPasswordMut.isPending || !pwdNew || !pwdConfirm}
              data-testid="button-save-pwd"
            >
              {setPasswordMut.isPending
                ? <Loader2 className="h-4 w-4 animate-spin ml-1" />
                : <Lock className="h-4 w-4 ml-1" />}
              حفظ كلمة السر
            </Button>
            {pwdTarget?.hasPassword && (
              <Button
                variant="destructive"
                onClick={() => pwdTarget && removePasswordMut.mutate(pwdTarget.glAccountId)}
                disabled={removePasswordMut.isPending}
                data-testid="button-remove-pwd"
              >
                {removePasswordMut.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin ml-1" />
                  : <Trash2 className="h-4 w-4 ml-1" />}
                إزالة السر
              </Button>
            )}
            <Button variant="outline" onClick={() => setPwdTarget(null)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════════
          DIALOG — تأكيد الحذف
      ══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">حذف الخزنة</DialogTitle>
            <DialogDescription className="text-right">
              هل أنت متأكد من حذف الخزنة «{deleteTarget?.name}»؟
              {" "}سيُحذف كل تاريخ المعاملات المرتبط بها ولا يمكن التراجع عن هذه العملية.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMut.isPending
                ? <Loader2 className="h-4 w-4 animate-spin ml-1" />
                : <Trash2 className="h-4 w-4 ml-1" />}
              حذف
            </Button>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
