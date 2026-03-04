import { Globe, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";

interface ScopeSummary {
  isFullAccess: boolean;
  allowedPharmacyIds: string[];
  allowedDepartmentIds: string[];
}

export function ScopeBadge({ userId }: { userId: string }) {
  const { data } = useQuery<ScopeSummary>({ queryKey: ["/api/users", userId, "cashier-scope"] });
  if (!data) return null;

  if (data.isFullAccess) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="gap-1 text-[10px] cursor-help" data-testid={`badge-scope-full-${userId}`}>
              <Globe className="h-3 w-3 text-green-600" />
              كل الوحدات
            </Badge>
          </TooltipTrigger>
          <TooltipContent>هذا المستخدم لديه صلاحية الوصول لكل الصيدليات والأقسام</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const total = data.allowedPharmacyIds.length + data.allowedDepartmentIds.length;
  if (total === 0) return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 text-[10px] text-destructive border-destructive cursor-help" data-testid={`badge-scope-none-${userId}`}>
            <Lock className="h-3 w-3" />
            بلا وحدات
          </Badge>
        </TooltipTrigger>
        <TooltipContent>هذا المستخدم لن يتمكن من فتح وردية — لا توجد وحدات مخصصة له</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="gap-1 text-[10px] cursor-help" data-testid={`badge-scope-limited-${userId}`}>
            <Lock className="h-3 w-3 text-amber-600" />
            {total} {total === 1 ? "وحدة" : "وحدات"}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>مسموح بـ {data.allowedPharmacyIds.length} صيدلية + {data.allowedDepartmentIds.length} قسم</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
