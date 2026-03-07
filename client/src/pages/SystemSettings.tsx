import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Settings2 } from "lucide-react";

const STAY_MODE_OPTIONS = [
  {
    value: "hours_24",
    label: "٢٤ ساعة من وقت الدخول",
    description: "يُحسب كل يوم إقامة بعد مرور ٢٤ ساعة كاملة من لحظة دخول المريض",
  },
  {
    value: "hotel_noon",
    label: "نظام فندقي (١٢ ظهراً → ١٢ ظهراً)",
    description: "يبدأ اليوم الجديد عند منتصف النهار (١٢:٠٠ ظهراً) كما في الفنادق",
  },
];

export default function SystemSettings() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiRequest("PUT", `/api/settings/${key}`, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "تم الحفظ", description: "تم تحديث الإعداد بنجاح" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "خطأ", description: err.message });
    },
  });

  const currentMode = settings?.stay_billing_mode ?? "hours_24";

  return (
    <div className="p-6 max-w-2xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <Settings2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">إعدادات النظام</h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">نمط حساب الإقامة</CardTitle>
            <CardDescription>
              يحدد كيفية احتساب أيام الإقامة للمرضى داخل المستشفى
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={currentMode}
              onValueChange={(value) =>
                updateMutation.mutate({ key: "stay_billing_mode", value })
              }
              disabled={updateMutation.isPending}
              className="space-y-4"
              data-testid="radio-stay-billing-mode"
            >
              {STAY_MODE_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  className="flex items-start gap-3 p-4 rounded-lg border cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() =>
                    !updateMutation.isPending &&
                    updateMutation.mutate({ key: "stay_billing_mode", value: opt.value })
                  }
                >
                  <RadioGroupItem
                    value={opt.value}
                    id={`mode-${opt.value}`}
                    className="mt-0.5"
                    data-testid={`radio-mode-${opt.value}`}
                  />
                  <Label
                    htmlFor={`mode-${opt.value}`}
                    className="cursor-pointer space-y-1"
                  >
                    <span className="font-medium text-sm">{opt.label}</span>
                    <p className="text-xs text-muted-foreground font-normal">
                      {opt.description}
                    </p>
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {updateMutation.isPending && (
              <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>جارٍ الحفظ...</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
