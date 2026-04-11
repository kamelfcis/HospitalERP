import { memo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Search, CheckCircle2, Building2, Clock, Users, Activity,
} from "lucide-react";
import type { VisitRecord } from "./types";
import { STATUS_LABEL } from "./types";

export const StatCard = memo(function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-lg border px-3 py-2 ${color}`}>
      <span className="text-lg font-bold">{value}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </div>
  );
});

export const VisitRow = memo(function VisitRow({ visit, onComplete }: {
  visit: VisitRecord;
  onComplete: (id: string) => void;
}) {
  const s = STATUS_LABEL[visit.status] ?? { label: visit.status, cls: "" };
  const time = new Date(visit.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-visit-${visit.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm truncate">{visit.patient_name}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 ${visit.visit_type === "inpatient" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-teal-50 text-teal-700 border-teal-200"}`}>
            {visit.visit_type === "inpatient" ? "داخلي" : "خارجي"}
          </Badge>
          <Badge variant="outline" className={`text-[10px] px-1.5 ${s.cls}`}>{s.label}</Badge>
        </div>
        <div className="text-xs text-muted-foreground flex gap-2 mt-0.5 flex-wrap">
          <span className="font-mono">{visit.visit_number}</span>
          {visit.patient_code && <span>ملف: {visit.patient_code}</span>}
          {visit.department_name && <span className="flex items-center gap-0.5"><Building2 className="h-3 w-3" />{visit.department_name}</span>}
          {visit.requested_service && <span>• {visit.requested_service}</span>}
          <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{time}</span>
        </div>
      </div>
      {visit.status === "open" && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50 shrink-0"
          onClick={() => onComplete(visit.id)}
          data-testid={`button-complete-visit-${visit.id}`}
        >
          <CheckCircle2 className="h-3.5 w-3.5 me-1" />
          إتمام
        </Button>
      )}
    </div>
  );
});

interface VisitsListPanelProps {
  visits: VisitRecord[];
  visitsLoading: boolean;
  listSearch: string;
  setListSearch: (v: string) => void;
  listDate: string;
  setListDate: (v: string) => void;
  listStatusFilter: string;
  setListStatusFilter: (v: string) => void;
  listTypeFilter: string;
  setListTypeFilter: (v: string) => void;
  handleComplete: (id: string) => void;
}

export function VisitsListPanel({
  visits, visitsLoading,
  listSearch, setListSearch,
  listDate, setListDate,
  listStatusFilter, setListStatusFilter,
  listTypeFilter, setListTypeFilter,
  handleComplete,
}: VisitsListPanelProps) {
  return (
    <div className="lg:col-span-5 xl:col-span-5 flex flex-col min-h-0">
      <div className="border rounded-xl bg-card shadow-sm flex flex-col flex-1 min-h-0">
        <div className="px-4 py-3 border-b">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold">زيارات اليوم</span>
            <Badge variant="outline" className="text-[10px]">{visits.length}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[120px]">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={listSearch} onChange={e => setListSearch(e.target.value)}
                placeholder="بحث..."
                className="h-7 text-xs pr-7"
                data-testid="input-visit-search"
              />
            </div>
            <Input type="date" value={listDate} onChange={e => setListDate(e.target.value)} className="h-7 text-xs w-[120px]" data-testid="input-visit-date" />
            <Select value={listStatusFilter} onValueChange={setListStatusFilter}>
              <SelectTrigger className="h-7 text-xs w-[90px]" data-testid="select-visit-status">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">الكل</SelectItem>
                <SelectItem value="open">مفتوح</SelectItem>
                <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                <SelectItem value="completed">مكتمل</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
            <Select value={listTypeFilter} onValueChange={setListTypeFilter}>
              <SelectTrigger className="h-7 text-xs w-[90px]" data-testid="select-visit-type">
                <SelectValue placeholder="النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">الكل</SelectItem>
                <SelectItem value="outpatient">خارجي</SelectItem>
                <SelectItem value="inpatient">داخلي</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <ScrollArea className="flex-1">
          {visitsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : visits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">لا توجد زيارات</p>
            </div>
          ) : (
            visits.map(v => (
              <VisitRow key={v.id} visit={v} onComplete={handleComplete} />
            ))
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
