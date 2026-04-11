import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Calendar, Phone,
} from "lucide-react";
import type { DashboardMode, DisplayUnit, StatusFilter } from "./types";

interface FiltersBarProps {
  mode: DashboardMode;
  setMode: (v: DashboardMode) => void;
  displayUnit: DisplayUnit;
  setDisplayUnit: (v: DisplayUnit) => void;
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
  status: StatusFilter;
  setStatus: (v: StatusFilter) => void;
  search: string;
  setSearch: (v: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  showResolved: boolean;
  setShowResolved: (v: boolean) => void;
  selCategories: Set<string>;
  toggleCategory: (cat: string) => void;
  clearCategories: () => void;
  excludeOrdered: boolean;
  setExcludeOrdered: (v: boolean) => void;
  showOrderedOnly: boolean;
  setShowOrderedOnly: (v: boolean) => void;
  orderedFromDate: string;
  setOrderedFromDate: (v: string) => void;
  orderedToDate: string;
  setOrderedToDate: (v: string) => void;
  setPage: (v: number) => void;
}

export function FiltersBar({
  mode, setMode, displayUnit, setDisplayUnit,
  fromDate, setFromDate, toDate, setToDate,
  status, setStatus, search, setSearch,
  searchInputRef, showResolved, setShowResolved,
  selCategories, toggleCategory, clearCategories,
  excludeOrdered, setExcludeOrdered,
  showOrderedOnly, setShowOrderedOnly,
  orderedFromDate, setOrderedFromDate,
  orderedToDate, setOrderedToDate,
  setPage,
}: FiltersBarProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 bg-gray-50 border rounded-lg p-3">

        <Select value={mode} onValueChange={(v) => { setMode(v as DashboardMode); setPage(1); }}>
          <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shortage_driven">النواقص فقط</SelectItem>
            <SelectItem value="full_analysis">تحليل شامل</SelectItem>
          </SelectContent>
        </Select>

        <Select value={displayUnit} onValueChange={(v) => { setDisplayUnit(v as DisplayUnit); setPage(1); }}>
          <SelectTrigger className="w-32 h-8 text-sm" data-testid="select-unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="major">وحدة كبرى</SelectItem>
            <SelectItem value="medium">وحدة وسطى</SelectItem>
            <SelectItem value="minor">وحدة صغرى</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs text-gray-500">من</span>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            className="h-8 text-sm w-36"
            data-testid="input-from-date"
          />
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">إلى</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            className="h-8 text-sm w-36"
            data-testid="input-to-date"
          />
        </div>

        <Select value={status || "__all__"} onValueChange={(v) => { setStatus(v === "__all__" ? "" : v as StatusFilter); setPage(1); }}>
          <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-status">
            <SelectValue placeholder="كل الحالات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل الحالات</SelectItem>
            <SelectItem value="not_available">غير متوفر</SelectItem>
            <SelectItem value="available_elsewhere">متوفر بمخزن آخر</SelectItem>
            <SelectItem value="high_demand">ضغط عالٍ</SelectItem>
            <SelectItem value="low_stock">مخزون منخفض</SelectItem>
            <SelectItem value="normal">طبيعي</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-40">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <Input
            ref={searchInputRef}
            placeholder="بحث بالاسم أو الكود..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-8 text-sm pr-8"
            data-testid="input-search"
          />
        </div>

        <div className="flex items-center gap-3 border-r border-gray-200 pr-3 mr-1">
          <span className="text-xs text-gray-500 shrink-0">التصنيف:</span>

          <div className="flex items-center gap-1.5">
            <Checkbox
              id="cat-drug"
              checked={selCategories.has("drug")}
              onCheckedChange={() => toggleCategory("drug")}
              data-testid="checkbox-cat-drug"
              className="h-3.5 w-3.5"
            />
            <Label htmlFor="cat-drug" className="text-xs cursor-pointer text-gray-700 select-none">
              أدوية
            </Label>
          </div>

          <div className="flex items-center gap-1.5">
            <Checkbox
              id="cat-supply"
              checked={selCategories.has("supply")}
              onCheckedChange={() => toggleCategory("supply")}
              data-testid="checkbox-cat-supply"
              className="h-3.5 w-3.5"
            />
            <Label htmlFor="cat-supply" className="text-xs cursor-pointer text-gray-700 select-none">
              مستهلكات
            </Label>
          </div>

          {selCategories.size > 0 && (
            <button
              onClick={() => { clearCategories(); setPage(1); }}
              className="text-xs text-blue-500 hover:underline"
              data-testid="btn-clear-categories"
            >
              مسح
            </button>
          )}
        </div>

        {mode === "shortage_driven" && (
          <Button
            variant={showResolved ? "default" : "outline"}
            size="sm"
            onClick={() => { setShowResolved(!showResolved); setPage(1); }}
            data-testid="btn-show-resolved"
            className="h-8 text-sm"
          >
            {showResolved ? "إخفاء المحلول" : "إظهار المحلول"}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
        <div className="flex items-center gap-1.5 text-amber-700 shrink-0">
          <Phone className="h-3.5 w-3.5" />
          <span className="font-medium text-xs">متابعة الطلب من الشركة:</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Checkbox
            id="excl-ordered"
            checked={excludeOrdered && !showOrderedOnly}
            onCheckedChange={(v) => {
              setExcludeOrdered(Boolean(v));
              if (v) setShowOrderedOnly(false);
              setPage(1);
            }}
            data-testid="checkbox-exclude-ordered"
            className="h-3.5 w-3.5"
          />
          <Label htmlFor="excl-ordered" className="text-xs cursor-pointer text-gray-700 select-none">
            ☑ استبعاد ما تم طلبه من الشركة
          </Label>
        </div>

        <div className="flex items-center gap-1.5">
          <Checkbox
            id="show-ordered-only"
            checked={showOrderedOnly}
            onCheckedChange={(v) => {
              setShowOrderedOnly(Boolean(v));
              if (v) setExcludeOrdered(false);
              setPage(1);
            }}
            data-testid="checkbox-show-ordered-only"
            className="h-3.5 w-3.5"
          />
          <Label htmlFor="show-ordered-only" className="text-xs cursor-pointer text-gray-700 select-none">
            إظهار المطلوب فقط
          </Label>
        </div>

        <div className="border-r border-amber-300 h-5 mx-1" />

        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 shrink-0">طُلب من</span>
          <Input
            type="date"
            value={orderedFromDate}
            onChange={(e) => { setOrderedFromDate(e.target.value); setPage(1); }}
            className="h-7 text-xs w-32"
            data-testid="input-ordered-from-date"
          />
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 shrink-0">إلى</span>
          <Input
            type="date"
            value={orderedToDate}
            onChange={(e) => { setOrderedToDate(e.target.value); setPage(1); }}
            className="h-7 text-xs w-32"
            data-testid="input-ordered-to-date"
          />
        </div>

        {(orderedFromDate || orderedToDate) && (
          <button
            onClick={() => { setOrderedFromDate(""); setOrderedToDate(""); setPage(1); }}
            className="text-xs text-amber-600 hover:underline shrink-0"
            data-testid="btn-clear-ordered-dates"
          >
            مسح التواريخ
          </button>
        )}
      </div>
    </>
  );
}
