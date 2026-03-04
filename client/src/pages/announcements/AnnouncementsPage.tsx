import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, Eye, EyeOff, Megaphone } from "lucide-react";
import { MarqueeTicker } from "@/components/layout/MarqueeTicker";

interface Announcement {
  id: string;
  message: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

function AnnouncementPreview({ messages }: { messages: string[] }) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">معاينة الشريط</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="bg-primary rounded-b-md h-10 flex items-center px-4 overflow-hidden">
          <MarqueeTicker
            messages={messages}
            speed={70}
            className="flex-1 text-primary-foreground/90"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function NewAnnouncementForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [text, setText] = useState("");

  const createMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/announcements", { message: text }),
    onSuccess: () => {
      setText("");
      toast({ title: "تم الإضافة", description: "تم إضافة الإعلان بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/active"] });
      onSuccess();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Plus className="h-4 w-4" />
          إعلان جديد
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          placeholder="اكتب نص الإعلان هنا..."
          value={text}
          onChange={e => setText(e.target.value)}
          rows={2}
          className="resize-none text-right"
          dir="rtl"
          data-testid="input-announcement-text"
        />
        <Button
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={!text.trim() || createMutation.isPending}
          data-testid="button-add-announcement"
        >
          <Plus className="h-3 w-3 ml-1" />
          إضافة
        </Button>
      </CardContent>
    </Card>
  );
}

function AnnouncementRow({ item }: { item: Announcement }) {
  const { toast } = useToast();

  const toggleMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/announcements/${item.id}`, { isActive: !item.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/active"] });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/announcements/${item.id}`),
    onSuccess: () => {
      toast({ title: "تم الحذف" });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/active"] });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-row-reverse items-start gap-3 p-3 border rounded-md bg-background" dir="rtl">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-right leading-relaxed">{item.message}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(item.createdAt).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Badge variant={item.isActive ? "default" : "secondary"} className="text-xs">
          {item.isActive ? "نشط" : "مخفي"}
        </Badge>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
          title={item.isActive ? "إخفاء" : "إظهار"}
          data-testid={`button-toggle-announcement-${item.id}`}
        >
          {item.isActive ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => deleteMutation.mutate()}
          disabled={deleteMutation.isPending}
          title="حذف"
          data-testid={`button-delete-announcement-${item.id}`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const isAdmin = ["owner", "admin"].includes(user?.role || "");

  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["/api/announcements"],
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground" dir="rtl">
        غير مصرح بالوصول
      </div>
    );
  }

  const activeMessages = announcements.filter(a => a.isActive).map(a => a.message);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4" dir="rtl">
      <div className="flex flex-row-reverse items-center gap-2 mb-4">
        <Megaphone className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">إدارة شريط الإعلانات</h1>
      </div>

      <AnnouncementPreview messages={activeMessages} />

      <NewAnnouncementForm onSuccess={() => {}} />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">جميع الإعلانات ({announcements.length})</h2>
        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">جارٍ التحميل...</div>
        ) : announcements.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">لا توجد إعلانات بعد</div>
        ) : (
          announcements.map(item => <AnnouncementRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
