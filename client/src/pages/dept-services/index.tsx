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
    <div className="p-6 space-y-4" dir="rtl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-xl" data-testid="text-page-title">
            <FileText className="h-6 w-6" />
            خدمات {departmentName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="single" dir="rtl">
            <TabsList className="mb-4">
              <TabsTrigger value="single" className="gap-1" data-testid="tab-single">
                <FileText className="h-4 w-4" />
                طلب فردي
              </TabsTrigger>
              <TabsTrigger value="batch" className="gap-1" data-testid="tab-batch">
                <Users className="h-4 w-4" />
                إدخال جماعي
              </TabsTrigger>
            </TabsList>

            <TabsContent value="single">
              <SingleOrderTab departmentId={departmentId} departmentName={departmentName} />
            </TabsContent>

            <TabsContent value="batch">
              <BatchTab departmentId={departmentId} departmentName={departmentName} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
