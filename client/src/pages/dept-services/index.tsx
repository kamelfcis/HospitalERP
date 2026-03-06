import { useRoute } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SingleOrderTab } from "./tabs/SingleOrderTab";
import { BatchTab } from "./tabs/BatchTab";
import { useDepartments } from "./hooks/useDeptServices";
import { FileText, Users } from "lucide-react";

const DEPT_CODE_MAP: Record<string, string> = {
  LAB: "e1298b3f",
  RAD: "33343989",
};

const DEPT_NAME_MAP: Record<string, string> = {
  LAB: "المعمل",
  RAD: "الأشعة",
};

export default function DeptServicesPage() {
  const [, params] = useRoute("/dept-services/:deptCode");
  const deptCode = (params?.deptCode || "LAB").toUpperCase();

  const { data: departments = [] } = useDepartments();

  const dept = departments.find((d: any) => d.code === deptCode) ||
    departments.find((d: any) => d.id === DEPT_CODE_MAP[deptCode]);

  const departmentId = dept?.id || DEPT_CODE_MAP[deptCode] || "";
  const departmentName = dept?.nameAr || dept?.name_ar || DEPT_NAME_MAP[deptCode] || deptCode;

  return (
    <div className="p-3 md:p-4" dir="rtl">
      <Card>
        <Tabs defaultValue="single" dir="rtl">
          <CardHeader className="pb-1 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg" data-testid="text-page-title">
                <FileText className="h-5 w-5" />
                خدمات {departmentName}
              </CardTitle>
              <TabsList className="h-8">
                <TabsTrigger value="single" className="gap-1 text-xs h-7 px-3" data-testid="tab-single">
                  <FileText className="h-3.5 w-3.5" />
                  طلب فردي
                </TabsTrigger>
                <TabsTrigger value="batch" className="gap-1 text-xs h-7 px-3" data-testid="tab-batch">
                  <Users className="h-3.5 w-3.5" />
                  إدخال جماعي
                </TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-1">
            <TabsContent value="single" className="mt-0">
              <SingleOrderTab departmentId={departmentId} departmentName={departmentName} />
            </TabsContent>
            <TabsContent value="batch" className="mt-0">
              <BatchTab departmentId={departmentId} departmentName={departmentName} />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
