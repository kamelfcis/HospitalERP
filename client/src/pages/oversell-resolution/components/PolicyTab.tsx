import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, AlertTriangle, BookOpen, ClipboardList, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import type { GoLiveChecklist } from "./types";

interface PolicyTabProps {
  checklistData: GoLiveChecklist | undefined;
  onRefreshChecklist: () => void;
  onEnableFlag: () => void;
  flagPending: boolean;
}

export function PolicyTab({ checklistData, onRefreshChecklist, onEnableFlag, flagPending }: PolicyTabProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              قائمة التحقق قبل الإنتاج
              {checklistData?.allGreen && (
                <Badge className="text-xs bg-green-100 text-green-700 border border-green-300">جاهز للإنتاج ✓</Badge>
              )}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={onRefreshChecklist}>
              <RefreshCw className="h-3 w-3 ml-1" />
              إعادة الفحص
            </Button>
          </div>
          {checklistData && (
            <p className="text-xs text-gray-400">آخر فحص: {new Date(checklistData.checkedAt).toLocaleString("ar")}</p>
          )}
        </CardHeader>
        <CardContent>
          {!checklistData ? (
            <div className="p-4 text-center text-gray-400">جاري الفحص...</div>
          ) : (
            <div className="space-y-2">
              {checklistData.checks.map((check) => (
                <div key={check.key} className={`flex items-start gap-3 p-3 rounded-lg border ${check.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  <div className="mt-0.5 shrink-0">
                    {check.ok
                      ? <CheckCircle className="h-4 w-4 text-green-600" />
                      : <XCircle className="h-4 w-4 text-red-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${check.ok ? "text-green-800" : "text-red-800"}`}>{check.label}</p>
                    {check.detail && <p className={`text-xs mt-0.5 ${check.ok ? "text-green-600" : "text-red-600"}`}>{check.detail}</p>}
                    {check.action && !check.ok && (
                      <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                        → {check.action}
                      </p>
                    )}
                  </div>
                  {!check.ok && check.key === "feature_flag" && (
                    <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={onEnableFlag} disabled={flagPending}>
                      تفعيل
                    </Button>
                  )}
                  {!check.ok && check.key === "cogs_mapping" && (
                    <Link href="/account-mappings">
                      <Button size="sm" variant="outline" className="text-xs shrink-0">إعداد</Button>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            وثيقة سياسة الصرف بدون رصيد
          </CardTitle>
          <CardDescription>السياسة التشغيلية المعتمدة لاستخدام هذه الخاصية</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm" dir="rtl">
            <div>
              <h3 className="font-semibold text-green-700 mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                حالات الاستخدام المسموح بها
              </h3>
              <ul className="space-y-1.5 text-gray-700 text-xs">
                <li className="flex items-start gap-2"><span className="text-green-600 mt-0.5">✓</span> فواتير المرضى الداخليين (طوارئ / عمليات) في حالات الضرورة الطبية</li>
                <li className="flex items-start gap-2"><span className="text-green-600 mt-0.5">✓</span> الأدوية المحددة التي يوافق عليها مدير الصيدلية مسبقاً (allow_oversell مُفعَّل)</li>
                <li className="flex items-start gap-2"><span className="text-green-600 mt-0.5">✓</span> عند وجود أمر شراء في الطريق ومتوقع استلامه خلال 24 ساعة</li>
              </ul>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-red-700 mb-2 flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                حالات الاستخدام الممنوعة
              </h3>
              <ul className="space-y-1.5 text-gray-700 text-xs">
                <li className="flex items-start gap-2"><span className="text-red-600 mt-0.5">✗</span> الصيدلية الخارجية (OTC) — يُمنع منعاً باتاً</li>
                <li className="flex items-start gap-2"><span className="text-red-600 mt-0.5">✗</span> الصرف لأغراض شخصية أو خارج نطاق فاتورة مريض موثقة</li>
                <li className="flex items-start gap-2"><span className="text-red-600 mt-0.5">✗</span> الصرف بدون سبب واضح — السبب إجباري عند الإنهاء</li>
                <li className="flex items-start gap-2"><span className="text-red-600 mt-0.5">✗</span> الصرف إذا كان الصنف غير مُفعَّل للصرف بدون رصيد</li>
              </ul>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-amber-700 mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                الحدود والقيود التشغيلية
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                  <p className="text-xs font-medium text-amber-800">وقت التسوية</p>
                  <p className="text-xs text-amber-600 mt-1">يجب تسوية البنود المعلقة خلال <strong>24–48 ساعة</strong> من الصرف</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                  <p className="text-xs font-medium text-amber-800">نسبة التحذير</p>
                  <p className="text-xs text-amber-600 mt-1">يصدر تنبيه عند تجاوز نسبة الصرف المؤجل <strong>10%</strong> من إجمالي الصرف</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                  <p className="text-xs font-medium text-amber-800">إغلاق الفترة</p>
                  <p className="text-xs text-amber-600 mt-1">يُحظر إغلاق أي فترة مالية ما دامت هناك بنود معلقة</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                  <p className="text-xs font-medium text-amber-800">الصلاحيات المطلوبة</p>
                  <p className="text-xs text-amber-600 mt-1"><strong>oversell.manage</strong> للتسوية — <strong>oversell.approve</strong> للموافقة والإلغاء</p>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-gray-700 mb-2">المسؤوليات</h3>
              <div className="text-xs text-gray-600 space-y-1">
                <p><strong>مدير الصيدلية:</strong> مراجعة التقرير اليومي — تسوية البنود المعلقة — الموافقة على الأصناف المسموح لها</p>
                <p><strong>محاسب التكاليف:</strong> مراجعة القيود المحاسبية المولّدة — التحقق من نسبة الصرف المؤجل شهرياً</p>
                <p><strong>مدير الحسابات:</strong> إقفال الفترة المالية فقط بعد تصفير البنود المعلقة</p>
                <p><strong>تقنية المعلومات:</strong> مراجعة تقرير السلامة أسبوعياً من تبويب "فحص السلامة"</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
