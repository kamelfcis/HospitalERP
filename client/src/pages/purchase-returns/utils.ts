// VAT base = (qty + bonusQty) × cost  [mirrors purchase invoice formula]
// subtotal  =  qty             × cost  [only paid units]
export function computeLine(
  qty: number, unitCost: number, vatRate: number,
  isFreeItem: boolean, bonusQty: number = 0
) {
  const cost     = isFreeItem ? 0 : unitCost;
  const subtotal = Math.round(qty * cost * 100) / 100;
  const vatBase  = (qty + bonusQty) * cost;
  const vatAmt   = Math.round(vatBase * vatRate / 100 * 100) / 100;
  return { subtotal, vatAmount: vatAmt, lineTotal: subtotal + vatAmt };
}
