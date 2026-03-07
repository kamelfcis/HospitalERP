import { useChartOfAccounts } from "./chart-of-accounts/hooks/useChartOfAccounts";
import { AccountsToolbar } from "./chart-of-accounts/components/AccountsToolbar";
import { AccountsTree } from "./chart-of-accounts/components/AccountsTree";
import { AccountDialog } from "./chart-of-accounts/components/AccountDialog";
import { Skeleton } from "@/components/ui/skeleton";

export default function ChartOfAccounts() {
  const {
    accounts,
    isLoading,
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    isDialogOpen,
    setIsDialogOpen,
    editingAccount,
    formData,
    setFormData,
    flatTree,
    expandedAccounts,
    isExporting,
    isImporting,
    fileInputRef,
    handleOpenDialog,
    handleSubmit,
    toggleExpanded,
    handleExport,
    handleImport,
    handleDelete,
  } = useChartOfAccounts();

  if (isLoading) {
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <AccountsToolbar
        accountsCount={accounts?.length || 0}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterType={filterType}
        setFilterType={setFilterType}
        isExporting={isExporting}
        isImporting={isImporting}
        fileInputRef={fileInputRef}
        handleExport={handleExport}
        handleImport={handleImport}
        handleOpenDialog={handleOpenDialog}
      />

      <AccountsTree
        flatTree={flatTree}
        expandedAccounts={expandedAccounts}
        toggleExpanded={toggleExpanded}
        handleOpenDialog={handleOpenDialog}
        handleDelete={handleDelete}
      />

      <AccountDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editingAccount={editingAccount}
        formData={formData}
        setFormData={setFormData}
        accounts={accounts}
        handleSubmit={handleSubmit}
      />
    </div>
  );
}
