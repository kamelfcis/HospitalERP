import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Package, 
  Save, 
  X, 
  ArrowRight, 
  AlertTriangle, 
  Loader2 
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ItemFormFields from "./ItemFormFields";
import ItemStatsPanel from "./ItemStatsPanel";
import ItemCardDialogs from "./ItemCardDialogs";
import ItemConsumablesPanel from "./ItemConsumablesPanel";
import { useItemCard } from "./hooks/useItemCard";

export default function ItemCard() {
  const {
    isNew,
    itemId,
    isEditing,
    setIsEditing,
    item,
    isLoading,
    formTypes,
    uoms,
    lastPurchases,
    avgSales,
    salesPeriod,
    setSalesPeriod,
    purchaseFromDate,
    setPurchaseFromDate,
    formData,
    setFormData,
    validationErrors,
    setValidationErrors,
    uniquenessResult,
    showFormTypeDialog,
    setShowFormTypeDialog,
    newFormTypeName,
    setNewFormTypeName,
    showDeptPriceDialog,
    setShowDeptPriceDialog,
    selectedDeptPrice,
    setSelectedDeptPrice,
    newDeptPrice,
    setNewDeptPrice,
    showBarcodeDialog,
    setShowBarcodeDialog,
    newBarcodeValue,
    setNewBarcodeValue,
    newBarcodeType,
    setNewBarcodeType,
    showUomDialog,
    setShowUomDialog,
    newUomCode,
    setNewUomCode,
    newUomNameAr,
    setNewUomNameAr,
    newUomNameEn,
    setNewUomNameEn,
    handleSave,
    saveMutation,
    createFormTypeMutation,
    handleSaveDeptPrice,
    createDeptPriceMutation,
    updateDeptPriceMutation,
    deleteDeptPriceMutation,
    handleAddBarcode,
    addBarcodeMutation,
    deleteBarcodeMutation,
    expirySettingMutation,
    createUomMutation,
    handleOpenDeptPriceDialog,
    isService,
    isExpiryLocked,
    activeBarcodes,
    hasMediumUnit,
    hasMinorUnit,
    departmentPrices,
    availableDepartments,
    navigate,
  } = useItemCard();

  if (isLoading && !isNew) {
    return (
      <div className="h-full flex items-center justify-center">
        <Skeleton className="h-[400px] w-full max-w-4xl" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="peachtree-toolbar flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            {isNew ? "إضافة صنف جديد" : "كارت الصنف"}
          </span>
          {!isNew && (
            <>
              <span className="text-muted-foreground">|</span>
              <span className="font-mono text-sm font-bold text-primary">{item?.itemCode}</span>
              <span className="font-semibold text-sm">{item?.nameAr}</span>
              {item?.isToxic && (
                <Badge variant="destructive" className="text-[10px] gap-0.5 h-5">
                  <AlertTriangle className="h-3 w-3" />
                  سموم
                </Badge>
              )}
              {!item?.isActive && (
                <Badge variant="outline" className="text-[10px] h-5 bg-red-50 text-red-700">موقوف</Badge>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-[11px] gap-1 px-2"
                onClick={() => isNew ? navigate("/items") : setIsEditing(false)}
                data-testid="button-cancel"
              >
                <X className="h-3 w-3" />
                إلغاء
              </Button>
              <Button
                size="sm"
                className="text-[11px] gap-1 px-2"
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save"
              >
                {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                حفظ
              </Button>
            </>
          ) : (
            <Button size="sm" className="text-[11px] px-2" onClick={() => { setIsEditing(true); setValidationErrors({}); }} data-testid="button-edit">
              تعديل
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-[11px] gap-1 px-2" onClick={() => navigate("/items")} data-testid="button-back">
            <ArrowRight className="h-3 w-3" />
            رجوع
          </Button>
        </div>
      </div>

      <div className="flex-1 p-2 overflow-auto">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-8 flex flex-col gap-2">
            <ItemFormFields
              formData={formData}
              setFormData={setFormData}
              isEditing={isEditing}
              isNew={isNew}
              validationErrors={validationErrors}
              uniquenessResult={uniquenessResult}
              formTypes={formTypes}
              uoms={uoms}
              item={item}
              isService={isService}
              hasMediumUnit={hasMediumUnit}
              hasMinorUnit={hasMinorUnit}
              isExpiryLocked={isExpiryLocked}
              activeBarcodes={activeBarcodes}
              itemId={itemId}
              hasTransactions={(item as any)?.hasTransactions === true}
              setShowFormTypeDialog={setShowFormTypeDialog}
              setShowUomDialog={setShowUomDialog}
              setShowBarcodeDialog={setShowBarcodeDialog}
              onExpiryToggle={(checked) => expirySettingMutation.mutate(checked)}
              expiryPending={expirySettingMutation.isPending}
              onDeleteBarcode={(id) => deleteBarcodeMutation.mutate(id)}
              deletingBarcode={deleteBarcodeMutation.isPending}
            />
            {isService && !isNew && itemId && (
              <ItemConsumablesPanel
                itemId={itemId}
                isEditing={isEditing}
              />
            )}
          </div>

          <ItemStatsPanel
            item={item}
            isNew={isNew}
            lastPurchases={lastPurchases}
            avgSales={avgSales}
            salesPeriod={salesPeriod}
            setSalesPeriod={setSalesPeriod}
            purchaseFromDate={purchaseFromDate}
            setPurchaseFromDate={setPurchaseFromDate}
            departmentPrices={departmentPrices}
            availableDepartments={availableDepartments}
            handleOpenDeptPriceDialog={handleOpenDeptPriceDialog}
            onDeleteDeptPrice={(id) => deleteDeptPriceMutation.mutate(id)}
            deletingDeptPrice={deleteDeptPriceMutation.isPending}
          />
        </div>
      </div>

      <ItemCardDialogs
        showFormTypeDialog={showFormTypeDialog}
        setShowFormTypeDialog={setShowFormTypeDialog}
        newFormTypeName={newFormTypeName}
        setNewFormTypeName={setNewFormTypeName}
        createFormTypeMutation={createFormTypeMutation}
        showDeptPriceDialog={showDeptPriceDialog}
        setShowDeptPriceDialog={setShowDeptPriceDialog}
        selectedDeptPrice={selectedDeptPrice}
        setSelectedDeptPrice={setSelectedDeptPrice}
        newDeptPrice={newDeptPrice}
        setNewDeptPrice={setNewDeptPrice}
        handleSaveDeptPrice={handleSaveDeptPrice}
        createDeptPriceMutation={createDeptPriceMutation}
        updateDeptPriceMutation={updateDeptPriceMutation}
        availableDepartments={availableDepartments}
        item={item}
        showBarcodeDialog={showBarcodeDialog}
        setShowBarcodeDialog={setShowBarcodeDialog}
        newBarcodeValue={newBarcodeValue}
        setNewBarcodeValue={setNewBarcodeValue}
        newBarcodeType={newBarcodeType}
        setNewBarcodeType={setNewBarcodeType}
        handleAddBarcode={handleAddBarcode}
        addBarcodeMutation={addBarcodeMutation}
        showUomDialog={showUomDialog}
        setShowUomDialog={setShowUomDialog}
        newUomCode={newUomCode}
        setNewUomCode={setNewUomCode}
        newUomNameAr={newUomNameAr}
        setNewUomNameAr={setNewUomNameAr}
        newUomNameEn={newUomNameEn}
        setNewUomNameEn={setNewUomNameEn}
        createUomMutation={createUomMutation}
      />
    </div>
  );
}
