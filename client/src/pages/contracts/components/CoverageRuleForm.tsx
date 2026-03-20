import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertContractCoverageRuleSchema, coverageRuleTypeLabels } from "@shared/schema";
import type { ContractCoverageRule } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";

const ruleFormSchema = insertContractCoverageRuleSchema.extend({
  ruleName: z.string().min(1, "اسم القاعدة مطلوب"),
  ruleType: z.string().min(1, "نوع القاعدة مطلوب"),
  priority: z.coerce.number().int().min(1).default(10),
  discountPct: z.string().optional().nullable(),
  fixedPrice:  z.string().optional().nullable(),
});
type RuleFormValues = z.infer<typeof ruleFormSchema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contractId: string;
  editing: ContractCoverageRule | null;
}

export function CoverageRuleForm({ open, onOpenChange, contractId, editing }: Props) {
  const { toast } = useToast();

  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: {
      contractId,
      ruleName:        editing?.ruleName        ?? "",
      ruleType:        editing?.ruleType        ?? "include_service",
      serviceId:       editing?.serviceId       ?? "",
      departmentId:    editing?.departmentId    ?? "",
      serviceCategory: editing?.serviceCategory ?? "",
      discountPct:     editing?.discountPct     ?? null,
      fixedPrice:      editing?.fixedPrice      ?? null,
      priority:        editing?.priority        ?? 10,
      isActive:        editing?.isActive        ?? true,
      notes:           editing?.notes           ?? "",
    },
  });

  const ruleType = form.watch("ruleType");

  const showServiceId  = ["include_service", "exclude_service", "discount_pct", "fixed_price", "approval_required"].includes(ruleType);
  const showDeptId     = ["include_dept", "exclude_dept"].includes(ruleType);
  const showCategory   = ["discount_pct", "fixed_price", "global_discount", "approval_required"].includes(ruleType);
  const showDiscount   = ["discount_pct", "global_discount"].includes(ruleType);
  const showFixedPrice = ruleType === "fixed_price";

  const mutation = useMutation({
    mutationFn: (data: RuleFormValues) =>
      editing
        ? apiRequest("PATCH", `/api/contracts/rules/${editing.id}`, data)
        : apiRequest("POST", `/api/contracts/${contractId}/rules`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "rules"] });
      toast({ title: editing ? "تم تحديث القاعدة" : "تمت إضافة القاعدة" });
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
          <DialogTitle>{editing ? "تعديل قاعدة التغطية" : "إضافة قاعدة تغطية"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="ruleName" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>اسم القاعدة *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="مثال: تشمل الأشعة" data-testid="input-rule-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="ruleType" render={({ field }) => (
                <FormItem>
                  <FormLabel>نوع القاعدة *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-rule-type">
                        <SelectValue placeholder="اختر النوع" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(coverageRuleTypeLabels).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="priority" render={({ field }) => (
                <FormItem>
                  <FormLabel>الأولوية (أصغر = أعلى)</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" min={1} data-testid="input-rule-priority" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {showServiceId && (
              <FormField control={form.control} name="serviceId" render={({ field }) => (
                <FormItem>
                  <FormLabel>معرّف الخدمة (اختياري — اتركه فارغاً لتطبيق القاعدة على الكل)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="service-uuid" data-testid="input-rule-service-id" />
                  </FormControl>
                </FormItem>
              )} />
            )}

            {showDeptId && (
              <FormField control={form.control} name="departmentId" render={({ field }) => (
                <FormItem>
                  <FormLabel>معرّف القسم</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="dept-uuid" data-testid="input-rule-dept-id" />
                  </FormControl>
                </FormItem>
              )} />
            )}

            {showCategory && (
              <FormField control={form.control} name="serviceCategory" render={({ field }) => (
                <FormItem>
                  <FormLabel>فئة الخدمة (اختياري)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="مثال: RADIOLOGY" data-testid="input-rule-category" />
                  </FormControl>
                </FormItem>
              )} />
            )}

            {showDiscount && (
              <FormField control={form.control} name="discountPct" render={({ field }) => (
                <FormItem>
                  <FormLabel>نسبة الخصم %</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} type="number" min={0} max={100} step={0.01} data-testid="input-rule-discount" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {showFixedPrice && (
              <FormField control={form.control} name="fixedPrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>السعر الثابت (جنيه)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} type="number" min={0} step={0.01} data-testid="input-rule-fixed-price" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>ملاحظات</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={2} data-testid="input-rule-notes" />
                </FormControl>
              </FormItem>
            )} />

            <FormField control={form.control} name="isActive" render={({ field }) => (
              <FormItem className="flex flex-row-reverse items-center justify-between rounded-md border p-3">
                <FormLabel className="cursor-pointer">القاعدة نشطة</FormLabel>
                <FormControl>
                  <Switch checked={field.value ?? true} onCheckedChange={field.onChange} data-testid="switch-rule-active" />
                </FormControl>
              </FormItem>
            )} />

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-rule">
                {mutation.isPending && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
                {editing ? "حفظ التعديلات" : "إضافة القاعدة"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
