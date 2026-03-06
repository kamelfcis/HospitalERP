import { cn } from "@/lib/utils";

interface Props {
  label: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function QuadrantCard({ label, children, className, action }: Props) {
  return (
    <div className={cn("border rounded-lg flex flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b shrink-0">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        {action && <div className="flex gap-1">{action}</div>}
      </div>
      <div className="flex-1 overflow-auto p-2">
        {children}
      </div>
    </div>
  );
}
