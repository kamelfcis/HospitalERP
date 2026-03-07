import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Upload, Download, Filter, Loader2 } from "lucide-react";

interface AccountsToolbarProps {
  accountsCount: number;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterType: string;
  setFilterType: (type: string) => void;
  isExporting: boolean;
  isImporting: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleExport: () => void;
  handleImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleOpenDialog: () => void;
}

export function AccountsToolbar({
  accountsCount,
  searchQuery,
  setSearchQuery,
  filterType,
  setFilterType,
  isExporting,
  isImporting,
  fileInputRef,
  handleExport,
  handleImport,
  handleOpenDialog,
}: AccountsToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="peachtree-toolbar flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-foreground">دليل الحسابات</h1>
          <span className="text-xs text-muted-foreground">
            ({accountsCount} حساب)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".xlsx,.xls"
            className="hidden"
            data-testid="input-file-import-accounts"
          />
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 text-xs px-2" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            data-testid="button-import-accounts"
          >
            {isImporting ? <Loader2 className="h-3 w-3 ml-1 animate-spin" /> : <Upload className="h-3 w-3 ml-1" />}
            استيراد
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 text-xs px-2" 
            onClick={handleExport}
            disabled={isExporting}
            data-testid="button-export-accounts"
          >
            {isExporting ? <Loader2 className="h-3 w-3 ml-1 animate-spin" /> : <Download className="h-3 w-3 ml-1" />}
            تصدير
          </Button>
          <Button size="sm" className="h-7 text-xs px-2" onClick={() => handleOpenDialog()} data-testid="button-add-account">
            <Plus className="h-3 w-3 ml-1" />
            حساب جديد
          </Button>
        </div>
      </div>

      <div className="peachtree-toolbar flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-[300px]">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="بحث برقم أو اسم الحساب..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="peachtree-input pr-7 text-xs h-7"
            data-testid="input-search-accounts"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="peachtree-select w-[140px] text-xs" data-testid="select-account-type-filter">
            <Filter className="h-3 w-3 ml-1" />
            <SelectValue placeholder="نوع الحساب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">جميع الأنواع</SelectItem>
            <SelectItem value="asset" className="text-xs">أصول</SelectItem>
            <SelectItem value="liability" className="text-xs">خصوم</SelectItem>
            <SelectItem value="equity" className="text-xs">حقوق ملكية</SelectItem>
            <SelectItem value="revenue" className="text-xs">إيرادات</SelectItem>
            <SelectItem value="expense" className="text-xs">مصروفات</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
