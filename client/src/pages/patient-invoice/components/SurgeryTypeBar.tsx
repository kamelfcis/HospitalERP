/**
 * SurgeryTypeBar — compact banner on the patient invoice.
 * Appears only when the invoice is linked to an admission.
 * Allows changing the surgery type → automatically updates the OR_ROOM line price.
 * Supports isPackage toggle to switch between regular and package services.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Scissors, X, Package } from "lucide-react";
import type { SurgeryType, Admission } from "@shared/schema";
import { surgeryCategoryLabels } from "@shared/schema";

interface SurgeryTypeBarProps {
  invoiceId: string;
  admissionId: string;
  isDraft: boolean;
  isPackage?: boolean;
  onInvoiceReload?: () => void;
}

const CATEGORY_COLOURS: Record<string, string> = {
  major:   "bg-red-100 text-red-800 border-red-200",
  medium:  "bg-orange-100 text-orange-800 border-orange-200",
  minor:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  skilled: "bg-blue-100 text-blue-800 border-blue-200",
  simple:  "bg-green-100 text-green-800 border-green-200",
};

export function SurgeryTypeBar({ invoiceId, admissionId, isDraft, isPackage = false, onInvoiceReload }: SurgeryTypeBarProps) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);

  const { data: admission } = useQuery<Admission>({
    queryKey: ["/api/admissions", admissionId],
    queryFn: () => fetch(`/api/admissions/${admissionId}`, { credentials: "include" })
      .then(r => r.json()),
    enabled: !!admissionId,
  });

  const { data: currentSurgery } = useQuery<SurgeryType | null>({
    queryKey: ["/api/surgery-types", admission?.surgeryTypeId],
    queryFn: () => fetch(`/api/surgery-types?search=`, { credentials: "include" })
      .then(r => r.json())
      .then((list: SurgeryType[]) => list.find(s => s.id === admission?.surgeryTypeId) ?? null),
    enabled: !!admission?.surgeryTypeId,
  });

  const { data: searchResults = [] } = useQuery<SurgeryType[]>({
    queryKey: ["/api/surgery-types", "search", search],
    queryFn: () => apiRequest("GET", `/api/surgery-types?search=${encodeURIComponent(search)}`).then(r => r.json()),
    enabled: search.length >= 1,
  });

  const updateMutation = useMutation({
    mutationFn: ({ surgeryTypeId, pkg }: { surgeryTypeId: string | null; pkg: boolean }) =>
      apiRequest("PUT", `/api/patient-invoices/${invoiceId}/surgery-type`, { surgeryTypeId, isPackage: pkg }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admissions", admissionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/patient-invoices", invoiceId] });
      toast({ title: "تم تحديث نوع العملية" });
      setEditing(false);
      setSearch("");
      onInvoiceReload?.();
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "خطأ", description: e.message }),
  });

  if (!admissionId) return null;

  const handleTogglePackage = () => {
    if (!admission?.surgeryTypeId) return;
    updateMutation.mutate({ surgeryTypeId: admission.surgeryTypeId, pkg: !isPackage });
  };

  return (
    <div className="mb-3 rounded-lg border bg-purple-50/60 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Scissors className="h-4 w-4 text-purple-600 shrink-0" />
        <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 shrink-0">نوع العملية:</span>

        {editing ? (
          <div className="flex-1 relative">
            <Input
              data-testid="input-surgery-type-edit"
              placeholder="ابحث باسم العملية..."
              value={search}
              onChange={e => { setSearch(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              className="h-7 text-sm"
              autoFocus
            />
            {showResults && search.length >= 1 && searchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 border rounded-lg bg-background shadow-md overflow-hidden text-right">
                {searchResults.filter(s => s.isActive).map(s => (
                  <button
                    key={s.id}
                    data-testid={`surgery-edit-option-${s.id}`}
                    type="button"
                    className="w-full px-3 py-2 text-sm hover:bg-muted flex items-center justify-between border-b last:border-b-0"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      updateMutation.mutate({ surgeryTypeId: s.id, pkg: isPackage });
                      setShowResults(false);
                    }}
                  >
                    <span className="font-medium">{s.nameAr}</span>
                    <Badge variant="outline" className={`text-xs ${CATEGORY_COLOURS[s.category] ?? ""}`}>
                      {surgeryCategoryLabels[s.category as keyof typeof surgeryCategoryLabels]}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
            {showResults && search.length >= 1 && searchResults.length === 0 && (
              <div className="absolute z-50 w-full mt-1 border rounded-lg bg-background shadow-sm px-3 py-2 text-sm text-muted-foreground">
                لا توجد نتائج
              </div>
            )}
          </div>
        ) : currentSurgery ? (
          <div className="flex-1 flex items-center gap-2">
            <span className="text-sm font-medium">{currentSurgery.nameAr}</span>
            <Badge variant="outline" className={`text-xs ${CATEGORY_COLOURS[currentSurgery.category] ?? ""}`}>
              {surgeryCategoryLabels[currentSurgery.category as keyof typeof surgeryCategoryLabels]}
            </Badge>
            {isPackage && (
              <Badge className="text-[10px] px-1.5 py-0 bg-purple-600 text-white">
                <Package className="h-3 w-3 ml-0.5" />
                باكدج
              </Badge>
            )}
          </div>
        ) : (
          <span className="flex-1 text-sm text-muted-foreground italic">لم يُحدد نوع العملية</span>
        )}

        {isDraft && (
          <div className="flex items-center gap-1 shrink-0">
            {currentSurgery && !editing && (
              <Button
                variant={isPackage ? "default" : "outline"}
                size="sm"
                className={`h-6 px-2 text-xs ${isPackage ? "bg-purple-600 hover:bg-purple-700" : "text-purple-700 border-purple-300"}`}
                data-testid="button-toggle-package"
                onClick={handleTogglePackage}
                disabled={updateMutation.isPending}
              >
                <Package className="h-3 w-3 ml-0.5" />
                باكدج
              </Button>
            )}
            {!editing && (
              <Button
                variant="ghost" size="sm"
                className="h-6 px-2 text-xs text-purple-700"
                data-testid="button-edit-surgery-type"
                onClick={() => setEditing(true)}
              >
                تغيير
              </Button>
            )}
            {editing && (
              <Button
                variant="ghost" size="sm"
                className="h-6 w-6 p-0"
                onClick={() => { setEditing(false); setSearch(""); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            {currentSurgery && !editing && (
              <Button
                variant="ghost" size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                data-testid="button-clear-surgery-type"
                onClick={() => updateMutation.mutate({ surgeryTypeId: null, pkg: false })}
                disabled={updateMutation.isPending}
              >
                حذف
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
