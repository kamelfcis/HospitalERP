import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, Printer, Save } from "lucide-react";
import { printReceipt, type ReceiptData, type ReceiptSettings } from "@/utils/receipt-printer";

const schema = z.object({
  header:      z.string().min(1, "أدخل اسم الصيدلية أو العنوان"),
  footer:      z.string(),
  logoText:    z.string(),
  autoPrint:   z.boolean(),
  showPreview: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const SAMPLE_RECEIPT: ReceiptData = {
  invoiceId:     "demo",
  invoiceNumber: 100042,
  receiptNumber: 512,
  invoiceDate:   new Date().toISOString().slice(0, 10),
  invoiceTime:   "14:30",
  warehouseName: "الصيدلية الرئيسية",
  cashierName:   "محمد أحمد",
  customerName:  "علي حسن",
  customerType:  "cash",
  subtotal:      75.50,
  discountValue: 5.50,
  netTotal:      70.00,
  lines: [
    { itemName: "باراسيتامول 500mg", qty: 2, unitName: "شريط", salePrice: 15.50, lineTotal: 31.00 },
    { itemName: "أموكسيسيلين 500mg كبسولات",  qty: 1, unitName: "علبة",  salePrice: 39.50, lineTotal: 39.50 },
  ],
};

export default function ReceiptSettingsPage() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<ReceiptSettings>({
    queryKey: ["/api/receipt-settings"],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      header:      "الصيدلية",
      footer:      "شكرًا لزيارتكم",
      logoText:    "",
      autoPrint:   true,
      showPreview: false,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        header:      settings.header,
        footer:      settings.footer,
        logoText:    settings.logoText,
        autoPrint:   settings.autoPrint,
        showPreview: settings.showPreview,
      });
    }
  }, [settings, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await apiRequest("PUT", "/api/receipt-settings", values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipt-settings"] });
      toast({ title: "تم الحفظ", description: "تم حفظ إعدادات الإيصالات بنجاح" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const handlePreview = () => {
    const values = form.getValues();
    const previewSettings: ReceiptSettings = { ...values, showPreview: true };
    printReceipt(SAMPLE_RECEIPT, previewSettings);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <Printer className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold">إعدادات الإيصالات الحرارية</h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground">محتوى الإيصال</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="header"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم الصيدلية / العنوان الرئيسي</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="مثال: صيدلية الشفاء"
                        data-testid="input-receipt-header"
                      />
                    </FormControl>
                    <FormDescription>يظهر في أعلى كل إيصال بخط كبير</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="logoText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نص الشعار (اختياري)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="مثال: رخصة وزارة الصحة رقم 12345"
                        data-testid="input-receipt-logo-text"
                      />
                    </FormControl>
                    <FormDescription>سطر صغير يظهر فوق العنوان الرئيسي</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="footer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نص التذييل</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={2}
                        placeholder="مثال: الأدوية لا تُرد بعد الشراء — شكرًا لزيارتكم"
                        data-testid="input-receipt-footer"
                      />
                    </FormControl>
                    <FormDescription>يظهر في أسفل الإيصال</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground">إعدادات الطباعة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="autoPrint"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel className="font-medium">طباعة تلقائية بعد التحصيل</FormLabel>
                      <FormDescription>
                        يُطبع الإيصال تلقائيًا عند تحصيل كل فاتورة
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-auto-print"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="showPreview"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <FormLabel className="font-medium">عرض معاينة قبل الطباعة</FormLabel>
                      <FormDescription>
                        إذا كان مفعّلًا تظهر نافذة المعاينة قبل إرسال الإيصال للطابعة
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-show-preview"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Separator />

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreview}
              data-testid="button-preview-receipt"
            >
              <Printer className="h-4 w-4 ml-2" />
              معاينة إيصال تجريبي
            </Button>
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              data-testid="button-save-receipt-settings"
            >
              {saveMutation.isPending
                ? <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                : <Save className="h-4 w-4 ml-2" />}
              حفظ الإعدادات
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
