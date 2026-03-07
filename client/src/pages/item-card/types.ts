import type { Item, ItemFormType } from "@shared/schema";

export interface ItemWithFormType extends Item {
  formType?: ItemFormType;
}

export interface AvgSalesResponse {
  avgPrice: string;
  totalQty: string;
  invoiceCount: number;
}
