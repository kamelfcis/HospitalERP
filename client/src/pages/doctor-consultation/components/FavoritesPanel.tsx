import { useState } from "react";
import { Star, Plus, Trash2, Pin, PinOff, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useDoctorFavorites,
  useAddFavorite,
  useUpdateFavorite,
  useDeleteFavorite,
  FAVORITE_TYPE_LABELS,
  type FavoriteType,
  type DoctorFavorite,
} from "../hooks/useDoctorFavorites";

// ─── Save favorite dialog ───────────────────────────────────────────────────

interface SaveDialogProps {
  open: boolean;
  initialContent: string;
  clinicId?: string | null;
  onClose: () => void;
}

function SaveFavoriteDialog({ open, initialContent, clinicId, onClose }: SaveDialogProps) {
  const { toast } = useToast();
  const add = useAddFavorite(clinicId);
  const [type, setType] = useState<FavoriteType>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(initialContent);

  // Reset when dialog opens
  function handleOpen() {
    setType("note");
    setTitle("");
    setContent(initialContent);
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) {
      toast({ title: "الرجاء إدخال عنوان ومحتوى", variant: "destructive" });
      return;
    }
    try {
      await add.mutateAsync({ type, title: title.trim(), content: content.trim(), clinicId });
      toast({ title: "تم الحفظ في المفضلة" });
      onClose();
    } catch {
      toast({ title: "خطأ في الحفظ", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }} onOpenAutoFocus={() => handleOpen()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>حفظ في المفضلة</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-sm">التصنيف</Label>
            <Select value={type} onValueChange={(v) => setType(v as FavoriteType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(FAVORITE_TYPE_LABELS) as [FavoriteType, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-sm">العنوان *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="اكتب عنواناً مختصراً..."
              data-testid="input-favorite-title"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">المحتوى *</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[80px] resize-none"
              data-testid="input-favorite-content"
            />
          </div>
        </div>
        <DialogFooter className="flex-row-reverse gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={add.isPending} data-testid="button-confirm-save-favorite">
            {add.isPending && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Favorite item row ───────────────────────────────────────────────────────

interface FavoriteRowProps {
  fav: DoctorFavorite;
  onInsert: (text: string) => void;
  clinicId?: string | null;
}

function FavoriteRow({ fav, onInsert, clinicId }: FavoriteRowProps) {
  const { toast } = useToast();
  const update = useUpdateFavorite(clinicId);
  const remove = useDeleteFavorite(clinicId);

  async function togglePin() {
    await update.mutateAsync({ id: fav.id, isPinned: !fav.isPinned });
  }

  async function handleDelete() {
    try {
      await remove.mutateAsync(fav.id);
    } catch {
      toast({ title: "خطأ في الحذف", variant: "destructive" });
    }
  }

  return (
    <div className="flex items-start gap-2 group px-2 py-1.5 rounded hover:bg-muted/50 transition-colors">
      {fav.isPinned && <Pin className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium truncate">{fav.title}</span>
          <Badge variant="outline" className="text-xs px-1 py-0 h-4">
            {FAVORITE_TYPE_LABELS[fav.type] ?? fav.type}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{fav.content}</p>
      </div>
      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => onInsert(fav.content)}
          data-testid={`button-insert-favorite-${fav.id}`}
        >
          إدراج
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground"
          onClick={togglePin}
          title={fav.isPinned ? "إلغاء التثبيت" : "تثبيت"}
          data-testid={`button-pin-favorite-${fav.id}`}
        >
          {fav.isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
          onClick={handleDelete}
          title="حذف"
          data-testid={`button-delete-favorite-${fav.id}`}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main FavoritesPanel ─────────────────────────────────────────────────────

interface Props {
  clinicId?: string | null;
  /** Called when the doctor clicks "Insert" on a favorite — inserts text into the active field */
  onInsert: (text: string) => void;
  /** The current text in the active field (to save as favorite) */
  currentText?: string;
}

/**
 * Doctor-side saved text helpers panel.
 * Shows pinned favorites first, then rest. Doctor can insert, pin, save, delete.
 * NOT a diagnosis engine — no medical logic. Just reusable text.
 */
export function FavoritesPanel({ clinicId, onInsert, currentText = "" }: Props) {
  const { data: favorites = [], isLoading } = useDoctorFavorites(clinicId);
  const [saveOpen, setSaveOpen] = useState(false);
  const [filterType, setFilterType] = useState<FavoriteType | "all">("all");

  const filtered = filterType === "all"
    ? favorites
    : favorites.filter((f) => f.type === filterType);

  const pinned = filtered.filter((f) => f.isPinned);
  const rest   = filtered.filter((f) => !f.isPinned);

  return (
    <>
      {/* Inline Save dialog */}
      <SaveFavoriteDialog
        open={saveOpen}
        initialContent={currentText}
        clinicId={clinicId}
        onClose={() => setSaveOpen(false)}
      />

      <div className="border rounded-lg bg-background flex flex-col h-full min-h-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
          <Star className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs font-semibold">نصوص محفوظة</span>
          <div className="mr-auto flex items-center gap-1">
            {/* Filter by type */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2">
                  {filterType === "all" ? "الكل" : FAVORITE_TYPE_LABELS[filterType]}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" dir="rtl">
                <DropdownMenuItem onClick={() => setFilterType("all")}>الكل</DropdownMenuItem>
                <DropdownMenuSeparator />
                {(Object.entries(FAVORITE_TYPE_LABELS) as [FavoriteType, string][]).map(([k, v]) => (
                  <DropdownMenuItem key={k} onClick={() => setFilterType(k)}>{v}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Save current text as favorite */}
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs gap-1 px-2"
              onClick={() => setSaveOpen(true)}
              data-testid="button-open-save-favorite"
            >
              <Plus className="h-3 w-3" />
              حفظ
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 py-1">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-6">
              لا توجد نصوص محفوظة
              <br />
              <span className="text-xs">اكتب نصاً ثم اضغط «حفظ» لإضافته</span>
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground px-3 pb-1 font-medium">مثبّت</p>
                  {pinned.map((fav) => (
                    <FavoriteRow key={fav.id} fav={fav} onInsert={onInsert} clinicId={clinicId} />
                  ))}
                  {rest.length > 0 && <div className="border-t my-1" />}
                </>
              )}
              {rest.map((fav) => (
                <FavoriteRow key={fav.id} fav={fav} onInsert={onInsert} clinicId={clinicId} />
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
