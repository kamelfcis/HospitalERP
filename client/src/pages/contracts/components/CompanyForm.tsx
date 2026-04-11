import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertCompanySchema, companyTypeLabels } from "@shared/schema";
import type { Company } from "@shared/schema";
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
import { AccountLookup } from "@/components/lookups";

const companyFormSchema = insertCompanySchema.extend({
  code:        z.string().min(1, "الكود مطلوب").max(30, "الكود لا يتجاوز 30 حرفاً"),
  nameAr:      z.string().min(2, "الاسم بالعربية مطلوب"),
  companyType: z.string().min(1, "نوع الشركة مطلوب"),
});
type CompanyFormValues = z.infer<typeof companyFormSchema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Company | null;
}

export function CompanyForm({ open, onOpenChange, editing }: Props) {
  const { toast } = useToast();

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      code:          editing?.code          ?? "",
      nameAr:        editing?.nameAr        ?? "",
      nameEn:        editing?.nameEn        ?? "",
      companyType:   editing?.companyType   ?? "contract",
      phone:         editing?.phone         ?? "",
      email:         editing?.email         ?? "",
      address:       editing?.address       ?? "",
      taxId:         editing?.taxId         ?? "",
      notes:         editing?.notes         ?? "",
      defaultPaymentTermsDays: editing?.defaultPaymentTermsDays ?? undefined,
      creditLimit:   editing?.creditLimit   ?? undefined,
      glAccountId:   editing?.glAccountId   ?? "",
      isActive:      editing?.isActive      ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: CompanyFormValues) =>
      editing
        ? apiRequest("PATCH", `/api/companies/${editing.id}`, data)
        : apiRequest("POST", "/api/companies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: editing ? "تم تحديث الشركة" : "تمت إضافة الشركة" });
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
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>{editing ? "تعديل الشركة" : "إضافة شركة جديدة"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel>الكود *</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-company-code" placeholder="مثال: INS001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="companyType" render={({ field }) => (
                <FormItem>
                  <FormLabel>النوع *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-company-type">
                        <SelectValue placeholder="اختر النوع" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(companyTypeLabels).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="nameAr" render={({ field }) => (
              <FormItem>
                <FormLabel>الاسم بالعربية *</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="input-company-name-ar" placeholder="اسم الشركة" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="nameEn" render={({ field }) => (
              <FormItem>
                <FormLabel>الاسم بالإنجليزية</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} data-testid="input-company-name-en" placeholder="Company Name" />
                </FormControl>
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>الهاتف</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-company-phone" />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>البريد الإلكتروني</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-company-email" type="email" />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="taxId" render={({ field }) => (
                <FormItem>
                  <FormLabel>الرقم الضريبي</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-company-tax-id" />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="defaultPaymentTermsDays" render={({ field }) => (
                <FormItem>
                  <FormLabel>أجل السداد (يوم)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      data-testid="input-company-payment-terms"
                      value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="glAccountId" render={({ field }) => (
              <FormItem>
                <FormLabel>حساب GL في دليل الحسابات</FormLabel>
                <FormControl>
                  <AccountLookup
                    value={field.value ?? ""}
                    onChange={(item) => field.onChange(item?.id ?? "")}
                    placeholder="اختر حساب الشركة في الدليل..."
                    data-testid="lookup-company-gl-account"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>العنوان</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={2} data-testid="input-company-address" />
                </FormControl>
              </FormItem>
            )} />

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>ملاحظات</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={2} data-testid="input-company-notes" />
                </FormControl>
              </FormItem>
            )} />

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-company">
                {mutation.isPending && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
                {editing ? "حفظ التعديلات" : "إضافة الشركة"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
