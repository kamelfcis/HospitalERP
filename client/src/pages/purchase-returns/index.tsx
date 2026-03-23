import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateReturnTab } from "./CreateReturnTab";
import { HistoryTab } from "./HistoryTab";

export default function PurchaseReturnsPage() {
  return (
    <div className="p-6 space-y-4 min-h-screen" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">مرتجعات المشتريات</h1>
        <p className="text-muted-foreground text-sm">إرجاع أصناف للموردين مع خصم المخزون وتسوية الذمم</p>
      </div>

      <Tabs defaultValue="create">
        <TabsList>
          <TabsTrigger value="create" data-testid="tab-create">إنشاء مرتجع</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">سجل المرتجعات</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-4">
          <CreateReturnTab />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
