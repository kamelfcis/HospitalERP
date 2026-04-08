import { useState, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import {
  BookOpen, PanelRightClose, PanelRightOpen, Users, LogOut,
  ChevronDown, ChevronLeft, Search, X, type LucideIcon,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { usePharmacyMode } from "@/hooks/use-pharmacy-mode";
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

// ─── SidebarToggleButton ─────────────────────────────────────────────────────
function SidebarToggleButton() {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost" size="icon" onClick={toggleSidebar}
          className="h-8 w-8" data-testid="button-sidebar-toggle"
        >
          {isCollapsed ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{isCollapsed ? "فتح القائمة" : "إغلاق القائمة"}</TooltipContent>
    </Tooltip>
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
          className="flex flex-row-reverse items-center gap-2 group-data-[collapsible=icon]:justify-center"
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
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
      {/* رأس المجموعة قابل للنقر */}
      <button
        onClick={onToggle}
        className="flex flex-row-reverse w-full items-center justify-between px-3 py-1.5
                   text-sidebar-foreground/70 hover:text-sidebar-foreground
                   group-data-[collapsible=icon]:hidden transition-colors duration-150"
        data-testid={`button-nav-group-${group.id}`}
      >
        <div className="flex flex-row-reverse items-center gap-1.5">
          <GroupIcon className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold uppercase tracking-wide">{group.label}</span>
        </div>
        {isOpen
          ? <ChevronDown className="h-3 w-3 opacity-50" />
          : <ChevronLeft className="h-3 w-3 opacity-50" />
        }
      </button>

      {/* أيقونة فقط عند الطي الكامل */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onToggle}
            className="hidden group-data-[collapsible=icon]:flex justify-center w-full py-1 text-sidebar-foreground/60 hover:text-sidebar-foreground"
          >
            <GroupIcon className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{group.label}</TooltipContent>
      </Tooltip>

      {isOpen && (
        <SidebarGroupContent>
          <SidebarMenu>
            {visibleItems.map(item => (
              <NavItemLink
                key={item.href}
                item={item}
                isActive={location === item.href || (item.href !== "/" && location.startsWith(item.href))}
              />
            ))}
          </SidebarMenu>
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
      <SidebarGroupLabel className="text-white/50 text-[10px]">
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
      <div className="flex h-screen w-full bg-background" dir="rtl">
        <Sidebar side="right" collapsible="icon" className="no-print" data-sidebar="main">

          {/* ── رأس الشريط ──────────────────────────────────────────────── */}
          <SidebarHeader className="border-b border-border/50 p-4 pb-2">
            <div className="flex flex-row-reverse items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-white/20 shrink-0">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <div className="group-data-[collapsible=icon]:hidden text-right">
                <h2 className="font-bold text-white text-[15px]">{appTitle}</h2>
                <p className="text-xs text-white/70">{appSubtitle}</p>
              </div>
            </div>

            {/* ── صندوق البحث ─────────────────────────────────────────── */}
            <SidebarSearch query={searchQuery} onChange={setSearchQuery} />
          </SidebarHeader>

          {/* ── المحتوى ──────────────────────────────────────────────────── */}
          <SidebarContent>
            <ScrollArea className="flex-1">
              {isSearching ? (
                /* وضع البحث: قائمة مسطّحة بالنتائج */
                <SearchResults items={searchResults} location={location} />
              ) : (
                /* الوضع العادي: مجموعات منظّمة قابلة للطي */
                visibleGroupItems.map(({ group, items }) => (
                  <CollapsibleNavGroup
                    key={group.id}
                    group={group}
                    isOpen={openGroups.has(group.id)}
                    onToggle={() => toggleGroup(group.id)}
                    visibleItems={items}
                    location={location}
                  />
                ))
              )}
            </ScrollArea>
          </SidebarContent>

          {/* ── تذييل الشريط ─────────────────────────────────────────────── */}
          <SidebarFooter className="border-t border-border/50 p-3">
            <div className="group-data-[collapsible=icon]:hidden space-y-2">
              <div className="flex flex-row-reverse items-center justify-between gap-2">
                <div className="flex flex-row-reverse items-center gap-2 text-sm">
                  <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Users className="h-4 w-4 text-white" />
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-white text-xs" data-testid="text-current-user">{user?.fullName}</p>
                    <p className="text-xs text-white/70">{ROLE_LABELS[user?.role || ""] || user?.role}</p>
                  </div>
                </div>
                <SidebarToggleButton />
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
          <main className="flex-1 overflow-auto" dir="rtl">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
