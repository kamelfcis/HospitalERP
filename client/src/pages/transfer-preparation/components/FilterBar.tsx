import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Filter, FileSpreadsheet } from "lucide-react";
import type { BulkField, BulkOp } from "../types";
import { usePrep } from "../context";

export function FilterBar() {
  const {
    excludeCovered, setExcludeCovered,
    bulkField, setBulkField,
    bulkOp, setBulkOp,
    bulkThreshold, setBulkThreshold,
    handleBulkExclude, handleResetExclusions, handleFillSuggested,
    excludedCount, totalItems, visibleLines, linesWithQty,
  } = usePrep();

  return (
    <div className="border rounded-lg p-3 bg-card space-y-3" data-testid="section-filters">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="excludeCovered"
            checked={excludeCovered}
            onCheckedChange={(v) => setExcludeCovered(!!v)}
            data-testid="checkbox-exclude-covered"
          />
          <Label htmlFor="excludeCovered" className="text-xs cursor-pointer">
            استبعاد الأصناف التي رصيد الوجهة يغطي كمية البيع
          </Label>
        </div>

        <div className="flex items-center gap-1 border rounded px-2 py-1">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">حذف جماعي:</span>
          <Select value={bulkField} onValueChange={(v) => setBulkField(v as BulkField)}>
            <SelectTrigger className="h-7 text-xs w-[110px]" data-testid="select-bulk-field">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dest_stock">رصيد الوجهة</SelectItem>
              <SelectItem value="source_stock">رصيد المصدر</SelectItem>
              <SelectItem value="total_sold">كمية البيع</SelectItem>
            </SelectContent>
          </Select>
          <Select value={bulkOp} onValueChange={(v) => setBulkOp(v as BulkOp)}>
            <SelectTrigger className="h-7 text-xs w-[70px]" data-testid="select-bulk-op">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gt">أكبر من</SelectItem>
              <SelectItem value="lt">أقل من</SelectItem>
              <SelectItem value="eq">يساوي</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={bulkThreshold}
            onChange={(e) => setBulkThreshold(e.target.value)}
            className="h-7 w-[80px] text-xs"
            placeholder="الكمية"
            data-testid="input-bulk-threshold"
          />
          <Button size="sm" variant="outline" onClick={handleBulkExclude} className="h-7 text-xs" data-testid="button-bulk-exclude">
            تطبيق
          </Button>
        </div>

        {excludedCount > 0 && (
          <Button size="sm" variant="ghost" onClick={handleResetExclusions} className="h-7 text-xs" data-testid="button-reset-exclusions">
            إلغاء الاستبعاد ({excludedCount})
          </Button>
        )}

        <Button size="sm" variant="outline" onClick={handleFillSuggested} className="h-7 text-xs" data-testid="button-fill-suggested">
          <FileSpreadsheet className="h-3.5 w-3.5 ml-1" />
          ملء الكميات المقترحة
        </Button>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>إجمالي الأصناف: {totalItems}</span>
        <span>المعروض: {visibleLines.length}</span>
        {excludedCount > 0 && <span className="text-orange-500">مستبعد: {excludedCount}</span>}
        {linesWithQty > 0 && <span className="text-green-600">بكميات تحويل: {linesWithQty}</span>}
      </div>
    </div>
  );
}
