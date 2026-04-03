import type { Item } from "@shared/schema";

export type SalesLineType = "item" | "service" | "consumable";

export interface SalesLineLocal {
  tempId: string;
  lineType?: SalesLineType;
  itemId: string;
  item: Item | null;
  serviceId?: string;
  serviceNameAr?: string;
  unitLevel: string;
  qty: number;
  salePrice: number;
  baseSalePrice: number;
  lineTotal: number;
  expiryMonth: number | null;
  expiryYear: number | null;
  lotId: string | null;
  fefoLocked: boolean;
  priceSource?: string;
  availableQtyMinor?: string;
  expiryOptions?: {
    expiryMonth: number;
    expiryYear: number;
    qtyAvailableMinor: string;
    lotId?: string;
    lotSalePrice?: string;
    hasPriceConflict?: boolean;
  }[];
}
