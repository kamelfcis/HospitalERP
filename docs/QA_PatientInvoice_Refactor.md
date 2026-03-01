# QA Checklist — PatientInvoice Refactor Safety

Run this checklist manually before and after any structural refactor of `PatientInvoice.tsx`.
All items must pass before merging.

---

## 1. Create New Invoice

- [ ] Navigate to `/patient-invoices`
- [ ] Page loads with an empty draft form (invoice number pre-filled from server)
- [ ] Patient name field is required — saving without it shows a validation toast
- [ ] Changing patient type (general / VIP / insurance) reflects correctly in form state

---

## 2. Service Line — Totals

- [ ] Add a service line (type = service): fill description, quantity, unit price
- [ ] Discount percent applied → `discountAmount` recomputes: `qty × price × (pct/100)`
- [ ] Discount amount applied → `discountPercent` back-calculates from amount
- [ ] `totalPrice = qty × unitPrice − discountAmount` shown correctly in each row
- [ ] Footer totals (subtotal / discount / net / paid / remaining) update live
- [ ] Server-side totals: save and reload invoice; compare server-returned `netAmount` to displayed footer net — must be equal

---

## 3. Drug Line — Unit Conversion & Fractional Qty

- [ ] Add a drug line (type = drug), select an item
- [ ] Unit selector shows major / medium / minor (حبة / علبة / شريط etc.)
- [ ] Switching unit recalculates `unitPrice` using the item's conversion factor
- [ ] Enter `qty = 0.5` (fractional < 1) → `totalPrice = 0.5 × unitPrice` (no rounding error)
- [ ] Enter `qty = 2.25` → price correct to 2 decimal places

---

## 4. FEFO Preview — handleQtyConfirm

- [ ] Select a drug item that has multiple batches in stock
- [ ] Enter a quantity that spans more than one batch
- [ ] FEFO preview popup appears listing batch splits (earliest expiry first)
- [ ] Confirm → lines are split: one row per batch with correct qty and `lotId`
- [ ] Total qty of split lines equals originally entered qty exactly
- [ ] Cancelling FEFO preview leaves the original single line unchanged

---

## 5. Discount — Percent vs Amount

- [ ] On a line with `unitPrice = 100` and `qty = 3`:
  - Set `discountPercent = 10` → `discountAmount = 30`, `totalPrice = 270`
  - Clear percent, set `discountAmount = 45` → `discountPercent = 15`, `totalPrice = 255`
- [ ] Discount cannot exceed line total (no negative totalPrice)
- [ ] Line-level discount sums to footer discount total

---

## 6. Payments Tab

- [ ] Switch to Payments tab
- [ ] Add a cash payment of 100 → `paid` increases, `remaining` decreases
- [ ] Add a second payment (card) of 50 → totals update correctly
- [ ] Remove the second payment → back to single payment state
- [ ] Overpayment (paid > net) → remaining shows negative value (credit)
- [ ] Payment method dropdown includes: cash / card / bank transfer / insurance

---

## 7. Save & Reload

- [ ] Save invoice (POST `/api/patient-invoices`)
- [ ] invoiceId appears in URL / state
- [ ] Reload page or navigate to same invoice via registry
- [ ] All lines present with original qty, price, discount, doctor
- [ ] All payments present with original amounts and methods
- [ ] Totals identical to pre-save values
- [ ] Status badge shows "مسودة"

---

## 8. Finalize — Idempotency

- [ ] Click "اعتماد" → status changes to "نهائي"
- [ ] Form fields are disabled / locked
- [ ] Click finalize button again (force re-submit) → returns 200 with same invoice (no duplicate)
- [ ] No duplicate journal entries created (check GL if mappings configured)
- [ ] Status badge shows "نهائي" (green)

---

## 9. Doctor Transfer Panel (Phase 7)

- [ ] Panel is hidden on draft invoices
- [ ] Panel appears below invoice on finalized invoices
- [ ] "تحويل للطبيب" button opens form panel
- [ ] Default amount = net_amount (first transfer)
- [ ] Fill doctor name and amount → click "تأكيد التحويل" → confirm Sheet opens
- [ ] confirmUUID generated on Sheet open (new UUID each time Sheet opens fresh)
- [ ] Submit → toast success, transfer listed in table below
- [ ] Second transfer: default amount = net_amount − already_transferred
- [ ] Attempting to transfer more than remaining → 400 error toast

---

## 10. Distribution Dialog

- [ ] On draft invoice with lines, click "توزيع على حالات"
- [ ] Dialog opens with patient/admission search
- [ ] Search returns matching admissions
- [ ] Select an admission and distribute → lines copied to target invoice
- [ ] Close dialog without selecting → original invoice unchanged
- [ ] Distribution is idempotent (re-distributing to same admission returns existing)

---

## 11. Stats Popup (Inventory)

- [ ] On a drug line, click the stock stats icon
- [ ] Popup opens showing batch list with qty and expiry per warehouse
- [ ] Popup closes on X or backdrop click
- [ ] Works with items that have zero stock (shows empty state, no crash)

---

## 12. Admissions Tab

- [ ] Switch to "إقامة" tab
- [ ] "إنشاء إقامة" form opens
- [ ] Create admission → appears in list
- [ ] Discharge admission → status changes to "تم الخروج"
- [ ] Consolidate invoices → consolidated amounts shown
- [ ] Print admission report → print area rendered (check DOM, not actual print)

---

## 13. Registry Tab

- [ ] Switch to "سجل المرضى" tab
- [ ] Filter by date range → list updates
- [ ] Filter by status (draft / finalized / cancelled) → correct records shown
- [ ] Search by patient name → matching rows returned
- [ ] Pagination: next/prev page works
- [ ] Click on a registry row → loads that invoice into the invoice tab

---

## 14. Auto-Save

- [ ] Add lines to a new draft; wait 15 seconds without clicking Save
- [ ] Invoice is silently saved (no toast, but invoiceId appears in state)
- [ ] Reload confirms auto-saved data is present

---

## 15. Cancel / Delete

- [ ] Delete button on draft invoice → confirm dialog appears
- [ ] Confirm delete → invoice removed, form resets
- [ ] Finalized invoice has no delete button (guarded server-side too)

---

*Last updated: Phase 9 refactor safety pass*
