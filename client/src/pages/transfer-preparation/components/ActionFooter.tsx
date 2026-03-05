import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeftRight, Loader2 } from "lucide-react";

interface Props {
  sourceName: string;
  destName: string;
  linesWithQty: number;
  isCreating: boolean;
  onCreateTransfer: (transferDate: string) => void;
}

export function ActionFooter({ sourceName, destName, linesWithQty, isCreating, onCreateTransfer }: Props) {
  const transferDateRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    const transferDate = transferDateRef.current?.value || new Date().toISOString().split("T")[0];
    onCreateTransfer(transferDate);
  };

  return (
    <div className="border rounded-lg p-4 bg-card" data-testid="section-action">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <Label className="text-xs">تاريخ التحويل</Label>
            <Input
              type="date"
              ref={transferDateRef}
              defaultValue={new Date().toISOString().split("T")[0]}
              className="w-[160px]"
              data-testid="input-transfer-date"
            />
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">من: </span>
            <span className="font-medium">{sourceName}</span>
            <span className="text-muted-foreground mx-2">←</span>
            <span className="text-muted-foreground">إلى: </span>
            <span className="font-medium">{destName}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{linesWithQty} صنف بكميات تحويل</span>
          <Button
            onClick={handleClick}
            disabled={linesWithQty === 0 || isCreating}
            className="min-w-[160px]"
            data-testid="button-create-transfer"
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin ml-1" />
            ) : (
              <ArrowLeftRight className="h-4 w-4 ml-1" />
            )}
            إنشاء إذن تحويل
          </Button>
        </div>
      </div>
    </div>
  );
}
