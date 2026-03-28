/**
 * opening-stock/index.tsx — قائمة وثائق الرصيد الافتتاحي
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, PackagePlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/formatters";
import type { Warehouse } from "@shared/schema";

function StatusBadge({ status }: { status: string }) {
  if (status === "posted")
    return <Badge variant="default" className="bg-green-600">مرحّل</Badge>;
  return <Badge variant="secondary">مسودة</Badge>;
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [warehouseId, setWarehouseId] = useState("");
  const [postDate, setPostDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const { data: warehouses = [] } = useQuery<Warehouse[]>({ queryKey: ["/api/warehouses"] });

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/opening-stock", { warehouseId, postDate, notes }),
    onSuccess: async (res) => {
      const doc = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/opening-stock"] });
      toast({ title: "تم إنشاء الوثيقة" });
      onClose();
      navigate(`/opening-stock/${doc.id}`);
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!warehouseId) return toast({ title: "اختر المخزن", variant: "destructive" });
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>وثيقة رصيد افتتاحي جديدة</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-sm">المخزن *</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId} dir="rtl">
              <SelectTrigger className="mt-1" data-testid="select-warehouse">
                <SelectValue placeholder="اختر المخزن" />
              </SelectTrigger>
              <SelectContent>
                {(warehouses as Warehouse[]).filter((w) => w.isActive).map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">تاريخ الرصيد *</Label>
            <Input
              type="date"
              value={postDate}
              onChange={(e) => setPostDate(e.target.value)}
              className="mt-1"
              data-testid="input-post-date"
            />
          </div>
          <div>
            <Label className="text-sm">ملاحظات</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اختياري"
              className="mt-1"
              data-testid="input-notes"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={create.isPending} data-testid="button-create-confirm">
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            إنشاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OpeningStockList() {
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);

  const { data: docs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/opening-stock"],
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">الرصيد الافتتاحي</h1>
          <Badge variant="outline" className="text-xs">{docs.length} وثيقة</Badge>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="button-new-doc">
          <Plus className="h-4 w-4 ml-1" />
          وثيقة جديدة
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <PackagePlus className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>لا توجد وثائق رصيد افتتاحي</p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 ml-1" />
              إنشاء أول وثيقة
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">المخزن</TableHead>
                <TableHead className="text-right">تاريخ الرصيد</TableHead>
                <TableHead className="text-center">عدد الأصناف</TableHead>
                <TableHead className="text-center">الحالة</TableHead>
                <TableHead className="text-right">ملاحظات</TableHead>
                <TableHead className="text-right">تاريخ الإنشاء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((doc) => (
                <TableRow
                  key={doc.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/opening-stock/${doc.id}`)}
                  data-testid={`row-doc-${doc.id}`}
                >
                  <TableCell className="font-medium">{doc.warehouseNameAr ?? "—"}</TableCell>
                  <TableCell>{formatDate(doc.postDate)}</TableCell>
                  <TableCell className="text-center">{doc.lineCount ?? 0}</TableCell>
                  <TableCell className="text-center"><StatusBadge status={doc.status} /></TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">{doc.notes ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatDate(doc.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <CreateDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
