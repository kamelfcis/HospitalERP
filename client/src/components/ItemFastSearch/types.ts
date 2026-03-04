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
}

export interface ItemSelectedPayload {
  item: FastSearchItem;
  batch: BatchOption | null;
  availableQtyMinor: string;
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
}

export type SearchMode = "AR" | "EN" | "CODE" | "BARCODE";

export interface FastSearchResponse {
  items: FastSearchItem[];
  total: number;
  page: number;
  pageSize: number;
}
