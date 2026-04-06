import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, Loader2, FileText, PlusCircle, X,
} from "lucide-react";
import type { InvoiceTemplate } from "@shared/schema";
import { ServiceLookup } from "@/components/lookups";
import type { Service } from "@shared/schema";

// ── Local Types ───────────────────────────────────────────────────────────────
interface TemplateLine {
  id?: string;
  lineType: "service" | "drug" | "consumable" | "equipment";
  serviceId:   string | null;
  itemId:      string | null;
  descriptionSnapshot: string;
  defaultQty:  string;
  notes:       string;
  doctorName:  string;
  nurseName:   string;
  businessClassification: string | null;
  sortOrder:   number;
}

interface TemplateWithLines extends InvoiceTemplate {
  lines?: TemplateLine[];
}

const LINE_TYPE_LABELS: Record<string, string> = {
  service:    "خدمة",
  drug:       "دواء",
  consumable: "مستهلك",
  equipment:  "جهاز",
};

function genTmpId() {
  return `tmp-${Date.now()}-${Math.random()}`;
}

// ── Template Form Dialog ──────────────────────────────────────────────────────
interface FormDialogProps {
  open: boolean;
  onClose: () => void;
  template?: TemplateWithLines | null;
  onSaved: () => void;
}

function TemplateFormDialog({ open, onClose, template, onSaved }: FormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!template?.id;

  const [name,        setName]        = useState(template?.name        ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [category,    setCategory]    = useState(template?.category    ?? "");
  const [lines,       setLines]       = useState<(TemplateLine & { _tmp?: string })[]>(() =>
    (template?.lines ?? []).map(l => ({ ...l, _tmp: genTmpId() }))
  );
  const [selectedServiceId, setSelectedServiceId] = useState("");

  function addServiceLine(svc: Service) {
    setLines(prev => [
      ...prev,
      {
        _tmp: genTmpId(),
        lineType: "service",
        serviceId: svc.id,
        itemId: null,
        descriptionSnapshot: svc.nameAr || svc.nameEn || svc.code || "",
        defaultQty: "1",
        notes: "",
        doctorName: "",
        nurseName: "",
        businessClassification: svc.businessClassification ?? null,
        sortOrder: prev.length,
      },
    ]);
    setSelectedServiceId("");
  }

  function removeLine(tmp: string) {
    setLines(prev => prev.filter(l => l._tmp !== tmp));
  }

  function updateLineField(tmp: string, field: keyof TemplateLine, value: unknown) {
    setLines(prev => prev.map(l => l._tmp === tmp ? { ...l, [field]: value } : l));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name, description: description || null, category: category || null,
        lines: lines.map((l, i) => ({
          lineType: l.lineType,
          serviceId: l.serviceId || null,
          itemId: l.itemId || null,
          descriptionSnapshot: l.descriptionSnapshot,
          defaultQty: l.defaultQty || "1",
          notes: l.notes || null,
          doctorName: l.doctorName || null,
          nurseName: l.nurseName || null,
          businessClassification: l.businessClassification || null,
          sortOrder: i,
        })),
      };
      if (isEdit) {
        await apiRequest("PATCH", `/api/invoice-templates/${template!.id}`, payload);
      } else {
        await apiRequest("POST", "/api/invoice-templates", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-templates"] });
      toast({ title: isEdit ? "تم تحديث النموذج" : "تم إنشاء النموذج" });
      onSaved();
    },
    onError: () => {
      toast({ title: "خطأ في حفظ النموذج", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل النموذج" : "إنشاء نموذج جديد"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Header fields */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1 col-span-3">
              <Label>اسم النموذج *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: باقة الولادة القيصرية" data-testid="input-template-name" />
            </div>
            <div className="space-y-1">
              <Label>التصنيف</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="مثال: جراحة" data-testid="input-template-category" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>الوصف</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="وصف اختياري" data-testid="input-template-desc" />
            </div>
          </div>

          {/* Add service line */}
          <div className="border rounded-md p-2 bg-muted/20 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">إضافة بند (خدمة)</p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <ServiceLookup
                  value={selectedServiceId}
                  onChange={(item) => { if (item) addServiceLine(item.meta as Service); }}
                  placeholder="بحث عن خدمة..."
                  data-testid="input-tmpl-service-search"
                />
              </div>
            </div>
          </div>

          {/* Lines table */}
          {lines.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right text-xs">النوع</TableHead>
                    <TableHead className="text-right text-xs">البيان</TableHead>
                    <TableHead className="text-center text-xs w-16">الكمية</TableHead>
                    <TableHead className="text-right text-xs">الطبيب</TableHead>
                    <TableHead className="text-right text-xs">ملاحظة</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l._tmp}>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {LINE_TYPE_LABELS[l.lineType] ?? l.lineType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{l.descriptionSnapshot}</TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          value={l.defaultQty}
                          min="0" step="any"
                          onChange={(e) => updateLineField(l._tmp!, "defaultQty", e.target.value)}
                          className="h-7 text-xs text-center w-16"
                          data-testid={`input-tmpl-qty-${l._tmp}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.doctorName}
                          onChange={(e) => updateLineField(l._tmp!, "doctorName", e.target.value)}
                          className="h-7 text-xs"
                          placeholder="—"
                          data-testid={`input-tmpl-doctor-${l._tmp}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.notes}
                          onChange={(e) => updateLineField(l._tmp!, "notes", e.target.value)}
                          className="h-7 text-xs"
                          placeholder="—"
                          data-testid={`input-tmpl-notes-${l._tmp}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => removeLine(l._tmp!)}
                          data-testid={`btn-tmpl-remove-${l._tmp}`}
                        >
                          <X className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {lines.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">
              لا توجد بنود — أضف خدمة من أعلاه
            </p>
          )}
        </div>

        <DialogFooter className="flex-row-reverse gap-2">
          <Button onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending} data-testid="btn-tmpl-save">
            {saveMutation.isPending && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
            {isEdit ? "حفظ التعديلات" : "إنشاء النموذج"}
          </Button>
          <Button variant="outline" onClick={onClose} data-testid="btn-tmpl-cancel">إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InvoiceTemplatesPage() {
  const { toast } = useToast();
  const [search,           setSearch]           = useState("");
  const [showDialog,       setShowDialog]       = useState(false);
  const [editingTemplate,  setEditingTemplate]  = useState<TemplateWithLines | null>(null);
  const [expandedId,       setExpandedId]       = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery<TemplateWithLines[]>({
    queryKey: ["/api/invoice-templates"],
  });

  const { data: expandedLines, isLoading: loadingLines } = useQuery<{ lines: TemplateLine[] }>({
    queryKey: ["/api/invoice-templates", expandedId],
    enabled: !!expandedId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/invoice-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoice-templates"] });
      toast({ title: "تم تعطيل النموذج" });
    },
    onError: () => toast({ title: "خطأ في حذف النموذج", variant: "destructive" }),
  });

  async function handleEdit(tmpl: TemplateWithLines) {
    const res = await fetch(`/api/invoice-templates/${tmpl.id}`);
    const full: TemplateWithLines = await res.json();
    setEditingTemplate(full);
    setShowDialog(true);
  }

  const filtered = templates.filter(t =>
    !search || t.name.includes(search) || (t.category ?? "").includes(search)
  );

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex flex-row-reverse items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">نماذج فاتورة المريض</h1>
        </div>
        <Button
          size="sm"
          onClick={() => { setEditingTemplate(null); setShowDialog(true); }}
          data-testid="btn-new-template"
        >
          <Plus className="h-4 w-4 ml-1" />
          نموذج جديد
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو التصنيف..."
          className="max-w-xs"
          data-testid="input-tmpl-search"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 text-sm">
          لا توجد نماذج — أنشئ نموذجاً باستخدام الزر أعلاه
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">اسم النموذج</TableHead>
                <TableHead className="text-right">التصنيف</TableHead>
                <TableHead className="text-center">البنود</TableHead>
                <TableHead className="text-center">الاستخدام</TableHead>
                <TableHead className="text-center">الحالة</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <>
                  <TableRow
                    key={t.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  >
                    <TableCell className="font-medium text-sm">
                      <div className="flex items-center gap-1">
                        {expandedId === t.id ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                        {t.name}
                      </div>
                      {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.category ?? "—"}</TableCell>
                    <TableCell className="text-center text-sm">{(t as any).lineCount ?? "—"}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-sm font-medium">{t.usageCount ?? 0}</span>
                        {t.lastUsedAt && (
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(t.lastUsedAt).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {t.isActive ? (
                        <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-300">نشط</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">معطل</Badge>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(t)}
                          data-testid={`btn-tmpl-edit-${t.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => deleteMutation.mutate(t.id)}
                          data-testid={`btn-tmpl-delete-${t.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Expanded lines */}
                  {expandedId === t.id && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/20 p-3">
                        {loadingLines ? (
                          <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
                        ) : !expandedLines?.lines?.length ? (
                          <p className="text-xs text-muted-foreground text-center py-1">لا توجد بنود</p>
                        ) : (
                          <div className="space-y-1">
                            {expandedLines.lines.map((l, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <Badge variant="outline" className="text-[10px] shrink-0">
                                  {LINE_TYPE_LABELS[l.lineType] ?? l.lineType}
                                </Badge>
                                <span className="font-medium">{l.descriptionSnapshot}</span>
                                <span className="text-muted-foreground">× {l.defaultQty}</span>
                                {l.doctorName && <span className="text-muted-foreground">د. {l.doctorName}</span>}
                                {l.notes && <span className="text-muted-foreground italic">{l.notes}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {showDialog && (
        <TemplateFormDialog
          open={showDialog}
          onClose={() => { setShowDialog(false); setEditingTemplate(null); }}
          template={editingTemplate}
          onSaved={() => { setShowDialog(false); setEditingTemplate(null); }}
        />
      )}
    </div>
  );
}
