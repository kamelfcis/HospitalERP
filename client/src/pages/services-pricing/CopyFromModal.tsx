import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PriceList } from "@shared/schema";

interface Props {
  open: boolean;
  onClose: () => void;
  listId: string;
  priceLists: PriceList[];
}

// ─── CopyFromModal ─────────────────────────────────────────────────────────────
/**
 * CopyFromModal
 * ديالوج نسخ الأسعار من قائمة أسعار أخرى إلى القائمة الحالية.
 */
export default function CopyFromModal({ open, onClose, listId, priceLists }: Props) {
  const { toast } = useToast();
  const [sourceId, setSourceId] = useState("");

  const copyMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/price-lists/${listId}/copy-from`, { sourceListId: sourceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/price-lists", listId] });
      toast({ title: "تم نسخ الأسعار بنجاح" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  useEffect(() => { if (!open) setSourceId(""); }, [open]);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>نسخ من قائمة أخرى</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>اختر القائمة المصدر</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger data-testid="select-trigger-copy-source">
                <SelectValue placeholder="اختر قائمة" />
              </SelectTrigger>
              <SelectContent>
                {priceLists.map(pl => (
                  <SelectItem key={pl.id} value={pl.id}>{pl.name} ({pl.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-copy">إلغاء</Button>
          <Button onClick={() => copyMutation.mutate()} disabled={copyMutation.isPending || !sourceId}
            data-testid="button-apply-copy">
            {copyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            نسخ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
