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
  useSidebar,
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
  PanelRightClose,
  PanelRightOpen,
  Package,
  ArrowLeftRight,
  Truck,
  Receipt,
  Stethoscope,
  ShoppingCart,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  {
    title: "الأصناف",
    href: "/items",
    icon: Package,
  },
  {
    title: "استلام من مورد",
    href: "/supplier-receiving",
    icon: Truck,
  },
  {
    title: "فواتير الشراء",
    href: "/purchase-invoices",
    icon: Receipt,
  },
  {
    title: "تحويل مخزني",
    href: "/store-transfers",
    icon: ArrowLeftRight,
  },
  {
    title: "فواتير البيع",
    href: "/sales-invoices",
    icon: ShoppingCart,
  },
  {
    title: "الخدمات والأسعار",
    href: "/services-pricing",
    icon: Stethoscope,
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
  {
    title: "كشف حساب",
    href: "/reports/account-ledger",
    icon: FileText,
  },
];

const systemNavItems = [
  {
    title: "سجل التدقيق",
    href: "/audit-log",
    icon: History,
  },
];

function SidebarToggleButton() {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="text-primary-foreground hover:bg-primary-foreground/10"
          data-testid="button-sidebar-toggle"
        >
          {isCollapsed ? (
            <PanelRightOpen className="h-5 w-5" />
          ) : (
            <PanelRightClose className="h-5 w-5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isCollapsed ? "فتح القائمة" : "إغلاق القائمة"}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background">
        <Sidebar side="right" collapsible="icon" className="no-print" data-sidebar="main">
          <SidebarHeader className="border-b border-border/50 p-4">
            <div className="flex flex-row-reverse items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div className="group-data-[collapsible=icon]:hidden text-right">
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
                          <Link href={item.href} data-testid={`nav-link-${item.href.replace(/\//g, '-').replace(/^-/, '')}`} className="flex flex-row-reverse items-center gap-2">
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
                          <Link href={item.href} data-testid={`nav-link-${item.href.replace(/\//g, '-').replace(/^-/, '')}`} className="flex flex-row-reverse items-center gap-2">
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
                          <Link href={item.href} data-testid={`nav-link-${item.href.replace(/\//g, '-').replace(/^-/, '')}`} className="flex flex-row-reverse items-center gap-2">
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
            <div className="flex flex-row-reverse items-center gap-2 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center">
              <Settings className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">الإصدار 1.0</span>
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between h-14 px-4 border-b bg-primary shrink-0 no-print">
            <div className="flex items-center gap-4">
              <SidebarToggleButton />
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
