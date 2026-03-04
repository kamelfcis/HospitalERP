import type { Item } from "@shared/schema";

export interface SalesLineLocal {
  tempId: string;
  itemId: string;
  item: Item | null;
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
  }[];
}
