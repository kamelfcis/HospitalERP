import { useState } from "react";
import { Banknote, Users, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTreasuries } from "./hooks/useTreasuries";
import { OverviewTab } from "./tabs/OverviewTab";
import { UsersTab } from "./tabs/UsersTab";
import { StatementTab } from "./tabs/StatementTab";
import { TreasuryFormDialog } from "./components/TreasuryFormDialog";
import { PasswordDialog } from "./components/PasswordDialog";
import { DeleteDialog } from "./components/DeleteDialog";
import { emptyForm, type TreasuryForm, type TreasurySummary } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveTab = "overview" | "users" | "statement";

interface TabDef {
  id: ActiveTab;
  label: string;
  icon: React.ElementType;
}

const TABS: TabDef[] = [
  { id: "overview",   label: "نظرة عامة على الخزن", icon: Banknote },
  { id: "users",      label: "تعيين المستخدمين",     icon: Users   },
  { id: "statement",  label: "كشف حساب الخزنة",     icon: FileText },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TreasuriesPage() {
  const { toast } = useToast();

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");

  // ── Statement initial treasury (set when clicking "كشف" from overview) ──
  const [stmtInitTreasuryId, setStmtInitTreasuryId] = useState("");

  // ── Form dialog ──────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TreasuryForm>(emptyForm);

  // ── Password dialog ──────────────────────────────────────────────────────
  const [pwdTarget, setPwdTarget] = useState<TreasurySummary | null>(null);

  // ── Delete dialog ────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<TreasurySummary | null>(null);

  // ── Data & mutations ──────────────────────────────────────────────────────
  const {
    summaries, summariesLoading,
    users, userAssignments,
    createMut, updateMut, deleteMut,
    setPasswordMut, removePasswordMut,
    assignMut, removeAssignMut,
  } = useTreasuries();

  // ── Handlers ─────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setFormOpen(true);
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
    if (editId) {
      updateMut.mutate(
        { id: editId, data: form },
        { onSuccess: () => { setFormOpen(false); setEditId(null); setForm(emptyForm); } },
      );
    } else {
      createMut.mutate(
        form,
        { onSuccess: () => { setFormOpen(false); setForm(emptyForm); } },
      );
    }
  };

  const handleOpenStatement = (t: TreasurySummary) => {
    setStmtInitTreasuryId(t.id);
    setActiveTab("statement");
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5" dir="rtl">

      {/* Page header */}
      <div className="flex items-center gap-3">
        <Banknote className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-2xl font-bold">إدارة الخزن</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b pb-3">
        {TABS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant={activeTab === id ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab(id)}
            data-testid={`tab-${id}`}
          >
            <Icon className="h-4 w-4 ml-1" />
            {label}
          </Button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <OverviewTab
          summaries={summaries}
          isLoading={summariesLoading}
          onAdd={openCreate}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
          onPassword={setPwdTarget}
          onStatement={handleOpenStatement}
        />
      )}

      {activeTab === "users" && (
        <UsersTab
          summaries={summaries}
          users={users}
          userAssignments={userAssignments}
          onAssign={p => assignMut.mutate(p)}
          onRemoveAssign={id => removeAssignMut.mutate(id)}
          isAssigning={assignMut.isPending}
          isRemoving={removeAssignMut.isPending}
        />
      )}

      {activeTab === "statement" && (
        <StatementTab
          summaries={summaries}
          initialTreasuryId={stmtInitTreasuryId}
        />
      )}

      {/* Dialogs */}
      <TreasuryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editId={editId}
        form={form}
        onFormChange={patch => setForm(f => ({ ...f, ...patch }))}
        onSubmit={handleFormSubmit}
        isSaving={createMut.isPending || updateMut.isPending}
      />

      <PasswordDialog
        treasury={pwdTarget}
        onClose={() => setPwdTarget(null)}
        onSetPassword={p => setPasswordMut.mutate(p, { onSuccess: () => setPwdTarget(null) })}
        onRemovePassword={id => removePasswordMut.mutate(id, { onSuccess: () => setPwdTarget(null) })}
        isSetting={setPasswordMut.isPending}
        isRemoving={removePasswordMut.isPending}
      />

      <DeleteDialog
        treasury={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={id => deleteMut.mutate(id, { onSuccess: () => setDeleteTarget(null) })}
        isDeleting={deleteMut.isPending}
      />
    </div>
  );
}
