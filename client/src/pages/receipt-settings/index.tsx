import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer, Save, Copy, CheckCheck, AlertCircle, Zap } from "lucide-react";
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
    { itemName: "أموكسيسيلين 500mg كبسولات", qty: 1, unitName: "علبة", salePrice: 39.50, lineTotal: 39.50 },
  ],
};

const CHROME_CMD = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --start-maximized';
const EDGE_CMD   = '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --kiosk-printing --start-maximized';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Button type="button" size="sm" variant="outline" onClick={handleCopy} className="shrink-0">
      {copied ? <CheckCheck className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

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
    printReceipt(SAMPLE_RECEIPT, { ...values, autoPrint: true });
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

      {/* ── إعداد الطباعة المباشرة ── */}
      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-600" />
            <CardTitle className="text-sm font-semibold text-amber-800 dark:text-amber-400">
              تفعيل الطباعة المباشرة بدون أي نافذة
            </CardTitle>
            <Badge variant="secondary" className="text-xs">موصى به للكاشير</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-amber-900 dark:text-amber-300">
            المتصفح يعرض دائمًا نافذة الطباعة كإجراء أمني. للطباعة الفورية بدون أي نوافذ،
            افتح المتصفح بالخيار <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded font-mono text-xs">--kiosk-printing</code> عبر الخطوات التالية:
          </p>

          <ol className="list-decimal list-inside space-y-2 text-amber-900 dark:text-amber-300">
            <li>انقر بزر الفأرة الأيمن على اختصار المتصفح على سطح المكتب</li>
            <li>اختر <strong>خصائص</strong></li>
            <li>في حقل <strong>الهدف (Target)</strong>، أضف <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded font-mono text-xs">--kiosk-printing</code> في النهاية</li>
            <li>اضغط <strong>موافق</strong> ثم أعد تشغيل المتصفح</li>
          </ol>

          <div className="space-y-2">
            <p className="font-medium text-amber-900 dark:text-amber-300 text-xs">أمثلة جاهزة للنسخ:</p>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Google Chrome:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white dark:bg-zinc-900 border rounded px-2 py-1 text-xs font-mono break-all">
                  {CHROME_CMD}
                </code>
                <CopyButton text={CHROME_CMD} />
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Microsoft Edge:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white dark:bg-zinc-900 border rounded px-2 py-1 text-xs font-mono break-all">
                  {EDGE_CMD}
                </code>
                <CopyButton text={EDGE_CMD} />
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 pt-1">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              تأكد أيضًا من ضبط الطابعة الحرارية كطابعة افتراضية في Windows، وحجم الورق 80mm في إعدادات الطابعة.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── نموذج الإعدادات ── */}
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
                        يُطبع الإيصال تلقائيًا فور تحصيل كل فاتورة
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
              طباعة إيصال تجريبي
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
