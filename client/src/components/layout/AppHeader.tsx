import { useQuery } from "@tanstack/react-query";
import { MarqueeTicker } from "./MarqueeTicker";

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
      className="flex items-center h-10 px-4 bg-sidebar shrink-0 no-print overflow-hidden border-b border-sidebar-border"
      data-testid="app-header-ticker"
    >
      <MarqueeTicker
        messages={messages}
        speed={70}
        className="flex-1 text-sidebar-foreground/90"
      />
    </header>
  );
}
