import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

interface TaskNotif {
  id: string;
  type: string;
  taskId: string;
  isRead: boolean;
  createdAt: string;
  actorName: string;
  taskTitle: string;
}

const TYPE_LABELS: Record<string, string> = {
  task_created: "أرسل لك مهمة جديدة",
  task_status_updated: "حدّث حالة مهمة",
  task_commented: "علّق على مهمة",
  task_completed: "أتم تنفيذ مهمة",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  return `منذ ${d} يوم`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/tasks/notifications/unread-count"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: !!user,
  });

  const { data: notifs = [], refetch: refetchNotifs } = useQuery<TaskNotif[]>({
    queryKey: ["/api/tasks/notifications"],
    enabled: open,
    staleTime: 10_000,
  });

  const unreadCount = countData?.count ?? 0;

  // ── SSE connection ────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (esRef.current) esRef.current.close();
    const es = new EventSource("/api/tasks/notifications/sse");
    esRef.current = es;
    es.addEventListener("task-notification", () => {
      qc.invalidateQueries({ queryKey: ["/api/tasks/notifications/unread-count"] });
      qc.invalidateQueries({ queryKey: ["/api/tasks/notifications"] });
    });
    es.onerror = () => {
      es.close();
      setTimeout(connectSSE, 5000);
    };
  }, [qc]);

  useEffect(() => {
    if (!user) return;
    connectSSE();
    return () => { esRef.current?.close(); };
  }, [user, connectSSE]);

  async function markRead(notifId: string, taskId: string) {
    await apiRequest("PATCH", `/api/tasks/notifications/${notifId}/read`, {});
    qc.invalidateQueries({ queryKey: ["/api/tasks/notifications/unread-count"] });
    qc.invalidateQueries({ queryKey: ["/api/tasks/notifications"] });
    setOpen(false);
    navigate(`/tasks?taskId=${taskId}`);
  }

  async function markAllRead() {
    await apiRequest("PATCH", "/api/tasks/notifications/read-all", {});
    qc.invalidateQueries({ queryKey: ["/api/tasks/notifications/unread-count"] });
    refetchNotifs();
  }

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-white/10"
          data-testid="button-notification-bell"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none select-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0"
        dir="rtl"
        data-testid="panel-notifications"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-sm">الإشعارات</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={markAllRead}>
              قراءة الكل
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {notifs.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">لا توجد إشعارات</div>
          ) : (
            <div className="divide-y">
              {notifs.map((n) => (
                <button
                  key={n.id}
                  className={`w-full text-right px-4 py-3 hover:bg-muted/50 transition-colors flex flex-col gap-0.5 ${!n.isRead ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
                  onClick={() => markRead(n.id, n.taskId)}
                  data-testid={`notif-item-${n.id}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">
                        {n.actorName}{" "}
                        <span className="font-normal text-muted-foreground">
                          {TYPE_LABELS[n.type] ?? n.type}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{n.taskTitle}</p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t px-4 py-2 text-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs w-full"
            onClick={() => { setOpen(false); navigate("/tasks"); }}
            data-testid="button-view-all-tasks"
          >
            عرض كل المهام
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
