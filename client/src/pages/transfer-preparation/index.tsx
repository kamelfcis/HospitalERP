import { useCallback, useRef } from "react";
import { PrepContext } from "./context";
import { useSetup } from "./hooks/useSetup";
import { useLines } from "./hooks/useLines";
import { useTransferCreation } from "./hooks/useTransferCreation";
import { SetupForm } from "./components/SetupForm";
import { FilterBar } from "./components/FilterBar";
import { PrepTable } from "./components/PrepTable";
import { ActionFooter } from "./components/ActionFooter";

export default function TransferPreparation() {
  const linesHook = useLines();
  const setupHook = useSetup(linesHook.loadItems);

  const visibleLinesRef = useRef(linesHook.visibleLines);
  visibleLinesRef.current = linesHook.visibleLines;
  const getVisibleLines = useCallback(() => visibleLinesRef.current, []);

  const { handleCreateTransfer, isCreating } = useTransferCreation(
    setupHook.sourceWarehouseId,
    setupHook.destWarehouseId,
    getVisibleLines,
  );

  const ctx = {
    ...setupHook,
    ...linesHook,
    handleCreateTransfer,
    isCreating,
  };

  return (
    <PrepContext.Provider value={ctx}>
      <div className="p-4 space-y-4" dir="rtl" data-testid="page-transfer-preparation">
        <h1 className="text-xl font-bold" data-testid="text-page-title">إعداد إذن تحويل</h1>
        <SetupForm />
        {setupHook.queried && (
          <>
            <FilterBar />
            <PrepTable />
            {linesHook.visibleLines.length > 0 && <ActionFooter />}
          </>
        )}
      </div>
    </PrepContext.Provider>
  );
}
