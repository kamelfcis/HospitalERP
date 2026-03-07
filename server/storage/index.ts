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
  type InsertPatient,
  type Doctor,
  type InsertDoctor,
  type Admission,
  type InsertAdmission,
  type AccountMapping,
  type InsertAccountMapping,
  type RolePermission,
  type UserPermission,
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
} from "@shared/schema";

export interface DeptServiceOrderInput {
  patientName: string;
  patientPhone?: string;
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
  getUserPermissions(userId: string): Promise<UserPermission[]>;
  setUserPermissions(userId: string, permissions: { permission: string; granted: boolean }[]): Promise<void>;
  
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
  closeFiscalPeriod(id: string, userId: string): Promise<FiscalPeriod | undefined>;
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
  postJournalEntry(id: string, userId: string): Promise<JournalEntry | undefined>;
  reverseJournalEntry(id: string, userId: string): Promise<JournalEntry | undefined>;
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
  getDashboardStats(): Promise<any>;
  getTrialBalance(asOfDate: string): Promise<any>;
  getIncomeStatement(startDate: string, endDate: string): Promise<any>;
  getBalanceSheet(asOfDate: string): Promise<any>;
  getCostCenterReport(startDate: string, endDate: string, costCenterId?: string): Promise<any>;
  getAccountLedger(accountId: string, startDate: string, endDate: string): Promise<any>;

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
  getLastPurchases(itemId: string, limit?: number): Promise<PurchaseTransaction[]>;
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

  // Cashier scope
  getUserCashierScope(userId: string): Promise<{ isFullAccess: boolean; allowedPharmacyIds: string[]; allowedDepartmentIds: string[] }>;

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
  updateDraftTransfer(transferId: string, header: any, lines: any[]): Promise<StoreTransfer>;
  postTransfer(transferId: string): Promise<StoreTransfer>;
  deleteTransfer(id: string, reason?: string): Promise<boolean>;
  getWarehouseFefoPreview(itemId: string, warehouseId: string, requiredQty: number, asOfDate: string): Promise<any>;
  getItemAvailability(itemId: string, warehouseId: string): Promise<string>;
  searchItemsForTransfer(query: string, warehouseId: string, limit?: number): Promise<any[]>;
  getExpiryOptions(itemId: string, warehouseId: string, asOfDate: string): Promise<{expiryDate: string; expiryMonth: number | null; expiryYear: number | null; qtyAvailableMinor: string; lotSalePrice?: string}[]>;
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
  }): Promise<{items: any[]; total: number}>;

  searchItemsByPattern(query: string, limit: number): Promise<any[]>;

  // Pilot Test Seed
  seedPilotTest(): Promise<{ warehouses: any[]; items: any[]; lots: any[] }>;

  // Suppliers
  getSuppliers(params: { search?: string; page: number; pageSize: number }): Promise<{ suppliers: Supplier[]; total: number }>;
  searchSuppliers(q: string, limit?: number): Promise<Pick<Supplier, 'id' | 'code' | 'nameAr' | 'nameEn' | 'phone'>[]>;
  getSupplier(id: string): Promise<Supplier | undefined>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined>;

  // Receiving
  getReceivings(params: { supplierId?: string; warehouseId?: string; status?: string; statusFilter?: string; fromDate?: string; toDate?: string; search?: string; page: number; pageSize: number; includeCancelled?: boolean }): Promise<{ data: ReceivingHeaderWithDetails[]; total: number }>;
  getReceiving(id: string): Promise<ReceivingHeaderWithDetails | undefined>;
  getNextReceivingNumber(): Promise<number>;
  checkSupplierInvoiceUnique(supplierId: string, supplierInvoiceNo: string, excludeId?: string): Promise<boolean>;
  saveDraftReceiving(header: InsertReceivingHeader, lines: { itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; purchasePrice: string; lineTotal: string; batchNumber?: string; expiryDate?: string; expiryMonth?: number; expiryYear?: number; salePrice?: string; salePriceHint?: string; notes?: string; isRejected?: boolean; rejectionReason?: string; bonusQty?: string; bonusQtyInMinor?: string }[], existingId?: string): Promise<ReceivingHeader>;
  postReceiving(id: string): Promise<ReceivingHeader>;
  deleteReceiving(id: string, reason?: string): Promise<boolean>;
  getItemHints(itemId: string, supplierId: string, warehouseId: string): Promise<{ lastPurchasePrice: string | null; lastSalePrice: string | null; currentSalePrice: string; onHandMinor: string }>;
  getItemWarehouseStats(itemId: string): Promise<{ warehouseId: string; warehouseName: string; warehouseCode: string; qtyMinor: string; expiryBreakdown: { expiryMonth: number | null; expiryYear: number | null; qty: string }[] }[]>;

  convertReceivingToInvoice(receivingId: string): Promise<any>;
  getNextPurchaseInvoiceNumber(): Promise<number>;
  getPurchaseInvoices(filters: any & { includeCancelled?: boolean }): Promise<{data: any[]; total: number}>;
  getPurchaseInvoice(id: string): Promise<any>;
  savePurchaseInvoice(invoiceId: string, lines: any[], headerUpdates?: any): Promise<any>;
  approvePurchaseInvoice(id: string): Promise<any>;
  deletePurchaseInvoice(id: string, reason?: string): Promise<boolean>;

  // Service Consumables
  getServiceConsumables(serviceId: string): Promise<ServiceConsumableWithItem[]>;
  replaceServiceConsumables(serviceId: string, lines: { itemId: string; quantity: string; unitLevel: string; notes?: string | null }[]): Promise<ServiceConsumable[]>;

  // Sales Invoices
  getNextSalesInvoiceNumber(): Promise<number>;
  getSalesInvoices(filters: { status?: string; dateFrom?: string; dateTo?: string; customerType?: string; search?: string; pharmacistId?: string; warehouseId?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: any[]; total: number; totals: { subtotal: number; discountValue: number; netTotal: number }}>;
  getSalesInvoice(id: string): Promise<SalesInvoiceWithDetails | undefined>;
  createSalesInvoice(header: any, lines: any[]): Promise<SalesInvoiceHeader>;
  updateSalesInvoice(id: string, header: any, lines: any[]): Promise<SalesInvoiceHeader>;
  finalizeSalesInvoice(id: string): Promise<SalesInvoiceHeader>;
  deleteSalesInvoice(id: string, reason?: string): Promise<boolean>;

  // Patient Invoices
  getNextPatientInvoiceNumber(): Promise<number>;
  getNextPaymentRefNumber(offset?: number): Promise<string>;
  getPatientInvoices(filters: { status?: string; dateFrom?: string; dateTo?: string; patientName?: string; doctorName?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: any[]; total: number}>;
  getPatientInvoice(id: string): Promise<PatientInvoiceWithDetails | undefined>;
  createPatientInvoice(header: any, lines: any[], payments: any[]): Promise<PatientInvoiceHeader>;
  updatePatientInvoice(id: string, header: any, lines: any[], payments: any[], expectedVersion?: number): Promise<PatientInvoiceHeader>;
  finalizePatientInvoice(id: string, expectedVersion?: number): Promise<PatientInvoiceHeader>;
  buildPatientInvoiceGLLines(header: PatientInvoiceHeader, lines: PatientInvoiceLine[]): { lineType: string; amount: string }[];
  deletePatientInvoice(id: string, reason?: string): Promise<boolean>;
  distributePatientInvoice(sourceId: string, patients: { name: string; phone?: string }[]): Promise<PatientInvoiceHeader[]>;
  distributePatientInvoiceDirect(data: {
    patients: { name: string; phone?: string }[];
    lines: any[];
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
  openCashierShift(cashierId: string, cashierName: string, openingCash: string, unitType: string, pharmacyId?: string | null, departmentId?: string | null, glAccountId?: string | null): Promise<any>;
  getActiveShift(cashierId: string, unitType: string, unitId: string): Promise<any>;
  getMyOpenShift(cashierId: string): Promise<any | null>;
  getMyOpenShifts(cashierId: string): Promise<any[]>;
  getUserCashierGlAccount(userId: string): Promise<{ glAccountId: string; code: string; name: string; hasPassword: boolean } | null>;
  getShiftById(shiftId: string): Promise<any>;
  closeCashierShift(shiftId: string, closingCash: string): Promise<any>;
  validateShiftClose(shiftId: string): Promise<{ canClose: boolean; pendingCount: number; hasOtherOpenShift: boolean; otherShift: any; reasonCode: string }>;
  getPendingSalesInvoices(unitType: string, unitId: string, search?: string): Promise<any[]>;
  getPendingReturnInvoices(unitType: string, unitId: string, search?: string): Promise<any[]>;
  getSalesInvoiceDetails(invoiceId: string): Promise<any>;
  collectInvoices(shiftId: string, invoiceIds: string[], collectedBy: string, paymentDate?: string): Promise<any>;
  refundInvoices(shiftId: string, invoiceIds: string[], refundedBy: string, paymentDate?: string): Promise<any>;
  getShiftTotals(shiftId: string): Promise<any>;
  getNextCashierReceiptNumber(): Promise<number>;
  getNextCashierRefundReceiptNumber(): Promise<number>;
  markReceiptPrinted(receiptId: string, printedBy: string, reprintReason?: string): Promise<any>;
  markRefundReceiptPrinted(receiptId: string, printedBy: string, reprintReason?: string): Promise<any>;
  getCashierReceipt(receiptId: string): Promise<any>;
  getCashierRefundReceipt(receiptId: string): Promise<any>;

  // Patients
  getPatients(): Promise<Patient[]>;
  searchPatients(search: string): Promise<Patient[]>;
  getPatientStats(filters?: { search?: string; dateFrom?: string; dateTo?: string; deptId?: string }): Promise<any[]>;
  getPatient(id: string): Promise<Patient | undefined>;
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
  getDoctorStatement(params: { doctorName: string; dateFrom?: string; dateTo?: string }): Promise<any[]>;

  // Admissions
  getAdmissions(filters?: { status?: string; search?: string }): Promise<Admission[]>;
  getAdmission(id: string): Promise<Admission | undefined>;
  createAdmission(data: InsertAdmission): Promise<Admission>;
  updateAdmission(id: string, data: Partial<InsertAdmission>): Promise<Admission>;
  dischargeAdmission(id: string): Promise<Admission>;
  getAdmissionInvoices(admissionId: string): Promise<PatientInvoiceHeader[]>;
  consolidateAdmissionInvoices(admissionId: string): Promise<PatientInvoiceHeader>;
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
  admitPatientToBed(params: { bedId: string; patientName: string; patientPhone?: string; departmentId?: string; serviceId?: string; doctorName?: string; notes?: string; paymentType?: string; insuranceCompany?: string; surgeryTypeId?: string }): Promise<{ bed: Bed; admissionId: string; invoiceId: string; segmentId?: string }>;
  transferPatientBed(params: { sourceBedId: string; targetBedId: string; newServiceId?: string; newInvoiceId?: string }): Promise<{ sourceBed: Bed; targetBed: Bed }>;
  dischargeFromBed(bedId: string): Promise<{ bed: Bed }>;
  setBedStatus(bedId: string, status: string): Promise<Bed>;

  // Doctor Payable Transfers
  getDoctorTransfers(invoiceId: string): Promise<DoctorTransfer[]>;
  transferToDoctorPayable(params: { invoiceId: string; doctorName: string; amount: string; clientRequestId: string; notes?: string }): Promise<DoctorTransfer>;

  // Doctor Settlements
  getDoctorSettlements(params?: { doctorName?: string }): Promise<(DoctorSettlement & { allocations: DoctorSettlementAllocation[] })[]>;
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
  getTreasuryStatement(params: { treasuryId: string; dateFrom?: string; dateTo?: string }): Promise<{ transactions: TreasuryTransaction[]; totalIn: string; totalOut: string; balance: string }>;
  createTreasuryTransactionsForInvoice(invoiceId: string, finalizationDate: string): Promise<void>;

  // Account Mappings
  getAccountMappings(transactionType?: string): Promise<AccountMapping[]>;
  getAccountMapping(id: string): Promise<AccountMapping | undefined>;
  upsertAccountMapping(data: InsertAccountMapping): Promise<AccountMapping>;
  deleteAccountMapping(id: string): Promise<boolean>;
  getMappingsForTransaction(transactionType: string, warehouseId?: string | null): Promise<AccountMapping[]>;

  // Auto Journal Entry
  generateJournalEntry(params: {
    sourceType: string;
    sourceDocumentId: string;
    reference: string;
    description: string;
    entryDate: string;
    lines: { lineType: string; amount: string }[];
    periodId?: string;
  }): Promise<JournalEntry | null>;
  batchPostJournalEntries(ids: string[], userId: string): Promise<number>;

  // Chat
  getChatUsers(currentUserId: string): Promise<{ id: string; fullName: string; role: string; unreadCount: number; lastMessage: string | null; lastMessageAt: Date | null }[]>;
  getChatConversation(userAId: string, userBId: string, limit?: number): Promise<import("@shared/schema").ChatMessage[]>;
  sendChatMessage(senderId: string, receiverId: string, body: string): Promise<import("@shared/schema").ChatMessage>;
  markChatRead(senderId: string, currentUserId: string): Promise<void>;
  getChatUnreadCount(userId: string): Promise<number>;

  // Sales Returns
  searchSaleInvoicesForReturn(params: { invoiceNumber?: string; receiptBarcode?: string; itemBarcode?: string; itemCode?: string; itemId?: string; dateFrom?: string; dateTo?: string; warehouseId?: string }): Promise<any[]>;
  getSaleInvoiceForReturn(invoiceId: string): Promise<any | null>;
  createSalesReturn(data: { originalInvoiceId: string; warehouseId: string; returnLines: { originalLineId: string; itemId: string; unitLevel: string; qty: string; qtyInMinor: string; salePrice: string; lineTotal: string; expiryMonth: number | null; expiryYear: number | null; lotId: string | null }[]; discountType: string; discountPercent: string; discountValue: string; notes: string; createdBy: string }): Promise<any>;

  // ── موديول العيادات الخارجية ──────────────────────────────────────────
  // العيادات
  getClinics(userId: string, role: string): Promise<any[]>;
  getClinicById(id: string): Promise<any | null>;
  createClinic(data: { nameAr: string; departmentId?: string; defaultPharmacyId?: string; consultationServiceId?: string; secretaryFeeType?: string; secretaryFeeValue?: number }): Promise<any>;
  updateClinic(id: string, data: Partial<{ nameAr: string; departmentId: string; defaultPharmacyId: string; consultationServiceId: string; secretaryFeeType: string; secretaryFeeValue: number; isActive: boolean }>): Promise<any>;
  getUserClinicIds(userId: string): Promise<string[]>;
  assignUserToClinic(userId: string, clinicId: string): Promise<void>;
  removeUserFromClinic(userId: string, clinicId: string): Promise<void>;

  // جداول الأطباء
  getDoctorSchedules(clinicId: string): Promise<any[]>;
  upsertDoctorSchedule(data: { clinicId: string; doctorId: string; weekday?: number | null; startTime?: string; endTime?: string; maxAppointments?: number }): Promise<any>;

  // الحجوزات
  getClinicAppointments(clinicId: string, date: string): Promise<any[]>;
  createAppointment(data: { clinicId: string; doctorId: string; patientId?: string; patientName: string; patientPhone?: string; appointmentDate: string; appointmentTime?: string; notes?: string; createdBy?: string }): Promise<any>;
  getAppointmentClinicId(appointmentId: string): Promise<string | null>;
  updateAppointmentStatus(id: string, status: string): Promise<void>;

  // الربط بالمستخدم/الطبيب
  getUserDoctorId(userId: string): Promise<string | null>;
  assignUserToDoctor(userId: string, doctorId: string): Promise<void>;
  removeUserDoctorAssignment(userId: string): Promise<void>;
  getUserAssignedDoctorId(userId: string): Promise<string | null>;

  // الكشف والروشتة
  getConsultationByAppointment(appointmentId: string): Promise<any | null>;
  saveConsultation(data: { appointmentId: string; chiefComplaint?: string; diagnosis?: string; notes?: string; createdBy?: string; drugs: { lineNo: number; itemId?: string | null; drugName: string; dose?: string; frequency?: string; duration?: string; notes?: string; unitLevel?: string; quantity?: number; unitPrice?: number }[]; serviceOrders: { serviceId?: string | null; serviceNameManual?: string; targetId?: string; targetName?: string; unitPrice?: number }[] }): Promise<any>;

  // الأدوية المفضلة
  getDoctorFavoriteDrugs(doctorId: string, clinicId?: string | null): Promise<any[]>;
  addFavoriteDrug(data: { doctorId: string; clinicId?: string | null; itemId?: string | null; drugName: string; defaultDose?: string; defaultFrequency?: string; defaultDuration?: string }): Promise<any>;
  removeFavoriteDrug(id: string, doctorId?: string): Promise<void>;
  getFrequentDrugsNotInFavorites(doctorId: string, minCount?: number, clinicId?: string | null): Promise<any[]>;

  // الأوامر الطبية
  getClinicOrders(filters: { targetType?: string; status?: string; targetId?: string; doctorId?: string }): Promise<any[]>;
  getClinicOrder(id: string): Promise<any | null>;
  executeClinicOrder(orderId: string, userId: string): Promise<{ invoiceId: string }>;
  cancelClinicOrder(orderId: string): Promise<void>;

  // كشف حساب الطبيب - عيادات
  getClinicDoctorStatement(doctorId: string | null, dateFrom: string, dateTo: string, clinicId?: string | null): Promise<any[]>;

  // تسعير خدمات حسب الطبيب
  getServiceDoctorPrices(serviceId: string): Promise<any[]>;
  upsertServiceDoctorPrice(serviceId: string, doctorId: string, price: number): Promise<any>;
  deleteServiceDoctorPrice(id: string): Promise<void>;
  getDoctorServicePrice(serviceId: string, doctorId: string): Promise<number | null>;

  saveDeptServiceOrder(data: DeptServiceOrderInput): Promise<{ invoiceId: string; invoiceNumber: number }>;
  saveDeptServiceOrderBatch(data: DeptServiceBatchInput): Promise<{ results: Array<{ patientName: string; invoiceId?: string; invoiceNumber?: number; error?: string }> }>;
  checkDeptServiceDuplicate(patientName: string, serviceIds: string[], date: string): Promise<Array<{ serviceName: string; invoiceNumber: number }>>;

  // Services
  getServices(departmentId?: string): Promise<ServiceWithDepartment[]>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, service: Partial<InsertService>): Promise<Service | undefined>;
  getServiceCategories(): Promise<string[]>;

  // Price Lists
  getPriceLists(): Promise<PriceList[]>;
  createPriceList(data: InsertPriceList): Promise<PriceList>;
  updatePriceList(id: string, data: Partial<InsertPriceList>): Promise<PriceList | undefined>;

  // Price List Items
  getPriceListItems(priceListId: string): Promise<PriceListItemWithService[]>;
  upsertPriceListItems(priceListId: string, items: { serviceId: string; price: string }[]): Promise<PriceListItem[]>;
  copyPriceList(sourcePriceListId: string, newName: string): Promise<PriceList>;

  // Bulk Adjustment
  bulkAdjustPreview(filters: any): Promise<any[]>;
  bulkAdjustApply(filters: any, adjustmentType: string, adjustmentValue: number, userId: string): Promise<number>;

  // Sales invoice journal helpers
  regenerateJournalForInvoice(invoiceId: string): Promise<JournalEntry | null>;
  retryFailedJournals(): Promise<{ total: number; succeeded: number; failed: number }>;

  // Receiving corrections
  createReceivingCorrection(receivingId: string, corrections: any[]): Promise<any>;
  postReceivingCorrection(correctionId: string): Promise<any>;
  getItemAvailabilitySummary(itemId: string): Promise<any>;
}

import { roundMoney, roundQty, parseMoney } from "../finance-helpers";
export { roundMoney, roundQty };

export class DatabaseStorage implements IStorage {
  [key: string]: any;
}

import usersMethods from "./users-storage";
import financeMethods from "./finance-storage";
import itemsMethods from "./items-storage";
import transfersMethods from "./transfers-storage";
import purchasingMethods from "./purchasing-storage";
import servicesMethods from "./services-storage";
import salesInvoicesMethods from "./sales-invoices-storage";
import patientInvoicesMethods from "./patient-invoices-storage";
import cashierMethods from "./cashier-storage";
import patientsDoctorsMethods from "./patients-doctors-storage";
import bedboardStayMethods from "./bedboard-stay-storage";
import treasuriesMethods from "./treasuries-storage";
import clinicMethods from "./clinic-storage";

Object.assign(
  DatabaseStorage.prototype,
  usersMethods,
  financeMethods,
  itemsMethods,
  transfersMethods,
  purchasingMethods,
  servicesMethods,
  salesInvoicesMethods,
  patientInvoicesMethods,
  cashierMethods,
  patientsDoctorsMethods,
  bedboardStayMethods,
  treasuriesMethods,
  clinicMethods,
);

export const storage = new DatabaseStorage();
