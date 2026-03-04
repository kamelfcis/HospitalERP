import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { TreasurySummary, UserRow, UserTreasuryRow } from "../types";

interface Props {
  summaries: TreasurySummary[];
  users: UserRow[];
  userAssignments: UserTreasuryRow[];
  onAssign: (params: { userId: string; treasuryId: string }) => void;
  onRemoveAssign: (userId: string) => void;
  isAssigning: boolean;
  isRemoving: boolean;
}

export function UsersTab({ summaries, users, userAssignments, onAssign, onRemoveAssign, isAssigning, isRemoving }: Props) {
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [treasuryId, setTreasuryId] = useState("");

  const handleAssign = () => {
    if (!userId || !treasuryId) {
      toast({ title: "يجب اختيار مستخدم وخزنة", variant: "destructive" }); return;
    }
    onAssign({ userId, treasuryId });
    setUserId(""); setTreasuryId("");
  };

  return (
    <div className="space-y-4">
      {/* Assignment form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-right">تعيين خزنة لمستخدم</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            كل مستخدم يمكن ربطه بخزنة واحدة — يمكن لعدة مستخدمين الارتباط بنفس الخزنة.
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-48">
              <label className="text-sm font-medium mb-1.5 block">المستخدم</label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger data-testid="select-assign-user">
                  <SelectValue placeholder="اختر مستخدماً..." />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.isActive).map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.fullName}
                      <span className="text-xs text-muted-foreground mr-2">({u.username})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-48">
              <label className="text-sm font-medium mb-1.5 block">الخزنة</label>
              <Select value={treasuryId} onValueChange={setTreasuryId}>
                <SelectTrigger data-testid="select-assign-treasury">
                  <SelectValue placeholder="اختر خزنة..." />
                </SelectTrigger>
                <SelectContent>
                  {summaries.filter(t => t.isActive).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAssign} disabled={isAssigning} data-testid="button-assign">
              {isAssigning ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Plus className="h-4 w-4 ml-1" />}
              تعيين
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-right">التعيينات الحالية</CardTitle>
        </CardHeader>
        <CardContent>
          {userAssignments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد تعيينات بعد</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المستخدم</TableHead>
                  <TableHead className="text-right">الخزنة المعينة</TableHead>
                  <TableHead className="text-center">إلغاء التعيين</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userAssignments.map(a => (
                  <TableRow key={a.userId} data-testid={`row-assign-${a.userId}`}>
                    <TableCell className="font-medium">{a.userName}</TableCell>
                    <TableCell>{a.treasuryName}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm" variant="outline"
                        onClick={() => onRemoveAssign(a.userId)}
                        disabled={isRemoving}
                        data-testid={`button-remove-assign-${a.userId}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 ml-1" />إلغاء
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
