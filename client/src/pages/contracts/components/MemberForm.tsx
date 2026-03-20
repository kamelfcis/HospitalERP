import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertContractMemberSchema, relationTypeLabels } from "@shared/schema";
import type { ContractMember } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

function today() { return new Date().toISOString().slice(0, 10); }
function oneYearLater() {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10);
}

const memberFormSchema = insertContractMemberSchema.extend({
  memberCardNumber: z.string().min(1, "رقم البطاقة مطلوب"),
  memberNameAr:     z.string().min(2, "الاسم بالعربية مطلوب"),
  startDate:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ صحيح مطلوب"),
  endDate:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ صحيح مطلوب"),
});
type MemberFormValues = z.infer<typeof memberFormSchema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contractId: string;
  editing: ContractMember | null;
}

export function MemberForm({ open, onOpenChange, contractId, editing }: Props) {
  const { toast } = useToast();

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: {
      contractId,
      memberCardNumber: editing?.memberCardNumber ?? "",
      memberNameAr:     editing?.memberNameAr     ?? "",
      memberNameEn:     editing?.memberNameEn     ?? "",
      employeeNumber:   editing?.employeeNumber   ?? "",
      nationalId:       editing?.nationalId       ?? "",
      relationType:     editing?.relationType     ?? "primary",
      memberClass:      editing?.memberClass      ?? "",
      startDate:        editing?.startDate        ?? today(),
      endDate:          editing?.endDate          ?? oneYearLater(),
      isActive:         editing?.isActive         ?? true,
      notes:            editing?.notes            ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: MemberFormValues) =>
      editing
        ? apiRequest("PATCH", `/api/contract-members/${editing.id}`, data)
        : apiRequest("POST", "/api/contract-members", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contract-members", contractId] });
      toast({ title: editing ? "تم تحديث بيانات المنتسب" : "تمت إضافة المنتسب" });
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
          <DialogTitle>{editing ? "تعديل بيانات المنتسب" : "إضافة منتسب جديد"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="memberCardNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>رقم البطاقة *</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-member-card" placeholder="CARD-001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="relationType" render={({ field }) => (
                <FormItem>
                  <FormLabel>صلة القرابة *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-relation-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(relationTypeLabels).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="memberNameAr" render={({ field }) => (
              <FormItem>
                <FormLabel>الاسم بالعربية *</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="input-member-name-ar" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="memberNameEn" render={({ field }) => (
              <FormItem>
                <FormLabel>الاسم بالإنجليزية</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} data-testid="input-member-name-en" />
                </FormControl>
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="nationalId" render={({ field }) => (
                <FormItem>
                  <FormLabel>الرقم القومي</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-member-nid" />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="employeeNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>رقم الموظف</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-member-emp" />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>تاريخ البداية *</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" data-testid="input-member-start" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="endDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>تاريخ النهاية *</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" data-testid="input-member-end" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="memberClass" render={({ field }) => (
                <FormItem>
                  <FormLabel>الفئة</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-member-class" placeholder="مثال: VIP" />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="annualLimit" render={({ field }) => (
                <FormItem>
                  <FormLabel>الحد السنوي (جنيه)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      data-testid="input-member-limit"
                      value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value || undefined)}
                    />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>ملاحظات</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={2} data-testid="input-member-notes" />
                </FormControl>
              </FormItem>
            )} />

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-member">
                {mutation.isPending && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
                {editing ? "حفظ التعديلات" : "إضافة المنتسب"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
