import { Textarea } from "@/components/ui/textarea";
import { QuadrantCard } from "./QuadrantCard";

interface Props {
  diagnosis: string;
  notes: string;
  onDiagnosisChange: (v: string) => void;
  onNotesChange: (v: string) => void;
}

export function DiagnosisQuadrant({ diagnosis, notes, onDiagnosisChange, onNotesChange }: Props) {
  return (
    <QuadrantCard label="التشخيص والملاحظات">
      <div className="flex flex-col gap-2 h-full">
        <Textarea
          className="flex-1 resize-none border-0 focus-visible:ring-0 bg-transparent p-1 text-sm min-h-[60px]"
          placeholder="التشخيص..."
          value={diagnosis}
          onChange={(e) => onDiagnosisChange(e.target.value)}
          data-testid="textarea-diagnosis"
        />
        <div className="border-t pt-1">
          <Textarea
            className="resize-none border-0 focus-visible:ring-0 bg-transparent p-1 text-xs min-h-[40px]"
            placeholder="ملاحظات إضافية..."
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            data-testid="textarea-notes"
          />
        </div>
      </div>
    </QuadrantCard>
  );
}
