import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, X, ArrowRight, Send, Check, CheckCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABELS } from "@shared/permissions";
import { toast } from "@/hooks/use-toast";

interface ChatUser {
  id: string;
  fullName: string;
  role: string;
  unreadCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return formatTime(dateStr);
  return d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
}

export function ChatPopup() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/chat/unread-count"],
    refetchInterval: 60000,
    staleTime: 30000,
    enabled: !!user,
  });

  const { data: chatUsers = [] } = useQuery<ChatUser[]>({
    queryKey: ["/api/chat/users"],
    enabled: open && !selectedUser,
    refetchInterval: open && !selectedUser ? 30000 : false,
    staleTime: 15000,
  });

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/messages", selectedUser?.id],
    enabled: !!selectedUser,
    refetchInterval: false,
  });

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      apiRequest("POST", "/api/chat/messages", { receiverId: selectedUser!.id, body }),
    onSuccess: () => {
      setInputText("");
      qc.invalidateQueries({ queryKey: ["/api/chat/messages", selectedUser?.id] });
      qc.invalidateQueries({ queryKey: ["/api/chat/users"] });
    },
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (selectedUser && open) {
      qc.invalidateQueries({ queryKey: ["/api/chat/unread-count"] });
      qc.invalidateQueries({ queryKey: ["/api/chat/users"] });
    }
  }, [selectedUser, open, qc]);

  const selectedUserRef = useRef(selectedUser);
  selectedUserRef.current = selectedUser;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!user) return;
    const es = new EventSource("/api/chat/sse");
    es.addEventListener("chat-message", (e) => {
      qc.invalidateQueries({ queryKey: ["/api/chat/unread-count"] });
      qc.invalidateQueries({ queryKey: ["/api/chat/users"] });
      try {
        const data = JSON.parse(e.data);
        const currentSelected = selectedUserRef.current;
        const isOpen = openRef.current;
        if (currentSelected) {
          qc.invalidateQueries({ queryKey: ["/api/chat/messages", currentSelected.id] });
        }
        if (!isOpen || currentSelected?.id !== data.senderId) {
          const preview = data.body?.length > 60 ? data.body.slice(0, 60) + "…" : data.body;
          toast({
            title: `رسالة من ${data.senderName ?? "مستخدم"}`,
            description: preview,
            duration: 6000,
          });
        }
      } catch {}
    });
    return () => es.close();
  }, [user, qc]);

  useEffect(() => {
    if (open && selectedUser) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, selectedUser]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (selectedUser) setSelectedUser(null);
        else setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, selectedUser]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || sendMutation.isPending) return;
    sendMutation.mutate(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectUser = (u: ChatUser) => {
    setSelectedUser(u);
    qc.invalidateQueries({ queryKey: ["/api/chat/messages", u.id] });
  };

  const unreadCount = unreadData?.count ?? 0;

  const initials = (name: string) =>
    name.trim().split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  const avatarColor = (id: string) => {
    const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f97316", "#10b981", "#06b6d4", "#f59e0b"];
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % colors.length;
    return colors[h];
  };

  if (!user) return null;

  return (
    <div className="fixed bottom-5 left-5 z-50 no-print" dir="rtl">
      {open && (
        <div
          className="mb-3 w-[360px] rounded-2xl shadow-2xl border border-border bg-background flex flex-col overflow-hidden"
          style={{ height: "520px" }}
          data-testid="chat-popup"
        >
          {!selectedUser ? (
            <>
              <div className="flex items-center justify-between px-4 py-3 bg-sidebar border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-white" />
                  <span className="font-bold text-white text-[15px]">الرسائل الداخلية</span>
                  {unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 leading-none">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-white/70 hover:text-white"
                  data-testid="button-chat-close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {chatUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
                    <MessageCircle className="h-10 w-10 opacity-30" />
                    <p>لا يوجد مستخدمون آخرون</p>
                  </div>
                ) : (
                  chatUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleSelectUser(u)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/40 text-right"
                      data-testid={`button-chat-user-${u.id}`}
                    >
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                        style={{ backgroundColor: avatarColor(u.id) }}
                      >
                        {initials(u.fullName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-foreground truncate">{u.fullName}</span>
                          {u.lastMessageAt && (
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              {formatDate(u.lastMessageAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground truncate">
                            {u.lastMessage || ROLE_LABELS[u.role] || u.role}
                          </span>
                          {u.unreadCount > 0 && (
                            <span className="bg-blue-500 text-white text-[11px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0">
                              {u.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 py-3 bg-sidebar border-b border-border shrink-0">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-white/70 hover:text-white"
                  data-testid="button-chat-back"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                  style={{ backgroundColor: avatarColor(selectedUser.id) }}
                >
                  {initials(selectedUser.fullName)}
                </div>
                <div className="flex-1 text-right">
                  <p className="font-bold text-white text-sm leading-none">{selectedUser.fullName}</p>
                  <p className="text-white/60 text-xs">{ROLE_LABELS[selectedUser.role] || selectedUser.role}</p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-white/70 hover:text-white"
                  data-testid="button-chat-close-conv"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    ابدأ المحادثة...
                  </div>
                )}
                {messages.map((msg, i) => {
                  const isMe = msg.senderId === user?.id;
                  const prevMsg = messages[i - 1];
                  const showDate =
                    !prevMsg ||
                    new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="text-center py-1">
                          <span className="text-[11px] text-muted-foreground bg-muted rounded-full px-3 py-0.5">
                            {new Date(msg.createdAt).toLocaleDateString("ar-EG", {
                              weekday: "long", day: "numeric", month: "long",
                            })}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${isMe ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-snug shadow-sm ${
                            isMe
                              ? "bg-blue-600 text-white rounded-tl-sm"
                              : "bg-muted text-foreground rounded-tr-sm"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                          <div className={`flex items-center gap-1 mt-0.5 ${isMe ? "justify-start" : "justify-end"}`}>
                            <span className={`text-[10px] ${isMe ? "text-blue-200" : "text-muted-foreground"}`}>
                              {formatTime(msg.createdAt)}
                            </span>
                            {isMe && (
                              msg.readAt
                                ? <CheckCheck className="h-3 w-3 text-blue-200" />
                                : <Check className="h-3 w-3 text-blue-300" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="px-3 py-2 border-t border-border shrink-0">
                <div className="flex items-end gap-2">
                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || sendMutation.isPending}
                    className="h-9 w-9 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center shrink-0 transition-colors"
                    data-testid="button-chat-send"
                  >
                    <Send className="h-4 w-4 text-white" style={{ transform: "scaleX(-1)" }} />
                  </button>
                  <textarea
                    ref={inputRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="اكتب رسالة..."
                    rows={1}
                    className="flex-1 resize-none rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 max-h-24 overflow-y-auto"
                    style={{ direction: "rtl" }}
                    data-testid="input-chat-message"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => {
            setOpen((v) => !v);
            if (!open) setSelectedUser(null);
          }}
          className="relative h-13 w-13 rounded-full bg-sidebar shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
          style={{ width: 52, height: 52 }}
          data-testid="button-chat-bubble"
        >
          {open ? (
            <X className="h-6 w-6 text-white" />
          ) : (
            <MessageCircle className="h-6 w-6 text-white" />
          )}
          {!open && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[11px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 shadow">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
