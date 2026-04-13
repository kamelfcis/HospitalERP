import { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import { ArrowLeftRight, Stethoscope } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { DoctorLookup } from "@/components/lookups";
import type { DoctorTransfer } from "@shared/schema";

interface DoctorTransferSectionProps {
  invoiceId:            string | null;
  status:               string;
  dtTransfers:          DoctorTransfer[];
  dtAlreadyTransferred: number;
  dtRemaining:          number;
  dtOpen:               boolean;
  setDtOpen:            (fn: (o: boolean) => boolean) => void;
  dtAmount:             string;
  setDtAmount:          (v: string) => void;
  dtDoctorName:         string;
  setDtDoctorName:      (v: string) => void;
  dtNotes:              string;
  setDtNotes:           (v: string) => void;
  openDtConfirm:        () => void;
}

export function DoctorTransferSection({
  invoiceId,
  status,
  dtTransfers,
  dtAlreadyTransferred,
  dtRemaining,
  dtOpen,
  setDtOpen,
  dtAmount,
  setDtAmount,
  dtDoctorName,
  setDtDoctorName,
  dtNotes,
  setDtNotes,
  openDtConfirm,
}: DoctorTransferSectionProps) {
  const [localDtDoctorId, setLocalDtDoctorId] = useState("");

  if (status !== "finalized" || !invoiceId) return null;

  return (
    <div className="border rounded-md p-2 space-y-2" data-testid="section-doctor-transfer">
      <div className="flex flex-row-reverse items-center gap-2">
        <Stethoscope className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold">تحويل مستحقات الطبيب</h3>
        <div className="flex-1" />
        {dtTransfers.length > 0 && (
          <span className="text-xs text-muted-foreground">
            محوّل: {formatCurrency(dtAlreadyTransferred)} | متبقي: {formatCurrency(dtRemaining)}
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400"
          onClick={() => { setDtOpen(o => !o); if (!dtOpen) setDtAmount(dtRemaining.toFixed(2)); }}
          data-testid="button-dt-open"
        >
          <ArrowLeftRight className="h-3 w-3 ml-1" />
          {dtOpen ? "إلغاء" : "تحويل للطبيب"}
        </Button>
      </div>

      {dtTransfers.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الطبيب</TableHead>
              <TableHead className="text-right">المبلغ</TableHead>
              <TableHead className="text-right">التاريخ</TableHead>
              <TableHead className="text-right">ملاحظات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dtTransfers.map(t => (
              <TableRow key={t.id} data-testid={`row-dt-${t.id}`}>
                <TableCell className="text-xs">{t.doctorName}</TableCell>
                <TableCell className="text-xs font-medium">{formatCurrency(parseFloat(t.amount))}</TableCell>
                <TableCell className="text-xs">{formatDateShort(t.transferredAt as any)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.notes || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {dtOpen && (
        <div className="flex flex-row-reverse items-end gap-2 flex-wrap border-t pt-2">
          <div className="flex flex-row-reverse items-center gap-1">
            <Label className="text-xs whitespace-nowrap">الطبيب *</Label>
            <div className="w-44">
              <DoctorLookup
                value={localDtDoctorId}
                displayValue={dtDoctorName}
                onChange={(item) => {
                  setLocalDtDoctorId(item?.id || "");
                  setDtDoctorName(item?.name || "");
                }}
                data-testid="lookup-dt-doctor"
              />
            </div>
          </div>
          <div className="flex flex-row-reverse items-center gap-1">
            <Label className="text-xs whitespace-nowrap">المبلغ *</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={dtAmount}
              onChange={e => setDtAmount(e.target.value)}
              placeholder="0.00"
              className="h-7 text-xs w-28"
              data-testid="input-dt-amount"
            />
          </div>
          <div className="flex flex-row-reverse items-center gap-1">
            <Label className="text-xs whitespace-nowrap">ملاحظات</Label>
            <Input
              value={dtNotes}
              onChange={e => setDtNotes(e.target.value)}
              placeholder="اختياري"
              className="h-7 text-xs w-40"
              data-testid="input-dt-notes"
            />
          </div>
          <Button
            size="sm"
            className="bg-blue-600 text-white hover:bg-blue-700"
            onClick={openDtConfirm}
            data-testid="button-dt-confirm-open"
          >
            <ArrowLeftRight className="h-3 w-3 ml-1" />
            تأكيد التحويل
          </Button>
        </div>
      )}
    </div>
  );
}
