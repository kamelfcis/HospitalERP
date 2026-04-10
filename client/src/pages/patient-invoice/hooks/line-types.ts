/**
 * line-types.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Type definitions خاصة بـ useLineManagement.
 * مفصولة لتسهيل الاستيراد في أي hook أو component يحتاجها.
 */
import type { ItemUnitConfig } from "../utils/units";

export interface FefoAllocation {
  allocatedQty: string;
  lotId?: string | null;
  expiryMonth?: number | string | null;
  expiryYear?: number | string | null;
  lotSalePrice?: string | null;
}

export interface ServiceSearchResult {
  id: string;
  nameAr?: string | null;
  name?: string | null;
  code?: string | null;
  basePrice?: string | null;
  requiresDoctor?: boolean | null;
  requiresNurse?: boolean | null;
  serviceType?: string | null;
  businessClassification?: string | null;
}

export interface ItemSearchResult extends ItemUnitConfig {
  id: string;
  nameAr?: string | null;
  itemCode?: string | null;
  hasExpiry?: boolean | null;
  allowOversell?: boolean | null;
  availableQtyMinor?: string | number | null;
  salePriceCurrent?: string | number | null;
  purchasePriceLast?: string | number | null;
  businessClassification?: string | null;
}

/** شكل البيانات الخام القادمة من API قبل التحويل إلى LineLocal */
export interface RawInvoiceLine {
  lineType: string;
  serviceId?: string | null;
  itemId?: string | null;
  description?: string | null;
  doctorName?: string | null;
  nurseName?: string | null;
  quantity?: string | null;
  unitPrice?: string | null;
  discountPercent?: string | null;
  discountAmount?: string | null;
  totalPrice?: string | null;
  notes?: string | null;
  sortOrder?: number | null;
  unitLevel?: string | null;
  itemData?: ItemSearchResult | null;
  item?: ItemSearchResult | null;
  priceSource?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  lotId?: string | null;
  expiryMonth?: number | string | null;
  expiryYear?: number | string | null;
  businessClassification?: string | null;
  service?: {
    requiresDoctor?: boolean | null;
    requiresNurse?: boolean | null;
    serviceType?: string | null;
    businessClassification?: string | null;
  } | null;
  line?: {
    lotId?: string | null;
    expiryMonth?: number | string | null;
    expiryYear?: number | string | null;
    priceSource?: string | null;
  } | null;
  requiresDoctor?: boolean | null;
  requiresNurse?: boolean | null;
}
