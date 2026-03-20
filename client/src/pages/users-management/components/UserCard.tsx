import { Card, CardContent } from "@/components/ui/card";
import { Button }            from "@/components/ui/button";
import { Badge }             from "@/components/ui/badge";
import { Pencil, Trash2, Shield, UserCircle, Wallet, Lock } from "lucide-react";
import { ROLE_LABELS } from "@shared/permissions";
import { ScopeBadge } from "../../cashier/components/ScopeBadge";
import type { UserData } from "../types";

interface UserCardProps {
  user:             UserData;
  canEdit:          boolean;
  canDelete:        boolean;
  onEdit:           (u: UserData) => void;
  onDelete:         (id: string) => void;
  onOpenPerms:      (id: string) => void;
  onOpenAcctScope:  (u: UserData) => void;
}

export function UserCard({ user, canEdit, canDelete, onEdit, onDelete, onOpenPerms, onOpenAcctScope }: UserCardProps) {
  return (
    <Card data-testid={`card-user-${user.id}`}>
      <CardContent className="px-3 py-2">
        <div className="flex items-center justify-between flex-wrap gap-2">

          <div className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium text-sm" data-testid={`text-user-fullname-${user.id}`}>
              {user.fullName}
            </span>
            <span className="text-xs text-muted-foreground" data-testid={`text-user-username-${user.id}`}>
              @{user.username}
            </span>
            <Badge variant={user.isActive ? "default" : "secondary"} data-testid={`badge-user-status-${user.id}`}>
              {user.isActive ? "نشط" : "معطل"}
            </Badge>
            <Badge variant="outline" data-testid={`badge-user-role-${user.id}`}>
              {ROLE_LABELS[user.role] || user.role}
            </Badge>
            {user.cashierGlAccountId && (
              <>
                <Badge variant="secondary" className="gap-1 text-[10px]" data-testid={`badge-user-cashier-${user.id}`}>
                  <Wallet className="h-3 w-3" />
                  كاشير
                </Badge>
                <ScopeBadge userId={user.id} />
              </>
            )}
          </div>

          <div className="flex items-center gap-1">
            {canEdit && (
              <>
                <Button
                  variant="ghost" size="icon"
                  onClick={() => onOpenPerms(user.id)}
                  data-testid={`button-user-perms-${user.id}`}
                  title="الصلاحيات"
                >
                  <Shield className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  onClick={() => onOpenAcctScope(user)}
                  data-testid={`button-user-acct-scope-${user.id}`}
                  title="نطاق الحسابات"
                >
                  <Lock className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  onClick={() => onEdit(user)}
                  data-testid={`button-edit-user-${user.id}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </>
            )}
            {canDelete && (
              <Button
                variant="ghost" size="icon"
                onClick={() => {
                  if (confirm("هل تريد حذف هذا المستخدم؟")) onDelete(user.id);
                }}
                data-testid={`button-delete-user-${user.id}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
