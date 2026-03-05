import { usePreparationData } from "./hooks/usePreparationData";
import { SetupForm } from "./components/SetupForm";
import { FilterBar } from "./components/FilterBar";
import { PrepTable } from "./components/PrepTable";
import { ActionFooter } from "./components/ActionFooter";

export default function TransferPreparation() {
  const d = usePreparationData();

  return (
    <div className="p-4 space-y-4" dir="rtl" data-testid="page-transfer-preparation">
      <h1 className="text-xl font-bold" data-testid="text-page-title">إعداد إذن تحويل</h1>

      <SetupForm
        sourceWarehouseId={d.sourceWarehouseId}
        setSourceWarehouseId={d.setSourceWarehouseId}
        destWarehouseId={d.destWarehouseId}
        setDestWarehouseId={d.setDestWarehouseId}
        dateFrom={d.dateFrom}
        setDateFrom={d.setDateFrom}
        dateTo={d.dateTo}
        setDateTo={d.setDateTo}
        warehouses={d.warehouses}
        queryEnabled={d.queryEnabled}
        isFetching={d.isFetching}
        onQuery={d.handleQuery}
      />

      {d.queried && (
        <>
          <FilterBar
            excludeCovered={d.excludeCovered}
            setExcludeCovered={d.setExcludeCovered}
            bulkField={d.bulkField}
            setBulkField={d.setBulkField}
            bulkOp={d.bulkOp}
            setBulkOp={d.setBulkOp}
            bulkThreshold={d.bulkThreshold}
            setBulkThreshold={d.setBulkThreshold}
            onBulkExclude={d.handleBulkExclude}
            onResetExclusions={d.handleResetExclusions}
            onFillSuggested={d.handleFillSuggested}
            excludedCount={d.excludedCount}
            totalItems={d.totalItems}
            visibleCount={d.visibleLines.length}
            linesWithQty={d.linesWithQty}
          />

          <PrepTable
            visibleLines={d.visibleLines}
            linesCount={d.lines.length}
            sortSourceAsc={d.sortSourceAsc}
            setSortSourceAsc={d.setSortSourceAsc}
            sortDestAsc={d.sortDestAsc}
            setSortDestAsc={d.setSortDestAsc}
            onQtyChange={d.handleQtyChange}
            onExcludeItem={d.handleExcludeItem}
          />

          {d.visibleLines.length > 0 && (
            <ActionFooter
              sourceName={d.sourceName}
              destName={d.destName}
              linesWithQty={d.linesWithQty}
              isCreating={d.isCreating}
              onCreateTransfer={d.handleCreateTransfer}
            />
          )}
        </>
      )}
    </div>
  );
}
