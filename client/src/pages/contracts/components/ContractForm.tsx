import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertContractSchema } from "@shared/schema";
import type { Contract } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";

function today() { return new Date().toISOString().slice(0, 10); }
function oneYearLater() {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10);
}

const contractFormSchema = insertContractSchema.extend({
  contractNumber: z.string().min(1, "رقم العقد مطلوب"),
  contractName:   z.string().min(2, "اسم العقد مطلوب"),
  startDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ صحيح مطلوب"),
  endDate:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ صحيح مطلوب"),
});
type ContractFormValues = z.infer<typeof contractFormSchema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  editing: Contract | null;
}

export function ContractForm({ open, onOpenChange, companyId, editing }: Props) {
  const { toast } = useToast();

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      companyId,
      contractNumber:     editing?.contractNumber     ?? "",
      contractName:       editing?.contractName       ?? "",
      companyCoveragePct: editing?.companyCoveragePct ?? "100",
      startDate:          editing?.startDate          ?? today(),
      endDate:            editing?.endDate            ?? oneYearLater(),
      isActive:           editing?.isActive           ?? true,
      notes:              editing?.notes              ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: ContractFormValues) =>
      editing
        ? apiRequest("PATCH", `/api/contracts/${editing.id}`, data)
        : apiRequest("POST", "/api/contracts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", companyId] });
      toast({ title: editing ? "تم تحديث العقد" : "تمت إضافة العقد" });
      onOpenChange(false);
      form.reset();
    },
    onError: async (err: unknown) => {
      const body = err instanceof Response ? await err.json().catch(() => ({})) : {};
      toast({ variant: "destructive", title: "خطأ", description: body?.message ?? "حدث خطأ" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{editing ? "تعديل العقد" : "إضافة عقد جديد"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="contractNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>رقم العقد *</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-contract-number" placeholder="CON-2025-001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="companyCoveragePct" render={({ field }) => (
                <FormItem>
                  <FormLabel>نسبة تغطية الشركة %</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? "100"} type="number" min={0} max={100} step={0.01} data-testid="input-contract-coverage" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="contractName" render={({ field }) => (
              <FormItem>
                <FormLabel>اسم العقد *</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="input-contract-name" placeholder="عقد تأمين طبي 2025" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>تاريخ البداية *</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" data-testid="input-contract-start" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="endDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>تاريخ النهاية *</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" data-testid="input-contract-end" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>ملاحظات</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={2} data-testid="input-contract-notes" />
                </FormControl>
              </FormItem>
            )} />

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-contract">
                {mutation.isPending && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
                {editing ? "حفظ التعديلات" : "إضافة العقد"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
