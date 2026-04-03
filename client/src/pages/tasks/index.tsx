import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Plus, CheckCircle2, Clock, AlertCircle, PauseCircle, HelpCircle, XCircle,
  ChevronDown, Calendar, User, MessageSquare, Send, Tag, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────
interface TaskUser { id: string; fullName: string; role: string; }
interface TaskAssignee { userId: string; userName: string; status: string; }
interface TaskItem {
  id: string; title: string; description?: string;
  priority: string; status: string;
  createdAt: string; dueDate?: string;
  createdByName: string; myStatus?: string; readAt?: string;
  assignees: TaskAssignee[];
}
interface TaskComment {
  id: string; body: string; statusAfterUpdate?: string;
  createdAt: string; userName: string; userId: string;
}
interface TaskDetail extends TaskItem {
  createdBy: string;
  comments: TaskComment[];
}

// ── Labels & Colors ───────────────────────────────────────────
const PRIORITY_LABELS: Record<string, string> = {
  normal: "عادي", important: "مهم", urgent: "عاجل",
};
const PRIORITY_COLORS: Record<string, string> = {
  normal: "secondary", important: "default", urgent: "destructive",
};
const STATUS_LABELS: Record<string, string> = {
  new: "جديدة", in_progress: "جاري العمل", done: "مكتملة",
  deferred: "مؤجلة", needs_clarification: "بحاجة توضيح", cancelled: "ملغاة",
};
const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  new: AlertCircle, in_progress: Clock, done: CheckCircle2,
  deferred: PauseCircle, needs_clarification: HelpCircle, cancelled: XCircle,
};
const STATUS_COLORS: Record<string, string> = {
  new: "text-blue-500", in_progress: "text-yellow-500", done: "text-green-500",
  deferred: "text-gray-400", needs_clarification: "text-orange-500", cancelled: "text-red-400",
};

function formatDate(d?: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" });
}
function formatDateTime(d?: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Status Badge Component ────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const Icon = STATUS_ICONS[status] ?? AlertCircle;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${STATUS_COLORS[status] ?? "text-muted-foreground"}`}>
      <Icon className="h-3.5 w-3.5" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Task Card Component ───────────────────────────────────────
function TaskCard({ task, tab, onClick }: { task: TaskItem; tab: string; onClick: () => void }) {
  const isUnread = tab === "inbox" && !task.readAt;
  return (
    <button
      className={`w-full text-right p-4 rounded-lg border hover:border-primary/40 hover:shadow-sm transition-all flex flex-col gap-2 ${isUnread ? "border-blue-200 bg-blue-50/40 dark:bg-blue-950/10" : "bg-card"}`}
      onClick={onClick}
      data-testid={`task-card-${task.id}`}
    >
      <div className="flex items-start gap-2 justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {isUnread && <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1" />}
          <span className="font-semibold text-sm leading-snug truncate">{task.title}</span>
        </div>
        <Badge variant={(PRIORITY_COLORS[task.priority] as any) ?? "secondary"} className="shrink-0 text-xs">
          {PRIORITY_LABELS[task.priority] ?? task.priority}
        </Badge>
      </div>
      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {tab === "inbox" ? task.createdByName : task.assignees.map(a => a.userName).join("، ")}
        </span>
        {task.dueDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(task.dueDate)}
          </span>
        )}
        <StatusBadge status={tab === "inbox" ? (task.myStatus ?? task.status) : task.status} />
      </div>
    </button>
  );
}

// ── Create Task Dialog ────────────────────────────────────────
function CreateTaskDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: users = [] } = useQuery<TaskUser[]>({
    queryKey: ["/api/tasks/users/list"],
    enabled: open,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/tasks", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "تم إرسال المهمة بنجاح" });
      handleClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function handleClose() {
    setTitle(""); setDescription(""); setPriority("normal"); setDueDate(""); setSelectedIds([]);
    onClose();
  }

  function toggleUser(id: string) {
    setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  function submit() {
    if (!title.trim()) return toast({ title: "عنوان المهمة مطلوب", variant: "destructive" });
    if (selectedIds.length === 0) return toast({ title: "يجب اختيار مستلم واحد على الأقل", variant: "destructive" });
    mutation.mutate({ title, description, priority, dueDate: dueDate || undefined, assigneeIds: selectedIds });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>إنشاء مهمة جديدة</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>العنوان *</Label>
            <Input
              placeholder="عنوان المهمة..."
              value={title}
              onChange={e => setTitle(e.target.value)}
              data-testid="input-task-title"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>الوصف</Label>
            <Textarea
              placeholder="تفاصيل إضافية..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              data-testid="input-task-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>الأولوية</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">عادي</SelectItem>
                  <SelectItem value="important">مهم</SelectItem>
                  <SelectItem value="urgent">عاجل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>تاريخ الاستحقاق</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} data-testid="input-task-due-date" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>المستلمون *</Label>
            <div className="border rounded-md max-h-40 overflow-y-auto divide-y">
              {users.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">لا يوجد مستخدمون</p>
              ) : users.map(u => (
                <label key={u.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 select-none" data-testid={`checkbox-user-${u.id}`}>
                  <Checkbox
                    checked={selectedIds.includes(u.id)}
                    onCheckedChange={() => toggleUser(u.id)}
                  />
                  <span className="text-sm flex-1">{u.fullName}</span>
                  <span className="text-xs text-muted-foreground">{u.role}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>إلغاء</Button>
          <Button onClick={submit} disabled={mutation.isPending} data-testid="button-submit-task">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            إرسال المهمة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Task Detail Dialog ────────────────────────────────────────
function TaskDetailDialog({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [comment, setComment] = useState("");
  const [newStatus, setNewStatus] = useState<string>("");

  const { data: task, isLoading } = useQuery<TaskDetail>({
    queryKey: ["/api/tasks", taskId],
    queryFn: () => fetch(`/api/tasks/${taskId}`).then(r => r.json()),
    enabled: !!taskId,
    staleTime: 0,
  });

  const isAssignee = task?.assignees.some(a => a.userId === user?.id) ?? false;

  const statusMutation = useMutation({
    mutationFn: (status: string) => apiRequest("PATCH", `/api/tasks/${taskId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
      toast({ title: "تم تحديث الحالة" });
      setNewStatus("");
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const commentMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/tasks/${taskId}/comments`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
      setComment(""); setNewStatus("");
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  function submitComment() {
    if (!comment.trim()) return;
    const effectiveStatus = newStatus && newStatus !== "__none__" ? newStatus : undefined;
    commentMutation.mutate({ body: comment.trim(), statusAfterUpdate: effectiveStatus });
  }

  function submitStatusChange(status: string) {
    statusMutation.mutate(status);
  }

  return (
    <Dialog open={!!taskId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" dir="rtl">
        {isLoading || !task ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg leading-snug">{task.title}</DialogTitle>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <Badge variant={(PRIORITY_COLORS[task.priority] as any) ?? "secondary"}>
                  {PRIORITY_LABELS[task.priority]}
                </Badge>
                <StatusBadge status={task.status} />
                {task.dueDate && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {formatDate(task.dueDate)}
                  </span>
                )}
              </div>
            </DialogHeader>

            <ScrollArea className="flex-1 min-h-0">
              <div className="flex flex-col gap-4 px-1 pb-4">
                {/* Info Row */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">المرسل</p>
                    <p className="font-medium">{task.createdByName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">المستلمون</p>
                    <p className="font-medium">{task.assignees.map(a => a.userName).join("، ")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">تاريخ الإنشاء</p>
                    <p>{formatDateTime(task.createdAt)}</p>
                  </div>
                  {task.dueDate && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">الاستحقاق</p>
                      <p>{formatDate(task.dueDate)}</p>
                    </div>
                  )}
                </div>

                {/* Description */}
                {task.description && (
                  <div className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                    {task.description}
                  </div>
                )}

                {/* Assignees Status */}
                {task.assignees.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">حالة المستلمين</p>
                    <div className="flex flex-wrap gap-2">
                      {task.assignees.map(a => (
                        <div key={a.userId} className="flex items-center gap-1.5 text-xs border rounded px-2 py-1">
                          <span>{a.userName}</span>
                          <StatusBadge status={a.status} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timeline / Comments */}
                {task.comments.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5" /> التحديثات والتعليقات
                      </p>
                      <div className="flex flex-col gap-3">
                        {task.comments.map(c => (
                          <div key={c.id} className="flex gap-2">
                            <div className="flex flex-col items-center">
                              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                                {c.userName.charAt(0)}
                              </div>
                              <div className="w-px flex-1 bg-border mt-1" />
                            </div>
                            <div className="flex-1 pb-2">
                              <div className="flex items-baseline gap-2 mb-1">
                                <span className="text-xs font-semibold">{c.userName}</span>
                                <span className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                                {c.statusAfterUpdate && (
                                  <span className="text-xs"><StatusBadge status={c.statusAfterUpdate} /></span>
                                )}
                              </div>
                              <p className="text-sm text-foreground/90 whitespace-pre-wrap bg-muted/30 rounded-md px-3 py-2">
                                {c.body}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Status Actions (assignee only) */}
                {isAssignee && task.status !== "done" && task.status !== "cancelled" && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">تغيير حالتي</p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { s: "in_progress", label: "بدأت العمل" },
                          { s: "done", label: "أنهيت المهمة" },
                          { s: "deferred", label: "تأجيل" },
                          { s: "needs_clarification", label: "أحتاج توضيح" },
                        ].map(({ s, label }) => (
                          <Button
                            key={s}
                            variant="outline"
                            size="sm"
                            className="text-xs h-8"
                            disabled={statusMutation.isPending}
                            onClick={() => submitStatusChange(s)}
                            data-testid={`button-status-${s}`}
                          >
                            {statusMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Add Comment */}
                {task.status !== "cancelled" && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-medium text-muted-foreground">إضافة تعليق</p>
                      <Textarea
                        placeholder="اكتب تعليقاً..."
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        rows={2}
                        data-testid="input-comment"
                      />
                      <div className="flex items-center gap-2">
                        {isAssignee && (
                          <Select value={newStatus} onValueChange={setNewStatus}>
                            <SelectTrigger className="w-44 h-8 text-xs" data-testid="select-comment-status">
                              <SelectValue placeholder="تغيير الحالة (اختياري)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">بدون تغيير</SelectItem>
                              <SelectItem value="in_progress">جاري العمل</SelectItem>
                              <SelectItem value="done">مكتملة</SelectItem>
                              <SelectItem value="deferred">مؤجلة</SelectItem>
                              <SelectItem value="needs_clarification">بحاجة توضيح</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        <Button
                          size="sm"
                          onClick={submitComment}
                          disabled={commentMutation.isPending || !comment.trim()}
                          data-testid="button-send-comment"
                        >
                          {commentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          إرسال
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────
const STATUS_FILTERS = [
  { value: "__all__", label: "الكل" },
  { value: "new", label: "جديدة" },
  { value: "in_progress", label: "جاري" },
  { value: "done", label: "مكتملة" },
  { value: "deferred", label: "مؤجلة" },
  { value: "needs_clarification", label: "بحاجة توضيح" },
];

export default function TasksPage() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get("taskId");
    if (taskId) setSelectedTaskId(taskId);
  }, []);

  const statusParam = statusFilter === "__all__" ? "" : `&status=${statusFilter}`;
  const { data: taskList = [], isLoading } = useQuery<TaskItem[]>({
    queryKey: [`/api/tasks?tab=${tab}${statusParam}`],
    staleTime: 15_000,
  });

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
        <h1 className="text-xl font-bold">المهام الداخلية</h1>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-create-task">
          <Plus className="h-4 w-4" />
          مهمة جديدة
        </Button>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 pb-2 border-b bg-background flex flex-col gap-3">
        <Tabs value={tab} onValueChange={v => { setTab(v as any); setStatusFilter("__all__"); }}>
          <TabsList className="w-fit">
            <TabsTrigger value="inbox" data-testid="tab-inbox">الواردة إليّ</TabsTrigger>
            <TabsTrigger value="sent" data-testid="tab-sent">الصادرة مني</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${statusFilter === f.value ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted/50"}`}
              onClick={() => setStatusFilter(f.value)}
              data-testid={`filter-status-${f.value}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task List */}
      <ScrollArea className="flex-1">
        <div className="p-6 flex flex-col gap-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : taskList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground">لا توجد مهام</p>
            </div>
          ) : (
            taskList.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                tab={tab}
                onClick={() => setSelectedTaskId(task.id)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Dialogs */}
      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {selectedTaskId && (
        <TaskDetailDialog
          taskId={selectedTaskId}
          onClose={() => {
            setSelectedTaskId(null);
            navigate("/tasks", { replace: true });
          }}
        />
      )}
    </div>
  );
}
