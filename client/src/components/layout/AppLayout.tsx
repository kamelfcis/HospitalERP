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
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Building2,
  Calendar,
  ClipboardList,
  PanelRightClose,
  PanelRightOpen,
  Package,
  ArrowLeftRight,
  Truck,
  Receipt,
  Stethoscope,
  ShoppingCart,
  Warehouse,
  UserRound,
  Banknote,
  Users,
  Lock,
  Scale,
  TrendingUp,
  BarChart3,
  PieChart,
  History,
  Settings,
  LogOut,
  Shield,
  BedDouble,
  DoorOpen,
  Scissors,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABELS } from "@shared/permissions";
import { AppHeader } from "./AppHeader";

interface AppLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
}

const mainNavItems: NavItem[] = [
  { title: "لوحة التحكم",            href: "/",                   icon: LayoutDashboard,  permission: "dashboard.view" },
  { title: "دليل الحسابات",           href: "/chart-of-accounts",  icon: BookOpen,          permission: "accounts.view" },
  { title: "القيود اليومية",           href: "/journal-entries",    icon: FileText,          permission: "journal.view" },
  { title: "مراكز التكلفة",           href: "/cost-centers",       icon: Building2,         permission: "cost_centers.view" },
  { title: "الفترات المحاسبية",        href: "/fiscal-periods",     icon: Calendar,          permission: "fiscal_periods.view" },
  { title: "نماذج القيود",            href: "/templates",          icon: ClipboardList,     permission: "templates.view" },
  { title: "الأصناف",                href: "/items",              icon: Package,           permission: "items.view" },
  { title: "استلام من مورد",          href: "/supplier-receiving", icon: Truck,             permission: "receiving.view" },
  { title: "فواتير الشراء",           href: "/purchase-invoices",  icon: Receipt,           permission: "purchase_invoices.view" },
  { title: "تحويل مخزني",            href: "/store-transfers",    icon: ArrowLeftRight,    permission: "transfers.view" },
  { title: "فواتير البيع",            href: "/sales-invoices",     icon: ShoppingCart,      permission: "sales.view" },
  { title: "فاتورة مريض",            href: "/patient-invoices",   icon: UserRound,         permission: "patient_invoices.view" },
  { title: "لوحة الأسرّة",            href: "/bed-board",          icon: BedDouble,         permission: "patient_invoices.view" },
  { title: "إدارة الأدوار والغرف",    href: "/room-management",    icon: DoorOpen,          permission: "patient_invoices.view" },
  { title: "أنواع العمليات الجراحية", href: "/surgery-types",      icon: Scissors,          permission: "patient_invoices.view" },
  { title: "تسوية مستحقات الأطباء",   href: "/doctor-settlements", icon: Banknote,          permission: "patient_invoices.view" },
  { title: "شاشة تحصيل الكاشير",     href: "/cashier-collection", icon: Banknote,          permission: "cashier.view" },
  { title: "الخدمات والأسعار",        href: "/services-pricing",   icon: Stethoscope,       permission: "services.view" },
  { title: "المخازن",                href: "/warehouses",         icon: Warehouse,          permission: "warehouses.view" },
  { title: "الأقسام",               href: "/departments",        icon: Building2,          permission: "departments.view" },
  { title: "سجل المرضى",            href: "/patients",           icon: Users,              permission: "patients.view" },
  { title: "سجل الأطباء",           href: "/doctors",            icon: Stethoscope,        permission: "doctors.view" },
];

const reportNavItems: NavItem[] = [
  { title: "ميزان المراجعة",       href: "/reports/trial-balance",    icon: Scale,    permission: "reports.trial_balance" },
  { title: "قائمة الدخل",         href: "/reports/income-statement",  icon: TrendingUp, permission: "reports.income_statement" },
  { title: "الميزانية العمومية",    href: "/reports/balance-sheet",    icon: BarChart3,  permission: "reports.balance_sheet" },
  { title: "تقارير مراكز التكلفة", href: "/reports/cost-centers",     icon: PieChart,   permission: "reports.cost_centers" },
  { title: "كشف حساب",            href: "/reports/account-ledger",   icon: FileText,   permission: "reports.account_ledger" },
];

const systemNavItems: NavItem[] = [
  { title: "إعدادات النظام",    href: "/system-settings",   icon: Settings,  permission: "settings.account_mappings" },
  { title: "ربط الحسابات",     href: "/account-mappings",  icon: Settings,  permission: "settings.account_mappings" },
  { title: "الخزن",            href: "/treasuries",        icon: Banknote,  permission: "settings.account_mappings" },
  { title: "سجل التدقيق",      href: "/audit-log",         icon: History,   permission: "audit_log.view" },
  { title: "إدارة المستخدمين", href: "/users",             icon: Shield,    permission: "users.view" },
  { title: "شريط الإعلانات",   href: "/announcements",     icon: Megaphone, permission: "settings.account_mappings" },
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
          className="h-8 w-8"
          data-testid="button-sidebar-toggle"
        >
          {isCollapsed ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        {isCollapsed ? "فتح القائمة" : "إغلاق القائمة"}
      </TooltipContent>
    </Tooltip>
  );
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const [location] = useLocation();
  const { hasPermission } = useAuth();

  const visibleItems = items.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  if (visibleItems.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {visibleItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={location === item.href || (item.href !== "/" && location.startsWith(item.href))}
                tooltip={item.title}
              >
                <Link
                  href={item.href}
                  data-testid={`nav-link-${item.href.replace(/\//g, "-").replace(/^-/, "")}`}
                  className="flex flex-row-reverse items-center gap-2"
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuth();

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background" dir="rtl">
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
              <NavGroup label="القائمة الرئيسية" items={mainNavItems} />
              <NavGroup label="التقارير المالية" items={reportNavItems} />
              <NavGroup label="النظام" items={systemNavItems} />
            </ScrollArea>
          </SidebarContent>

          <SidebarFooter className="border-t border-border/50 p-3">
            <div className="group-data-[collapsible=icon]:hidden space-y-2">
              <div className="flex flex-row-reverse items-center justify-between gap-2">
                <div className="flex flex-row-reverse items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div className="text-right">
                    <p className="font-medium text-foreground text-xs" data-testid="text-current-user">{user?.fullName}</p>
                    <p className="text-xs text-muted-foreground">{ROLE_LABELS[user?.role || ""] || user?.role}</p>
                  </div>
                </div>
                <SidebarToggleButton />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={logout}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
                تسجيل الخروج
              </Button>
            </div>
            <div className="group-data-[collapsible=icon]:flex hidden flex-col items-center gap-2">
              <SidebarToggleButton />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={logout} data-testid="button-logout-icon">
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">تسجيل الخروج</TooltipContent>
              </Tooltip>
            </div>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0">
          <AppHeader />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
