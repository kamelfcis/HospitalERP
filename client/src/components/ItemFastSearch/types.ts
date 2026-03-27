export interface FastSearchItem {
  id: string;
  itemCode: string;
  nameAr: string;
  nameEn: string | null;
  category: string;
  salePriceCurrent: string;
  majorUnitName: string | null;
  mediumUnitName: string | null;
  minorUnitName: string | null;
  majorToMedium: string | null;
  majorToMinor: string | null;
  mediumToMinor: string | null;
  hasExpiry: boolean;
  availableQtyMinor: string;
}

export interface BatchOption {
  expiryDate: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  qtyAvailableMinor: string;
  lotSalePrice?: string;
  /** true عندما تحتوي نفس دفعة الصلاحية على دُفعات بأسعار مختلفة */
  hasPriceConflict?: boolean;
}

export interface ItemSelectedPayload {
  item: FastSearchItem;
  batch: BatchOption | null;
  availableQtyMinor: string;
  /** جميع دُفعات الصلاحية المتاحة — مجلوبة مسبقاً من ItemFastSearch بدون API call إضافي */
  allBatches: BatchOption[];
}

export interface ItemFastSearchProps {
  open: boolean;
  onClose: () => void;
  warehouseId: string;
  invoiceDate?: string;
  onItemSelected: (payload: ItemSelectedPayload) => void;
  excludeServices?: boolean;
  drugsOnly?: boolean;
  title?: string;
  /** وضع الاستلام — يُخفي تلوين الأصناف منعدمة الرصيد (الاستلام مش بيع) */
  hideStockWarning?: boolean;
}

export type SearchMode = "AR" | "EN" | "CODE" | "BARCODE";

export interface FastSearchResponse {
  items: FastSearchItem[];
  total: number;
  page: number;
  pageSize: number;
}
