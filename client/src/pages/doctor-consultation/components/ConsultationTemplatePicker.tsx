import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConsultationTemplates } from "../hooks/useConsultationTemplates";
import type { ConsultationTemplate } from "../hooks/useConsultationTemplates";

interface Props {
  onApply: (template: ConsultationTemplate) => void;
}

/**
 * Dropdown picker for pre-built specialty consultation templates.
 * Doctor must explicitly choose — no auto-application.
 */
export function ConsultationTemplatePicker({ onApply }: Props) {
  const { groups } = useConsultationTemplates();
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-7 text-xs"
          data-testid="button-template-picker"
        >
          <FileText className="h-3 w-3" />
          قوالب سريعة
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" dir="rtl">
        {groups.map((group, gi) => (
          <DropdownMenuGroup key={group.specialty}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.templates.map((tpl) => (
              <DropdownMenuItem
                key={tpl.key}
                className="text-xs cursor-pointer"
                onSelect={() => {
                  onApply(tpl);
                  setOpen(false);
                }}
                data-testid={`template-item-${tpl.key}`}
              >
                {tpl.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
