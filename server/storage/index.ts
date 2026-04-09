/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Storage Layer — طبقة تخزين البيانات (Barrel / Index)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 *  This barrel file defines the IStorage interface contract and the
 *  DatabaseStorage class skeleton.  Method implementations live in
 *  domain-specific files under server/storage/:
 *
 *  FILE                        | المجال
 *  ────────────────────────────┼────────────────────────
 *  users-storage.ts            | المستخدمون والصلاحيات
 *  finance-storage.ts          | المحاسبة والمالية
 *  items-storage.ts            | الأصناف والمخازن
 *  transfers-storage.ts        | تحويلات المخازن
 *  purchasing-storage.ts       | الموردون والمشتريات
 *  services-storage.ts         | الخدمات وقوائم الأسعار
 *  sales-invoices-storage.ts   | فواتير المبيعات
 *  patient-invoices-storage.ts | فواتير المرضى والمرتجعات
 *  cashier-storage.ts          | الكاشير وكلمات سر الأدراج
 *  patients-doctors-storage.ts | المرضى والأطباء والإقامات
 *  bedboard-stay-storage.ts    | لوحة الأسرة ومحرك الإقامة
 *  treasuries-storage.ts       | تحويلات وتسويات الأطباء والخزن
 *  clinic-storage.ts           | العيادات الخارجية
 *
 *  Each domain file exports a default object of methods.
 *  Methods are merged onto DatabaseStorage.prototype below.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import {
  type User,
  type InsertUser,
  type Account,
  type InsertAccount,
  type CostCenter,
  type InsertCostCenter,
  type FiscalPeriod,
  type InsertFiscalPeriod,
  type JournalEntry,
  type InsertJournalEntry,
  type JournalLine,
  type InsertJournalLine,
  type JournalTemplate,
  type InsertJournalTemplate,
  type TemplateLine,
  type InsertTemplateLine,
  type AuditLog,
  type InsertAuditLog,
  type JournalEntryWithLines,
  type Item,
  type InsertItem,
  type ItemFormType,
  type InsertItemFormType,
  type ItemUom,
  type InsertItemUom,
  type ItemWithFormType,
  type PurchaseTransaction,
  type Department,
  type InsertDepartment,
  type ItemDepartmentPrice,
  type InsertItemDepartmentPrice,
  type ItemDepartmentPriceWithDepartment,
  type InventoryLot,
  type InsertInventoryLot,
  type InventoryLotMovement,
  type InsertInventoryLotMovement,
  type ItemBarcode,
  type InsertItemBarcode,
  type Warehouse,
  type InsertWarehouse,
  type StoreTransfer,
  type InsertStoreTransfer,
  type StoreTransferWithDetails,
  type TransferLine,
  type InsertTransferLine,
  type TransferLineAllocation,
  type InsertTransferLineAllocation,
  type TransferLineWithItem,
  type Supplier,
  type InsertSupplier,
  type ReceivingHeader,
  type InsertReceivingHeader,
  type ReceivingHeaderWithDetails,
  type ReceivingLine,
  type InsertReceivingLine,
  type ReceivingLineWithItem,
  type Service,
  type InsertService,
  type ServiceWithDepartment,
  type PriceList,
  type InsertPriceList,
  type PriceListItem,
  type PriceListItemWithService,
  type ServiceConsumable,
  type ServiceConsumableWithItem,
  type SalesInvoiceHeader,
  type SalesInvoiceLine,
  type SalesInvoiceWithDetails,
  type SalesInvoiceLineWithItem,
  type PatientInvoiceHeader,
  type PatientInvoiceLine,
  type PatientInvoicePayment,
  type PatientInvoiceWithDetails,
  type CashierShift,
  type CashierReceipt,
  type CashierRefundReceipt,
  type Pharmacy,
  type InsertPharmacy,
  type Patient,
  type PatientSearchResult,
  type InsertPatient,
  type Doctor,
  type InsertDoctor,
  type Admission,
  type InsertAdmission,
  type AccountMapping,
  type InsertAccountMapping,
  type RolePermission,
  type PermissionGroup,
  type GroupPermission,
  type InsertPermissionGroup,
  type StockMovementHeader,
  type StockMovementAllocation,
  type StaySegment,
  type Floor,
  type Room,
  type Bed,
  type DoctorTransfer,
  type DoctorSettlement,
  type DoctorSettlementAllocation,
  type SurgeryType,
  type SurgeryCategoryPrice,
  type InsertSurgeryType,
  type Treasury,
  type InsertTreasury,
  type TreasuryTransaction,
  type InsertSalesInvoiceLine,
  type PurchaseInvoiceHeader,
} from "@shared/schema";

export interface DeptServiceOrderInput {
  patientName: string;
  patientPhone?: string;
  patientId?: string;
  doctorId?: string;
  doctorName?: string;
  departmentId: string;
  orderType: 'cash' | 'contract';
  contractName?: string;
  treasuryId?: string;
  services: Array<{
    serviceId: string;
    serviceName: string;
    quantity: number;
    unitPrice: number;
  }>;
  discountPercent?: number;
  discountAmount?: number;
  notes?: string;
  userId: string;
  clinicOrderIds?: string[];
  /** UUID حر يربط هذه الفاتورة بمجموعة زيارة (nullable — لا FK الآن) */
  visitGroupId?: string;
  visitId?: string;
}

export interface DeptServiceBatchInput {
  patients: Array<{ patientName: string; patientPhone?: string }>;
  doctorId?: string;
  doctorName?: string;
  departmentId: string;
  orderType: 'cash' | 'contract';
  contractName?: string;
  treasuryId?: string;
  services: Array<{
    serviceId: string;
    serviceName: string;
    quantity: number;
    unitPrice: number;
  }>;
  discountPercent?: number;
  discountAmount?: number;
  notes?: string;
  userId: string;
}

export interface IStorage {
  // Users & RBAC
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  getUsers(): Promise<User[]>;
  getUserEffectivePermissions(userId: string): Promise<string[]>;
  getRolePermissions(role: string): Promise<RolePermission[]>;
  setRolePermissions(role: string, permissions: string[]): Promise<void>;

  // Permission Groups
  getPermissionGroups(): Promise<import("./permission-groups-storage").PermissionGroupWithStats[]>;
  getPermissionGroup(id: string): Promise<import("./permission-groups-storage").PermissionGroupDetail | null>;
  createPermissionGroup(data: { name: string; description?: string; sortOrder?: number }): Promise<PermissionGroup>;
  updatePermissionGroup(id: string, data: { name?: string; description?: string }): Promise<PermissionGroup>;
  deletePermissionGroup(id: string): Promise<void>;
  setGroupPermissions(groupId: string, permissions: string[]): Promise<void>;
  assignUserToGroup(userId: string, groupId: string | null): Promise<void>;
  
  // Accounts
  getAccounts(): Promise<Account[]>;
  getAccount(id: string): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: string, account: Partial<InsertAccount>): Promise<Account | undefined>;
  deleteAccount(id: string): Promise<boolean>;
  
  // Cost Centers
  getCostCenters(): Promise<CostCenter[]>;
  getCostCenter(id: string): Promise<CostCenter | undefined>;
  createCostCenter(costCenter: InsertCostCenter): Promise<CostCenter>;
  updateCostCenter(id: string, costCenter: Partial<InsertCostCenter>): Promise<CostCenter | undefined>;
  deleteCostCenter(id: string): Promise<boolean>;
  
  // Fiscal Periods
  getFiscalPeriods(): Promise<FiscalPeriod[]>;
  getFiscalPeriod(id: string): Promise<FiscalPeriod | undefined>;
  getCurrentPeriod(): Promise<FiscalPeriod | undefined>;
  assertPeriodOpen(dateStr: string): Promise<void>;
  createFiscalPeriod(period: InsertFiscalPeriod): Promise<FiscalPeriod>;
  closeFiscalPeriod(id: string, userId: string | null): Promise<FiscalPeriod | undefined>;
  reopenFiscalPeriod(id: string): Promise<FiscalPeriod | undefined>;
  
  // Journal Entries
  getJournalEntries(): Promise<JournalEntry[]>;
  getJournalEntriesPaginated(filters: {
    page?: number;
    pageSize?: number;
    status?: string;
    sourceType?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }): Promise<{ data: JournalEntry[]; total: number }>;
  getJournalEntry(id: string): Promise<JournalEntryWithLines | undefined>;
  getNextEntryNumber(): Promise<number>;
  createJournalEntry(entry: InsertJournalEntry, lines: InsertJournalLine[]): Promise<JournalEntry>;
  updateJournalEntry(id: string, entry: Partial<InsertJournalEntry>, lines?: InsertJournalLine[]): Promise<JournalEntry | undefined>;
  postJournalEntry(id: string, userId: string | null): Promise<JournalEntry | undefined>;
  reverseJournalEntry(id: string, userId: string | null): Promise<JournalEntry | undefined>;
  deleteJournalEntry(id: string): Promise<boolean>;
  
  // Journal Templates
  getTemplates(): Promise<JournalTemplate[]>;
  getTemplate(id: string): Promise<JournalTemplate | undefined>;
  getTemplateWithLines(id: string): Promise<(JournalTemplate & { lines: TemplateLine[] }) | undefined>;
  createTemplate(template: InsertJournalTemplate): Promise<JournalTemplate>;
  createTemplateWithLines(template: InsertJournalTemplate, lines: InsertTemplateLine[]): Promise<JournalTemplate>;
  updateTemplate(id: string, template: Partial<InsertJournalTemplate>): Promise<JournalTemplate | undefined>;
  updateTemplateWithLines(id: string, template: Partial<InsertJournalTemplate>, lines: InsertTemplateLine[]): Promise<JournalTemplate | undefined>;
  deleteTemplate(id: string): Promise<boolean>;
  getTemplateLines(templateId: string): Promise<TemplateLine[]>;
  
  // Audit Log
  getAuditLogs(): Promise<AuditLog[]>;
  getAuditLogsPaginated(filters: { page: number; pageSize: number; tableName?: string; action?: string; dateFrom?: string; dateTo?: string }): Promise<{ data: AuditLog[]; total: number }>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  
  // Reports
  getDashboardStats(): Promise<Record<string, unknown>>;
  getTrialBalance(asOfDate: string): Promise<Record<string, unknown>>;
  getIncomeStatement(startDate: string, endDate: string): Promise<Record<string, unknown>>;
  getBalanceSheet(asOfDate: string): Promise<Record<string, unknown>>;
  getCostCenterReport(startDate: string, endDate: string, costCenterId?: string): Promise<Record<string, unknown>>;
  getAccountLedger(accountId: string, startDate: string, endDate: string): Promise<Record<string, unknown>>;

  // Items
  getItems(params: { page?: number; limit?: number; search?: string; category?: string; isToxic?: boolean; formTypeId?: string; isActive?: boolean; minPrice?: number; maxPrice?: number }): Promise<{ items: Item[]; total: number }>;
  getItem(id: string): Promise<ItemWithFormType | undefined>;
  getItemsByIds(ids: string[]): Promise<Map<string, Item>>;
  createItem(item: InsertItem): Promise<Item>;
  updateItem(id: string, item: Partial<InsertItem>): Promise<Item | undefined>;
  deleteItem(id: string): Promise<boolean>;
  checkItemUniqueness(code?: string, nameAr?: string, nameEn?: string, excludeId?: string): Promise<{ codeUnique: boolean; nameArUnique: boolean; nameEnUnique: boolean }>;

  // Item Form Types
  getItemFormTypes(): Promise<ItemFormType[]>;
  createItemFormType(formType: InsertItemFormType): Promise<ItemFormType>;

  // Item UOMs
  getItemUoms(): Promise<ItemUom[]>;
  createItemUom(data: InsertItemUom): Promise<ItemUom>;

  // Purchase & Sales Transactions
  getLastPurchases(itemId: string, limit?: number, fromDate?: string): Promise<PurchaseTransaction[]>;
  getAverageSales(itemId: string, startDate: string, endDate: string): Promise<{ avgPrice: string; totalQty: string; invoiceCount: number }>;

  // Departments
  getDepartments(): Promise<Department[]>;
  getDepartment(id: string): Promise<Department | undefined>;
  createDepartment(dept: InsertDepartment): Promise<Department>;
  updateDepartment(id: string, dept: Partial<InsertDepartment>): Promise<Department | undefined>;
  deleteDepartment(id: string): Promise<boolean>;

  // Item Department Prices
  getItemDepartmentPrices(itemId: string): Promise<ItemDepartmentPriceWithDepartment[]>;
  createItemDepartmentPrice(price: InsertItemDepartmentPrice): Promise<ItemDepartmentPrice>;
  updateItemDepartmentPrice(id: string, price: Partial<InsertItemDepartmentPrice>): Promise<ItemDepartmentPrice | undefined>;
  deleteItemDepartmentPrice(id: string): Promise<boolean>;
  getItemPriceForDepartment(itemId: string, departmentId: string): Promise<string | null>;

  // Inventory Lots
  getLots(itemId: string): Promise<InventoryLot[]>;
  getLot(lotId: string): Promise<InventoryLot | undefined>;
  createLot(lot: InsertInventoryLot): Promise<InventoryLot>;

  // FEFO Preview
  getFefoPreview(itemId: string, requiredQty: number, asOfDate: string): Promise<{ allocations: Array<{ lotId: string; expiryDate: string | null; availableQty: string; allocatedQty: string }>; fulfilled: boolean; shortfall: string }>;

  // Item Barcodes
  getItemBarcodes(itemId: string): Promise<ItemBarcode[]>;
  createItemBarcode(barcode: InsertItemBarcode): Promise<ItemBarcode>;
  deactivateBarcode(barcodeId: string): Promise<ItemBarcode | undefined>;
  resolveBarcode(barcodeValue: string): Promise<{ found: boolean; itemId?: string; itemCode?: string; nameAr?: string } | null>;

  // Warehouses
  getWarehouses(): Promise<Warehouse[]>;
  getWarehouse(id: string): Promise<Warehouse | undefined>;
  createWarehouse(wh: InsertWarehouse): Promise<Warehouse>;
  updateWarehouse(id: string, wh: Partial<InsertWarehouse>): Promise<Warehouse | undefined>;
  deleteWarehouse(id: string): Promise<boolean>;

  // User-Department assignments
  getUserDepartments(userId: string): Promise<Department[]>;
  setUserDepartments(userId: string, departmentIds: string[]): Promise<void>;

  // User-Warehouse assignments
  getUserWarehouses(userId: string): Promise<Warehouse[]>;
  setUserWarehouses(userId: string, warehouseIds: string[]): Promise<void>;

  // User-Clinic assignments
  getUserClinics(userId: string): Promise<string[]>;
  setUserClinics(userId: string, clinicIds: string[]): Promise<void>;

  // User-Account scope
  getUserAccountScope(userId: string): Promise<string[]>;
  setUserAccountScope(userId: string, accountIds: string[], actorUserId: string): Promise<void>;
  getVisibleAccountIds(userId: string): Promise<string[] | null>;

  // نطاق الوحدات التشغيلية للمستخدم (يشمل الكاشير وغير الكاشير)
  getUserOperationalScope(userId: string): Promise<{ isFullAccess: boolean; allowedPharmacyIds: string[]; allowedDepartmentIds: string[]; allowedClinicIds: string[] }>;

  // Store Transfers
  getTransfers(): Promise<StoreTransferWithDetails[]>;
  getTransfersFiltered(params: {
    fromDate?: string;
    toDate?: string;
    sourceWarehouseId?: string;
    destWarehouseId?: string;
    status?: string;
    search?: string;
    page: number;
    pageSize: number;
    includeCancelled?: boolean;
  }): Promise<{data: StoreTransferWithDetails[]; total: number}>;
  getTransfer(id: string): Promise<StoreTransferWithDetails | undefined>;
  createDraftTransfer(header: InsertStoreTransfer, lines: { itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; selectedExpiryDate?: string; expiryMonth?: number; expiryYear?: number; availableAtSaveMinor?: string; notes?: string }[]): Promise<StoreTransfer>;
  updateDraftTransfer(transferId: string, header: Partial<InsertStoreTransfer>, lines: { itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; selectedExpiryDate?: string; expiryMonth?: number; expiryYear?: number; availableAtSaveMinor?: string; notes?: string }[]): Promise<StoreTransfer>;
  postTransfer(transferId: string): Promise<StoreTransfer>;
  deleteTransfer(id: string, reason?: string): Promise<boolean>;
  getWarehouseFefoPreview(itemId: string, warehouseId: string, requiredQty: number, asOfDate: string): Promise<Record<string, unknown>>;
  getItemAvailability(itemId: string, warehouseId: string): Promise<string>;
  searchItemsForTransfer(query: string, warehouseId: string, limit?: number): Promise<Record<string, unknown>[]>;
  getExpiryOptions(itemId: string, warehouseId: string, asOfDate: string): Promise<{expiryDate: string; expiryMonth: number | null; expiryYear: number | null; qtyAvailableMinor: string; lotSalePrice?: string; hasPriceConflict?: boolean}[]>;
  searchItemsAdvanced(params: {
    mode: 'AR' | 'EN' | 'CODE' | 'BARCODE';
    query: string;
    warehouseId: string;
    page: number;
    pageSize: number;
    includeZeroStock: boolean;
    drugsOnly: boolean;
    excludeServices?: boolean;
    minPrice?: number;
    maxPrice?: number;
  }): Promise<{items: Record<string, unknown>[]; total: number}>;

  searchItemsByPattern(query: string, limit: number): Promise<Record<string, unknown>[]>;

  // Suppliers
  getSuppliers(params: { search?: string; page: number; pageSize: number; supplierType?: string; isActive?: boolean | null; sortBy?: "nameAr" | "currentBalance"; sortDir?: "asc" | "desc" }): Promise<{ suppliers: (Supplier & { currentBalance: string })[]; total: number }>;
  searchSuppliers(q: string, limit?: number): Promise<Pick<Supplier, 'id' | 'code' | 'nameAr' | 'nameEn' | 'phone'>[]>;
  getSupplier(id: string): Promise<Supplier | undefined>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined>;

  // Receiving
  getReceivings(params: { supplierId?: string; warehouseId?: string; status?: string; statusFilter?: string; fromDate?: string; toDate?: string; search?: string; page: number; pageSize: number; includeCancelled?: boolean }): Promise<{ data: ReceivingHeaderWithDetails[]; total: number; totalCostSum: string }>;
  getReceiving(id: string): Promise<ReceivingHeaderWithDetails | undefined>;
  getNextReceivingNumber(): Promise<number>;
  checkSupplierInvoiceUnique(supplierId: string, supplierInvoiceNo: string, excludeId?: string): Promise<boolean>;
  saveDraftReceiving(header: InsertReceivingHeader, lines: { itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; purchasePrice: string; lineTotal: string; batchNumber?: string; expiryDate?: string; expiryMonth?: number; expiryYear?: number; salePrice?: string; salePriceHint?: string; notes?: string; isRejected?: boolean; rejectionReason?: string; bonusQty?: string; bonusQtyInMinor?: string }[], existingId?: string): Promise<ReceivingHeader>;
  postReceiving(id: string): Promise<ReceivingHeader>;
  editPostedReceiving(id: string, newLines: { itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; purchasePrice: string; lineTotal: string; batchNumber?: string; expiryDate?: string; expiryMonth?: number; expiryYear?: number; salePrice?: string; salePriceHint?: string; notes?: string; isRejected?: boolean; rejectionReason?: string; bonusQty?: string; bonusQtyInMinor?: string }[]): Promise<ReceivingHeader>;
  deleteReceiving(id: string, reason?: string): Promise<boolean>;
  getItemHints(itemId: string, supplierId: string, warehouseId: string): Promise<{ lastPurchasePrice: string | null; lastSalePrice: string | null; currentSalePrice: string; onHandMinor: string }>;
  getItemWarehouseStats(itemId: string): Promise<{ warehouseId: string; warehouseName: string; warehouseCode: string; qtyMinor: string; expiryBreakdown: { expiryMonth: number | null; expiryYear: number | null; qty: string }[] }[]>;

  convertReceivingToInvoice(receivingId: string): Promise<Record<string, unknown>>;
  getNextPurchaseInvoiceNumber(): Promise<number>;
  getPurchaseInvoices(filters: Record<string, unknown> & { includeCancelled?: boolean }): Promise<{data: Record<string, unknown>[]; total: number}>;
  getPurchaseInvoice(id: string): Promise<Record<string, unknown>>;
  savePurchaseInvoice(invoiceId: string, lines: Record<string, unknown>[], headerUpdates?: Record<string, unknown>): Promise<Record<string, unknown>>;
  approvePurchaseInvoice(id: string): Promise<Record<string, unknown>>;
  deletePurchaseInvoice(id: string, reason?: string): Promise<boolean>;

  // Service Consumables
  getServiceConsumables(serviceId: string): Promise<ServiceConsumableWithItem[]>;
  replaceServiceConsumables(serviceId: string, lines: { itemId: string; quantity: string; unitLevel: string; notes?: string | null }[]): Promise<ServiceConsumable[]>;

  // Sales Invoices
  getNextSalesInvoiceNumber(): Promise<number>;
  getSalesInvoices(filters: { status?: string; dateFrom?: string; dateTo?: string; customerType?: string; claimStatus?: string; search?: string; pharmacistId?: string; warehouseId?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: Record<string, unknown>[]; total: number; totals: { subtotal: number; discountValue: number; netTotal: number }}>;
  getSalesInvoice(id: string): Promise<SalesInvoiceWithDetails | undefined>;
  createSalesInvoice(header: Record<string, unknown>, lines: Record<string, unknown>[]): Promise<SalesInvoiceHeader>;
  updateSalesInvoice(id: string, header: Record<string, unknown>, lines: Record<string, unknown>[]): Promise<SalesInvoiceHeader>;
  finalizeSalesInvoice(id: string): Promise<SalesInvoiceHeader>;
  deleteSalesInvoice(id: string, reason?: string): Promise<boolean>;

  // Patient Invoices
  getNextPatientInvoiceNumber(): Promise<number>;
  getNextPaymentRefNumber(offset?: number): Promise<string>;
  getPatientInvoices(filters: { status?: string; dateFrom?: string; dateTo?: string; patientName?: string; doctorName?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: Record<string, unknown>[]; total: number}>;
  getPatientInvoice(id: string): Promise<PatientInvoiceWithDetails | undefined>;
  createPatientInvoice(header: Record<string, unknown>, lines: Record<string, unknown>[], payments: Record<string, unknown>[]): Promise<PatientInvoiceHeader>;
  updatePatientInvoice(id: string, header: Record<string, unknown>, lines: Record<string, unknown>[], payments: Record<string, unknown>[], expectedVersion?: number): Promise<PatientInvoiceHeader>;
  finalizePatientInvoice(id: string, expectedVersion?: number, oversellReason?: string): Promise<PatientInvoiceHeader>;
  buildPatientInvoiceGLLines(header: PatientInvoiceHeader, lines: PatientInvoiceLine[]): { lineType: string; amount: string }[];
  deletePatientInvoice(id: string, reason?: string): Promise<boolean>;
  distributePatientInvoice(sourceId: string, patients: { name: string; phone?: string }[]): Promise<PatientInvoiceHeader[]>;
  distributePatientInvoiceDirect(data: {
    patients: { name: string; phone?: string }[];
    lines: Record<string, unknown>[];
    invoiceDate: string;
    departmentId?: string | null;
    warehouseId?: string | null;
    doctorName?: string | null;
    patientType?: string;
    contractName?: string | null;
    notes?: string | null;
  }): Promise<PatientInvoiceHeader[]>;

  // Pharmacies
  getPharmacies(): Promise<Pharmacy[]>;
  getPharmacy(id: string): Promise<Pharmacy | undefined>;
  createPharmacy(data: InsertPharmacy): Promise<Pharmacy>;
  updatePharmacy(id: string, data: Partial<InsertPharmacy>): Promise<Pharmacy>;

  // Drawer Passwords
  setDrawerPassword(glAccountId: string, passwordHash: string): Promise<void>;
  getDrawerPassword(glAccountId: string): Promise<string | null>;
  removeDrawerPassword(glAccountId: string): Promise<boolean>;
  getDrawersWithPasswordStatus(): Promise<{ glAccountId: string; hasPassword: boolean; code: string; name: string }[]>;

  // Cashier
  openCashierShift(cashierId: string, cashierName: string, openingCash: string, unitType: string, pharmacyId?: string | null, departmentId?: string | null, glAccountId?: string | null): Promise<Record<string, unknown>>;
  getActiveShift(cashierId: string, unitType: string, unitId: string): Promise<Record<string, unknown>>;
  getMyOpenShift(cashierId: string): Promise<Record<string, unknown> | null>;
  getMyOpenShifts(cashierId: string): Promise<Record<string, unknown>[]>;
  getUserCashierGlAccount(userId: string): Promise<{ glAccountId: string; code: string; name: string; hasPassword: boolean } | null>;
  getShiftById(shiftId: string): Promise<import("@shared/schema").CashierShift | null>;
  closeCashierShift(shiftId: string, closingCash: string, closedByUserId: string, closedByName: string, isSupervisorOverride?: boolean, journalContext?: import("./cashier-storage").ShiftJournalContext): Promise<Record<string, unknown>>;
  preflightShiftClose(shiftId: string, closingCash: string | number): Promise<{ cashierGlAccountId: string; cashierId: string; cashierName: string; businessDate: string; expectedCash: number; variance: number; periodId: string; custodianAccountId: string; varianceAccountId: string | null }>;
  validateShiftClose(shiftId: string): Promise<{ canClose: boolean; pendingCount: number; hasOtherOpenShift: boolean; otherShift: Record<string, unknown> | null; reasonCode: string; isStale: boolean; hoursOpen: number }>;
    getPendingDocCountForUnit(shift: import("@shared/schema").CashierShift): Promise<number>;
    findOtherOpenShiftForUnit(currentShiftId: string, shift: import("@shared/schema").CashierShift): Promise<import("@shared/schema").CashierShift | null>;
  getPendingSalesInvoices(unitType: string, unitId: string, search?: string): Promise<Record<string, unknown>[]>;
  getPendingReturnInvoices(unitType: string, unitId: string, search?: string): Promise<Record<string, unknown>[]>;
  getSalesInvoiceDetails(invoiceId: string): Promise<Record<string, unknown>>;
  collectInvoices(shiftId: string, invoiceIds: string[], collectedBy: string, paymentDate?: string): Promise<Record<string, unknown>>;
  refundInvoices(shiftId: string, invoiceIds: string[], refundedBy: string, paymentDate?: string): Promise<Record<string, unknown>>;
  getShiftTotals(shiftId: string): Promise<{ totalCollected: string; totalRefunded: string; collectCount: number; refundCount: number; openingCash: string; netCash: string; hoursOpen: number; isStale: boolean }>;
  getNextCashierReceiptNumber(): Promise<number>;
  getNextCashierRefundReceiptNumber(): Promise<number>;
  markReceiptPrinted(receiptId: string, printedBy: string, reprintReason?: string): Promise<Record<string, unknown>>;
  markRefundReceiptPrinted(receiptId: string, printedBy: string, reprintReason?: string): Promise<Record<string, unknown>>;
  getCashierReceipt(receiptId: string): Promise<Record<string, unknown>>;
  getCashierRefundReceipt(receiptId: string): Promise<Record<string, unknown>>;
  generateShiftCloseJournal(params: {
    shiftId: string;
    cashierGlAccountId: string;
    cashierId: string;
    cashierName: string;
    closingCash: number;
    expectedCash: number;
    businessDate: string;
  }): Promise<{ journalId: string }>;

  // Patients
  getPatients(limit?: number): Promise<Patient[]>;
  searchPatients(search: string): Promise<PatientSearchResult[]>;
  getPatientStats(filters?: { search?: string; dateFrom?: string; dateTo?: string; deptIds?: string[]; page?: number; pageSize?: number }): Promise<{ rows: Record<string, unknown>[]; total: number; page: number; pageSize: number }>;
  getPatient(id: string): Promise<Patient | undefined>;
  getPatientJourney(patientId: string): Promise<Record<string, unknown> | null>;
  getPatientTimeline(patientId: string): Promise<Record<string, unknown> | null>;
  getPatientInquiry(
    filters: { adminDeptFilter?: string | null; clinicId?: string | null; dateFrom?: string | null; dateTo?: string | null; search?: string | null },
    forcedDeptIds: string[] | null,
  ): Promise<{ rows: Record<string, unknown>[]; count: number; limit: number; hasMore: boolean }>;
  getPatientInquiryLines(
    patientKey: { patientId?: string | null; patientName?: string | null },
    forcedDeptIds: string[] | null,
    lineType?: string | null,
  ): Promise<Record<string, unknown>[]>;
  getPatientPreviousConsultations(patientId: string, limit?: number, allowedClinicIds?: string[] | null, offset?: number, excludeAppointmentId?: string | null): Promise<{ data: Array<Record<string, unknown>>; hasMore: boolean }>;
  checkPatientInScope(patientId: string, forcedDeptIds: string[] | null): Promise<boolean>;
  checkInvoiceInScope(invoiceId: string, forcedDeptIds: string[] | null): Promise<boolean>;
  checkPatientDuplicateCandidates(
    input: { fullName?: string | null; phone?: string | null; nationalId?: string | null; age?: number | null },
    excludePatientId?: string,
  ): Promise<import("../services/patient-dedup").DuplicateCheckResult>;
  getPatientMergeImpact(masterPatientId: string, duplicatePatientId: string): Promise<{
    masterPatient: Record<string, unknown>;
    duplicatePatient: Record<string, unknown>;
    invoiceCount: number;
    admissionCount: number;
    appointmentCount: number;
  }>;
  mergePatients(masterPatientId: string, duplicatePatientId: string, reason: string, userId: string): Promise<void>;
  getPatientDuplicateCandidatesList(limit?: number): Promise<Array<{
    patientA: Record<string, unknown>;
    patientB: Record<string, unknown>;
    matchReason: string;
    score: number;
  }>>;
  createPatient(data: InsertPatient): Promise<Patient>;
  updatePatient(id: string, data: Partial<InsertPatient>): Promise<Patient>;
  deletePatient(id: string): Promise<boolean>;

  // Doctors
  getDoctors(includeInactive?: boolean): Promise<Doctor[]>;
  searchDoctors(search: string): Promise<Doctor[]>;
  getDoctor(id: string): Promise<Doctor | undefined>;
  createDoctor(data: InsertDoctor): Promise<Doctor>;
  updateDoctor(id: string, data: Partial<InsertDoctor>): Promise<Doctor>;
  deleteDoctor(id: string): Promise<boolean>;
  getDoctorBalances(): Promise<{ id: string; name: string; specialty: string | null; totalTransferred: string; totalSettled: string; remaining: string }[]>;
  getDoctorStatement(params: { doctorName: string; dateFrom?: string; dateTo?: string }): Promise<Record<string, unknown>[]>;

  // Admissions
  getAdmissions(filters?: { status?: string; search?: string; dateFrom?: string; dateTo?: string; deptId?: string; page?: number; pageSize?: number }): Promise<any[] | { data: any[]; total: number; page: number; pageSize: number }>;
  getAdmission(id: string): Promise<Admission | undefined>;
  createAdmission(data: InsertAdmission): Promise<Admission>;
  updateAdmission(id: string, data: Partial<InsertAdmission>): Promise<Admission>;
  dischargeAdmission(id: string): Promise<Admission>;
  getAdmissionInvoices(admissionId: string): Promise<PatientInvoiceHeader[]>;
  consolidateAdmissionInvoices(admissionId: string): Promise<PatientInvoiceHeader>;
  /** تجميع فواتير الأقسام حسب مجموعة الزيارة (visit_group_id) */
  consolidateVisitGroupInvoices(visitGroupId: string): Promise<PatientInvoiceHeader>;
  /** كل فواتير مجموعة الزيارة (مجمعة وغير مجمعة) */
  getVisitGroupInvoices(visitGroupId: string): Promise<PatientInvoiceHeader[]>;
  // Stay Engine
  getStaySegments(admissionId: string): Promise<StaySegment[]>;
  openStaySegment(params: { admissionId: string; serviceId?: string; invoiceId: string; notes?: string }): Promise<StaySegment>;
  closeStaySegment(segmentId: string): Promise<StaySegment>;
  transferStaySegment(params: { admissionId: string; oldSegmentId: string; newServiceId?: string; newInvoiceId: string; notes?: string }): Promise<StaySegment>;
  accrueStayLines(): Promise<{ segmentsProcessed: number; linesUpserted: number }>;
  // Surgery Types
  getSurgeryTypes(search?: string): Promise<SurgeryType[]>;
  createSurgeryType(data: InsertSurgeryType): Promise<SurgeryType>;
  updateSurgeryType(id: string, data: Partial<InsertSurgeryType>): Promise<SurgeryType>;
  deleteSurgeryType(id: string): Promise<void>;
  getSurgeryCategoryPrices(): Promise<SurgeryCategoryPrice[]>;
  upsertSurgeryCategoryPrice(category: string, price: string): Promise<SurgeryCategoryPrice>;
  updateInvoiceSurgeryType(invoiceId: string, surgeryTypeId: string | null): Promise<void>;
  // Bed Board
  getBedBoard(): Promise<Array<Floor & { rooms: Array<Room & { beds: Array<Bed & { patientName?: string; admissionNumber?: string }> }> }>>;
  getAvailableBeds(): Promise<Array<Bed & { roomNameAr: string; floorNameAr: string }>>;
  admitPatientToBed(params: { bedId: string; patientName: string; patientPhone?: string; patientId?: string; departmentId?: string; serviceId?: string; doctorName?: string; notes?: string; paymentType?: string; insuranceCompany?: string; surgeryTypeId?: string }): Promise<{ bed: Bed; admissionId: string; invoiceId: string; segmentId?: string }>;
  transferPatientBed(params: { sourceBedId: string; targetBedId: string; newServiceId?: string; newInvoiceId?: string }): Promise<{ sourceBed: Bed; targetBed: Bed }>;
  dischargeFromBed(bedId: string): Promise<{ bed: Bed }>;
  setBedStatus(bedId: string, status: string): Promise<Bed>;

  // Doctor Payable Transfers
  getDoctorTransfers(invoiceId: string): Promise<DoctorTransfer[]>;
  transferToDoctorPayable(params: { invoiceId: string; doctorName: string; amount: string; clientRequestId: string; notes?: string }): Promise<DoctorTransfer>;

  // Doctor Settlements
  getDoctorSettlements(params?: { doctorName?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }): Promise<{ data: (DoctorSettlement & { allocations: DoctorSettlementAllocation[] })[]; total: number; page: number; pageSize: number }>;
  getDoctorOutstandingTransfers(doctorName: string): Promise<(DoctorTransfer & { settled: string; remaining: string })[]>;
  createDoctorSettlement(params: { doctorName: string; paymentDate: string; amount: string; paymentMethod: string; settlementUuid: string; notes?: string; allocations?: { transferId: string; amount: string }[] }): Promise<DoctorSettlement & { allocations: DoctorSettlementAllocation[] }>;

  // Treasuries
  getTreasuriesSummary(): Promise<(Treasury & { glAccountCode: string; glAccountName: string; openingBalance: string; totalIn: string; totalOut: string; balance: string; hasPassword: boolean })[]>;
  getTreasuries(): Promise<(Treasury & { glAccountCode: string; glAccountName: string })[]>;
  getTreasury(id: string): Promise<Treasury | undefined>;
  createTreasury(data: InsertTreasury): Promise<Treasury>;
  updateTreasury(id: string, data: Partial<InsertTreasury>): Promise<Treasury>;
  deleteTreasury(id: string): Promise<boolean>;
  getUserTreasury(userId: string): Promise<(Treasury & { glAccountCode: string; glAccountName: string }) | null>;
  getAllUserTreasuries(): Promise<{ userId: string; treasuryId: string; treasuryName: string; userName: string }[]>;
  assignUserTreasury(userId: string, treasuryId: string): Promise<void>;
  removeUserTreasury(userId: string): Promise<void>;
  getTreasuryStatement(params: { treasuryId: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }): Promise<{ transactions: TreasuryTransaction[]; total: number; page: number; pageSize: number; totalIn: string; totalOut: string; balance: string; pageOpeningBalance: number }>;
  createTreasuryTransactionsForInvoice(invoiceId: string, finalizationDate: string): Promise<void>;

  // Account Mappings
  getAccountMappings(transactionType?: string): Promise<AccountMapping[]>;
  getAccountMapping(id: string): Promise<AccountMapping | undefined>;
  upsertAccountMapping(data: InsertAccountMapping): Promise<AccountMapping>;
  bulkUpsertAccountMappings(items: InsertAccountMapping[]): Promise<AccountMapping[]>;
  deleteAccountMapping(id: string): Promise<boolean>;
  getMappingsForTransaction(transactionType: string, warehouseId?: string | null, pharmacyId?: string | null): Promise<AccountMapping[]>;

  // Auto Journal Entry
  generateJournalEntry(params: {
    sourceType: string;
    sourceDocumentId: string;
    reference: string;
    description: string;
    entryDate: string;
    lines: { lineType: string; amount: string }[];
    periodId?: string;
    dynamicAccountOverrides?: Record<string, { debitAccountId?: string | null; creditAccountId?: string | null }>;
  }): Promise<JournalEntry | null>;
  batchPostJournalEntries(ids: string[], userId: string | null): Promise<{ posted: number; errors: string[] }>;

  // Chat
  getChatUsers(currentUserId: string): Promise<{ id: string; fullName: string; role: string; unreadCount: number; lastMessage: string | null; lastMessageAt: Date | null }[]>;
  getChatConversation(userAId: string, userBId: string, limit?: number): Promise<import("@shared/schema").ChatMessage[]>;
  sendChatMessage(senderId: string, receiverId: string, body: string): Promise<import("@shared/schema").ChatMessage>;
  markChatRead(senderId: string, currentUserId: string): Promise<void>;
  getChatUnreadCount(userId: string): Promise<number>;

  // Sales Returns
  searchSaleInvoicesForReturn(params: { invoiceNumber?: string; receiptBarcode?: string; itemBarcode?: string; itemCode?: string; itemId?: string; dateFrom?: string; dateTo?: string; warehouseId?: string; allowedWarehouseIds?: string[] }): Promise<Record<string, unknown>[]>;
  getSaleInvoiceForReturn(invoiceId: string): Promise<Record<string, unknown> | null>;
  createSalesReturn(data: { originalInvoiceId: string; warehouseId: string; returnLines: { originalLineId: string; itemId: string; unitLevel: string; qty: string; qtyInMinor: string; salePrice: string; lineTotal: string; expiryMonth: number | null; expiryYear: number | null; lotId: string | null }[]; discountType: string; discountPercent: string; discountValue: string; notes: string; createdBy: string }): Promise<Record<string, unknown>>;

  // ── موديول العيادات الخارجية ──────────────────────────────────────────
  // العيادات
  getClinics(userId: string, role: string): Promise<Record<string, unknown>[]>;
  getClinicById(id: string): Promise<Record<string, unknown> | null>;
  createClinic(data: { nameAr: string; departmentId?: string; defaultPharmacyId?: string; consultationServiceId?: string; treasuryId?: string; secretaryFeeType?: string; secretaryFeeValue?: number }): Promise<Record<string, unknown>>;
  updateClinic(id: string, data: Partial<{ nameAr: string; departmentId: string; defaultPharmacyId: string; consultationServiceId: string; secretaryFeeType: string; secretaryFeeValue: number; isActive: boolean }>): Promise<Record<string, unknown>>;
  getUserClinicIds(userId: string): Promise<string[]>;
  assignUserToClinic(userId: string, clinicId: string): Promise<void>;
  removeUserFromClinic(userId: string, clinicId: string): Promise<void>;

  // جداول الأطباء
  getDoctorSchedules(clinicId: string): Promise<Record<string, unknown>[]>;
  upsertDoctorSchedule(data: { clinicId: string; doctorId: string; weekday?: number | null; startTime?: string; endTime?: string; maxAppointments?: number }): Promise<Record<string, unknown>>;

  // الحجوزات
  getClinicAppointments(clinicId: string, date: string, filterDoctorId?: string | null): Promise<Record<string, unknown>[]>;
  createAppointment(data: { clinicId: string; doctorId: string; patientId?: string; patientName: string; patientPhone?: string; appointmentDate: string; appointmentTime?: string; notes?: string; createdBy?: string; paymentType?: string; insuranceCompany?: string; payerReference?: string; }): Promise<Record<string, unknown>>;
  getAppointmentClinicId(appointmentId: string): Promise<string | null>;
  updateAppointmentStatus(id: string, status: string): Promise<void>;
  cancelAndRefundAppointment(aptId: string, refundedBy: string, refundAmount?: number, cancelAppointment?: boolean, refundReason?: string): Promise<{ refundedAmount: string; patientName: string; isFullCancel: boolean }>;

  // الربط بالمستخدم/الطبيب
  getUserDoctorId(userId: string): Promise<string | null>;
  assignUserToDoctor(userId: string, doctorId: string): Promise<void>;
  removeUserDoctorAssignment(userId: string): Promise<void>;
  getUserAssignedDoctorId(userId: string): Promise<string | null>;

  // الكشف والروشتة
  getConsultationByAppointment(appointmentId: string): Promise<Record<string, unknown> | null>;
  saveConsultation(data: { appointmentId: string; chiefComplaint?: string; diagnosis?: string; notes?: string; createdBy?: string; drugs: { lineNo: number; itemId?: string | null; drugName: string; dose?: string; frequency?: string; duration?: string; notes?: string; unitLevel?: string; quantity?: number; unitPrice?: number }[]; serviceOrders: { serviceId?: string | null; serviceNameManual?: string; unitPrice?: number; targetId?: string; targetName?: string }[] }): Promise<Record<string, unknown>>;

  // الأدوية المفضلة
  getDoctorFavoriteDrugs(doctorId: string, clinicId?: string | null): Promise<Record<string, unknown>[]>;
  addFavoriteDrug(data: { doctorId: string; clinicId?: string | null; itemId?: string | null; drugName: string; defaultDose?: string; defaultFrequency?: string; defaultDuration?: string }): Promise<Record<string, unknown>>;
  removeFavoriteDrug(id: string, doctorId?: string): Promise<void>;
  getFrequentDrugsNotInFavorites(doctorId: string, minCount?: number, clinicId?: string | null): Promise<Record<string, unknown>[]>;

  // الأوامر الطبية
  getClinicOrders(filters: { targetType?: string; status?: string; targetId?: string; doctorId?: string; clinicIds?: string[] }): Promise<Record<string, unknown>[]>;
  getClinicOrder(id: string): Promise<Record<string, unknown> | null>;
  executeClinicOrder(orderId: string, userId: string): Promise<{ invoiceId: string }>;
  cancelClinicOrder(orderId: string): Promise<void>;
  getAppointmentOrderTracking(appointmentId: string): Promise<{
    totalService: number;
    executedService: number;
    pendingService: number;
    totalPharmacy: number;
    executedPharmacy: number;
    pendingPharmacy: number;
    orders: Array<Record<string, unknown>>;
  }>;

  // تاريخ زيارات المريض النقدي بحثاً بالاسم (بدون patient_id)
  getConsultationsByPatientName(patientName: string, limit?: number, offset?: number, excludeAppointmentId?: string | null, clinicIds?: string[] | null): Promise<{ data: Array<Record<string, unknown>>; hasMore: boolean }>;

  // العرض المجمّع لأوامر الطبيب (قراءة فقط)
  getGroupedClinicOrders(filters: { targetType?: string; status?: string; targetId?: string; doctorId?: string; clinicIds?: string[] }): Promise<Array<Record<string, unknown>>>;

  // لوحات المتابعة اليومية (قراءة فقط)
  getDoctorDailySummary(doctorId: string, date: string): Promise<import("./clinic-dashboard-storage").DoctorDailySummaryData>;
  getSecretaryDailySummary(clinicId: string, date: string): Promise<import("./clinic-dashboard-storage").SecretaryDailySummaryData>;

  // كشف حساب الطبيب - عيادات
  getClinicDoctorStatement(doctorId: string | null, dateFrom: string, dateTo: string, clinicId?: string | null): Promise<Record<string, unknown>[]>;

  // ── استقبال وقياسات حيوية (Intake) ────────────────────────────────────────
  getIntakeByAppointment(appointmentId: string): Promise<import("@shared/schema/intake").ClinicVisitIntake | null>;
  upsertIntake(appointmentId: string, data: Omit<import("@shared/schema/intake").InsertClinicVisitIntake, "appointmentId">, userId: string): Promise<import("@shared/schema/intake").ClinicVisitIntake>;
  lockIntake(appointmentId: string): Promise<void>;
  markIntakeCompleted(appointmentId: string, userId: string): Promise<import("@shared/schema/intake").ClinicVisitIntake>;

  // ── المفضلة — نصوص محفوظة للطبيب (Favorites) ──────────────────────────────
  getDoctorFavorites(doctorId: string, clinicId?: string | null): Promise<import("@shared/schema/intake").ClinicDoctorFavorite[]>;
  addDoctorFavorite(doctorId: string, data: Omit<import("@shared/schema/intake").InsertClinicDoctorFavorite, "doctorId">): Promise<import("@shared/schema/intake").ClinicDoctorFavorite>;
  updateDoctorFavorite(id: string, doctorId: string, data: Partial<Pick<import("@shared/schema/intake").ClinicDoctorFavorite, "title" | "content" | "isPinned" | "type">>): Promise<import("@shared/schema/intake").ClinicDoctorFavorite | null>;
  deleteDoctorFavorite(id: string, doctorId: string): Promise<boolean>;

  // تسعير خدمات حسب الطبيب
  getServiceDoctorPrices(serviceId: string): Promise<Record<string, unknown>[]>;
  upsertServiceDoctorPrice(serviceId: string, doctorId: string, price: number): Promise<Record<string, unknown>>;
  deleteServiceDoctorPrice(id: string): Promise<void>;
  getDoctorServicePrice(serviceId: string, doctorId: string): Promise<number | null>;

  saveDeptServiceOrder(data: DeptServiceOrderInput): Promise<{ invoiceId: string; invoiceNumber: number }>;
  _saveDeptServiceOrderViaVisit(data: DeptServiceOrderInput): Promise<{ invoiceId: string; invoiceNumber: number }>;
  saveDeptServiceOrderBatch(data: DeptServiceBatchInput): Promise<{ results: Array<{ patientName: string; invoiceId?: string; invoiceNumber?: number; error?: string }> }>;
  checkDeptServiceDuplicate(patientName: string, serviceIds: string[], date: string): Promise<Array<{ serviceName: string; invoiceNumber: number }>>;

  // Services
  getService(id: string): Promise<ServiceWithDepartment | null>;
  getServices(params: { search?: string; departmentId?: string; category?: string; active?: string; page?: number; pageSize?: number }): Promise<{ data: ServiceWithDepartment[]; total: number }>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, service: Partial<InsertService>): Promise<Service | undefined>;
  getServiceCategories(): Promise<string[]>;
  getItemConsumables(itemId: string): Promise<any[]>;
  replaceItemConsumables(itemId: string, lines: { consumableItemId: string; quantity: string; unitLevel: string; notes?: string | null }[]): Promise<any[]>;

  // Price Lists
  getPriceLists(): Promise<PriceList[]>;
  createPriceList(data: InsertPriceList): Promise<PriceList>;
  updatePriceList(id: string, data: Partial<InsertPriceList>): Promise<PriceList | undefined>;

  // Price List Items
  getPriceListItems(priceListId: string, params?: { search?: string; departmentId?: string; category?: string; page?: number; pageSize?: number }): Promise<{ data: PriceListItemWithService[]; total: number }>;
  upsertPriceListItems(priceListId: string, items: { serviceId: string; price: string }[]): Promise<PriceListItem[]>;
  copyPriceList(sourcePriceListId: string, newName: string): Promise<PriceList>;

  // Bulk Adjustment
  bulkAdjustPreview(priceListId: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;
  bulkAdjustApply(priceListId: string, params: Record<string, unknown>): Promise<Record<string, unknown>>;

  // Sales invoice journal helpers
  regenerateJournalForInvoice(invoiceId: string): Promise<JournalEntry | null>;
  retryFailedJournals(): Promise<{ total: number; succeeded: number; failed: number }>;
  checkJournalReadiness(invoiceId: string): Promise<{ ready: boolean; critical: string[]; warnings: string[] }>;
  syncInvoiceHeaderJournalStatus(invoiceId: string): Promise<string>;
  getDistinctCashierNames(): Promise<string[]>;
  getDrawerHandoverSummary(filters: import("./cashier-handover-storage").HandoverFilters): Promise<import("./cashier-handover-storage").HandoverSummaryResult>;

  // Receiving corrections
  createReceivingCorrection(receivingId: string, corrections?: Record<string, unknown>[]): Promise<Record<string, unknown>>;
  postReceivingCorrection(correctionId: string): Promise<Record<string, unknown>>;
  getItemAvailabilitySummary(itemId: string, asOfDate?: string, excludeExpired?: boolean): Promise<Record<string, unknown>>;

  // RPT refresh jobs
  refreshPatientVisitSummary(): Promise<{ upserted: number; durationMs: number; ranAt: string }>;
  refreshPatientVisitClassification(): Promise<{ upserted: number; durationMs: number; ranAt: string }>;
  refreshInventorySnapshot(): Promise<{ upserted: number; durationMs: number; ranAt: string }>;
  refreshItemMovementsSummary(): Promise<{ upserted: number; durationMs: number; ranAt: string }>;

  // Opening Stock (الرصيد الافتتاحي)
  getOpeningStockHeaders(): Promise<import("./opening-stock-storage").OpeningStockHeaderWithWarehouse[]>;
  getOpeningStockHeader(id: string): Promise<(import("@shared/schema").OpeningStockHeader & { lines: import("./opening-stock-storage").OpeningStockLineWithItem[]; warehouseNameAr?: string }) | null>;
  createOpeningStockHeader(data: { warehouseId: string; postDate: string; notes?: string; createdBy: string }): Promise<import("@shared/schema").OpeningStockHeader>;
  updateOpeningStockHeader(id: string, data: { postDate?: string; notes?: string }): Promise<import("@shared/schema").OpeningStockHeader>;
  deleteOpeningStockHeader(id: string): Promise<void>;
  deleteOpeningStockLine(headerId: string, lineId: string): Promise<void>;
  upsertOpeningStockLine(headerId: string, lineData: { lineId?: string; itemId: string; unitLevel: string; qtyInUnit: number; purchasePrice: number; salePrice: number; batchNo?: string | null; expiryMonth?: number | null; expiryYear?: number | null; lineNotes?: string | null }): Promise<import("@shared/schema").OpeningStockLine>;
  importOpeningStockLines(headerId: string, rows: Array<{ itemCode: string; unitLevel: string; qtyInUnit: number; purchasePrice: number; salePrice: number; batchNo?: string | null; expiryMonth?: number | null; expiryYear?: number | null; lineNotes?: string | null }>): Promise<{ imported: number; errors: string[] }>;
  postOpeningStock(id: string, postedBy: string): Promise<{ header: import("@shared/schema").OpeningStockHeader; totalCost: number }>;

  // Stock Count (جرد الأصناف)
  createStockCountSession(data: { warehouseId: string; countDate: string; notes?: string; createdBy: string }): Promise<import("@shared/schema").StockCountSession>;
  getStockCountSessions(opts: { warehouseId?: string; status?: string; page?: number; pageSize?: number }): Promise<{ sessions: any[]; total: number }>;
  getStockCountSessionWithLines(id: string): Promise<any | null>;
  updateStockCountHeader(id: string, data: { countDate?: string; notes?: string }): Promise<import("@shared/schema").StockCountSession>;
  cancelStockCountSession(id: string, userId?: string): Promise<void>;
  upsertStockCountLines(sessionId: string, lines: import("./stock-count-storage").UpsertCountLine[]): Promise<import("@shared/schema").StockCountLine[]>;
  deleteStockCountLine(lineId: string): Promise<void>;
  deleteZeroLines(sessionId: string): Promise<number>;
  loadItemsForSession(warehouseId: string, sessionId: string, opts: import("./stock-count-storage").LoadItemsOpts): Promise<import("./stock-count-storage").LoadedItem[]>;
  lookupBarcodeForSession(barcode: string, warehouseId: string, sessionId: string): Promise<import("./stock-count-storage").LoadedItem[]>;
  postStockCountSession(sessionId: string, userId: string): Promise<import("@shared/schema").StockCountSession>;

  // ── Companies (شركات التأمين والتعاقد) ───────────────────────────────────
  getCompanies(params?: import("./contracts-companies-storage").GetCompaniesParams): Promise<import("@shared/schema").Company[]>;
  getCompanyById(id: string): Promise<import("@shared/schema").Company | null>;
  createCompany(data: import("@shared/schema").InsertCompany): Promise<import("@shared/schema").Company>;
  updateCompany(id: string, data: Partial<import("@shared/schema").InsertCompany>): Promise<import("@shared/schema").Company>;
  deactivateCompany(id: string): Promise<import("@shared/schema").Company>;

  // ── Contracts (العقود) ────────────────────────────────────────────────────
  getContractsByCompany(companyId: string): Promise<import("@shared/schema").Contract[]>;
  getAllActiveContracts(): Promise<Array<{ id: string; contractName: string; contractNumber: string | null; companyCoveragePct: string | null; startDate: string; endDate: string; companyId: string; companyName: string }>>;
  getContractById(id: string): Promise<import("@shared/schema").Contract | null>;
  createContract(data: import("@shared/schema").InsertContract): Promise<import("@shared/schema").Contract>;
  updateContract(id: string, data: Partial<import("@shared/schema").InsertContract>): Promise<import("@shared/schema").Contract>;

  // ── Contract Members (المنتسبون) ──────────────────────────────────────────
  getMembersByContract(contractId: string): Promise<import("@shared/schema").ContractMember[]>;
  getMemberById(id: string): Promise<import("@shared/schema").ContractMember | null>;
  createContractMember(data: import("@shared/schema").InsertContractMember): Promise<import("@shared/schema").ContractMember>;
  updateContractMember(id: string, data: Partial<import("@shared/schema").InsertContractMember>): Promise<import("@shared/schema").ContractMember>;
  lookupMemberByCard(cardNumber: string, date: string): Promise<import("./contracts-core-storage").ContractMemberLookupResult | null>;

  // ── Coverage Rules (قواعد التغطية) ────────────────────────────────────────
  getCoverageRules(contractId: string): Promise<import("@shared/schema").ContractCoverageRule[]>;
  getCoverageRuleById(id: string): Promise<import("@shared/schema").ContractCoverageRule | null>;
  createCoverageRule(data: import("@shared/schema").InsertContractCoverageRule): Promise<import("@shared/schema").ContractCoverageRule>;
  updateCoverageRule(id: string, data: Partial<import("@shared/schema").InsertContractCoverageRule>): Promise<import("@shared/schema").ContractCoverageRule>;
  deleteCoverageRule(id: string): Promise<void>;

  // ── Contract Claims (دفعات المطالبات) ─────────────────────────────────────
  getClaimBatches(filters?: import("./contracts-claims-storage").ClaimBatchFilters): Promise<import("./contracts-claims-storage").ClaimBatchWithLines[]>;
  getClaimBatch(batchId: string): Promise<import("./contracts-claims-storage").ClaimBatchWithLines | null>;
  findOrCreateDraftBatch(companyId: string, contractId: string, batchDate: string): Promise<import("@shared/schema").ContractClaimBatch>;
  upsertClaimLine(data: import("@shared/schema").InsertClaimLine & { batchId: string }): Promise<import("@shared/schema").ContractClaimLine>;
  submitClaimBatch(batchId: string, submittedBy: string): Promise<import("@shared/schema").ContractClaimBatch>;
  respondToClaimBatch(batchId: string, responses: import("./contracts-claims-storage").RespondLineInput[]): Promise<import("@shared/schema").ContractClaimBatch>;
  settleClaimBatch(batchId: string, input: import("./contracts-claims-storage").SettleClaimBatchInput): Promise<import("@shared/schema").ContractClaimBatch>;
  cancelClaimBatch(batchId: string): Promise<import("@shared/schema").ContractClaimBatch>;

  // ── Contract Approvals (الموافقات المسبقة — Phase 4) ──────────────────────
  createApproval(data: import("@shared/schema").InsertContractApproval & { approvalStatus?: string; requestedBy?: string }): Promise<import("@shared/schema").ContractApproval>;
  getApprovalById(id: string): Promise<import("@shared/schema").ContractApproval | undefined>;
  getApprovalByLineId(lineId: string): Promise<import("@shared/schema").ContractApproval | undefined>;
  updateApproval(id: string, updates: Partial<{ approvalStatus: string; approvalDecision: string; approvedAmount: string; rejectionReason: string; decidedAt: Date; decidedBy: string; notes: string }>): Promise<import("@shared/schema").ContractApproval>;
  listApprovals(filters?: import("./contracts-approvals-storage").ApprovalFilters): Promise<import("./contracts-approvals-storage").ApprovalWithContext[]>;

  // ── Invoice Templates (نماذج فاتورة المريض) ─────────────────────────────────
  listTemplates(params?: import("./invoice-templates-storage").TemplateListParams): Promise<import("@shared/schema").InvoiceTemplate[]>;
  getTemplateById(id: string): Promise<import("@shared/schema").InvoiceTemplateWithLines | null>;
  getTemplateForApply(id: string): Promise<import("./invoice-templates-storage").TemplateForApply | null>;
  createTemplate(input: import("./invoice-templates-storage").CreateTemplateInput, userId?: string): Promise<import("@shared/schema").InvoiceTemplateWithLines>;
  updateTemplate(id: string, input: import("./invoice-templates-storage").UpdateTemplateInput): Promise<import("@shared/schema").InvoiceTemplateWithLines | null>;
  deactivateTemplate(id: string): Promise<import("@shared/schema").InvoiceTemplate | null>;
  getTemplateCategories(): Promise<string[]>;

  [key: string]: unknown;
}

import { roundMoney, roundQty, parseMoney } from "../finance-helpers";
export { roundMoney, roundQty };

export class DatabaseStorage {}
// Interface merging: tells TypeScript that DatabaseStorage instances have all IStorage methods
// (actual implementations are merged onto the prototype via Object.assign below)
export interface DatabaseStorage extends IStorage {
  // Internal helper methods (not in IStorage — implemented in domain files)
  computeInvoiceTotals(lines: Record<string, unknown>[], payments: Record<string, unknown>[]): { totalAmount: string; discountAmount: string; netAmount: string; paidAmount: string };
  _buildBulkAdjustQuery(priceListId: string, params: { mode: "PCT" | "FIXED"; direction: "INCREASE" | "DECREASE"; value: number; departmentId?: string; category?: string; createMissingFromBasePrice?: boolean }): { newPriceExpr: string; filterWhere: string };
  allocateStockInTx(tx: unknown, params: { operationType: string; referenceType: string; referenceId: string; warehouseId: string; lines: Array<{ lineIdx: number; itemId: string; qtyMinor: number; hasExpiry: boolean; expiryMonth?: number | null; expiryYear?: number | null }>; createdBy?: string }): Promise<{ movementHeaderId: string; lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> }>;
  expandLinesFEFO(tx: unknown, warehouseId: string, rawLines: Partial<InsertSalesInvoiceLine>[]): Promise<Partial<InsertSalesInvoiceLine>[]>;
  buildSalesJournalLines(invoiceId: string, invoice: SalesInvoiceHeader, cogsDrugs: number, cogsSupplies: number, revenueDrugs: number, revenueSupplies: number, queryCtx?: unknown): Promise<{ journalLineData: InsertJournalLine[]; totalDebits: number; totalCredits: number } | null>;
  insertJournalEntry(tx: unknown, invoiceId: string, invoice: SalesInvoiceHeader, journalLineData: InsertJournalLine[], totalDebits: number, totalCredits: number): Promise<JournalEntry>;
  generateSalesInvoiceJournalInTx(tx: unknown, invoiceId: string, invoice: SalesInvoiceHeader, cogsDrugs: number, cogsSupplies: number, revenueDrugs: number, revenueSupplies: number): Promise<JournalEntry | null>;
  generateSalesInvoiceJournal(invoiceId: string, invoice: SalesInvoiceHeader, cogsDrugs: number, cogsSupplies: number, revenueDrugs: number, revenueSupplies: number): Promise<JournalEntry | null>;
  completeSalesJournalsWithCash(invoiceIds: string[], cashGlAccountId: string | null, pharmacyId: string): Promise<void>;
  generateSalesReturnJournal(returnId: string): Promise<void>;
  completeSalesReturnWithCash(invoiceIds: string[], cashGlAccountId: string | null): Promise<void>;
  createCashierCollectionJournals(invoiceIds: string[], cashGlAccountOverride: string | null, pharmacyId: string): Promise<void>;
  generatePurchaseInvoiceJournal(invoiceId: string, invoice: PurchaseInvoiceHeader): Promise<JournalEntry | null>;
  getMappingsForTransaction(sourceType: string, warehouseId?: string | null, pharmacyId?: string | null): Promise<AccountMapping[]>;
  getNextEntryNumber(): Promise<number>;
  getNextSalesInvoiceNumber(): Promise<number>;
}

import usersMethods from "./users-storage";
import { financeAccountsMethods, financeReportsMethods, financeJournalMethods } from "./finance-storage";
import itemsMethods from "./items-storage";
import {
  transfersCoreMethods,
  transfersInventoryMethods,
  transfersSearchMethods,
  transfersLogisticsMethods,
} from "./transfers-storage";
import { purchasingReceivingsMethods, purchasingInvoicesMethods, purchasingInvoicesJournalMethods } from "./purchasing-storage";
import servicesMethods from "./services-storage";
import { salesInvoicesCoreMethods, salesInvoicesFinalizeMethods } from "./sales-invoices-storage";
import salesJournalMethods from "./sales-journal-storage";
import { patientInvoicesCoreMethods, patientInvoicesDistributionMethods, patientInvoicesReturnsMethods } from "./patient-invoices-storage";
import cashierMethods from "./cashier-storage";
import patientsDoctorsMethods from "./patients-doctors-storage";
import { bedboardStaysMethods, bedboardBedsMethods } from "./bedboard-stay-storage";
import treasuriesMethods from "./treasuries-storage";
import { clinicMasterMethods, clinicOrdersMethods } from "./clinic-storage";
import rptRefreshMethods from "./rpt-refresh-storage";
import openingStockStorage from "./opening-stock-storage";
import stockCountMethods from "./stock-count-storage";
import permissionGroupsMethods from "./permission-groups-storage";
import companiesMethods from "./contracts-companies-storage";
import contractsCoreMethods from "./contracts-core-storage";
import contractsRulesMethods from "./contracts-rules-storage";
import contractsClaimsMethods from "./contracts-claims-storage";
import contractsApprovalsMethods from "./contracts-approvals-storage";
import clinicIntakeMethods from "./clinic-intake-storage";
import clinicDashboardMethods from "./clinic-dashboard-storage";
import cashierHandoverMethods from "./cashier-handover-storage";
import invoiceTemplatesMethods from "./invoice-templates-storage";

Object.assign(
  DatabaseStorage.prototype,
  usersMethods,
  permissionGroupsMethods,
  financeAccountsMethods,
  financeReportsMethods,
  financeJournalMethods,
  itemsMethods,
  transfersCoreMethods,
  transfersInventoryMethods,
  transfersSearchMethods,
  transfersLogisticsMethods,
  purchasingReceivingsMethods,
  purchasingInvoicesMethods,
  purchasingInvoicesJournalMethods,
  servicesMethods,
  salesInvoicesCoreMethods,
  salesInvoicesFinalizeMethods,
  salesJournalMethods,
  patientInvoicesCoreMethods,
  patientInvoicesDistributionMethods,
  patientInvoicesReturnsMethods,
  cashierMethods,
  patientsDoctorsMethods,
  bedboardStaysMethods,
  bedboardBedsMethods,
  treasuriesMethods,
  clinicMasterMethods,
  clinicOrdersMethods,
  clinicIntakeMethods,
  clinicDashboardMethods,
  rptRefreshMethods,
  openingStockStorage,
  stockCountMethods,
  companiesMethods,
  contractsCoreMethods,
  contractsRulesMethods,
  contractsClaimsMethods,
  contractsApprovalsMethods,
  cashierHandoverMethods,
  invoiceTemplatesMethods,
);

export const storage = new DatabaseStorage();
