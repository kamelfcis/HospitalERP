import { Textarea } from "@/components/ui/textarea";
import { QuadrantCard } from "./QuadrantCard";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function ComplaintQuadrant({ value, onChange }: Props) {
  return (
    <QuadrantCard label="شكوى المريض">
      <Textarea
        className="h-full resize-none border-0 focus-visible:ring-0 bg-transparent p-1 text-sm"
        placeholder="اكتب شكوى المريض هنا..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="textarea-complaint"
      />
    </QuadrantCard>
  );
}
