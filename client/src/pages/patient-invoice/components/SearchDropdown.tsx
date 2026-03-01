import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

export interface SearchDropdownItem {
  id: string;
  primary: string;
  secondary?: string;
  raw?: any;
}

interface SearchDropdownProps {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  onFocus?: () => void;
  show: boolean;
  setShow: (v: boolean) => void;
  loading?: boolean;
  items: SearchDropdownItem[];
  onSelect: (item: SearchDropdownItem) => void;
  placeholder?: string;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  dropdownRef?: React.RefObject<HTMLDivElement>;
  inputClassName?: string;
  dropdownWidth?: string;
  inputTestId?: string;
  dropdownTestId?: string;
  itemTestIdPrefix?: string;
  showSearchIcon?: boolean;
  renderItem?: (item: SearchDropdownItem) => React.ReactNode;
}

export function SearchDropdown({
  value,
  onChange,
  onClear,
  onFocus,
  show,
  setShow,
  loading = false,
  items,
  onSelect,
  placeholder,
  disabled,
  inputRef,
  dropdownRef,
  inputClassName,
  dropdownWidth,
  inputTestId,
  dropdownTestId,
  itemTestIdPrefix,
  showSearchIcon = false,
  renderItem,
}: SearchDropdownProps) {
  return (
    <div className="relative">
      {showSearchIcon && (
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
      )}
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShow(true);
        }}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClear();
            setShow(false);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={`${showSearchIcon ? "pr-8" : ""} ${inputClassName || ""}`}
        data-testid={inputTestId}
      />
      {show && (loading || items.length > 0) && (
        <div
          ref={dropdownRef}
          className={`absolute top-full right-0 mt-1 border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto bg-popover ${dropdownWidth || "w-full"}`}
          data-testid={dropdownTestId}
        >
          {loading && (
            <div className="flex items-center justify-center gap-2 p-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>جاري البحث...</span>
            </div>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className="px-3 py-1.5 text-xs cursor-pointer hover-elevate flex flex-row-reverse items-center justify-between gap-2 border-b last:border-b-0"
              onClick={() => {
                onSelect(item);
                setShow(false);
              }}
              data-testid={itemTestIdPrefix ? `${itemTestIdPrefix}-${item.id}` : undefined}
            >
              {renderItem ? (
                renderItem(item)
              ) : (
                <>
                  <span className="font-medium truncate">{item.primary}</span>
                  {item.secondary && (
                    <span className="text-muted-foreground whitespace-nowrap">{item.secondary}</span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
