import { Settings2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ServicesTab from "./services-pricing/ServicesTab";
import PriceListsTab from "./services-pricing/PriceListsTab";

// ─── ServicesPricing ───────────────────────────────────────────────────────────
/**
 * ServicesPricing
 * الصفحة الرئيسية لإدارة الخدمات والتسعير.
 * تتكون من تبويبين:
 *   - الخدمات:       CRUD الخدمات مع المستهلكات المرتبطة.
 *   - قوائم الأسعار: إدارة قوائم الأسعار وبنودها مع التعديل الجماعي.
 */
export default function ServicesPricing() {
  return (
    <div className="p-2" dir="rtl">
      <Tabs defaultValue="services" className="w-full">
        <div className="peachtree-toolbar flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">إدارة الخدمات والتسعير</span>
            <span className="text-xs text-muted-foreground">|</span>
            <TabsList className="h-auto p-0 bg-transparent gap-0">
              <TabsTrigger
                value="services"
                data-testid="tab-services"
                className="text-xs px-3 py-1 rounded-none data-[state=active]:bg-blue-100 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600"
              >
                الخدمات
              </TabsTrigger>
              <TabsTrigger
                value="price-lists"
                data-testid="tab-price-lists"
                className="text-xs px-3 py-1 rounded-none data-[state=active]:bg-blue-100 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600"
              >
                قوائم الأسعار
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        <TabsContent value="services" className="mt-0">
          <ServicesTab />
        </TabsContent>
        <TabsContent value="price-lists" className="mt-0">
          <PriceListsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
