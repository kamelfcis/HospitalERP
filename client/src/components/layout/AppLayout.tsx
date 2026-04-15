import { useState, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen, PanelRightClose, PanelRightOpen, Users, LogOut,
  ChevronDown, ChevronLeft, Search, X, ChevronsDown, ChevronsUp,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { usePharmacyMode } from "@/hooks/use-pharmacy-mode";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@shared/permissions";
import { AppHeader } from "./AppHeader";
import { NAV_GROUPS, getAllNavItems, type NavItem, type NavGroup } from "./nav-config";

interface AppLayoutProps {
  children: React.ReactNode;
}

// ─── هل يُعرض البند؟ ─────────────────────────────────────────────────────────
function shouldShow(
  item: NavItem,
  pharmacyMode: boolean,
  isOwner: boolean,
  hasPermission: (p: string) => boolean,
): boolean {
  if (item.permission && !hasPermission(item.permission)) return false;
  if (pharmacyMode && !isOwner && item.hospitalOnly) return false;
  return true;
}

// ─── تطابق البحث ──────────────────────────────────────────────────────────────
function matchSearch(item: NavItem, query: string): boolean {
  if (!query) return true;
  return item.title.includes(query) || item.href.includes(query);
}

// ─── Sidebar rail: wide vs icon strip (desktop) / sheet (mobile) ─────────────
function SidebarRailToggleButton() {
  const { state, toggleSidebar, isMobile, openMobile } = useSidebar();
  const isCollapsed = isMobile ? !openMobile : state === "collapsed";
  const label = isMobile
    ? (isCollapsed ? "فتح القائمة" : "إغلاق القائمة")
    : isCollapsed
      ? "توسيع الشريط"
      : "طيّ الشريط (أيقونات)";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-8 w-8 text-white hover:bg-white/15"
          data-testid="button-sidebar-rail-toggle"
        >
          {isCollapsed ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Same as {@link SidebarRailToggleButton} — kept for HMR / cached bundles that still reference the old name. */
const SidebarToggleButton = SidebarRailToggleButton;

// ─── Expand / collapse all menu groups (when not searching) ─────────────────
function SidebarGroupsBulkControls({
  searchActive,
  onExpandAll,
  onCollapseAll,
}: {
  searchActive: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  const { isMobile } = useSidebar();
  if (searchActive) return null;
  return (
    <div className="flex flex-row-reverse items-center gap-0.5 group-data-[collapsible=icon]:hidden">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/15"
            onClick={onExpandAll}
            data-testid="button-sidebar-expand-all-groups"
          >
            <ChevronsDown className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">توسيع كل الأقسام</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/15"
            onClick={onCollapseAll}
            data-testid="button-sidebar-collapse-all-groups"
          >
            <ChevronsUp className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">طيّ كل الأقسام</TooltipContent>
      </Tooltip>
      {!isMobile && <SidebarRailToggleButton />}
    </div>
  );
}

// ─── SidebarSearch ────────────────────────────────────────────────────────────
interface SidebarSearchProps {
  query: string;
  onChange: (v: string) => void;
}
function SidebarSearch({ query, onChange }: SidebarSearchProps) {
  const { state } = useSidebar();
  if (state === "collapsed") return null;
  return (
    <div className="px-3 pb-2 pt-1 group-data-[collapsible=icon]:hidden">
      <div className="relative flex items-center">
        <Search className="absolute right-2.5 h-3.5 w-3.5 text-white/50 pointer-events-none" />
        <Input
          value={query}
          onChange={e => onChange(e.target.value)}
          placeholder="بحث في القائمة..."
          className="h-8 pr-8 pl-7 text-xs bg-white/10 border-white/20 text-white placeholder:text-white/50
                     focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:border-white/40"
          data-testid="input-sidebar-search"
          dir="rtl"
        />
        {query && (
          <button
            onClick={() => onChange("")}
            className="absolute left-2.5 text-white/50 hover:text-white"
            aria-label="مسح البحث"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── NavItemLink ──────────────────────────────────────────────────────────────
function NavItemLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <SidebarMenuItem key={item.href}>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
        <Link
          href={item.href}
          data-testid={`nav-link-${item.href.replace(/\//g, "-").replace(/^-/, "")}`}
          className={cn(
            "flex w-full flex-row items-center justify-start gap-2.5 font-sans antialiased",
            "text-[13px] font-medium leading-snug tracking-tight text-end",
            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
          )}
        >
          <span className="min-w-0 flex-1 truncate text-end group-data-[collapsible=icon]:hidden">
            {item.title}
          </span>
          <item.icon className="size-4 shrink-0 opacity-90" aria-hidden />
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// ─── CollapsibleNavGroup ──────────────────────────────────────────────────────
interface CollapsibleNavGroupProps {
  group: NavGroup;
  isOpen: boolean;
  onToggle: () => void;
  visibleItems: NavItem[];
  location: string;
}

function CollapsibleNavGroup({ group, isOpen, onToggle, visibleItems, location }: CollapsibleNavGroupProps) {
  if (visibleItems.length === 0) return null;
  const GroupIcon = group.icon;

  return (
    <SidebarGroup className="py-0">
      {/* رأس المجموعة (الأب) — يطوي/يفتح قائمة الأبناء */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-md px-3 py-2 font-sans antialiased
                   text-sidebar-foreground/85 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground
                   group-data-[collapsible=icon]:hidden transition-colors duration-150"
        data-testid={`button-nav-group-${group.id}`}
        aria-expanded={isOpen}
      >
        <div className="flex min-w-0 flex-1 flex-row items-center justify-start gap-2 font-sans antialiased">
          <span className="min-w-0 flex-1 truncate text-end text-xs font-semibold leading-snug tracking-wide text-sidebar-foreground">
            {group.label}
          </span>
          <GroupIcon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
        </div>
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
        )}
      </button>

      {/* أيقونة فقط عند طيّ الشريط إلى وضع الأيقونات */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggle}
            className="hidden w-full justify-center py-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent/25 hover:text-sidebar-foreground group-data-[collapsible=icon]:flex"
          >
            <GroupIcon className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{group.label}</TooltipContent>
      </Tooltip>

      {/* القائمة الفرعية — مسافة وهامش تحت عنوان المجموعة */}
      {isOpen && (
        <SidebarGroupContent className="mt-1.5 px-2 pb-1 group-data-[collapsible=icon]:hidden">
          <div className="rounded-lg border-s-2 border-sidebar-border/50 bg-sidebar-accent/[0.08] ps-2.5 py-1.5">
            <SidebarMenu className="gap-1.5">
              {visibleItems.map((item) => (
                <NavItemLink
                  key={item.href}
                  item={item}
                  isActive={location === item.href || (item.href !== "/" && location.startsWith(item.href))}
                />
              ))}
            </SidebarMenu>
          </div>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

// ─── SearchResults — قائمة نتائج البحث المسطّحة ──────────────────────────────
function SearchResults({ items, location }: { items: NavItem[]; location: string }) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-white/40 group-data-[collapsible=icon]:hidden">
        لا توجد نتائج
      </div>
    );
  }
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="text-end font-sans text-[11px] font-semibold tracking-wide text-white/55">
        نتائج البحث ({items.length})
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(item => (
            <NavItemLink
              key={item.href}
              item={item}
              isActive={location === item.href || (item.href !== "/" && location.startsWith(item.href))}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ─── AppLayout ────────────────────────────────────────────────────────────────
export function AppLayout({ children }: AppLayoutProps) {
  const { user, logout, hasPermission } = useAuth();
  const { pharmacyMode, isOwner } = usePharmacyMode();
  const [location] = useLocation();

  // ── بحث ────────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");

  // ── حالة طيّ المجموعات (مفتوحة افتراضياً) ──────────────────────────────────
  const defaultOpenGroups = new Set(NAV_GROUPS.map(g => g.id));
  const [openGroups, setOpenGroups] = useState<Set<string>>(defaultOpenGroups);

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const expandAllGroups = useCallback(() => {
    setOpenGroups(new Set(NAV_GROUPS.map((g) => g.id)));
  }, []);

  const collapseAllGroups = useCallback(() => {
    setOpenGroups(new Set());
  }, []);

  // ── بنود مرئية لكل مجموعة ────────────────────────────────────────────────
  const visibleGroupItems = useMemo(() =>
    NAV_GROUPS.map(group => ({
      group,
      items: group.items.filter(item => shouldShow(item, pharmacyMode, isOwner, hasPermission)),
    })),
    [pharmacyMode, isOwner, hasPermission],
  );

  // ── نتائج البحث ───────────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return getAllNavItems().filter(item =>
      shouldShow(item, pharmacyMode, isOwner, hasPermission) &&
      matchSearch(item, searchQuery.trim()),
    );
  }, [searchQuery, pharmacyMode, isOwner, hasPermission]);

  const isSearching = searchQuery.trim().length > 0;

  const appTitle    = pharmacyMode ? "AMS نظام الصيدلية" : "AMS نظام المستشفى";
  const appSubtitle = pharmacyMode ? "نظام الصيدلية والمخازن" : "نظام المحاسبة والمخازن";

  const style = { "--sidebar-width": "16rem", "--sidebar-width-icon": "3.5rem" };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-svh min-h-0 w-full bg-background" dir="rtl">
        <Sidebar side="right" collapsible="icon" className="no-print font-sans antialiased" data-sidebar="main">

          {/* ── رأس الشريط ──────────────────────────────────────────────── */}
          <SidebarHeader className="border-b border-border/50 p-3 pb-2 sm:p-4">
            <div className="mb-2 flex flex-row-reverse items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2 sm:gap-3">
                <div className="shrink-0 rounded-lg bg-white/20 p-1.5 sm:p-2">
                  <BookOpen className="h-4 w-4 text-white sm:h-5 sm:w-5" />
                </div>
                <div className="group-data-[collapsible=icon]:hidden min-w-0 text-right">
                  <h2 className="truncate text-sm font-bold text-white sm:text-[15px]">{appTitle}</h2>
                  <p className="truncate text-[10px] text-white/70 sm:text-xs">{appSubtitle}</p>
                </div>
              </div>
              <SidebarGroupsBulkControls
                searchActive={isSearching}
                onExpandAll={expandAllGroups}
                onCollapseAll={collapseAllGroups}
              />
            </div>

            {/* ── صندوق البحث ─────────────────────────────────────────── */}
            <SidebarSearch query={searchQuery} onChange={setSearchQuery} />
          </SidebarHeader>

          {/* ── المحتوى ──────────────────────────────────────────────────── */}
          <SidebarContent className="min-h-0 overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1 py-2 sm:px-2">
              {isSearching ? (
                <SearchResults items={searchResults} location={location} />
              ) : (
                visibleGroupItems.map(({ group, items }, idx) => (
                  <div key={group.id}>
                    <CollapsibleNavGroup
                      group={group}
                      isOpen={openGroups.has(group.id)}
                      onToggle={() => toggleGroup(group.id)}
                      visibleItems={items}
                      location={location}
                    />
                    {idx < visibleGroupItems.length - 1 && (
                      <Separator className="my-2 opacity-40 group-data-[collapsible=icon]:hidden" />
                    )}
                  </div>
                ))
              )}
            </div>
          </SidebarContent>

          {/* ── تذييل الشريط ─────────────────────────────────────────────── */}
          <SidebarFooter className="border-t border-border/50 p-2 sm:p-3">
            <div className="group-data-[collapsible=icon]:hidden space-y-2">
              <div className="flex flex-row-reverse items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2 text-sm">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20">
                    <Users className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="truncate text-xs font-bold text-white" data-testid="text-current-user">{user?.fullName}</p>
                    <p className="truncate text-[10px] text-white/70 sm:text-xs">{ROLE_LABELS[user?.role || ""] || user?.role}</p>
                  </div>
                </div>
                <SidebarRailToggleButton />
              </div>
              <Button
                variant="ghost" size="sm"
                className="w-full justify-start gap-2 text-white/80 hover:text-white hover:bg-white/10"
                onClick={logout} data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
                تسجيل الخروج
              </Button>
            </div>
            <div className="group-data-[collapsible=icon]:flex hidden flex-col items-center gap-2">
              <SidebarRailToggleButton />
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

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain" dir="rtl">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
