import { Loader2 } from "lucide-react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GroupedOrderRow } from "./GroupedOrderRow";
import type { GroupedClinicOrder, ClinicOrder } from "../types";

interface Props {
  groups: GroupedClinicOrder[];
  isLoading: boolean;
  onExecute: (order: ClinicOrder) => void;
  isExecuting: boolean;
  canExecute: boolean;
}

export function OrdersTable({ groups, isLoading, onExecute, isExecuting, canExecute }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-16 border rounded-lg">
        لا توجد أوامر
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="text-right w-8">النوع</TableHead>
            <TableHead className="text-right">الطبيب / المريض</TableHead>
            <TableHead className="text-right">الأمر</TableHead>
            <TableHead className="text-right w-36">الجهة</TableHead>
            <TableHead className="text-right w-24">الحالة</TableHead>
            {canExecute && <TableHead className="text-right w-32">إجراءات</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <GroupedOrderRow
              key={group.groupKey}
              group={group}
              onExecute={onExecute}
              isExecuting={isExecuting}
              canExecute={canExecute}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
