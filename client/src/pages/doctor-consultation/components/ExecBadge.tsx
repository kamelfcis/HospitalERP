import { CheckCircle2, Pill, Stethoscope } from "lucide-react";

interface ExecBadgeProps {
  executed: number;
  total: number;
  label: string;
  icon: "service" | "pharmacy";
}

export function ExecBadge({ executed, total, label, icon }: ExecBadgeProps) {
  if (total === 0) return null;
  const allDone = executed >= total;
  const Icon = icon === "pharmacy" ? Pill : Stethoscope;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
        allDone ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
      }`}
      title={`${label}: ${executed}/${total}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {executed}/{total}
      {allDone && <CheckCircle2 className="h-2.5 w-2.5" />}
    </span>
  );
}
