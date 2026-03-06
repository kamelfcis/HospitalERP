import { Badge } from "@/components/ui/badge";
import { Pill, Beaker } from "lucide-react";

interface Props {
  targetType: "department" | "pharmacy";
  targetName?: string | null;
}

export function TargetBadge({ targetType, targetName }: Props) {
  if (targetType === "pharmacy") {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs gap-1">
        <Pill className="h-3 w-3" />
        {targetName || "صيدلية"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs gap-1">
      <Beaker className="h-3 w-3" />
      {targetName || "قسم"}
    </Badge>
  );
}
