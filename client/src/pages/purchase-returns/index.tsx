import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateReturnTab } from "./CreateReturnTab";
import { HistoryTab } from "./HistoryTab";

export default function PurchaseReturnsPage() {
  return (
    <div className="p-4 space-y-3 min-h-screen" dir="rtl">
      <Tabs defaultValue="create">
        {/* Header + tabs on the same row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold leading-tight">مرتجعات المشتريات</h1>
            <p className="text-muted-foreground text-xs">إرجاع أصناف للموردين مع خصم المخزون وتسوية الذمم</p>
          </div>
          <TabsList>
            <TabsTrigger value="create" data-testid="tab-create">إنشاء مرتجع</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">سجل المرتجعات</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="create" className="mt-2">
          <CreateReturnTab />
        </TabsContent>

        <TabsContent value="history" className="mt-2">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
