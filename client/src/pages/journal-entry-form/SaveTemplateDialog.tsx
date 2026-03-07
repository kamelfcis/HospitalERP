import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateName: string;
  setTemplateName: (v: string) => void;
  templateDescription: string;
  setTemplateDescription: (v: string) => void;
  validLineCount: number;
  isSaving: boolean;
  onSave: () => void;
}

export default function SaveTemplateDialog({
  open,
  onOpenChange,
  templateName,
  setTemplateName,
  templateDescription,
  setTemplateDescription,
  validLineCount,
  isSaving,
  onSave,
}: Props) {
  function handleCancel() {
    onOpenChange(false);
    setTemplateName("");
    setTemplateDescription("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0" dir="rtl">
        <div className="peachtree-toolbar">
          <DialogHeader className="p-0">
            <DialogTitle className="text-sm font-semibold">حفظ كنموذج</DialogTitle>
          </DialogHeader>
        </div>
        <div className="p-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="templateName" className="text-xs">اسم النموذج *</Label>
            <input
              id="templateName"
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="مثال: قيد الرواتب الشهرية"
              className="peachtree-input w-full"
              data-testid="input-template-name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="templateDesc" className="text-xs">الوصف</Label>
            <textarea
              id="templateDesc"
              value={templateDescription}
              onChange={(e) => setTemplateDescription(e.target.value)}
              placeholder="وصف إضافي للنموذج (اختياري)"
              rows={2}
              className="peachtree-input w-full resize-none"
              style={{ height: "auto", minHeight: "52px" }}
              data-testid="input-template-desc"
            />
          </div>
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
            سيتم حفظ {validLineCount} سطور في النموذج
          </div>
        </div>
        <div className="peachtree-toolbar flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            data-testid="button-cancel-template"
            className="h-7 text-xs"
          >
            إلغاء
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={isSaving || !templateName.trim()}
            data-testid="button-confirm-save-template"
            className="h-7 text-xs"
          >
            {isSaving ? "جاري الحفظ..." : "حفظ النموذج"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
