import type { Warehouse } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Loader2 } from "lucide-react";

interface Props {
  sourceWarehouseId: string;
  setSourceWarehouseId: (v: string) => void;
  destWarehouseId: string;
  setDestWarehouseId: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  warehouses: Warehouse[] | undefined;
  queryEnabled: boolean;
  isFetching: boolean;
  onQuery: () => void;
}

export function SetupForm({
  sourceWarehouseId, setSourceWarehouseId,
  destWarehouseId, setDestWarehouseId,
  dateFrom, setDateFrom,
  dateTo, setDateTo,
  warehouses, queryEnabled, isFetching, onQuery,
}: Props) {
  return (
    <div className="border rounded-lg p-4 bg-card space-y-3" data-testid="section-setup">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div>
          <Label className="text-xs">المخزن المصدر (الرئيسي)</Label>
          <Select value={sourceWarehouseId} onValueChange={setSourceWarehouseId}>
            <SelectTrigger data-testid="trigger-source-warehouse">
              <SelectValue placeholder="اختر المخزن المصدر" />
            </SelectTrigger>
            <SelectContent>
              {warehouses?.filter((w) => w.isActive).map((w) => (
                <SelectItem key={w.id} value={w.id} data-testid={`option-source-${w.id}`}>{w.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">المخزن المحوّل إليه (الصيدلية / منفذ البيع)</Label>
          <Select value={destWarehouseId} onValueChange={setDestWarehouseId}>
            <SelectTrigger data-testid="trigger-dest-warehouse">
              <SelectValue placeholder="اختر المخزن الوجهة" />
            </SelectTrigger>
            <SelectContent>
              {warehouses?.filter((w) => w.isActive && w.id !== sourceWarehouseId).map((w) => (
                <SelectItem key={w.id} value={w.id} data-testid={`option-dest-${w.id}`}>{w.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="input-date-from" />
        </div>

        <div>
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="input-date-to" />
        </div>

        <div>
          <Button onClick={onQuery} disabled={!queryEnabled || isFetching} className="w-full" data-testid="button-query">
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Search className="h-4 w-4 ml-1" />}
            استعلام
          </Button>
        </div>
      </div>
    </div>
  );
}
