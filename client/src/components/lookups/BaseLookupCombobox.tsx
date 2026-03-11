import { useState, useRef, useEffect } from "react";
import { ChevronDown, Loader2, Search, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LookupItem } from "@/lib/lookupTypes";

export interface BaseLookupComboboxProps {
  items: LookupItem[];
  isLoading?: boolean;
  value: string;
  displayValue?: string;
  onChange: (item: LookupItem | null) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchValue?: string;
  onSearchChange?: (q: string) => void;
  renderItem?: (item: LookupItem) => React.ReactNode;
  clearable?: boolean;
  "data-testid"?: string;
}

export function BaseLookupCombobox({
  items,
  isLoading = false,
  value,
  displayValue,
  onChange,
  placeholder = "اختر...",
  disabled = false,
  searchable = false,
  searchValue = "",
  onSearchChange,
  renderItem,
  clearable = true,
  "data-testid": testId,
}: BaseLookupComboboxProps) {
  const [open, setOpen] = useState(false);
  const containerRef   = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);

  const selectedLabel = displayValue || items.find(i => i.id === value)?.name;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function handleOpen() {
    if (disabled) return;
    setOpen(prev => {
      if (!prev) setTimeout(() => inputRef.current?.focus(), 30);
      return !prev;
    });
  }

  function handleSelect(item: LookupItem) {
    onChange(item);
    setOpen(false);
    onSearchChange?.("");
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    onSearchChange?.("");
  }

  return (
    <div ref={containerRef} className="relative" data-testid={testId}>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={cn(
          "flex w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm",
          "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50 gap-2 h-9 text-right",
          open && "ring-2 ring-ring ring-offset-2"
        )}
        data-testid={testId ? `${testId}-trigger` : undefined}
      >
        <span className={cn("truncate flex-1", !selectedLabel && "text-muted-foreground")}>
          {selectedLabel ?? placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {clearable && value && !disabled && (
            <X
              className="h-3 w-3 text-muted-foreground hover:text-foreground"
              onClick={handleClear}
              data-testid={testId ? `${testId}-clear` : undefined}
            />
          )}
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full min-w-[200px] max-h-64 bg-popover border border-border rounded-md shadow-lg flex flex-col overflow-hidden">
          {searchable && (
            <div className="flex items-center gap-2 px-2 py-1.5 border-b shrink-0">
              <Search className="h-3 w-3 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={searchValue}
                onChange={e => onSearchChange?.(e.target.value)}
                placeholder="ابحث..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                data-testid={testId ? `${testId}-search` : undefined}
              />
              {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
            </div>
          )}

          <div className="overflow-y-auto">
            {isLoading && items.length === 0 ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {searchValue ? "لا توجد نتائج" : "لا توجد بيانات"}
              </p>
            ) : (
              items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm text-right hover:bg-accent hover:text-accent-foreground",
                    item.id === value && "bg-accent/50"
                  )}
                  data-testid={testId ? `${testId}-item-${item.id}` : undefined}
                >
                  <Check className={cn("h-3 w-3 shrink-0", item.id === value ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 min-w-0">
                    {renderItem ? renderItem(item) : (
                      <span className="flex flex-col items-start">
                        <span className="truncate">{item.name}</span>
                        {(item.code || item.subtitle) && (
                          <span className="text-xs text-muted-foreground truncate">
                            {[item.code, item.subtitle].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
