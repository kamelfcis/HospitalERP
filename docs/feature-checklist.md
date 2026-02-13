# New Feature Checklist - Hospital GL System

Every new financial or inventory feature must follow these steps.
Check each item before submitting for review.

---

## 1. Schema (shared/schema.ts)
- [ ] Define table with proper types (varchar IDs with UUID default, timestamps)
- [ ] Create insert schema with `createInsertSchema().omit({ id: true, ... })`
- [ ] Export insert type `z.infer<typeof insertSchema>`
- [ ] Export select type `typeof table.$inferSelect`
- [ ] Add `status` field if document has lifecycle (draft → posted → cancelled)
- [ ] Run `npm run db:push` to sync database

## 2. Storage (server/storage.ts)
- [ ] Add CRUD methods to `IStorage` interface
- [ ] Implement in `DatabaseStorage` class
- [ ] Use `db.transaction()` for multi-table writes
- [ ] Use `FOR UPDATE` locks for inventory/balance operations
- [ ] Use `roundMoney()` / `roundQty()` from `server/finance-helpers.ts` for all financial calculations
- [ ] Call `assertPeriodOpen()` before any posting/approval/finalization
- [ ] Call `createAuditLog()` for all sensitive operations (post, cancel, finalize, collect, refund)
- [ ] Use `isLotExpired()`, `validateBatchExpiry()`, `validateUnitConversion()` from `server/inventory-helpers.ts` for stock movements
- [ ] Add idempotency guard (check status before state transition)

## 3. Routes (server/routes.ts)
- [ ] Use `asyncHandler()` wrapper from `server/route-helpers.ts` for all handlers
- [ ] Use `validateBody()` from `server/route-helpers.ts` for request validation
- [ ] Use `requireParam()` for path parameters
- [ ] Use `getQueryFlag()` for boolean query parameters (e.g., `includeCancelled`)
- [ ] Call storage/service methods only — NO direct `db.*` calls in routes
- [ ] Use `apiError()` from `server/errors.ts` for explicit error responses
- [ ] Correct HTTP codes: 400 validation, 403 fiscal/forbidden, 404 not found, 409 conflict
- [ ] Exclude cancelled documents from list endpoints by default
- [ ] Add `formattedNumber` via `addFormattedNumber()` / `addFormattedNumbers()`

## 4. Frontend Page (client/src/pages/)
- [ ] Use `apiRequest()` or `apiRequestJson()` from `@/lib/queryClient` — NO direct `fetch()`
- [ ] Use `useApiMutation()` from `@/hooks/use-api-mutation` for all mutations
- [ ] Use `useQuery()` with proper `queryKey` arrays for cache management
- [ ] Show loading states with `isLoading` / `isPending`
- [ ] Add `data-testid` attributes to all interactive and data-display elements
- [ ] Arabic RTL text and labels throughout
- [ ] Handle toast messages (automatic via `useApiMutation`)

## 5. Tests (tests/)
- [ ] Copy `tests/templates/fiscal-period-403.template.test.ts` for fiscal period enforcement
- [ ] Copy `tests/templates/conflict-409.template.test.ts` for immutability enforcement
- [ ] Use helpers from `tests/helpers.ts` for test data creation
- [ ] Test happy path (create, read, update, post)
- [ ] Test fiscal period closed → 403
- [ ] Test double-post / modify-posted → 409
- [ ] Test cancelled document exclusion from list
- [ ] Run `npx vitest run` to verify all tests pass

## 6. Lint Check
- [ ] Run `npm run lint` and fix all errors
- [ ] No direct `fetch()` in client files
- [ ] No `db.*` imports in route files
- [ ] Financial math uses `roundMoney()` / `roundQty()`

## 7. Register Route
- [ ] Add route in `registerRoutes()` function in `server/routes.ts`
- [ ] Add page route in `client/src/App.tsx`
- [ ] Add sidebar navigation entry if applicable

---

## Quick Reference - Error Codes

| Code | Status | Arabic Message Constant | When |
|------|--------|------------------------|------|
| 400  | Bad Request | Various validation | Invalid input |
| 403  | Forbidden | `PERIOD_CLOSED` | Fiscal period closed |
| 404  | Not Found | `NOT_FOUND` | Record doesn't exist |
| 409  | Conflict | `ALREADY_POSTED` / `ALREADY_COLLECTED` | Immutability violation |

## Quick Reference - Imports

```typescript
// Routes
import { asyncHandler, validateBody, requireParam, getQueryFlag, auditLog, assertOpenFiscalPeriod } from "./route-helpers";
import { apiError, ErrorMessages } from "./errors";

// Storage/Service
import { roundMoney, roundQty, parseMoney, sumMoney } from "./finance-helpers";
import { isLotExpired, validateBatchExpiry, convertQtyToMinor, validateUnitConversion } from "./inventory-helpers";

// Frontend
import { useApiMutation } from "@/hooks/use-api-mutation";
import { apiRequest, apiRequestJson } from "@/lib/queryClient";
```
