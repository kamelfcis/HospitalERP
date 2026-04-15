import { useQuery } from "@tanstack/react-query";
import { MarqueeTicker } from "./MarqueeTicker";
import { NotificationBell } from "@/components/tasks/NotificationBell";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface Announcement {
  id: string;
  message: string;
}

export function AppHeader() {
  const { data: announcements = [] } = useQuery<Announcement[]>({
    queryKey: ["/api/announcements/active"],
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const messages = announcements.map(a => a.message);

  return (
    <header
      className="flex h-10 min-h-10 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 no-print sm:px-4 overflow-hidden"
      data-testid="app-header-ticker"
    >
      <SidebarTrigger
        className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent/80"
        data-testid="button-app-header-sidebar"
      />
      <MarqueeTicker
        messages={messages}
        speed={70}
        className="min-w-0 flex-1 text-sidebar-foreground/90"
      />
      <NotificationBell />
    </header>
  );
}
