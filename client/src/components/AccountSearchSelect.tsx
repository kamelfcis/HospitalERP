import { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Account } from "@shared/schema";

interface AccountSearchSelectProps {
  accounts: Account[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

export function AccountSearchSelect({
  accounts,
  value,
  onChange,
  placeholder = "ابحث عن الحساب...",
  disabled = false,
  "data-testid": testId,
}: AccountSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = accounts.find((a) => a.id === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Pattern matching function supporting % wildcard
  const matchesPattern = (text: string, pattern: string): boolean => {
    if (!pattern) return true;
    
    const lowerText = text.toLowerCase();
    const lowerPattern = pattern.toLowerCase();
    
    // If pattern contains %, treat it as a wildcard search
    if (lowerPattern.includes("%")) {
      // Split by % and check if all parts exist in order
      const parts = lowerPattern.split("%").filter(p => p.length > 0);
      
      let lastIndex = 0;
      for (const part of parts) {
        const index = lowerText.indexOf(part, lastIndex);
        if (index === -1) return false;
        lastIndex = index + part.length;
      }
      return true;
    }
    
    // Regular substring search
    return lowerText.includes(lowerPattern);
  };

  // Filter accounts based on search query
  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) {
      return accounts.filter(a => a.isActive);
    }

    return accounts.filter((account) => {
      if (!account.isActive) return false;
      
      // Search in code and name
      const searchText = `${account.code} ${account.name}`;
      return matchesPattern(searchText, searchQuery);
    });
  }, [accounts, searchQuery]);

  const handleSelect = (accountId: string) => {
    onChange(accountId);
    setSearchQuery("");
    setIsOpen(false);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    if (!isOpen) setIsOpen(true);
  };

  return (
    <div ref={containerRef} className="relative" data-testid={testId}>
      <div
        className={cn(
          "flex items-center border rounded-md bg-background",
          isOpen && "ring-2 ring-ring ring-offset-2",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <div className="flex items-center px-3 text-muted-foreground">
          <Search className="h-4 w-4" />
        </div>
        <Input
          ref={inputRef}
          type="text"
          value={isOpen ? searchQuery : (selectedAccount ? `${selectedAccount.code} - ${selectedAccount.name}` : "")}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          data-testid={testId ? `${testId}-input` : undefined}
        />
        <div className="flex items-center px-3 text-muted-foreground">
          <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg">
          {/* Search hint */}
          <div className="px-3 py-2 text-xs text-muted-foreground border-b bg-muted/30">
            <span>استخدم % للبحث المتقدم (مثال: مصروف%رواتب)</span>
          </div>
          
          <ScrollArea className="max-h-[300px]">
            {filteredAccounts.length === 0 ? (
              <div className="px-3 py-4 text-center text-muted-foreground">
                لا توجد نتائج
              </div>
            ) : (
              <div className="py-1">
                {filteredAccounts.map((account) => (
                  <div
                    key={account.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent",
                      value === account.id && "bg-accent"
                    )}
                    onClick={() => handleSelect(account.id)}
                    data-testid={testId ? `${testId}-option-${account.code}` : undefined}
                  >
                    <div className="flex-1 flex items-center gap-2">
                      <span className="font-mono text-sm text-muted-foreground w-16">
                        {account.code}
                      </span>
                      <span className="text-sm">{account.name}</span>
                      {account.accountType && (
                        <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                          {account.accountType === "asset" && "أصول"}
                          {account.accountType === "liability" && "خصوم"}
                          {account.accountType === "equity" && "ملكية"}
                          {account.accountType === "revenue" && "إيرادات"}
                          {account.accountType === "expense" && "مصروفات"}
                        </span>
                      )}
                    </div>
                    {value === account.id && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
