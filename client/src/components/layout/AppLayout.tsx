import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Building2,
  Calendar,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
  Scale,
  PieChart,
  History,
  Settings,
  ClipboardList,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AppLayoutProps {
  children: React.ReactNode;
}

const mainNavItems = [
  {
    title: "لوحة التحكم",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "دليل الحسابات",
    href: "/chart-of-accounts",
    icon: BookOpen,
  },
  {
    title: "القيود اليومية",
    href: "/journal-entries",
    icon: FileText,
  },
  {
    title: "مراكز التكلفة",
    href: "/cost-centers",
    icon: Building2,
  },
  {
    title: "الفترات المحاسبية",
    href: "/fiscal-periods",
    icon: Calendar,
  },
  {
    title: "نماذج القيود",
    href: "/templates",
    icon: ClipboardList,
  },
];

const reportNavItems = [
  {
    title: "ميزان المراجعة",
    href: "/reports/trial-balance",
    icon: Scale,
  },
  {
    title: "قائمة الدخل",
    href: "/reports/income-statement",
    icon: TrendingUp,
  },
  {
    title: "الميزانية العمومية",
    href: "/reports/balance-sheet",
    icon: BarChart3,
  },
  {
    title: "تقارير مراكز التكلفة",
    href: "/reports/cost-centers",
    icon: PieChart,
  },
];

const systemNavItems = [
  {
    title: "سجل التدقيق",
    href: "/audit-log",
    icon: History,
  },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background">
        <Sidebar side="right" collapsible="icon">
          <SidebarHeader className="border-b border-border/50 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div className="group-data-[collapsible=icon]:hidden">
                <h2 className="font-bold text-foreground">الدفتر العام</h2>
                <p className="text-xs text-muted-foreground">نظام المحاسبة</p>
              </div>
            </div>
          </SidebarHeader>
          
          <SidebarContent>
            <ScrollArea className="flex-1">
              <SidebarGroup>
                <SidebarGroupLabel>القائمة الرئيسية</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {mainNavItems.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={location === item.href || (item.href !== "/" && location.startsWith(item.href))}
                          tooltip={item.title}
                        >
                          <Link href={item.href} data-testid={`nav-link-${item.href.replace(/\//g, '-').replace(/^-/, '')}`}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel>التقارير المالية</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {reportNavItems.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={location === item.href}
                          tooltip={item.title}
                        >
                          <Link href={item.href} data-testid={`nav-link-${item.href.replace(/\//g, '-').replace(/^-/, '')}`}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel>النظام</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {systemNavItems.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={location === item.href}
                          tooltip={item.title}
                        >
                          <Link href={item.href} data-testid={`nav-link-${item.href.replace(/\//g, '-').replace(/^-/, '')}`}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </ScrollArea>
          </SidebarContent>

          <SidebarFooter className="border-t border-border/50 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center">
              <Settings className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">الإصدار 1.0</span>
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between h-14 px-4 border-b bg-primary shrink-0">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-primary-foreground" data-testid="button-sidebar-toggle" />
              <h1 className="text-lg font-semibold text-primary-foreground">
                نظام الحسابات العامة - المستشفى
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-primary-foreground/80">
                العملة: الجنيه المصري (ج.م)
              </span>
            </div>
          </header>
          
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
