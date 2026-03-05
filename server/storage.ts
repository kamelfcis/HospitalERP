import { db } from "./db";
import { getSetting } from "./settings-cache";
import { eq, desc, and, gte, lte, sql, or, like, ilike, asc, isNull, isNotNull } from "drizzle-orm";
import {
  users,
  accounts,
  costCenters,
  fiscalPeriods,
  journalEntries,
  journalLines,
  journalTemplates,
  templateLines,
  auditLog,
  items,
  itemFormTypes,
  purchaseTransactions,
  salesTransactions,
  departments,
  itemDepartmentPrices,
  inventoryLots,
  inventoryLotMovements,
  itemBarcodes,
  warehouses,
  userDepartments,
  userWarehouses,
  storeTransfers,
  transferLines,
  transferLineAllocations,
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
  itemUoms,
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
  suppliers,
  receivingHeaders,
  receivingLines,
  purchaseInvoiceHeaders,
  purchaseInvoiceLines,
  type Supplier,
  type InsertSupplier,
  type ReceivingHeader,
  type InsertReceivingHeader,
  type ReceivingHeaderWithDetails,
  type ReceivingLine,
  type InsertReceivingLine,
  type ReceivingLineWithItem,
  services,
  priceLists,
  priceListItems,
  priceAdjustmentsLog,
  serviceConsumables,
  type Service,
  type InsertService,
  type ServiceWithDepartment,
  type PriceList,
  type InsertPriceList,
  type PriceListItem,
  type PriceListItemWithService,
  type ServiceConsumable,
  type ServiceConsumableWithItem,
  salesInvoiceHeaders,
  salesInvoiceLines,
  type SalesInvoiceHeader,
  type SalesInvoiceLine,
  type SalesInvoiceWithDetails,
  type SalesInvoiceLineWithItem,
  patientInvoiceHeaders,
  patientInvoiceLines,
  patientInvoicePayments,
  type PatientInvoiceHeader,
  type PatientInvoiceLine,
  type PatientInvoicePayment,
  type PatientInvoiceWithDetails,
  cashierShifts,
  cashierReceipts,
  cashierRefundReceipts,
  cashierAuditLog,
  pharmacies,
  type CashierShift,
  type CashierReceipt,
  type CashierRefundReceipt,
  type Pharmacy,
  type InsertPharmacy,
  patients,
  doctors,
  admissions,
  accountMappings,
  drawerPasswords,
  type Patient,
  type InsertPatient,
  type Doctor,
  type InsertDoctor,
  type Admission,
  type InsertAdmission,
  type AccountMapping,
  type InsertAccountMapping,
  rolePermissions,
  userPermissions,
  type RolePermission,
  type UserPermission,
  stockMovementHeaders,
  stockMovementAllocations,
  type StockMovementHeader,
  type StockMovementAllocation,
  staySegments,
  type StaySegment,
  floors,
  rooms,
  beds,
  type Floor,
  type Room,
  type Bed,
  doctorTransfers,
  type DoctorTransfer,
  doctorSettlements,
  doctorSettlementAllocations,
  type DoctorSettlement,
  type DoctorSettlementAllocation,
  surgeryTypes,
  surgeryCategoryPrices,
  type SurgeryType,
  type SurgeryCategoryPrice,
  type InsertSurgeryType,
  treasuries,
  userTreasuries,
  treasuryTransactions,
  type Treasury,
  type InsertTreasury,
  type TreasuryTransaction,
} from "@shared/schema";

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
  getPendingInvoiceCountForPharmacy(pharmacyId: string): Promise<number>;
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
  getDoctors(): Promise<Doctor[]>;
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
}

function convertPriceToMinorUnit(enteredPrice: number, unitLevel: string, item: { majorToMinor?: string | null; mediumToMinor?: string | null }): number {
  if (unitLevel === 'major' && item.majorToMinor && parseFloat(item.majorToMinor) > 0) {
    return enteredPrice / parseFloat(item.majorToMinor);
  }
  if (unitLevel === 'medium' && item.mediumToMinor && parseFloat(item.mediumToMinor) > 0) {
    return enteredPrice / parseFloat(item.mediumToMinor);
  }
  return enteredPrice;
}

import { roundMoney, roundQty, parseMoney } from "./finance-helpers";
export { roundMoney, roundQty };

export class DatabaseStorage implements IStorage {

  private computeInvoiceTotals(lines: any[], payments: any[]): { totalAmount: string; discountAmount: string; netAmount: string; paidAmount: string } {
    let totalAmount = 0;
    let discountAmount = 0;
    for (const line of lines) {
      const qty = parseMoney(line.quantity);
      const unitPrice = parseMoney(line.unitPrice);
      const lineTotal = qty * unitPrice;
      const lineDiscount = parseMoney(line.discountAmount);
      totalAmount += lineTotal;
      discountAmount += lineDiscount;
    }
    const netAmount = totalAmount - discountAmount;
    const paidAmount = payments.reduce((sum: number, p: any) => sum + parseMoney(p.amount), 0);
    return {
      totalAmount: roundMoney(totalAmount),
      discountAmount: roundMoney(discountAmount),
      netAmount: roundMoney(netAmount),
      paidAmount: roundMoney(paidAmount),
    };
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    const [user] = await db.update(users).set({ isActive: false }).where(eq(users.id, id)).returning();
    return !!user;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getUserEffectivePermissions(userId: string): Promise<string[]> {
    const user = await this.getUser(userId);
    if (!user) return [];

    const rolPerms = await db.select().from(rolePermissions).where(eq(rolePermissions.role, user.role));
    const rolePermSet = new Set(rolPerms.map(rp => rp.permission));

    const userPerms = await db.select().from(userPermissions).where(eq(userPermissions.userId, userId));

    for (const up of userPerms) {
      if (up.granted) {
        rolePermSet.add(up.permission);
      } else {
        rolePermSet.delete(up.permission);
      }
    }

    return Array.from(rolePermSet);
  }

  async getRolePermissions(role: string): Promise<RolePermission[]> {
    return db.select().from(rolePermissions).where(eq(rolePermissions.role, role));
  }

  async setRolePermissions(role: string, permissions: string[]): Promise<void> {
    await db.delete(rolePermissions).where(eq(rolePermissions.role, role));
    if (permissions.length > 0) {
      await db.insert(rolePermissions).values(
        permissions.map(permission => ({ role: role as any, permission }))
      );
    }
  }

  async getUserPermissions(userId: string): Promise<UserPermission[]> {
    return db.select().from(userPermissions).where(eq(userPermissions.userId, userId));
  }

  async setUserPermissions(userId: string, perms: { permission: string; granted: boolean }[]): Promise<void> {
    await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
    if (perms.length > 0) {
      await db.insert(userPermissions).values(
        perms.map(p => ({ userId, permission: p.permission, granted: p.granted }))
      );
    }
  }

  // Accounts
  async getAccounts(): Promise<Account[]> {
    return db.select().from(accounts).orderBy(accounts.code);
  }

  async getAccount(id: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
    return account;
  }

  async createAccount(account: InsertAccount): Promise<Account> {
    // Calculate level based on parent
    let level = 1;
    if (account.parentId) {
      const parent = await this.getAccount(account.parentId);
      if (parent) {
        level = parent.level + 1;
      }
    }
    
    const [newAccount] = await db.insert(accounts).values({ ...account, level }).returning();
    return newAccount;
  }

  async updateAccount(id: string, account: Partial<InsertAccount>): Promise<Account | undefined> {
    const [updated] = await db.update(accounts).set(account).where(eq(accounts.id, id)).returning();
    return updated;
  }

  async deleteAccount(id: string): Promise<boolean> {
    const result = await db.delete(accounts).where(eq(accounts.id, id));
    return true;
  }

  // Cost Centers
  async getCostCenters(): Promise<CostCenter[]> {
    return db.select().from(costCenters).orderBy(costCenters.code);
  }

  async getCostCenter(id: string): Promise<CostCenter | undefined> {
    const [costCenter] = await db.select().from(costCenters).where(eq(costCenters.id, id));
    return costCenter;
  }

  async createCostCenter(costCenter: InsertCostCenter): Promise<CostCenter> {
    const [newCostCenter] = await db.insert(costCenters).values(costCenter).returning();
    return newCostCenter;
  }

  async updateCostCenter(id: string, costCenter: Partial<InsertCostCenter>): Promise<CostCenter | undefined> {
    const [updated] = await db.update(costCenters).set(costCenter).where(eq(costCenters.id, id)).returning();
    return updated;
  }

  async deleteCostCenter(id: string): Promise<boolean> {
    await db.delete(costCenters).where(eq(costCenters.id, id));
    return true;
  }

  // Fiscal Periods
  async getFiscalPeriods(): Promise<FiscalPeriod[]> {
    return db.select().from(fiscalPeriods).orderBy(desc(fiscalPeriods.startDate));
  }

  async getFiscalPeriod(id: string): Promise<FiscalPeriod | undefined> {
    const [period] = await db.select().from(fiscalPeriods).where(eq(fiscalPeriods.id, id));
    return period;
  }

  async getCurrentPeriod(): Promise<FiscalPeriod | undefined> {
    const today = new Date().toISOString().split('T')[0];
    const [period] = await db.select().from(fiscalPeriods)
      .where(and(
        lte(fiscalPeriods.startDate, today),
        gte(fiscalPeriods.endDate, today),
        eq(fiscalPeriods.isClosed, false)
      ));
    return period;
  }

  async assertPeriodOpen(dateStr: string): Promise<void> {
    const [period] = await db.select().from(fiscalPeriods)
      .where(and(
        lte(fiscalPeriods.startDate, dateStr),
        gte(fiscalPeriods.endDate, dateStr),
        eq(fiscalPeriods.isClosed, true)
      ));
    if (period) {
      throw new Error(`لا يمكن تنفيذ العملية: الفترة المحاسبية "${period.name}" مغلقة`);
    }
  }

  async createFiscalPeriod(period: InsertFiscalPeriod): Promise<FiscalPeriod> {
    const [newPeriod] = await db.insert(fiscalPeriods).values(period).returning();
    return newPeriod;
  }

  async closeFiscalPeriod(id: string, userId?: string | null): Promise<FiscalPeriod | undefined> {
    const [updated] = await db.update(fiscalPeriods)
      .set({ isClosed: true, closedAt: new Date(), closedBy: userId || null })
      .where(eq(fiscalPeriods.id, id))
      .returning();
    return updated;
  }

  async reopenFiscalPeriod(id: string): Promise<FiscalPeriod | undefined> {
    const [updated] = await db.update(fiscalPeriods)
      .set({ isClosed: false, closedAt: null, closedBy: null })
      .where(eq(fiscalPeriods.id, id))
      .returning();
    return updated;
  }

  // Journal Entries
  async getJournalEntries(): Promise<JournalEntry[]> {
    return db.select().from(journalEntries).orderBy(desc(journalEntries.entryNumber));
  }

  async getJournalEntry(id: string): Promise<JournalEntryWithLines | undefined> {
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!entry) return undefined;

    const lines = await db.select().from(journalLines)
      .where(eq(journalLines.journalEntryId, id))
      .orderBy(journalLines.lineNumber);

    // Get accounts for lines
    const linesWithAccounts = await Promise.all(lines.map(async (line) => {
      const [account] = await db.select().from(accounts).where(eq(accounts.id, line.accountId));
      let costCenter;
      if (line.costCenterId) {
        [costCenter] = await db.select().from(costCenters).where(eq(costCenters.id, line.costCenterId));
      }
      return { ...line, account, costCenter };
    }));

    return { ...entry, lines: linesWithAccounts };
  }

  async getNextEntryNumber(): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(${journalEntries.entryNumber}), 0)` })
      .from(journalEntries);
    return (result?.max || 0) + 1;
  }

  async createJournalEntry(entry: InsertJournalEntry, lines: InsertJournalLine[]): Promise<JournalEntry> {
    const entryNumber = await this.getNextEntryNumber();
    const [newEntry] = await db.insert(journalEntries)
      .values({ ...entry, entryNumber })
      .returning();

    // Insert lines
    for (const line of lines) {
      await db.insert(journalLines).values({
        ...line,
        journalEntryId: newEntry.id,
      });
    }

    return newEntry;
  }

  async updateJournalEntry(id: string, entry: Partial<InsertJournalEntry>, lines?: InsertJournalLine[]): Promise<JournalEntry | undefined> {
    const [existing] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!existing || existing.status !== 'draft') {
      return undefined;
    }

    const [updated] = await db.update(journalEntries)
      .set({ ...entry, updatedAt: new Date() })
      .where(eq(journalEntries.id, id))
      .returning();

    if (lines && lines.length > 0) {
      // Delete existing lines
      await db.delete(journalLines).where(eq(journalLines.journalEntryId, id));
      
      // Insert new lines
      for (const line of lines) {
        await db.insert(journalLines).values({
          ...line,
          journalEntryId: id,
        });
      }
    }

    return updated;
  }

  async postJournalEntry(id: string, userId?: string | null): Promise<JournalEntry | undefined> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM journal_entries WHERE id = ${id} FOR UPDATE`);
      const existing = lockResult.rows?.[0] as any;
      if (!existing || existing.status !== 'draft') {
        return undefined;
      }

      const [updated] = await tx.update(journalEntries)
        .set({ status: 'posted', postedBy: userId || null, postedAt: new Date() })
        .where(and(eq(journalEntries.id, id), eq(journalEntries.status, 'draft')))
        .returning();

      return updated;
    });
  }

  async reverseJournalEntry(id: string, userId?: string | null): Promise<JournalEntry | undefined> {
    return await db.transaction(async (tx) => {
    const lockResult = await tx.execute(sql`SELECT * FROM journal_entries WHERE id = ${id} FOR UPDATE`);
    const locked = lockResult.rows?.[0] as any;
    if (!locked || locked.status !== 'posted') {
      return undefined;
    }

    const entry = await this.getJournalEntry(id);
    if (!entry) return undefined;

    await tx.update(journalEntries)
      .set({ status: 'reversed', reversedBy: userId || null, reversedAt: new Date() })
      .where(and(eq(journalEntries.id, id), eq(journalEntries.status, 'posted')));

    const entryNumber = await this.getNextEntryNumber();
    const [reversalEntry] = await tx.insert(journalEntries).values({
      entryNumber,
      entryDate: new Date().toISOString().split('T')[0],
      description: `قيد عكسي - ${entry.description}`,
      status: 'posted',
      periodId: entry.periodId,
      totalDebit: entry.totalCredit,
      totalCredit: entry.totalDebit,
      reference: `REV-${entry.entryNumber}`,
      createdBy: userId || null,
      postedBy: userId || null,
      postedAt: new Date(),
      reversalEntryId: id,
    }).returning();

    for (const line of entry.lines) {
      await tx.insert(journalLines).values({
        journalEntryId: reversalEntry.id,
        lineNumber: line.lineNumber,
        accountId: line.accountId,
        costCenterId: line.costCenterId,
        description: line.description,
        debit: line.credit,
        credit: line.debit,
      });
    }

    const [updated] = await tx.update(journalEntries)
      .set({ reversalEntryId: reversalEntry.id })
      .where(eq(journalEntries.id, id))
      .returning();

    return updated;
    });
  }

  async deleteJournalEntry(id: string): Promise<boolean> {
    const [existing] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!existing || existing.status !== 'draft') {
      return false;
    }
    await db.delete(journalLines).where(eq(journalLines.journalEntryId, id));
    await db.delete(journalEntries).where(eq(journalEntries.id, id));
    return true;
  }

  // Journal Templates
  async getTemplates(): Promise<JournalTemplate[]> {
    return db.select().from(journalTemplates).orderBy(desc(journalTemplates.createdAt));
  }

  async getTemplate(id: string): Promise<JournalTemplate | undefined> {
    const [template] = await db.select().from(journalTemplates).where(eq(journalTemplates.id, id));
    return template;
  }

  async createTemplate(template: InsertJournalTemplate): Promise<JournalTemplate> {
    const [newTemplate] = await db.insert(journalTemplates).values(template).returning();
    return newTemplate;
  }

  async updateTemplate(id: string, template: Partial<InsertJournalTemplate>): Promise<JournalTemplate | undefined> {
    const [updated] = await db.update(journalTemplates).set(template).where(eq(journalTemplates.id, id)).returning();
    return updated;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    await db.delete(templateLines).where(eq(templateLines.templateId, id));
    await db.delete(journalTemplates).where(eq(journalTemplates.id, id));
    return true;
  }

  async getTemplateLines(templateId: string): Promise<TemplateLine[]> {
    return db.select().from(templateLines).where(eq(templateLines.templateId, templateId)).orderBy(templateLines.lineNumber);
  }

  async getTemplateWithLines(id: string): Promise<(JournalTemplate & { lines: TemplateLine[] }) | undefined> {
    const template = await this.getTemplate(id);
    if (!template) return undefined;
    const lines = await this.getTemplateLines(id);
    return { ...template, lines };
  }

  async createTemplateWithLines(template: InsertJournalTemplate, lines: InsertTemplateLine[]): Promise<JournalTemplate> {
    const [newTemplate] = await db.insert(journalTemplates).values(template).returning();
    if (lines.length > 0) {
      const linesWithTemplateId = lines.map(line => ({ ...line, templateId: newTemplate.id }));
      await db.insert(templateLines).values(linesWithTemplateId);
    }
    return newTemplate;
  }

  async updateTemplateWithLines(id: string, template: Partial<InsertJournalTemplate>, lines: InsertTemplateLine[]): Promise<JournalTemplate | undefined> {
    const [updated] = await db.update(journalTemplates).set(template).where(eq(journalTemplates.id, id)).returning();
    if (!updated) return undefined;
    // Delete old lines and insert new ones
    await db.delete(templateLines).where(eq(templateLines.templateId, id));
    if (lines.length > 0) {
      const linesWithTemplateId = lines.map(line => ({ ...line, templateId: id }));
      await db.insert(templateLines).values(linesWithTemplateId);
    }
    return updated;
  }

  // Audit Log
  async getAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(500);
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [newLog] = await db.insert(auditLog).values(log).returning();
    return newLog;
  }

  // Reports
  async getDashboardStats(): Promise<any> {
    const [accountCount] = await db.select({ count: sql<number>`count(*)` }).from(accounts);
    const [costCenterCount] = await db.select({ count: sql<number>`count(*)` }).from(costCenters);
    const [entryStats] = await db.select({
      total: sql<number>`count(*)`,
      draft: sql<number>`count(*) filter (where status = 'draft')`,
      posted: sql<number>`count(*) filter (where status = 'posted')`,
    }).from(journalEntries);

    const [totals] = await db.select({
      totalDebit: sql<string>`COALESCE(SUM(total_debit::numeric), 0)::text`,
      totalCredit: sql<string>`COALESCE(SUM(total_credit::numeric), 0)::text`,
    }).from(journalEntries).where(eq(journalEntries.status, 'posted'));

    const currentPeriod = await this.getCurrentPeriod();

    const recentEntries = await db.select().from(journalEntries)
      .orderBy(desc(journalEntries.createdAt))
      .limit(5);

    return {
      totalAccounts: accountCount?.count || 0,
      totalCostCenters: costCenterCount?.count || 0,
      totalJournalEntries: entryStats?.total || 0,
      draftEntries: entryStats?.draft || 0,
      postedEntries: entryStats?.posted || 0,
      totalDebits: totals?.totalDebit || "0",
      totalCredits: totals?.totalCredit || "0",
      currentPeriod,
      recentEntries,
    };
  }

  async getTrialBalance(asOfDate: string): Promise<any> {
    // Get all accounts with their balances
    const allAccounts = await this.getAccounts();
    
    const items = await Promise.all(allAccounts.map(async (account) => {
      const [balance] = await db.select({
        debit: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.status} = 'posted' AND ${journalEntries.entryDate} <= ${asOfDate} THEN ${journalLines.debit}::numeric ELSE 0 END), 0)::text`,
        credit: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.status} = 'posted' AND ${journalEntries.entryDate} <= ${asOfDate} THEN ${journalLines.credit}::numeric ELSE 0 END), 0)::text`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(eq(journalLines.accountId, account.id));

      const debitBalance = parseFloat(balance?.debit || "0") + parseFloat(account.openingBalance || "0");
      const creditBalance = parseFloat(balance?.credit || "0");
      const netBalance = debitBalance - creditBalance;

      return {
        account,
        debitBalance: netBalance > 0 ? netBalance.toFixed(2) : "0",
        creditBalance: netBalance < 0 ? Math.abs(netBalance).toFixed(2) : "0",
      };
    }));

    // Filter out accounts with zero balance
    const nonZeroItems = items.filter(item => 
      parseFloat(item.debitBalance) > 0 || parseFloat(item.creditBalance) > 0
    );

    const totalDebit = nonZeroItems.reduce((sum, item) => sum + parseFloat(item.debitBalance), 0);
    const totalCredit = nonZeroItems.reduce((sum, item) => sum + parseFloat(item.creditBalance), 0);

    return {
      items: nonZeroItems,
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
      asOfDate,
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    };
  }

  async getIncomeStatement(startDate: string, endDate: string): Promise<any> {
    const allAccounts = await this.getAccounts();
    
    const revenueAccounts = allAccounts.filter(a => a.accountType === 'revenue');
    const expenseAccounts = allAccounts.filter(a => a.accountType === 'expense');

    const getAccountAmount = async (accountId: string) => {
      const [result] = await db.select({
        amount: sql<string>`COALESCE(SUM(
          CASE WHEN ${journalEntries.status} = 'posted' AND ${journalEntries.entryDate} >= ${startDate} AND ${journalEntries.entryDate} <= ${endDate}
          THEN ${journalLines.credit}::numeric - ${journalLines.debit}::numeric ELSE 0 END
        ), 0)::text`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(eq(journalLines.accountId, accountId));
      return result?.amount || "0";
    };

    const revenues = await Promise.all(revenueAccounts.map(async (account) => {
      const amount = await getAccountAmount(account.id);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        amount,
      };
    }));

    const expenses = await Promise.all(expenseAccounts.map(async (account) => {
      const amount = await getAccountAmount(account.id);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        amount: (parseFloat(amount) * -1).toFixed(2), // Expenses are usually debits
      };
    }));

    const totalRevenue = revenues.reduce((sum, r) => sum + parseFloat(r.amount), 0);
    const totalExpense = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const netIncome = totalRevenue - totalExpense;

    return {
      revenues: revenues.filter(r => parseFloat(r.amount) !== 0),
      expenses: expenses.filter(e => parseFloat(e.amount) !== 0),
      totalRevenue: totalRevenue.toFixed(2),
      totalExpense: totalExpense.toFixed(2),
      netIncome: netIncome.toFixed(2),
      startDate,
      endDate,
    };
  }

  async getBalanceSheet(asOfDate: string): Promise<any> {
    const allAccounts = await this.getAccounts();
    
    const assetAccounts = allAccounts.filter(a => a.accountType === 'asset');
    const liabilityAccounts = allAccounts.filter(a => a.accountType === 'liability');
    const equityAccounts = allAccounts.filter(a => a.accountType === 'equity');

    const getAccountBalance = async (accountId: string, isDebitNormal: boolean) => {
      const [result] = await db.select({
        debit: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.status} = 'posted' AND ${journalEntries.entryDate} <= ${asOfDate} THEN ${journalLines.debit}::numeric ELSE 0 END), 0)::text`,
        credit: sql<string>`COALESCE(SUM(CASE WHEN ${journalEntries.status} = 'posted' AND ${journalEntries.entryDate} <= ${asOfDate} THEN ${journalLines.credit}::numeric ELSE 0 END), 0)::text`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .where(eq(journalLines.accountId, accountId));

      const debit = parseFloat(result?.debit || "0");
      const credit = parseFloat(result?.credit || "0");
      return isDebitNormal ? (debit - credit).toFixed(2) : (credit - debit).toFixed(2);
    };

    const assets = await Promise.all(assetAccounts.map(async (account) => {
      const openingBalance = parseFloat(account.openingBalance || "0");
      const transactionBalance = parseFloat(await getAccountBalance(account.id, true));
      const balance = (openingBalance + transactionBalance).toFixed(2);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        balance,
      };
    }));

    const liabilities = await Promise.all(liabilityAccounts.map(async (account) => {
      const balance = await getAccountBalance(account.id, false);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        balance,
      };
    }));

    const equity = await Promise.all(equityAccounts.map(async (account) => {
      const balance = await getAccountBalance(account.id, false);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        balance,
      };
    }));

    const revenueAccounts = allAccounts.filter(a => a.accountType === 'revenue');
    const expenseAccounts = allAccounts.filter(a => a.accountType === 'expense');

    let totalRevenue = 0;
    for (const acc of revenueAccounts) {
      const openBal = parseFloat(acc.openingBalance || "0");
      const txBal = parseFloat(await getAccountBalance(acc.id, false));
      totalRevenue += openBal + txBal;
    }
    let totalExpenses = 0;
    for (const acc of expenseAccounts) {
      const openBal = parseFloat(acc.openingBalance || "0");
      const txBal = parseFloat(await getAccountBalance(acc.id, true));
      totalExpenses += openBal + txBal;
    }
    const netIncome = totalRevenue - totalExpenses;

    const totalAssets = assets.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    const totalLiabilities = liabilities.reduce((sum, l) => sum + parseFloat(l.balance), 0);
    const totalEquityFromAccounts = equity.reduce((sum, e) => sum + parseFloat(e.balance), 0);
    const totalEquityWithIncome = totalEquityFromAccounts + netIncome;

    const equityItems = equity.filter(e => parseFloat(e.balance) !== 0);
    if (Math.abs(netIncome) >= 0.01) {
      equityItems.push({
        accountId: "net-income",
        accountCode: "",
        accountName: "صافي ربح/خسارة الفترة",
        balance: netIncome.toFixed(2),
      });
    }

    return {
      assets: assets.filter(a => parseFloat(a.balance) !== 0),
      liabilities: liabilities.filter(l => parseFloat(l.balance) !== 0),
      equity: equityItems,
      totalAssets: totalAssets.toFixed(2),
      totalLiabilities: totalLiabilities.toFixed(2),
      totalEquity: totalEquityWithIncome.toFixed(2),
      totalLiabilitiesAndEquity: (totalLiabilities + totalEquityWithIncome).toFixed(2),
      netIncome: netIncome.toFixed(2),
      asOfDate,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquityWithIncome)) < 0.01,
    };
  }

  async getCostCenterReport(startDate: string, endDate: string, costCenterId?: string): Promise<any> {
    const allCostCenters = costCenterId && costCenterId !== 'all'
      ? [await this.getCostCenter(costCenterId)].filter(Boolean) as CostCenter[]
      : await this.getCostCenters();

    const items = await Promise.all(allCostCenters.map(async (cc) => {
      const [result] = await db.select({
        totalRevenue: sql<string>`COALESCE(SUM(
          CASE WHEN ${accounts.accountType} = 'revenue' AND ${journalEntries.status} = 'posted' 
               AND ${journalEntries.entryDate} >= ${startDate} AND ${journalEntries.entryDate} <= ${endDate}
          THEN ${journalLines.credit}::numeric - ${journalLines.debit}::numeric ELSE 0 END
        ), 0)::text`,
        totalExpense: sql<string>`COALESCE(SUM(
          CASE WHEN ${accounts.accountType} = 'expense' AND ${journalEntries.status} = 'posted'
               AND ${journalEntries.entryDate} >= ${startDate} AND ${journalEntries.entryDate} <= ${endDate}
          THEN ${journalLines.debit}::numeric - ${journalLines.credit}::numeric ELSE 0 END
        ), 0)::text`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(eq(journalLines.costCenterId, cc.id));

      const totalRevenue = parseFloat(result?.totalRevenue || "0");
      const totalExpense = parseFloat(result?.totalExpense || "0");

      return {
        costCenterId: cc.id,
        costCenterCode: cc.code,
        costCenterName: cc.name,
        totalRevenue: totalRevenue.toFixed(2),
        totalExpense: totalExpense.toFixed(2),
        netResult: (totalRevenue - totalExpense).toFixed(2),
      };
    }));

    const grandTotalRevenue = items.reduce((sum, i) => sum + parseFloat(i.totalRevenue), 0);
    const grandTotalExpense = items.reduce((sum, i) => sum + parseFloat(i.totalExpense), 0);

    return {
      items,
      grandTotalRevenue: grandTotalRevenue.toFixed(2),
      grandTotalExpense: grandTotalExpense.toFixed(2),
      grandNetResult: (grandTotalRevenue - grandTotalExpense).toFixed(2),
      startDate,
      endDate,
    };
  }

  async getAccountLedger(accountId: string, startDate: string, endDate: string): Promise<any> {
    const account = await this.getAccount(accountId);
    if (!account) {
      throw new Error("الحساب غير موجود");
    }

    // Get opening balance (all transactions before startDate)
    // Include both 'posted' and 'reversed' entries (reversed entries still have valid transactions)
    const [openingResult] = await db.select({
      totalDebit: sql<string>`COALESCE(SUM(${journalLines.debit}::numeric), 0)::text`,
      totalCredit: sql<string>`COALESCE(SUM(${journalLines.credit}::numeric), 0)::text`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalLines.accountId, accountId),
      sql`(${journalEntries.status} = 'posted' OR ${journalEntries.status} = 'reversed')`,
      sql`${journalEntries.entryDate} < ${startDate}`
    ));

    const openingDebit = parseFloat(openingResult?.totalDebit || "0");
    const openingCredit = parseFloat(openingResult?.totalCredit || "0");
    
    // For asset/expense accounts: positive balance = debit
    // For liability/equity/revenue accounts: positive balance = credit
    const isDebitNormal = ['asset', 'expense'].includes(account.accountType);
    const accountOpeningBalance = parseFloat(account.openingBalance || "0");
    let openingBalance = isDebitNormal 
      ? accountOpeningBalance + (openingDebit - openingCredit)
      : accountOpeningBalance + (openingCredit - openingDebit);

    // Get all transactions within the period
    // Include both 'posted' and 'reversed' entries
    const lines = await db.select({
      id: journalLines.id,
      entryId: journalEntries.id,
      entryNumber: journalEntries.entryNumber,
      entryDate: journalEntries.entryDate,
      description: journalEntries.description,
      lineDescription: journalLines.description,
      debit: journalLines.debit,
      credit: journalLines.credit,
      reference: journalEntries.reference,
      status: journalEntries.status,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalLines.accountId, accountId),
      sql`(${journalEntries.status} = 'posted' OR ${journalEntries.status} = 'reversed')`,
      sql`${journalEntries.entryDate} >= ${startDate}`,
      sql`${journalEntries.entryDate} <= ${endDate}`
    ))
    .orderBy(journalEntries.entryDate, journalEntries.entryNumber);

    // Calculate running balance
    let runningBalance = openingBalance;
    const linesWithBalance = lines.map(line => {
      const debit = parseFloat(line.debit || "0");
      const credit = parseFloat(line.credit || "0");
      
      if (isDebitNormal) {
        runningBalance += (debit - credit);
      } else {
        runningBalance += (credit - debit);
      }

      return {
        ...line,
        runningBalance: runningBalance.toFixed(2),
      };
    });

    const totalDebit = lines.reduce((sum, l) => sum + parseFloat(l.debit || "0"), 0);
    const totalCredit = lines.reduce((sum, l) => sum + parseFloat(l.credit || "0"), 0);
    const closingBalance = runningBalance;

    return {
      account,
      openingBalance: openingBalance.toFixed(2),
      lines: linesWithBalance,
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
      closingBalance: closingBalance.toFixed(2),
    };
  }

  // Items
  async getItems(params: { page?: number; limit?: number; search?: string; category?: string; isToxic?: boolean; formTypeId?: string; isActive?: boolean; minPrice?: number; maxPrice?: number }): Promise<{ items: Item[]; total: number }> {
    const { page = 1, limit = 20, search, category, isToxic, formTypeId, isActive, minPrice, maxPrice } = params;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          ilike(items.nameAr, searchPattern),
          ilike(items.nameEn, searchPattern),
          ilike(items.itemCode, searchPattern)
        )
      );
    }

    if (category) {
      conditions.push(eq(items.category, category as any));
    }

    if (isToxic !== undefined) {
      conditions.push(eq(items.isToxic, isToxic));
    }

    if (formTypeId) {
      conditions.push(eq(items.formTypeId, formTypeId));
    }

    if (isActive !== undefined) {
      conditions.push(eq(items.isActive, isActive));
    }

    if (minPrice !== undefined) {
      conditions.push(gte(items.salePriceCurrent, String(minPrice)));
    }

    if (maxPrice !== undefined) {
      conditions.push(lte(items.salePriceCurrent, String(maxPrice)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(items)
      .where(whereClause);

    const itemsList = await db.select()
      .from(items)
      .where(whereClause)
      .orderBy(asc(items.itemCode))
      .limit(limit)
      .offset(offset);

    return {
      items: itemsList,
      total: countResult?.count || 0,
    };
  }

  async getItem(id: string): Promise<ItemWithFormType | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id));
    if (!item) return undefined;

    let formType: ItemFormType | undefined;
    if (item.formTypeId) {
      const [ft] = await db.select().from(itemFormTypes).where(eq(itemFormTypes.id, item.formTypeId));
      formType = ft;
    }

    return { ...item, formType };
  }

  async getItemsByIds(ids: string[]): Promise<Map<string, Item>> {
    const map = new Map<string, Item>();
    if (ids.length === 0) return map;
    const results = await db.select().from(items).where(sql`${items.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`);
    for (const item of results) {
      map.set(item.id, item);
    }
    return map;
  }

  async createItem(item: InsertItem): Promise<Item> {
    const [newItem] = await db.insert(items).values(item).returning();
    return newItem;
  }

  async updateItem(id: string, item: Partial<InsertItem>): Promise<Item | undefined> {
    const [updated] = await db.update(items)
      .set({ ...item, updatedAt: new Date() })
      .where(eq(items.id, id))
      .returning();
    return updated;
  }

  async deleteItem(id: string): Promise<boolean> {
    await db.delete(items).where(eq(items.id, id));
    return true;
  }

  async checkItemUniqueness(code?: string, nameAr?: string, nameEn?: string, excludeId?: string): Promise<{ codeUnique: boolean; nameArUnique: boolean; nameEnUnique: boolean }> {
    let codeUnique = true;
    let nameArUnique = true;
    let nameEnUnique = true;

    if (code) {
      const trimmed = code.trim();
      const conditions: any[] = [sql`LOWER(TRIM(${items.itemCode})) = LOWER(${trimmed})`];
      if (excludeId) conditions.push(sql`${items.id} != ${excludeId}`);
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(items).where(and(...conditions));
      codeUnique = Number(result.count) === 0;
    }

    if (nameAr) {
      const trimmed = nameAr.trim();
      const conditions: any[] = [sql`LOWER(TRIM(${items.nameAr})) = LOWER(${trimmed})`];
      if (excludeId) conditions.push(sql`${items.id} != ${excludeId}`);
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(items).where(and(...conditions));
      nameArUnique = Number(result.count) === 0;
    }

    if (nameEn) {
      const trimmed = nameEn.trim();
      const conditions: any[] = [sql`LOWER(TRIM(${items.nameEn})) = LOWER(${trimmed})`];
      if (excludeId) conditions.push(sql`${items.id} != ${excludeId}`);
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(items).where(and(...conditions));
      nameEnUnique = Number(result.count) === 0;
    }

    return { codeUnique, nameArUnique, nameEnUnique };
  }

  // Item Form Types
  async getItemFormTypes(): Promise<ItemFormType[]> {
    return db.select().from(itemFormTypes).orderBy(asc(itemFormTypes.sortOrder));
  }

  async createItemFormType(formType: InsertItemFormType): Promise<ItemFormType> {
    const [newFormType] = await db.insert(itemFormTypes).values(formType).returning();
    return newFormType;
  }

  async getItemUoms(): Promise<ItemUom[]> {
    return await db.select().from(itemUoms).where(eq(itemUoms.isActive, true)).orderBy(asc(itemUoms.nameAr));
  }

  async createItemUom(data: InsertItemUom): Promise<ItemUom> {
    const [uom] = await db.insert(itemUoms).values(data).returning();
    return uom;
  }

  // Purchase & Sales Transactions
  async getLastPurchases(itemId: string, limit: number = 5): Promise<PurchaseTransaction[]> {
    return db.select()
      .from(purchaseTransactions)
      .where(eq(purchaseTransactions.itemId, itemId))
      .orderBy(desc(purchaseTransactions.txDate))
      .limit(limit);
  }

  async getAverageSales(itemId: string, startDate: string, endDate: string): Promise<{ avgPrice: string; totalQty: string; invoiceCount: number }> {
    const [result] = await db.select({
      avgPrice: sql<string>`COALESCE(AVG(${salesTransactions.salePrice}::numeric), 0)::text`,
      totalQty: sql<string>`COALESCE(SUM(${salesTransactions.qty}::numeric), 0)::text`,
      invoiceCount: sql<number>`COUNT(*)::int`,
    })
    .from(salesTransactions)
    .where(and(
      eq(salesTransactions.itemId, itemId),
      gte(salesTransactions.txDate, startDate),
      lte(salesTransactions.txDate, endDate)
    ));

    return {
      avgPrice: result?.avgPrice || "0",
      totalQty: result?.totalQty || "0",
      invoiceCount: result?.invoiceCount || 0,
    };
  }

  // Departments
  async getDepartments(): Promise<Department[]> {
    return db.select().from(departments).orderBy(asc(departments.code));
  }

  async getDepartment(id: string): Promise<Department | undefined> {
    const [dept] = await db.select().from(departments).where(eq(departments.id, id));
    return dept;
  }

  async createDepartment(dept: InsertDepartment): Promise<Department> {
    const [newDept] = await db.insert(departments).values(dept).returning();
    return newDept;
  }

  async updateDepartment(id: string, dept: Partial<InsertDepartment>): Promise<Department | undefined> {
    const [updated] = await db.update(departments)
      .set(dept)
      .where(eq(departments.id, id))
      .returning();
    return updated;
  }

  async deleteDepartment(id: string): Promise<boolean> {
    await db.delete(departments).where(eq(departments.id, id));
    return true;
  }

  // Item Department Prices
  async getItemDepartmentPrices(itemId: string): Promise<ItemDepartmentPriceWithDepartment[]> {
    const prices = await db.select()
      .from(itemDepartmentPrices)
      .where(eq(itemDepartmentPrices.itemId, itemId))
      .orderBy(asc(itemDepartmentPrices.createdAt));

    const result: ItemDepartmentPriceWithDepartment[] = [];
    for (const price of prices) {
      const [dept] = await db.select().from(departments).where(eq(departments.id, price.departmentId));
      result.push({
        ...price,
        department: dept,
      });
    }
    return result;
  }

  async createItemDepartmentPrice(price: InsertItemDepartmentPrice): Promise<ItemDepartmentPrice> {
    const [newPrice] = await db.insert(itemDepartmentPrices).values(price).returning();
    return newPrice;
  }

  async updateItemDepartmentPrice(id: string, price: Partial<InsertItemDepartmentPrice>): Promise<ItemDepartmentPrice | undefined> {
    const [updated] = await db.update(itemDepartmentPrices)
      .set({ ...price, updatedAt: new Date() })
      .where(eq(itemDepartmentPrices.id, id))
      .returning();
    return updated;
  }

  async deleteItemDepartmentPrice(id: string): Promise<boolean> {
    await db.delete(itemDepartmentPrices).where(eq(itemDepartmentPrices.id, id));
    return true;
  }

  async getItemPriceForDepartment(itemId: string, departmentId: string): Promise<string | null> {
    const [deptPrice] = await db.select()
      .from(itemDepartmentPrices)
      .where(and(
        eq(itemDepartmentPrices.itemId, itemId),
        eq(itemDepartmentPrices.departmentId, departmentId)
      ));

    if (deptPrice && parseFloat(deptPrice.salePrice) > 0) {
      return deptPrice.salePrice;
    }

    return null;
  }

  // Inventory Lots
  async getLots(itemId: string): Promise<InventoryLot[]> {
    return db.select().from(inventoryLots)
      .where(and(eq(inventoryLots.itemId, itemId), eq(inventoryLots.isActive, true)))
      .orderBy(asc(inventoryLots.expiryDate));
  }

  async getLot(lotId: string): Promise<InventoryLot | undefined> {
    const [lot] = await db.select().from(inventoryLots).where(eq(inventoryLots.id, lotId));
    return lot;
  }

  async createLot(lot: InsertInventoryLot): Promise<InventoryLot> {
    const [newLot] = await db.insert(inventoryLots).values(lot).returning();
    await db.insert(inventoryLotMovements).values({
      lotId: newLot.id,
      txType: "in" as const,
      qtyChangeInMinor: lot.qtyInMinor || "0",
      unitCost: lot.purchasePrice || "0",
      referenceType: "initial",
      txDate: new Date(),
    } as any);
    return newLot;
  }

  // FEFO Preview
  async getFefoPreview(itemId: string, requiredQty: number, asOfDate: string): Promise<any> {
    const lots = await db.select().from(inventoryLots)
      .where(and(
        eq(inventoryLots.itemId, itemId),
        eq(inventoryLots.isActive, true),
        sql`${inventoryLots.qtyInMinor}::numeric > 0`,
        or(
          sql`${inventoryLots.expiryDate} IS NULL`,
          sql`${inventoryLots.expiryDate} >= ${asOfDate}`
        )
      ))
      .orderBy(asc(inventoryLots.expiryDate));

    const allocations: any[] = [];
    let remaining = requiredQty;

    for (const lot of lots) {
      if (remaining <= 0) break;
      const available = parseFloat(lot.qtyInMinor);
      const allocated = Math.min(available, remaining);
      allocations.push({
        lotId: lot.id,
        expiryDate: lot.expiryDate,
        availableQty: available.toFixed(4),
        allocatedQty: allocated.toFixed(4),
      });
      remaining -= allocated;
    }

    return {
      allocations,
      fulfilled: remaining <= 0,
      shortfall: remaining > 0 ? remaining.toFixed(4) : "0",
    };
  }

  // Item Barcodes
  async getItemBarcodes(itemId: string): Promise<ItemBarcode[]> {
    return db.select().from(itemBarcodes)
      .where(eq(itemBarcodes.itemId, itemId))
      .orderBy(desc(itemBarcodes.createdAt));
  }

  async createItemBarcode(barcode: InsertItemBarcode): Promise<ItemBarcode> {
    const normalized = { ...barcode, barcodeValue: barcode.barcodeValue.trim() };
    const [newBarcode] = await db.insert(itemBarcodes).values(normalized).returning();
    return newBarcode;
  }

  async deactivateBarcode(barcodeId: string): Promise<ItemBarcode | undefined> {
    const [updated] = await db.update(itemBarcodes)
      .set({ isActive: false })
      .where(eq(itemBarcodes.id, barcodeId))
      .returning();
    return updated;
  }

  async resolveBarcode(barcodeValue: string): Promise<{ found: boolean; itemId?: string; itemCode?: string; nameAr?: string }> {
    const normalized = barcodeValue.trim();
    const [barcode] = await db.select().from(itemBarcodes)
      .where(and(eq(itemBarcodes.barcodeValue, normalized), eq(itemBarcodes.isActive, true)));
    
    if (barcode) {
      const [item] = await db.select({ id: items.id, itemCode: items.itemCode, nameAr: items.nameAr })
        .from(items).where(eq(items.id, barcode.itemId));
      if (item) {
        return { found: true, itemId: item.id, itemCode: item.itemCode, nameAr: item.nameAr };
      }
    }

    const [item] = await db.select({ id: items.id, itemCode: items.itemCode, nameAr: items.nameAr })
      .from(items).where(eq(items.itemCode, normalized));
    if (item) {
      return { found: true, itemId: item.id, itemCode: item.itemCode, nameAr: item.nameAr };
    }

    return { found: false };
  }

  // Warehouses
  async getWarehouses(): Promise<Warehouse[]> {
    return db.select().from(warehouses)
      .orderBy(asc(warehouses.warehouseCode));
  }

  async getWarehouse(id: string): Promise<Warehouse | undefined> {
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, id));
    return wh;
  }

  async createWarehouse(wh: InsertWarehouse): Promise<Warehouse> {
    const [newWh] = await db.insert(warehouses).values(wh).returning();
    return newWh;
  }

  async updateWarehouse(id: string, wh: Partial<InsertWarehouse>): Promise<Warehouse | undefined> {
    const [updated] = await db.update(warehouses)
      .set(wh)
      .where(eq(warehouses.id, id))
      .returning();
    return updated;
  }

  async deleteWarehouse(id: string): Promise<boolean> {
    await db.delete(warehouses).where(eq(warehouses.id, id));
    return true;
  }

  async getUserDepartments(userId: string): Promise<Department[]> {
    const rows = await db.select({ department: departments })
      .from(userDepartments)
      .innerJoin(departments, eq(userDepartments.departmentId, departments.id))
      .where(eq(userDepartments.userId, userId));
    return rows.map(r => r.department);
  }

  async setUserDepartments(userId: string, departmentIds: string[]): Promise<void> {
    await db.delete(userDepartments).where(eq(userDepartments.userId, userId));
    if (departmentIds.length > 0) {
      await db.insert(userDepartments).values(
        departmentIds.map(deptId => ({ userId, departmentId: deptId }))
      );
    }
  }

  async getUserWarehouses(userId: string): Promise<Warehouse[]> {
    const rows = await db.select({ warehouse: warehouses })
      .from(userWarehouses)
      .innerJoin(warehouses, eq(userWarehouses.warehouseId, warehouses.id))
      .where(eq(userWarehouses.userId, userId));
    return rows.map(r => r.warehouse);
  }

  async setUserWarehouses(userId: string, warehouseIds: string[]): Promise<void> {
    await db.delete(userWarehouses).where(eq(userWarehouses.userId, userId));
    if (warehouseIds.length > 0) {
      await db.insert(userWarehouses).values(
        warehouseIds.map(whId => ({ userId, warehouseId: whId }))
      );
    }
  }

  async getUserCashierScope(userId: string): Promise<{ isFullAccess: boolean; allowedPharmacyIds: string[]; allowedDepartmentIds: string[] }> {
    const user = await this.getUser(userId);
    if (!user) return { isFullAccess: false, allowedPharmacyIds: [], allowedDepartmentIds: [] };

    if (user.role === "admin" || user.role === "owner") {
      return { isFullAccess: true, allowedPharmacyIds: [], allowedDepartmentIds: [] };
    }

    const perms = await this.getUserEffectivePermissions(userId);
    if (perms.includes("cashier.all_units")) {
      return { isFullAccess: true, allowedPharmacyIds: [], allowedDepartmentIds: [] };
    }

    const allowedPharmacyIds = user.pharmacyId ? [user.pharmacyId] : [];
    const deptRows = await db.select({ id: userDepartments.departmentId })
      .from(userDepartments)
      .where(eq(userDepartments.userId, userId));
    const allowedDepartmentIds = deptRows.map(r => r.id);

    return { isFullAccess: false, allowedPharmacyIds, allowedDepartmentIds };
  }

  // Store Transfers
  async getTransfers(): Promise<StoreTransferWithDetails[]> {
    const transfers = await db.select().from(storeTransfers)
      .where(sql`${storeTransfers.status} != 'cancelled'`)
      .orderBy(desc(storeTransfers.createdAt))
      .limit(100);

    const result: StoreTransferWithDetails[] = [];
    for (const t of transfers) {
      const [srcWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.sourceWarehouseId));
      const [destWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.destinationWarehouseId));
      const lines = await db.select().from(transferLines).where(eq(transferLines.transferId, t.id));
      const linesWithItems: TransferLineWithItem[] = [];
      for (const line of lines) {
        const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
        linesWithItems.push({ ...line, item });
      }
      result.push({ ...t, sourceWarehouse: srcWh, destinationWarehouse: destWh, lines: linesWithItems });
    }
    return result;
  }

  async getTransfer(id: string): Promise<StoreTransferWithDetails | undefined> {
    const [t] = await db.select().from(storeTransfers).where(eq(storeTransfers.id, id));
    if (!t) return undefined;
    const [srcWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.sourceWarehouseId));
    const [destWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.destinationWarehouseId));
    const lines = await db.select().from(transferLines).where(eq(transferLines.transferId, t.id));
    const linesWithItems: TransferLineWithItem[] = [];
    for (const line of lines) {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      linesWithItems.push({ ...line, item });
    }
    return { ...t, sourceWarehouse: srcWh, destinationWarehouse: destWh, lines: linesWithItems };
  }

  async createDraftTransfer(header: InsertStoreTransfer, lines: { itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; selectedExpiryDate?: string; expiryMonth?: number; expiryYear?: number; availableAtSaveMinor?: string; notes?: string }[]): Promise<StoreTransfer> {
    return await db.transaction(async (tx) => {
      const [maxNum] = await tx.select({ max: sql<number>`COALESCE(MAX(${storeTransfers.transferNumber}), 0)` }).from(storeTransfers);
      const nextNumber = (maxNum?.max || 0) + 1;

      const [transfer] = await tx.insert(storeTransfers).values({
        ...header,
        transferNumber: nextNumber,
        status: "draft" as const,
      }).returning();

      for (const line of lines) {
        await tx.insert(transferLines).values({
          transferId: transfer.id,
          itemId: line.itemId,
          unitLevel: line.unitLevel as any,
          qtyEntered: line.qtyEntered,
          qtyInMinor: line.qtyInMinor,
          selectedExpiryDate: line.selectedExpiryDate || null,
          selectedExpiryMonth: line.expiryMonth || null,
          selectedExpiryYear: line.expiryYear || null,
          availableAtSaveMinor: line.availableAtSaveMinor || null,
          notes: line.notes || null,
        });
      }

      return transfer;
    });
  }

  async updateDraftTransfer(transferId: string, header: any, lines: any[]): Promise<StoreTransfer> {
    return await db.transaction(async (tx) => {
      await tx.update(storeTransfers).set({
        transferDate: header.transferDate,
        sourceWarehouseId: header.sourceWarehouseId,
        destinationWarehouseId: header.destinationWarehouseId,
        notes: header.notes || null,
      }).where(eq(storeTransfers.id, transferId));

      await tx.delete(transferLines).where(eq(transferLines.transferId, transferId));

      for (const line of lines) {
        await tx.insert(transferLines).values({
          transferId,
          itemId: line.itemId,
          unitLevel: line.unitLevel as any,
          qtyEntered: line.qtyEntered,
          qtyInMinor: line.qtyInMinor,
          selectedExpiryDate: line.selectedExpiryDate || null,
          selectedExpiryMonth: line.expiryMonth || null,
          selectedExpiryYear: line.expiryYear || null,
          availableAtSaveMinor: line.availableAtSaveMinor || null,
          notes: line.notes || null,
        });
      }

      const [updated] = await tx.select().from(storeTransfers).where(eq(storeTransfers.id, transferId));
      return updated;
    });
  }

  async postTransfer(transferId: string): Promise<StoreTransfer> {
    return await db.transaction(async (tx) => {
    const [transfer] = await tx.select().from(storeTransfers).where(eq(storeTransfers.id, transferId)).for("update");
    if (!transfer) throw new Error("التحويل غير موجود");
    if (transfer.status !== "draft") throw new Error("لا يمكن ترحيل تحويل غير مسودة");
    if (transfer.sourceWarehouseId === transfer.destinationWarehouseId) throw new Error("مخزن المصدر والوجهة يجب أن يكونا مختلفين");

    const lines = await tx.select().from(transferLines).where(eq(transferLines.transferId, transferId));
    if (lines.length === 0) throw new Error("لا توجد سطور في التحويل");
      for (const line of lines) {
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
        if (!item) throw new Error(`الصنف غير موجود: ${line.itemId}`);
        if (item.category === "service") throw new Error(`الخدمات لا يمكن تحويلها: ${item.nameAr}`);

        const requiredQty = parseFloat(line.qtyInMinor);
        if (requiredQty <= 0) throw new Error(`الكمية يجب أن تكون أكبر من صفر: ${item.nameAr}`);

        let remaining = requiredQty;
        const allocations: { lotId: string; expiryDate: string | null; expiryMonth: number | null; expiryYear: number | null; allocatedQty: number; unitCost: string; lotSalePrice: string }[] = [];

        if (item.hasExpiry && line.selectedExpiryMonth && line.selectedExpiryYear) {
          const selMonth = line.selectedExpiryMonth;
          const selYear = line.selectedExpiryYear;
          const selectedLots = await tx.select().from(inventoryLots)
            .where(and(
              eq(inventoryLots.itemId, line.itemId),
              eq(inventoryLots.warehouseId, transfer.sourceWarehouseId),
              eq(inventoryLots.isActive, true),
              sql`${inventoryLots.qtyInMinor}::numeric > 0`,
              eq(inventoryLots.expiryMonth, selMonth),
              eq(inventoryLots.expiryYear, selYear)
            ))
            .orderBy(asc(inventoryLots.receivedDate));

          for (const lot of selectedLots) {
            if (remaining <= 0) break;
            const available = parseFloat(lot.qtyInMinor);
            const allocated = Math.min(available, remaining);
            allocations.push({
              lotId: lot.id,
              expiryDate: lot.expiryDate,
              expiryMonth: lot.expiryMonth,
              expiryYear: lot.expiryYear,
              allocatedQty: allocated,
              unitCost: lot.purchasePrice,
              lotSalePrice: lot.salePrice || "0",
            });
            remaining -= allocated;
          }
        } else if (item.hasExpiry && line.selectedExpiryDate) {
          const selectedLots = await tx.select().from(inventoryLots)
            .where(and(
              eq(inventoryLots.itemId, line.itemId),
              eq(inventoryLots.warehouseId, transfer.sourceWarehouseId),
              eq(inventoryLots.isActive, true),
              sql`${inventoryLots.qtyInMinor}::numeric > 0`,
              sql`${inventoryLots.expiryDate} = ${line.selectedExpiryDate}`
            ))
            .orderBy(asc(inventoryLots.receivedDate));

          for (const lot of selectedLots) {
            if (remaining <= 0) break;
            const available = parseFloat(lot.qtyInMinor);
            const allocated = Math.min(available, remaining);
            allocations.push({
              lotId: lot.id,
              expiryDate: lot.expiryDate,
              expiryMonth: lot.expiryMonth,
              expiryYear: lot.expiryYear,
              allocatedQty: allocated,
              unitCost: lot.purchasePrice,
              lotSalePrice: lot.salePrice || "0",
            });
            remaining -= allocated;
          }
        }

        if (remaining > 0) {
          const transferDateParsed = new Date(transfer.transferDate);
          const tMonth = transferDateParsed.getMonth() + 1;
          const tYear = transferDateParsed.getFullYear();

          const expiryCondition = item.hasExpiry
            ? and(
                sql`${inventoryLots.expiryMonth} IS NOT NULL`,
                sql`${inventoryLots.expiryYear} IS NOT NULL`,
                sql`(${inventoryLots.expiryYear} > ${tYear} OR (${inventoryLots.expiryYear} = ${tYear} AND ${inventoryLots.expiryMonth} >= ${tMonth}))`
              )
            : and(
                sql`${inventoryLots.expiryMonth} IS NULL`,
                sql`${inventoryLots.expiryYear} IS NULL`
              );

          const alreadyUsedLotIds = allocations.map(a => a.lotId);

          const fefoLots = await tx.select().from(inventoryLots)
            .where(and(
              eq(inventoryLots.itemId, line.itemId),
              eq(inventoryLots.warehouseId, transfer.sourceWarehouseId),
              eq(inventoryLots.isActive, true),
              sql`${inventoryLots.qtyInMinor}::numeric > 0`,
              expiryCondition,
              ...(alreadyUsedLotIds.length > 0
                ? [sql`${inventoryLots.id} NOT IN (${sql.join(alreadyUsedLotIds.map(id => sql`${id}`), sql`, `)})`]
                : [])
            ))
            .orderBy(asc(inventoryLots.expiryYear), asc(inventoryLots.expiryMonth), asc(inventoryLots.receivedDate));

          for (const lot of fefoLots) {
            if (remaining <= 0) break;
            const available = parseFloat(lot.qtyInMinor);
            const allocated = Math.min(available, remaining);
            allocations.push({
              lotId: lot.id,
              expiryDate: lot.expiryDate,
              expiryMonth: lot.expiryMonth,
              expiryYear: lot.expiryYear,
              allocatedQty: allocated,
              unitCost: lot.purchasePrice,
              lotSalePrice: lot.salePrice || "0",
            });
            remaining -= allocated;
          }
        }

        if (remaining > 0) {
          throw new Error(`الكمية غير متاحة للصنف: ${item.nameAr} - المطلوب: ${requiredQty} - المتاح: ${(requiredQty - remaining).toFixed(0)} (بالوحدة الصغرى)`);
        }

        for (const alloc of allocations) {
          await tx.execute(sql`
            UPDATE inventory_lots 
            SET qty_in_minor = qty_in_minor::numeric - ${alloc.allocatedQty.toFixed(4)}::numeric,
                updated_at = NOW()
            WHERE id = ${alloc.lotId}
          `);

          await tx.insert(inventoryLotMovements).values({
            lotId: alloc.lotId,
            warehouseId: transfer.sourceWarehouseId,
            txType: "out" as const,
            txDate: new Date(),
            qtyChangeInMinor: (-alloc.allocatedQty).toFixed(4),
            unitCost: alloc.unitCost,
            referenceType: "transfer",
            referenceId: transfer.id,
          } as any);

          const expiryMatchConditions = [];
          if (alloc.expiryDate) {
            expiryMatchConditions.push(sql`${inventoryLots.expiryDate} = ${alloc.expiryDate}`);
          } else {
            expiryMatchConditions.push(sql`${inventoryLots.expiryDate} IS NULL`);
          }
          if (alloc.expiryMonth != null) {
            expiryMatchConditions.push(sql`${inventoryLots.expiryMonth} = ${alloc.expiryMonth}`);
          } else {
            expiryMatchConditions.push(sql`${inventoryLots.expiryMonth} IS NULL`);
          }
          if (alloc.expiryYear != null) {
            expiryMatchConditions.push(sql`${inventoryLots.expiryYear} = ${alloc.expiryYear}`);
          } else {
            expiryMatchConditions.push(sql`${inventoryLots.expiryYear} IS NULL`);
          }

          const existingDestLots = await tx.select().from(inventoryLots)
            .where(and(
              eq(inventoryLots.itemId, line.itemId),
              eq(inventoryLots.warehouseId, transfer.destinationWarehouseId),
              eq(inventoryLots.isActive, true),
              ...expiryMatchConditions,
              sql`${inventoryLots.purchasePrice}::numeric = ${alloc.unitCost}::numeric`
            ));

          let destLotId: string;

          if (existingDestLots.length > 0) {
            destLotId = existingDestLots[0].id;
            const allocSalePrice = parseFloat(alloc.lotSalePrice || "0");
            const existingSalePrice = parseFloat(existingDestLots[0].salePrice || "0");
            const destSalePrice = allocSalePrice > 0 ? alloc.lotSalePrice : (existingSalePrice > 0 ? existingDestLots[0].salePrice : "0");
            await tx.execute(sql`
              UPDATE inventory_lots 
              SET qty_in_minor = qty_in_minor::numeric + ${alloc.allocatedQty.toFixed(4)}::numeric,
                  sale_price = ${destSalePrice},
                  updated_at = NOW()
              WHERE id = ${destLotId}
            `);
          } else {
            const [newLot] = await tx.insert(inventoryLots).values({
              itemId: line.itemId,
              warehouseId: transfer.destinationWarehouseId,
              expiryDate: item.hasExpiry ? (alloc.expiryDate || null) : null,
              expiryMonth: item.hasExpiry ? (alloc.expiryMonth || null) : null,
              expiryYear: item.hasExpiry ? (alloc.expiryYear || null) : null,
              receivedDate: transfer.transferDate,
              purchasePrice: alloc.unitCost,
              salePrice: alloc.lotSalePrice || "0",
              qtyInMinor: alloc.allocatedQty.toFixed(4),
              isActive: true,
            }).returning();
            destLotId = newLot.id;
          }

          await tx.insert(inventoryLotMovements).values({
            lotId: destLotId,
            warehouseId: transfer.destinationWarehouseId,
            txType: "in" as const,
            txDate: new Date(),
            qtyChangeInMinor: alloc.allocatedQty.toFixed(4),
            unitCost: alloc.unitCost,
            referenceType: "transfer",
            referenceId: transfer.id,
          } as any);

          await tx.insert(transferLineAllocations).values({
            lineId: line.id,
            sourceLotId: alloc.lotId,
            expiryDate: alloc.expiryDate || null,
            qtyOutInMinor: alloc.allocatedQty.toFixed(4),
            purchasePrice: alloc.unitCost,
            destinationLotId: destLotId,
          });
        }
      }

      const allAllocations = await tx.select().from(transferLineAllocations)
        .innerJoin(transferLines, eq(transferLineAllocations.lineId, transferLines.id))
        .where(eq(transferLines.transferId, transferId));
      
      let totalCost = 0;
      for (const row of allAllocations) {
        const qty = parseFloat(row.transfer_line_allocations.qtyOutInMinor);
        const cost = parseFloat(row.transfer_line_allocations.purchasePrice);
        totalCost += qty * cost;
      }

      const [updated] = await tx.update(storeTransfers)
        .set({ status: "executed" as const, executedAt: new Date() })
        .where(eq(storeTransfers.id, transferId))
        .returning();

      if (totalCost > 0) {
        this.generateWarehouseTransferJournal(
          transferId, transfer, totalCost
        ).catch(err => console.error("Auto journal for warehouse transfer failed:", err));
      }

      return updated;
    });
  }

  async deleteTransfer(id: string, reason?: string): Promise<boolean> {
    const [t] = await db.select().from(storeTransfers).where(eq(storeTransfers.id, id));
    if (!t) return false;
    if (t.status !== "draft") throw new Error("لا يمكن إلغاء تحويل مُرحّل");
    await db.update(storeTransfers).set({
      status: "cancelled" as any,
      notes: reason ? `[ملغي] ${reason}` : (t.notes ? `[ملغي] ${t.notes}` : "[ملغي]"),
    }).where(eq(storeTransfers.id, id));
    return true;
  }

  async getWarehouseFefoPreview(itemId: string, warehouseId: string, requiredQty: number, asOfDate: string): Promise<any> {
    const [item] = await db.select().from(items).where(eq(items.id, itemId));

    const asOf = new Date(asOfDate);
    const asOfMonth = asOf.getMonth() + 1;
    const asOfYear = asOf.getFullYear();

    const expiryCondition = item && item.hasExpiry
      ? and(
          sql`${inventoryLots.expiryMonth} IS NOT NULL`,
          sql`${inventoryLots.expiryYear} IS NOT NULL`,
          sql`(${inventoryLots.expiryYear} > ${asOfYear} OR (${inventoryLots.expiryYear} = ${asOfYear} AND ${inventoryLots.expiryMonth} >= ${asOfMonth}))`
        )
      : sql`${inventoryLots.expiryMonth} IS NULL`;

    const lots = await db.select().from(inventoryLots)
      .where(and(
        eq(inventoryLots.itemId, itemId),
        eq(inventoryLots.warehouseId, warehouseId),
        eq(inventoryLots.isActive, true),
        sql`${inventoryLots.qtyInMinor}::numeric > 0`,
        expiryCondition
      ))
      .orderBy(asc(inventoryLots.expiryYear), asc(inventoryLots.expiryMonth), asc(inventoryLots.receivedDate));

    const allocations: any[] = [];
    let remaining = requiredQty;

    for (const lot of lots) {
      if (remaining <= 0) break;
      const available = parseFloat(lot.qtyInMinor);
      const allocated = Math.min(available, remaining);
      allocations.push({
        lotId: lot.id,
        expiryDate: lot.expiryDate,
        expiryMonth: lot.expiryMonth,
        expiryYear: lot.expiryYear,
        receivedDate: lot.receivedDate,
        availableQty: available.toFixed(4),
        allocatedQty: allocated.toFixed(4),
        unitCost: lot.purchasePrice,
        lotSalePrice: lot.salePrice || "0",
      });
      remaining -= allocated;
    }

    return {
      allocations,
      fulfilled: remaining <= 0,
      shortfall: remaining > 0 ? remaining.toFixed(4) : "0",
    };
  }

  async getItemAvailability(itemId: string, warehouseId: string): Promise<string> {
    const [result] = await db.select({
      total: sql<string>`COALESCE(SUM(${inventoryLots.qtyInMinor}::numeric), 0)::text`
    })
      .from(inventoryLots)
      .where(and(
        eq(inventoryLots.itemId, itemId),
        eq(inventoryLots.warehouseId, warehouseId),
        eq(inventoryLots.isActive, true),
        sql`${inventoryLots.qtyInMinor}::numeric > 0`
      ));
    return result?.total || "0";
  }

  async getExpiryOptions(itemId: string, warehouseId: string, asOfDate: string): Promise<{expiryDate: string; expiryMonth: number | null; expiryYear: number | null; qtyAvailableMinor: string; lotSalePrice?: string}[]> {
    const [item] = await db.select().from(items).where(eq(items.id, itemId));
    if (!item || !item.hasExpiry) return [];
    
    const asOf = new Date(asOfDate);
    const asOfMonth = asOf.getMonth() + 1;
    const asOfYear = asOf.getFullYear();

    const results = await db.select({
      expiryMonth: inventoryLots.expiryMonth,
      expiryYear: inventoryLots.expiryYear,
      qtyAvailableMinor: sql<string>`SUM(${inventoryLots.qtyInMinor}::numeric)::text`,
      minSalePrice: sql<string>`MIN(${inventoryLots.salePrice})::text`,
      maxSalePrice: sql<string>`MAX(${inventoryLots.salePrice})::text`,
    })
      .from(inventoryLots)
      .where(and(
        eq(inventoryLots.itemId, itemId),
        eq(inventoryLots.warehouseId, warehouseId),
        eq(inventoryLots.isActive, true),
        sql`${inventoryLots.qtyInMinor}::numeric > 0`,
        sql`${inventoryLots.expiryMonth} IS NOT NULL`,
        sql`${inventoryLots.expiryYear} IS NOT NULL`,
        sql`(${inventoryLots.expiryYear} > ${asOfYear} OR (${inventoryLots.expiryYear} = ${asOfYear} AND ${inventoryLots.expiryMonth} >= ${asOfMonth}))`
      ))
      .groupBy(inventoryLots.expiryMonth, inventoryLots.expiryYear)
      .orderBy(asc(inventoryLots.expiryYear), asc(inventoryLots.expiryMonth));

    return results.filter(r => r.expiryMonth !== null && r.expiryYear !== null).map(r => ({
      expiryDate: `${r.expiryYear}-${String(r.expiryMonth).padStart(2, '0')}-01`,
      expiryMonth: r.expiryMonth,
      expiryYear: r.expiryYear,
      qtyAvailableMinor: r.qtyAvailableMinor,
      lotSalePrice: r.minSalePrice || undefined,
    }));
  }

  async getItemAvailabilitySummary(itemId: string, asOfDate: string, excludeExpired: boolean): Promise<{warehouseId: string; warehouseNameAr: string; qtyMinor: string; majorUnitName: string | null; majorToMinor: string | null}[]> {
    const [item] = await db.select({ hasExpiry: items.hasExpiry, majorUnitName: items.majorUnitName, majorToMinor: items.majorToMinor }).from(items).where(eq(items.id, itemId));
    if (!item) return [];

    const conditions: any[] = [
      eq(inventoryLots.itemId, itemId),
      eq(inventoryLots.isActive, true),
      sql`${inventoryLots.qtyInMinor}::numeric > 0`,
    ];

    if (excludeExpired && item.hasExpiry) {
      const asOf = new Date(asOfDate);
      const asOfMonth = asOf.getMonth() + 1;
      const asOfYear = asOf.getFullYear();
      conditions.push(
        sql`(${inventoryLots.expiryMonth} IS NULL OR ${inventoryLots.expiryYear} > ${asOfYear} OR (${inventoryLots.expiryYear} = ${asOfYear} AND ${inventoryLots.expiryMonth} >= ${asOfMonth}))`
      );
    }

    const results = await db.select({
      warehouseId: inventoryLots.warehouseId,
      warehouseNameAr: warehouses.nameAr,
      qtyMinor: sql<string>`SUM(${inventoryLots.qtyInMinor}::numeric)::text`,
    })
      .from(inventoryLots)
      .innerJoin(warehouses, and(eq(warehouses.id, inventoryLots.warehouseId), eq(warehouses.isActive, true)))
      .where(and(...conditions))
      .groupBy(inventoryLots.warehouseId, warehouses.nameAr)
      .orderBy(warehouses.nameAr);

    return results.filter(r => r.warehouseId !== null).map(r => ({
      warehouseId: r.warehouseId!,
      warehouseNameAr: r.warehouseNameAr,
      qtyMinor: r.qtyMinor,
      majorUnitName: item.majorUnitName,
      majorToMinor: item.majorToMinor,
    }));
  }

  async searchItemsAdvanced(params: {
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
  }): Promise<{items: any[]; total: number}> {
    const { mode, query, warehouseId, page, pageSize, includeZeroStock, drugsOnly, excludeServices, minPrice, maxPrice } = params;
    const offset = (page - 1) * pageSize;

    const buildPattern = (q: string) => {
      if (!q.includes('%')) return `%${q}%`;
      let p = q;
      if (!p.startsWith('%')) p = `%${p}`;
      if (!p.endsWith('%')) p = `${p}%`;
      return p;
    };

    let searchCondition: any;
    let joinBarcode = false;

    switch (mode) {
      case 'AR':
        searchCondition = ilike(items.nameAr, buildPattern(query));
        break;
      case 'EN':
        searchCondition = ilike(sql`COALESCE(${items.nameEn}, '')`, buildPattern(query));
        break;
      case 'CODE':
        searchCondition = ilike(items.itemCode, buildPattern(query));
        break;
      case 'BARCODE':
        joinBarcode = true;
        searchCondition = ilike(itemBarcodes.barcodeValue, buildPattern(query));
        break;
      default:
        searchCondition = ilike(items.nameAr, buildPattern(query));
    }

    const conditions: any[] = [eq(items.isActive, true), searchCondition];
    if (drugsOnly) {
      conditions.push(eq(items.category, 'drug'));
    }
    if (excludeServices) {
      conditions.push(sql`${items.category} != 'service'`);
    }
    if (minPrice !== undefined) {
      conditions.push(sql`${items.salePriceCurrent}::numeric >= ${minPrice}`);
    }
    if (maxPrice !== undefined) {
      conditions.push(sql`${items.salePriceCurrent}::numeric <= ${maxPrice}`);
    }

    const itemIdRef = sql.raw(`"items"."id"`);
    const availQtySql = sql<string>`COALESCE((
      SELECT SUM(il.qty_in_minor::numeric)::text
      FROM inventory_lots il
      WHERE il.item_id = ${itemIdRef}
        AND il.warehouse_id = ${warehouseId}
        AND il.is_active = true
        AND il.qty_in_minor::numeric > 0
    ), '0')`;

    const nearestExpirySql = sql<string>`(
      SELECT MIN(il.expiry_date)::text
      FROM inventory_lots il
      WHERE il.item_id = ${itemIdRef}
        AND il.warehouse_id = ${warehouseId}
        AND il.is_active = true
        AND il.qty_in_minor::numeric > 0
        AND il.expiry_date IS NOT NULL
        AND il.expiry_date >= CURRENT_DATE
    )`;

    const nearestExpiryMonthSql = sql<number>`(
      SELECT il.expiry_month
      FROM inventory_lots il
      WHERE il.item_id = ${itemIdRef}
        AND il.warehouse_id = ${warehouseId}
        AND il.is_active = true
        AND il.qty_in_minor::numeric > 0
        AND il.expiry_month IS NOT NULL
        AND il.expiry_year IS NOT NULL
        AND (il.expiry_year > EXTRACT(YEAR FROM CURRENT_DATE)::int OR (il.expiry_year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND il.expiry_month >= EXTRACT(MONTH FROM CURRENT_DATE)::int))
      ORDER BY il.expiry_year ASC, il.expiry_month ASC
      LIMIT 1
    )`;

    const nearestExpiryYearSql = sql<number>`(
      SELECT il.expiry_year
      FROM inventory_lots il
      WHERE il.item_id = ${itemIdRef}
        AND il.warehouse_id = ${warehouseId}
        AND il.is_active = true
        AND il.qty_in_minor::numeric > 0
        AND il.expiry_month IS NOT NULL
        AND il.expiry_year IS NOT NULL
        AND (il.expiry_year > EXTRACT(YEAR FROM CURRENT_DATE)::int OR (il.expiry_year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND il.expiry_month >= EXTRACT(MONTH FROM CURRENT_DATE)::int))
      ORDER BY il.expiry_year ASC, il.expiry_month ASC
      LIMIT 1
    )`;

    const nearestExpiryQtySql = sql<string>`(
      SELECT SUM(il.qty_in_minor::numeric)::text
      FROM inventory_lots il
      WHERE il.item_id = ${itemIdRef}
        AND il.warehouse_id = ${warehouseId}
        AND il.is_active = true
        AND il.qty_in_minor::numeric > 0
        AND il.expiry_date = (
          SELECT MIN(il2.expiry_date)
          FROM inventory_lots il2
          WHERE il2.item_id = ${itemIdRef}
            AND il2.warehouse_id = ${warehouseId}
            AND il2.is_active = true
            AND il2.qty_in_minor::numeric > 0
            AND il2.expiry_date IS NOT NULL
            AND il2.expiry_date >= CURRENT_DATE
        )
    )`;

    if (joinBarcode) {
      const baseQuery = db.select({
        id: items.id,
        itemCode: items.itemCode,
        nameAr: items.nameAr,
        nameEn: items.nameEn,
        hasExpiry: items.hasExpiry,
        category: items.category,
        majorUnitName: items.majorUnitName,
        minorUnitName: items.minorUnitName,
        majorToMinor: items.majorToMinor,
        majorToMedium: items.majorToMedium,
        mediumUnitName: items.mediumUnitName,
        mediumToMinor: items.mediumToMinor,
        salePriceCurrent: items.salePriceCurrent,
        availableQtyMinor: availQtySql,
        nearestExpiryDate: nearestExpirySql,
        nearestExpiryMonth: nearestExpiryMonthSql,
        nearestExpiryYear: nearestExpiryYearSql,
        nearestExpiryQtyMinor: nearestExpiryQtySql,
      })
        .from(items)
        .innerJoin(itemBarcodes, and(eq(itemBarcodes.itemId, items.id), eq(itemBarcodes.isActive, true)))
        .where(and(...conditions))
        .groupBy(items.id);

      if (!includeZeroStock) {
        const allResults = await baseQuery.orderBy(asc(items.itemCode));
        const filtered = allResults.filter(r => parseFloat(r.availableQtyMinor) > 0);
        const total = filtered.length;
        const paged = filtered.slice(offset, offset + pageSize);
        return { items: paged, total };
      }

      const countResult = await db.select({ count: sql<number>`COUNT(DISTINCT ${items.id})` })
        .from(items)
        .innerJoin(itemBarcodes, and(eq(itemBarcodes.itemId, items.id), eq(itemBarcodes.isActive, true)))
        .where(and(...conditions));

      const total = countResult[0]?.count || 0;
      const results = await baseQuery.orderBy(asc(items.itemCode)).limit(pageSize).offset(offset);
      return { items: results, total };
    }

    if (!includeZeroStock) {
      const allResults = await db.select({
        id: items.id,
        itemCode: items.itemCode,
        nameAr: items.nameAr,
        nameEn: items.nameEn,
        hasExpiry: items.hasExpiry,
        category: items.category,
        majorUnitName: items.majorUnitName,
        minorUnitName: items.minorUnitName,
        majorToMinor: items.majorToMinor,
        majorToMedium: items.majorToMedium,
        mediumUnitName: items.mediumUnitName,
        mediumToMinor: items.mediumToMinor,
        salePriceCurrent: items.salePriceCurrent,
        availableQtyMinor: availQtySql,
        nearestExpiryDate: nearestExpirySql,
        nearestExpiryMonth: nearestExpiryMonthSql,
        nearestExpiryYear: nearestExpiryYearSql,
        nearestExpiryQtyMinor: nearestExpiryQtySql,
      })
        .from(items)
        .where(and(...conditions))
        .orderBy(asc(items.itemCode));

      const filtered = allResults.filter(r => parseFloat(r.availableQtyMinor) > 0);
      const total = filtered.length;
      const paged = filtered.slice(offset, offset + pageSize);
      return { items: paged, total };
    }

    const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(items)
      .where(and(...conditions));

    const total = countResult?.count || 0;

    const results = await db.select({
      id: items.id,
      itemCode: items.itemCode,
      nameAr: items.nameAr,
      nameEn: items.nameEn,
      hasExpiry: items.hasExpiry,
      category: items.category,
      majorUnitName: items.majorUnitName,
      minorUnitName: items.minorUnitName,
      majorToMinor: items.majorToMinor,
      majorToMedium: items.majorToMedium,
      mediumUnitName: items.mediumUnitName,
      mediumToMinor: items.mediumToMinor,
      salePriceCurrent: items.salePriceCurrent,
      availableQtyMinor: availQtySql,
      nearestExpiryDate: nearestExpirySql,
      nearestExpiryMonth: nearestExpiryMonthSql,
      nearestExpiryYear: nearestExpiryYearSql,
      nearestExpiryQtyMinor: nearestExpiryQtySql,
    })
      .from(items)
      .where(and(...conditions))
      .orderBy(asc(items.itemCode))
      .limit(pageSize)
      .offset(offset);

    return { items: results, total };
  }

  async searchItemsByPattern(query: string, limit: number): Promise<any[]> {
    const buildPattern = (q: string) => {
      if (!q.includes('%')) return `%${q}%`;
      let p = q;
      if (!p.startsWith('%')) p = `%${p}`;
      if (!p.endsWith('%')) p = `${p}%`;
      return p;
    };

    const pattern = buildPattern(query);
    const searchCondition = or(
      ilike(items.nameAr, pattern),
      ilike(sql`COALESCE(${items.nameEn}, '')`, pattern),
      ilike(items.itemCode, pattern)
    );

    const results = await db.select({
      id: items.id,
      itemCode: items.itemCode,
      nameAr: items.nameAr,
      nameEn: items.nameEn,
      hasExpiry: items.hasExpiry,
      category: items.category,
      majorUnitName: items.majorUnitName,
      minorUnitName: items.minorUnitName,
      majorToMinor: items.majorToMinor,
      majorToMedium: items.majorToMedium,
      mediumUnitName: items.mediumUnitName,
      mediumToMinor: items.mediumToMinor,
      salePriceCurrent: items.salePriceCurrent,
      purchasePriceLast: items.purchasePriceLast,
    })
      .from(items)
      .where(and(eq(items.isActive, true), searchCondition))
      .orderBy(asc(items.itemCode))
      .limit(limit);

    return results;
  }

  async getTransfersFiltered(params: {
    fromDate?: string;
    toDate?: string;
    sourceWarehouseId?: string;
    destWarehouseId?: string;
    status?: string;
    search?: string;
    page: number;
    pageSize: number;
    includeCancelled?: boolean;
  }): Promise<{data: StoreTransferWithDetails[]; total: number}> {
    const { fromDate, toDate, sourceWarehouseId, destWarehouseId, status, search, page, pageSize, includeCancelled } = params;
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];

    if (fromDate) {
      conditions.push(gte(storeTransfers.transferDate, fromDate));
    }
    if (toDate) {
      conditions.push(lte(storeTransfers.transferDate, toDate));
    }
    if (sourceWarehouseId) {
      conditions.push(eq(storeTransfers.sourceWarehouseId, sourceWarehouseId));
    }
    if (destWarehouseId) {
      conditions.push(eq(storeTransfers.destinationWarehouseId, destWarehouseId));
    }
    if (status) {
      conditions.push(eq(storeTransfers.status, status as any));
    } else if (!includeCancelled) {
      conditions.push(sql`${storeTransfers.status} != 'cancelled'`);
    }
    if (search && search.trim()) {
      const searchTerm = search.trim().replace(/^TRF-/i, '');
      const numericSearch = parseInt(searchTerm, 10);
      if (!isNaN(numericSearch)) {
        conditions.push(eq(storeTransfers.transferNumber, numericSearch));
      } else {
        const matchingItemIds = await db.select({ id: items.id })
          .from(items)
          .where(or(
            ilike(items.nameAr, `%${searchTerm}%`),
            ilike(items.itemCode, `%${searchTerm}%`)
          ));

        if (matchingItemIds.length > 0) {
          const transferIdsWithItem = await db.selectDistinct({ transferId: transferLines.transferId })
            .from(transferLines)
            .where(sql`${transferLines.itemId} IN (${sql.join(matchingItemIds.map(i => sql`${i.id}`), sql`, `)})`);

          if (transferIdsWithItem.length > 0) {
            conditions.push(sql`${storeTransfers.id} IN (${sql.join(transferIdsWithItem.map(t => sql`${t.transferId}`), sql`, `)})`);
          } else {
            return { data: [], total: 0 };
          }
        } else {
          return { data: [], total: 0 };
        }
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(storeTransfers)
      .where(whereClause);

    const total = countResult?.count || 0;

    const transfers = await db.select().from(storeTransfers)
      .where(whereClause)
      .orderBy(desc(storeTransfers.createdAt))
      .limit(pageSize)
      .offset(offset);

    const result: StoreTransferWithDetails[] = [];
    for (const t of transfers) {
      const [srcWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.sourceWarehouseId));
      const [destWh] = await db.select().from(warehouses).where(eq(warehouses.id, t.destinationWarehouseId));
      const lines = await db.select().from(transferLines).where(eq(transferLines.transferId, t.id));
      const linesWithItems: TransferLineWithItem[] = [];
      for (const line of lines) {
        const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
        linesWithItems.push({ ...line, item });
      }
      result.push({ ...t, sourceWarehouse: srcWh, destinationWarehouse: destWh, lines: linesWithItems });
    }

    return { data: result, total };
  }

  async searchItemsForTransfer(query: string, warehouseId: string, limit: number = 10): Promise<any[]> {
    const searchTerms = query.trim().split('%').filter(Boolean);

    let conditions: any[] = [eq(items.isActive, true)];

    if (searchTerms.length > 1) {
      const nameConditions = searchTerms.map(term =>
        ilike(items.nameAr, `%${term}%`)
      );
      conditions.push(and(...nameConditions));
    } else if (searchTerms.length === 1) {
      const term = searchTerms[0];
      conditions.push(
        or(
          ilike(items.itemCode, `%${term}%`),
          ilike(items.nameAr, `%${term}%`),
          ilike(items.nameEn || '', `%${term}%`)
        )
      );
    }

    const results = await db.select().from(items)
      .where(and(...conditions))
      .orderBy(asc(items.itemCode))
      .limit(limit);

    const enriched = [];
    for (const item of results) {
      const avail = await this.getItemAvailability(item.id, warehouseId);
      enriched.push({
        ...item,
        availableQtyMinor: avail,
      });
    }
    return enriched;
  }

  async seedPilotTest(): Promise<{ warehouses: any[]; items: any[]; lots: any[] }> {
    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

    return await db.transaction(async (tx) => {
      const warehouseDefs = [
        { warehouseCode: "WH-PH-IN", nameAr: "صيدلية داخلية" },
        { warehouseCode: "WH-OR", nameAr: "مخزن العمليات" },
      ];

      const createdWarehouses: any[] = [];
      for (const whDef of warehouseDefs) {
        const [existing] = await tx.select().from(warehouses).where(eq(warehouses.warehouseCode, whDef.warehouseCode));
        if (existing) {
          createdWarehouses.push(existing);
        } else {
          const [inserted] = await tx.insert(warehouses).values(whDef).returning();
          createdWarehouses.push(inserted);
        }
      }

      const whPhIn = createdWarehouses.find(w => w.warehouseCode === "WH-PH-IN")!;

      const itemDefs = [
        {
          itemCode: "TEST-DRUG-1",
          category: "drug" as const,
          hasExpiry: true,
          nameAr: "باراسيتامول 500mg تجريبي",
          majorUnitName: "علبة",
          minorUnitName: "شريط",
          majorToMinor: "10",
          purchasePriceLast: "100",
          salePriceCurrent: "150",
        },
        {
          itemCode: "TEST-DRUG-2",
          category: "drug" as const,
          hasExpiry: true,
          nameAr: "أموكسيسيلين 250mg تجريبي",
          majorUnitName: "علبة",
          minorUnitName: "قرص",
          majorToMinor: "20",
          purchasePriceLast: "200",
          salePriceCurrent: "300",
        },
        {
          itemCode: "TEST-SUP-1",
          category: "supply" as const,
          hasExpiry: false,
          nameAr: "قفازات طبية تجريبي",
          majorUnitName: "علبة",
          minorUnitName: "قطعة",
          majorToMinor: "50",
          purchasePriceLast: "30",
          salePriceCurrent: "45",
        },
      ];

      const createdItems: any[] = [];
      for (const itemDef of itemDefs) {
        const [existing] = await tx.select().from(items).where(eq(items.itemCode, itemDef.itemCode));
        if (existing) {
          createdItems.push(existing);
        } else {
          const [inserted] = await tx.insert(items).values(itemDef).returning();
          createdItems.push(inserted);
        }
      }

      const drug1 = createdItems.find(i => i.itemCode === "TEST-DRUG-1")!;
      const drug2 = createdItems.find(i => i.itemCode === "TEST-DRUG-2")!;
      const sup1 = createdItems.find(i => i.itemCode === "TEST-SUP-1")!;

      const lotDefs = [
        {
          itemId: drug1.id,
          warehouseId: whPhIn.id,
          expiryDate: formatDate(addDays(today, 30)),
          receivedDate: formatDate(addDays(today, -5)),
          purchasePrice: "100.0000",
          qtyInMinor: "50.0000",
          label: "TEST-DRUG-1 LotA",
        },
        {
          itemId: drug1.id,
          warehouseId: whPhIn.id,
          expiryDate: formatDate(addDays(today, 90)),
          receivedDate: formatDate(addDays(today, -3)),
          purchasePrice: "105.0000",
          qtyInMinor: "100.0000",
          label: "TEST-DRUG-1 LotB",
        },
        {
          itemId: drug1.id,
          warehouseId: whPhIn.id,
          expiryDate: formatDate(addDays(today, -10)),
          receivedDate: formatDate(addDays(today, -60)),
          purchasePrice: "95.0000",
          qtyInMinor: "200.0000",
          label: "TEST-DRUG-1 LotExpired",
        },
        {
          itemId: drug2.id,
          warehouseId: whPhIn.id,
          expiryDate: formatDate(addDays(today, 60)),
          receivedDate: formatDate(addDays(today, -7)),
          purchasePrice: "200.0000",
          qtyInMinor: "40.0000",
          label: "TEST-DRUG-2 Lot1",
        },
        {
          itemId: sup1.id,
          warehouseId: whPhIn.id,
          expiryDate: null as string | null,
          receivedDate: formatDate(addDays(today, -10)),
          purchasePrice: "30.0000",
          qtyInMinor: "500.0000",
          label: "TEST-SUP-1 Lot1",
        },
      ];

      const createdLots: any[] = [];
      for (const lotDef of lotDefs) {
        const { label, ...lotData } = lotDef;

        const expiryCondition = lotData.expiryDate === null
          ? sql`${inventoryLots.expiryDate} IS NULL`
          : eq(inventoryLots.expiryDate, lotData.expiryDate);

        const [existing] = await tx.select().from(inventoryLots).where(
          and(
            eq(inventoryLots.itemId, lotData.itemId),
            eq(inventoryLots.warehouseId, lotData.warehouseId),
            expiryCondition,
            eq(inventoryLots.purchasePrice, lotData.purchasePrice),
          )
        );

        if (existing) {
          const [updated] = await tx.update(inventoryLots)
            .set({ qtyInMinor: lotData.qtyInMinor })
            .where(eq(inventoryLots.id, existing.id))
            .returning();
          createdLots.push({ ...updated, label });
        } else {
          const [inserted] = await tx.insert(inventoryLots).values(lotData).returning();
          createdLots.push({ ...inserted, label });
        }
      }

      return {
        warehouses: createdWarehouses.map(w => ({ id: w.id, warehouseCode: w.warehouseCode, nameAr: w.nameAr })),
        items: createdItems.map(i => ({ id: i.id, itemCode: i.itemCode, nameAr: i.nameAr })),
        lots: createdLots.map(l => ({ id: l.id, label: l.label, itemId: l.itemId, warehouseId: l.warehouseId, expiryDate: l.expiryDate, qtyInMinor: l.qtyInMinor })),
      };
    });
  }
  // ===== SUPPLIERS =====
  async getSuppliers(params: { search?: string; page: number; pageSize: number }): Promise<{ suppliers: Supplier[]; total: number }> {
    const { search, page = 1, pageSize = 50 } = params;
    const offset = (page - 1) * pageSize;
    const conditions: any[] = [eq(suppliers.isActive, true)];
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(
        ilike(suppliers.nameAr, pattern),
        ilike(suppliers.code, pattern),
        ilike(suppliers.phone, pattern),
        ilike(suppliers.taxId, pattern)
      ));
    }
    const where = conditions.length > 1 ? and(...conditions) : conditions[0];
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(suppliers).where(where);
    const results = await db.select().from(suppliers).where(where).orderBy(suppliers.nameAr).limit(pageSize).offset(offset);
    return { suppliers: results, total: Number(countResult.count) };
  }

  async searchSuppliers(q: string, limit: number = 20): Promise<Pick<Supplier, 'id' | 'code' | 'nameAr' | 'nameEn' | 'phone'>[]> {
    const trimmed = q.trim();
    if (!trimmed) return [];
    const isNumericLike = /^\d+$/.test(trimmed);
    let results;
    if (isNumericLike) {
      results = await db.select({
        id: suppliers.id, code: suppliers.code, nameAr: suppliers.nameAr, nameEn: suppliers.nameEn, phone: suppliers.phone,
      }).from(suppliers).where(and(eq(suppliers.isActive, true), or(
        eq(suppliers.code, trimmed),
        ilike(suppliers.code, `${trimmed}%`),
        ilike(suppliers.phone, `%${trimmed}%`),
      ))).orderBy(sql`CASE WHEN ${suppliers.code} = ${trimmed} THEN 0 ELSE 1 END`, suppliers.code).limit(limit);
    } else {
      const pattern = `%${trimmed}%`;
      results = await db.select({
        id: suppliers.id, code: suppliers.code, nameAr: suppliers.nameAr, nameEn: suppliers.nameEn, phone: suppliers.phone,
      }).from(suppliers).where(and(eq(suppliers.isActive, true), or(
        ilike(suppliers.nameAr, pattern),
        ilike(suppliers.nameEn, pattern),
        ilike(suppliers.code, pattern),
        ilike(suppliers.phone, pattern),
        ilike(suppliers.taxId, pattern),
      ))).orderBy(suppliers.nameAr).limit(limit);
    }
    return results;
  }

  async getSupplier(id: string): Promise<Supplier | undefined> {
    const [s] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return s;
  }

  async createSupplier(supplier: InsertSupplier): Promise<Supplier> {
    const [s] = await db.insert(suppliers).values(supplier).returning();
    return s;
  }

  async updateSupplier(id: string, supplier: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const [s] = await db.update(suppliers).set(supplier).where(eq(suppliers.id, id)).returning();
    return s;
  }

  // ===== RECEIVING =====
  async getReceivings(params: { supplierId?: string; warehouseId?: string; status?: string; statusFilter?: string; fromDate?: string; toDate?: string; search?: string; page: number; pageSize: number; includeCancelled?: boolean }): Promise<{ data: ReceivingHeaderWithDetails[]; total: number }> {
    const { supplierId, warehouseId, status, statusFilter, fromDate, toDate, search, page = 1, pageSize = 50, includeCancelled } = params;
    const offset = (page - 1) * pageSize;
    const conditions: any[] = [];
    if (supplierId) conditions.push(eq(receivingHeaders.supplierId, supplierId));
    if (warehouseId) conditions.push(eq(receivingHeaders.warehouseId, warehouseId));
    if (status) {
      conditions.push(eq(receivingHeaders.status, status as any));
    } else if (!includeCancelled) {
      conditions.push(sql`${receivingHeaders.status} != 'cancelled'`);
    }
    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'DRAFT') {
        conditions.push(eq(receivingHeaders.status, 'draft' as any));
      } else if (statusFilter === 'POSTED') {
        conditions.push(eq(receivingHeaders.status, 'posted_qty_only' as any));
        conditions.push(isNull(receivingHeaders.convertedToInvoiceId));
      } else if (statusFilter === 'CONVERTED') {
        conditions.push(isNotNull(receivingHeaders.convertedToInvoiceId));
      } else if (statusFilter === 'CORRECTED') {
        conditions.push(eq(receivingHeaders.correctionStatus, 'corrected'));
      }
    }
    if (fromDate) conditions.push(gte(receivingHeaders.receiveDate, fromDate));
    if (toDate) conditions.push(lte(receivingHeaders.receiveDate, toDate));
    if (search) {
      const searchStripped = search.replace(/^RCV-/i, '').trim();
      conditions.push(or(
        ilike(receivingHeaders.supplierInvoiceNo, `%${search}%`),
        sql`${receivingHeaders.receivingNumber}::text ILIKE ${`%${searchStripped}%`}`,
        sql`EXISTS (SELECT 1 FROM suppliers WHERE suppliers.id = ${receivingHeaders.supplierId} AND (suppliers.name_ar ILIKE ${`%${search}%`} OR suppliers.name_en ILIKE ${`%${search}%`}))`
      ));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(receivingHeaders).where(where);
    const headers = await db.select().from(receivingHeaders).where(where).orderBy(desc(receivingHeaders.receiveDate), desc(receivingHeaders.receivingNumber)).limit(pageSize).offset(offset);
    
    const data: ReceivingHeaderWithDetails[] = [];
    for (const h of headers) {
      const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, h.supplierId));
      const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
      const lines = await db.select().from(receivingLines).where(eq(receivingLines.receivingId, h.id));
      const linesWithItems: ReceivingLineWithItem[] = [];
      for (const line of lines) {
        const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
        linesWithItems.push({ ...line, item });
      }
      data.push({ ...h, supplier: sup, warehouse: wh, lines: linesWithItems });
    }
    return { data, total: Number(countResult.count) };
  }

  async getReceiving(id: string): Promise<ReceivingHeaderWithDetails | undefined> {
    const [h] = await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, id));
    if (!h) return undefined;
    const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, h.supplierId));
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
    const lines = await db.select().from(receivingLines).where(eq(receivingLines.receivingId, h.id));
    const linesWithItems: ReceivingLineWithItem[] = [];
    for (const line of lines) {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      linesWithItems.push({ ...line, item });
    }
    return { ...h, supplier: sup, warehouse: wh, lines: linesWithItems };
  }

  async getNextReceivingNumber(): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(receiving_number), 0)` }).from(receivingHeaders);
    return (result?.max || 0) + 1;
  }

  async checkSupplierInvoiceUnique(supplierId: string, supplierInvoiceNo: string, excludeId?: string): Promise<boolean> {
    const conditions = [eq(receivingHeaders.supplierId, supplierId), eq(receivingHeaders.supplierInvoiceNo, supplierInvoiceNo)];
    if (excludeId) {
      conditions.push(sql`${receivingHeaders.id} != ${excludeId}`);
    }
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(receivingHeaders).where(and(...conditions));
    return Number(result.count) === 0;
  }

  async saveDraftReceiving(header: InsertReceivingHeader, lines: { itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; purchasePrice: string; lineTotal: string; batchNumber?: string; expiryDate?: string; expiryMonth?: number; expiryYear?: number; salePrice?: string; salePriceHint?: string; notes?: string; isRejected?: boolean; rejectionReason?: string; bonusQty?: string; bonusQtyInMinor?: string }[], existingId?: string): Promise<ReceivingHeader> {
    return await db.transaction(async (tx) => {
      let header_result: ReceivingHeader;
      if (existingId) {
        const [existing] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, existingId));
        if (!existing || existing.status !== 'draft') throw new Error('لا يمكن تعديل مستند مُرحّل');
        
        await tx.update(receivingHeaders).set({
          ...header,
          updatedAt: new Date(),
        }).where(eq(receivingHeaders.id, existingId));
        
        await tx.delete(receivingLines).where(eq(receivingLines.receivingId, existingId));
        [header_result] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, existingId));
      } else {
        const nextNum = await this.getNextReceivingNumber();
        [header_result] = await tx.insert(receivingHeaders).values({
          ...header,
          receivingNumber: nextNum,
        } as any).returning();
      }
      
      let totalQty = 0;
      let totalCost = 0;
      
      for (const line of lines) {
        const lt = parseFloat(line.lineTotal) || 0;
        const qty = parseFloat(line.qtyInMinor) || 0;
        totalQty += qty;
        totalCost += lt;
        
        let resolvedUnitLevel = line.unitLevel;
        if (!resolvedUnitLevel || resolvedUnitLevel.trim() === '') {
          const [lineItem] = await tx.select().from(items).where(eq(items.id, line.itemId));
          resolvedUnitLevel = lineItem?.majorUnitName ? 'major' : 'minor';
        }
        
        await tx.insert(receivingLines).values({
          receivingId: header_result.id,
          itemId: line.itemId,
          unitLevel: resolvedUnitLevel as any,
          qtyEntered: line.qtyEntered,
          qtyInMinor: line.qtyInMinor,
          purchasePrice: line.purchasePrice,
          lineTotal: line.lineTotal,
          batchNumber: line.batchNumber || null,
          expiryDate: line.expiryDate || null,
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
          salePrice: line.salePrice || null,
          salePriceHint: line.salePriceHint || null,
          notes: line.notes || null,
          isRejected: line.isRejected || false,
          rejectionReason: line.rejectionReason || null,
          bonusQty: line.bonusQty || "0",
          bonusQtyInMinor: line.bonusQtyInMinor || "0",
        });
      }
      
      await tx.update(receivingHeaders).set({
        totalQty: totalQty.toFixed(4),
        totalCost: roundMoney(totalCost),
      }).where(eq(receivingHeaders.id, header_result.id));
      
      [header_result] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, header_result.id));
      return header_result;
    });
  }

  async postReceiving(id: string): Promise<ReceivingHeader> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM receiving_headers WHERE id = ${id} FOR UPDATE`);
      const header = lockResult.rows?.[0] as any;
      if (!header) throw new Error('المستند غير موجود');
      if (header.status === 'posted' || header.status === 'posted_qty_only') return header;
      
      if (!header.supplier_id) throw new Error('المورد مطلوب');
      if (!header.supplier_invoice_no?.trim()) throw new Error('رقم فاتورة المورد مطلوب');
      if (!header.warehouse_id) throw new Error('المستودع مطلوب');
      
      const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, header.supplier_id));
      const supplierName = supplier?.nameAr || supplier?.nameEn || null;

      const lines = await tx.select().from(receivingLines).where(eq(receivingLines.receivingId, id));
      const activeLines = lines.filter(l => !l.isRejected);
      if (activeLines.length === 0) throw new Error('لا توجد أصناف للترحيل');
      
      for (const line of activeLines) {
        const qtyMinor = parseFloat(line.qtyInMinor) + parseFloat(line.bonusQtyInMinor || "0");
        if (qtyMinor <= 0) continue;
        
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
        if (!item) continue;
        
        if (item.hasExpiry && (!line.expiryMonth || !line.expiryYear)) throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية (شهر/سنة)`);
        if (!item.hasExpiry && (line.expiryMonth || line.expiryYear)) throw new Error(`الصنف "${item.nameAr}" لا يدعم تواريخ صلاحية`);
        
        const costPerMinor = convertPriceToMinorUnit(parseFloat(line.purchasePrice), line.unitLevel || 'minor', item);
        const costPerMinorStr = costPerMinor.toFixed(4);
        
        const lotConditions = [
          eq(inventoryLots.itemId, line.itemId),
          eq(inventoryLots.warehouseId, header.warehouse_id),
        ];
        if (line.expiryMonth && line.expiryYear) {
          lotConditions.push(eq(inventoryLots.expiryMonth, line.expiryMonth));
          lotConditions.push(eq(inventoryLots.expiryYear, line.expiryYear));
        } else {
          lotConditions.push(sql`${inventoryLots.expiryMonth} IS NULL`);
        }
        
        const existingLots = await tx.select().from(inventoryLots).where(and(...lotConditions));
        let lotId: string;
        
        const lotSalePrice = line.salePrice || "0";
        
        if (existingLots.length > 0) {
          const lot = existingLots[0];
          const newQty = parseFloat(lot.qtyInMinor) + qtyMinor;
          await tx.update(inventoryLots).set({ 
            qtyInMinor: newQty.toFixed(4),
            purchasePrice: costPerMinorStr,
            salePrice: lotSalePrice,
            updatedAt: new Date(),
          }).where(eq(inventoryLots.id, lot.id));
          lotId = lot.id;
        } else {
          const [newLot] = await tx.insert(inventoryLots).values({
            itemId: line.itemId,
            warehouseId: header.warehouse_id,
            expiryDate: line.expiryDate || null,
            expiryMonth: line.expiryMonth || null,
            expiryYear: line.expiryYear || null,
            receivedDate: header.receive_date,
            purchasePrice: costPerMinorStr,
            salePrice: lotSalePrice,
            qtyInMinor: qtyMinor.toFixed(4),
          }).returning();
          lotId = newLot.id;
        }
        
        await tx.insert(inventoryLotMovements).values({
          lotId,
          warehouseId: header.warehouse_id,
          txType: 'in',
          qtyChangeInMinor: qtyMinor.toFixed(4),
          unitCost: costPerMinorStr,
          referenceType: 'receiving',
          referenceId: header.id,
        });

        const purchaseQty = parseFloat(line.qtyEntered || line.qtyInMinor);
        const purchaseTotal = (parseFloat(line.qtyInMinor) * costPerMinor).toFixed(2);
        await tx.insert(purchaseTransactions).values({
          itemId: line.itemId,
          txDate: header.receive_date,
          supplierName,
          qty: line.qtyEntered || line.qtyInMinor,
          unitLevel: line.unitLevel || 'minor',
          purchasePrice: line.purchasePrice,
          salePriceSnapshot: line.salePrice || null,
          total: purchaseTotal,
        });
        
        const updateFields: any = { purchasePriceLast: line.purchasePrice, updatedAt: new Date() };
        if (line.salePrice) updateFields.salePriceCurrent = line.salePrice;
        await tx.update(items).set(updateFields).where(eq(items.id, line.itemId));
      }
      
      const [posted] = await tx.update(receivingHeaders).set({
        status: 'posted_qty_only',
        postedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(receivingHeaders.id, id)).returning();
      
      return posted;
    });

    const recvResult = await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, id));
    const recvHeader = recvResult[0] as any;
    if (recvHeader) {
      const recvLines = await db.select().from(receivingLines).where(eq(receivingLines.receivingId, id));
      const activeRecvLines = recvLines.filter(l => !l.isRejected);
      const totalCost = activeRecvLines.reduce((sum, l) => sum + parseFloat(l.lineTotal || "0"), 0);
      
      if (totalCost > 0) {
        this.generateJournalEntry({
          sourceType: "receiving",
          sourceDocumentId: id,
          reference: `RCV-${recvHeader.receivingNumber}`,
          description: `قيد استلام مورد رقم ${recvHeader.receivingNumber}`,
          entryDate: recvHeader.receiveDate,
          lines: [
            { lineType: "inventory", amount: String(totalCost) },
            { lineType: "payables", amount: String(totalCost) },
          ],
        }).catch(err => console.error("Auto journal for receiving failed:", err));
      }
    }

    return (await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, id)))[0];
  }

  async deleteReceiving(id: string, reason?: string): Promise<boolean> {
    const [header] = await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, id));
    if (!header) return false;
    if (header.status === 'posted' || header.status === 'posted_qty_only') throw new Error('لا يمكن إلغاء مستند مُرحّل');
    await db.update(receivingHeaders).set({
      status: "cancelled" as any,
      notes: reason ? `[ملغي] ${reason}` : (header.notes ? `[ملغي] ${header.notes}` : "[ملغي]"),
    }).where(eq(receivingHeaders.id, id));
    return true;
  }

  async getItemHints(itemId: string, supplierId: string, warehouseId: string): Promise<{ lastPurchasePrice: string | null; lastSalePrice: string | null; currentSalePrice: string; onHandMinor: string }> {
    const lastReceivingLine = await db.select({
      purchasePrice: receivingLines.purchasePrice,
      salePrice: receivingLines.salePrice,
      salePriceHint: receivingLines.salePriceHint,
    })
    .from(receivingLines)
    .innerJoin(receivingHeaders, eq(receivingLines.receivingId, receivingHeaders.id))
    .where(and(
      eq(receivingLines.itemId, itemId),
      or(eq(receivingHeaders.status, 'posted'), eq(receivingHeaders.status, 'posted_qty_only')),
      eq(receivingLines.isRejected, false),
    ))
    .orderBy(desc(receivingHeaders.postedAt))
    .limit(1);
    
    const [item] = await db.select().from(items).where(eq(items.id, itemId));
    
    let onHandMinor = "0";
    if (warehouseId) {
      const [onHandResult] = await db.select({
        total: sql<string>`COALESCE(SUM(${inventoryLots.qtyInMinor}::numeric), 0)::text`
      }).from(inventoryLots).where(and(
        eq(inventoryLots.itemId, itemId),
        eq(inventoryLots.warehouseId, warehouseId),
        eq(inventoryLots.isActive, true),
      ));
      onHandMinor = onHandResult?.total || "0";
    }
    
    const lastLine = lastReceivingLine[0];
    return {
      lastPurchasePrice: lastLine?.purchasePrice || item?.purchasePriceLast || null,
      lastSalePrice: lastLine?.salePrice || lastLine?.salePriceHint || null,
      currentSalePrice: item?.salePriceCurrent || "0",
      onHandMinor,
    };
  }

  async getItemWarehouseStats(itemId: string): Promise<{ warehouseId: string; warehouseName: string; warehouseCode: string; qtyMinor: string; expiryBreakdown: { expiryMonth: number | null; expiryYear: number | null; qty: string }[] }[]> {
    const warehouseTotals = await db.select({
      warehouseId: inventoryLots.warehouseId,
      warehouseName: warehouses.nameAr,
      warehouseCode: warehouses.warehouseCode,
      qtyMinor: sql<string>`SUM(${inventoryLots.qtyInMinor}::numeric)::text`,
    })
    .from(inventoryLots)
    .innerJoin(warehouses, eq(warehouses.id, inventoryLots.warehouseId))
    .where(and(
      eq(inventoryLots.itemId, itemId),
      eq(inventoryLots.isActive, true),
      sql`${inventoryLots.qtyInMinor}::numeric > 0`,
    ))
    .groupBy(inventoryLots.warehouseId, warehouses.nameAr, warehouses.warehouseCode)
    .orderBy(warehouses.nameAr);

    const expiryBreakdowns = await db.select({
      warehouseId: inventoryLots.warehouseId,
      expiryMonth: inventoryLots.expiryMonth,
      expiryYear: inventoryLots.expiryYear,
      qty: sql<string>`SUM(${inventoryLots.qtyInMinor}::numeric)::text`,
    })
    .from(inventoryLots)
    .where(and(
      eq(inventoryLots.itemId, itemId),
      eq(inventoryLots.isActive, true),
      sql`${inventoryLots.qtyInMinor}::numeric > 0`,
    ))
    .groupBy(inventoryLots.warehouseId, inventoryLots.expiryMonth, inventoryLots.expiryYear)
    .orderBy(inventoryLots.expiryYear, inventoryLots.expiryMonth);

    return warehouseTotals.filter(w => w.warehouseId !== null).map(w => ({
      warehouseId: w.warehouseId!,
      warehouseName: w.warehouseName,
      warehouseCode: w.warehouseCode,
      qtyMinor: w.qtyMinor,
      expiryBreakdown: expiryBreakdowns
        .filter(e => e.warehouseId === w.warehouseId)
        .map(e => ({
          expiryMonth: e.expiryMonth,
          expiryYear: e.expiryYear,
          qty: e.qty,
        })),
    }));
  }

  // ===== PURCHASE INVOICES =====
  async convertReceivingToInvoice(receivingId: string): Promise<any> {
    return await db.transaction(async (tx) => {
      const [receiving] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, receivingId));
      if (!receiving) throw new Error("إذن الاستلام غير موجود");
      if (receiving.status === "draft") throw new Error("يجب ترحيل إذن الاستلام أولاً");
      if (receiving.convertedToInvoiceId) {
        const existingInvoice = await this.getPurchaseInvoice(receiving.convertedToInvoiceId);
        if (existingInvoice) return existingInvoice;
      }

      const lines = await tx.select().from(receivingLines).where(eq(receivingLines.receivingId, receivingId));
      const nextNum = await this.getNextPurchaseInvoiceNumber();

      const [invoice] = await tx.insert(purchaseInvoiceHeaders).values({
        invoiceNumber: nextNum,
        supplierId: receiving.supplierId,
        supplierInvoiceNo: receiving.supplierInvoiceNo,
        warehouseId: receiving.warehouseId,
        receivingId: receiving.id,
        invoiceDate: receiving.receiveDate,
        notes: null,
      } as any).returning();

      for (const line of lines) {
        if (line.isRejected) continue;
        await tx.insert(purchaseInvoiceLines).values({
          invoiceId: invoice.id,
          receivingLineId: line.id,
          itemId: line.itemId,
          unitLevel: line.unitLevel,
          qty: line.qtyEntered,
          bonusQty: line.bonusQty || "0",
          sellingPrice: line.salePrice || "0",
          purchasePrice: line.purchasePrice || "0",
          lineDiscountPct: "0",
          lineDiscountValue: "0",
          vatRate: "0",
          valueBeforeVat: "0",
          vatAmount: "0",
          valueAfterVat: "0",
          batchNumber: line.batchNumber,
          expiryMonth: line.expiryMonth,
          expiryYear: line.expiryYear,
        } as any);
      }

      await tx.update(receivingHeaders).set({
        convertedToInvoiceId: invoice.id,
        convertedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(receivingHeaders.id, receivingId));

      return invoice;
    });
  }

  async getNextPurchaseInvoiceNumber(): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(invoice_number), 0)` }).from(purchaseInvoiceHeaders);
    return (result?.max || 0) + 1;
  }

  async getPurchaseInvoices(filters: { supplierId?: string; status?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: any[]; total: number}> {
    const conditions: any[] = [];
    if (filters.supplierId) conditions.push(eq(purchaseInvoiceHeaders.supplierId, filters.supplierId));
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(purchaseInvoiceHeaders.status, filters.status as any));
    } else if (!filters.includeCancelled && (!filters.status || filters.status === "all")) {
      conditions.push(sql`${purchaseInvoiceHeaders.status} != 'cancelled'`);
    }
    if (filters.dateFrom) conditions.push(sql`${purchaseInvoiceHeaders.invoiceDate} >= ${filters.dateFrom}`);
    if (filters.dateTo) conditions.push(sql`${purchaseInvoiceHeaders.invoiceDate} <= ${filters.dateTo}`);

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(purchaseInvoiceHeaders).where(whereClause);

    const headers = await db.select().from(purchaseInvoiceHeaders)
      .where(whereClause)
      .orderBy(desc(purchaseInvoiceHeaders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const data = [];
    for (const h of headers) {
      const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, h.supplierId));
      const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
      data.push({ ...h, supplier: sup, warehouse: wh });
    }

    return { data, total: Number(countResult.count) };
  }

  async getPurchaseInvoice(id: string): Promise<any> {
    const [h] = await db.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
    if (!h) return undefined;
    const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, h.supplierId));
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
    const lines = await db.select().from(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.invoiceId, h.id));
    const linesWithItems = [];
    for (const line of lines) {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      linesWithItems.push({ ...line, item });
    }
    let receiving = undefined;
    if (h.receivingId) {
      const [r] = await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, h.receivingId));
      receiving = r;
    }
    return { ...h, supplier: sup, warehouse: wh, receiving, lines: linesWithItems };
  }

  async savePurchaseInvoice(invoiceId: string, lines: any[], headerUpdates?: any): Promise<any> {
    return await db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, invoiceId));
      if (!invoice) throw new Error("الفاتورة غير موجودة");
      if (invoice.status !== "draft") throw new Error("لا يمكن تعديل فاتورة معتمدة");

      await tx.delete(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.invoiceId, invoiceId));

      let totalBeforeVat = 0;
      let totalVat = 0;
      let totalLineDiscounts = 0;

      for (const line of lines) {
        const qty = parseFloat(line.qty) || 0;
        const bonusQty = parseFloat(line.bonusQty) || 0;
        const purchasePrice = parseFloat(line.purchasePrice) || 0;
        const lineDiscountPct = parseFloat(line.lineDiscountPct) || 0;
        const vatRate = parseFloat(line.vatRate) || 0;

        const valueBeforeVat = qty * purchasePrice;
        const sellingPrice = parseFloat(line.sellingPrice || "0");
        const lineDiscountValue = line.lineDiscountValue !== undefined
          ? parseFloat(line.lineDiscountValue) || 0
          : (sellingPrice > 0 ? +(sellingPrice * (lineDiscountPct / 100)).toFixed(2) : 0);
        const vatBase = (qty + bonusQty) * purchasePrice;
        const vatAmount = vatBase * (vatRate / 100);
        const valueAfterVat = valueBeforeVat + vatAmount;

        totalBeforeVat += valueBeforeVat;
        totalVat += vatAmount;
        totalLineDiscounts += lineDiscountValue * qty;

        await tx.insert(purchaseInvoiceLines).values({
          invoiceId,
          receivingLineId: line.receivingLineId || null,
          itemId: line.itemId,
          unitLevel: line.unitLevel,
          qty: String(qty),
          bonusQty: String(bonusQty),
          sellingPrice: line.sellingPrice || "0",
          purchasePrice: String(purchasePrice),
          lineDiscountPct: String(lineDiscountPct),
          lineDiscountValue: String(lineDiscountValue.toFixed(2)),
          vatRate: String(vatRate),
          valueBeforeVat: String(valueBeforeVat.toFixed(2)),
          vatAmount: String(vatAmount.toFixed(2)),
          valueAfterVat: String(valueAfterVat.toFixed(2)),
          batchNumber: line.batchNumber || null,
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
        } as any);
      }

      const discountType = headerUpdates?.discountType || invoice.discountType || "percent";
      const discountValue = parseFloat(headerUpdates?.discountValue || invoice.discountValue) || 0;
      let invoiceDiscount = 0;
      if (discountType === "percent") {
        invoiceDiscount = totalBeforeVat * (discountValue / 100);
      } else {
        invoiceDiscount = discountValue;
      }

      const totalAfterVat = totalBeforeVat + totalVat;
      const netPayable = totalAfterVat - invoiceDiscount;

      const updateSet: any = {
        totalBeforeVat: String(totalBeforeVat.toFixed(2)),
        totalVat: String(totalVat.toFixed(2)),
        totalAfterVat: String(totalAfterVat.toFixed(2)),
        totalLineDiscounts: String(totalLineDiscounts.toFixed(2)),
        netPayable: String(netPayable.toFixed(2)),
        updatedAt: new Date(),
      };
      if (headerUpdates?.discountType) updateSet.discountType = headerUpdates.discountType;
      if (headerUpdates?.discountValue !== undefined) updateSet.discountValue = String(headerUpdates.discountValue);
      if (headerUpdates?.notes !== undefined) updateSet.notes = headerUpdates.notes;
      if (headerUpdates?.invoiceDate) updateSet.invoiceDate = headerUpdates.invoiceDate;

      await tx.update(purchaseInvoiceHeaders).set(updateSet).where(eq(purchaseInvoiceHeaders.id, invoiceId));

      const [updated] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, invoiceId));
      return updated;
    });
  }

  async approvePurchaseInvoice(id: string): Promise<any> {
    const result = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM purchase_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const locked = lockResult.rows?.[0] as any;
      if (!locked) throw new Error("الفاتورة غير موجودة");
      if (locked.status !== "draft") throw new Error("الفاتورة معتمدة مسبقاً");
      const [invoice] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");

      await tx.update(purchaseInvoiceHeaders).set({
        status: "approved_costed",
        approvedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(purchaseInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
      return updated;
    });

    if (result) {
      this.generatePurchaseInvoiceJournal(id, result).catch(err => 
        console.error("Auto journal for purchase invoice failed:", err)
      );
    }

    return result;
  }

  private async generatePurchaseInvoiceJournal(invoiceId: string, invoice: any): Promise<JournalEntry | null> {
    const existingEntries = await db.select().from(journalEntries)
      .where(and(
        eq(journalEntries.sourceType, "purchase_invoice"),
        eq(journalEntries.sourceDocumentId, invoiceId)
      ));
    if (existingEntries.length > 0) return existingEntries[0];

    const totalBeforeVat = parseFloat(invoice.totalBeforeVat || "0");
    const totalVat = parseFloat(invoice.totalVat || "0");
    const totalAfterVat = parseFloat(invoice.totalAfterVat || "0");
    const netPayable = parseFloat(invoice.netPayable || "0");
    const headerDiscount = totalAfterVat - netPayable;

    if (totalBeforeVat <= 0 && netPayable <= 0) return null;

    const mappings = await this.getMappingsForTransaction("purchase_invoice");
    if (mappings.length === 0) return null;

    const mappingMap = new Map<string, AccountMapping>();
    for (const m of mappings) {
      mappingMap.set(m.lineType, m);
    }

    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, invoice.supplierId));
    const supplierType = supplier?.supplierType || "drugs";
    const payablesLineType = supplierType === "consumables" ? "payables_consumables" : "payables_drugs";

    const journalLineData: InsertJournalLine[] = [];
    const desc = `قيد فاتورة مشتريات رقم ${invoice.invoiceNumber}`;

    const inventoryMapping = mappingMap.get("inventory");
    if (inventoryMapping?.debitAccountId && totalBeforeVat > 0) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: 0,
        accountId: inventoryMapping.debitAccountId,
        debit: String(totalBeforeVat.toFixed(2)),
        credit: "0",
        description: "مخزون - فاتورة مشتريات",
      });
    }

    const vatMapping = mappingMap.get("vat_input");
    if (vatMapping?.debitAccountId && totalVat > 0) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: 0,
        accountId: vatMapping.debitAccountId,
        debit: String(totalVat.toFixed(2)),
        credit: "0",
        description: "ضريبة قيمة مضافة - مدخلات",
      });
    }

    const discountMapping = mappingMap.get("discount_earned");
    if (discountMapping?.creditAccountId && headerDiscount > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: 0,
        accountId: discountMapping.creditAccountId,
        debit: "0",
        credit: String(headerDiscount.toFixed(2)),
        description: "خصم مكتسب",
      });
    }

    const payablesMapping = mappingMap.get(payablesLineType) || mappingMap.get("payables");
    if (payablesMapping?.creditAccountId && netPayable > 0) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: 0,
        accountId: payablesMapping.creditAccountId,
        debit: "0",
        credit: String(netPayable.toFixed(2)),
        description: supplierType === "consumables" ? "موردين مستلزمات" : "موردين أدوية",
      });
    }

    if (journalLineData.length === 0) return null;

    const totalDebits = journalLineData.reduce((s, l) => s + parseFloat(l.debit || "0"), 0);
    const totalCredits = journalLineData.reduce((s, l) => s + parseFloat(l.credit || "0"), 0);
    const diff = Math.abs(totalDebits - totalCredits);

    if (diff > 0.01) {
      console.error(`Purchase invoice journal unbalanced: debits=${totalDebits}, credits=${totalCredits}, diff=${diff}`);
      return null;
    }

    return db.transaction(async (tx) => {
      const [period] = await tx.select().from(fiscalPeriods)
        .where(and(
          lte(fiscalPeriods.startDate, invoice.invoiceDate),
          gte(fiscalPeriods.endDate, invoice.invoiceDate),
          eq(fiscalPeriods.isClosed, false)
        ))
        .limit(1);

      const entryNumber = await this.getNextEntryNumber();

      const [entry] = await tx.insert(journalEntries).values({
        entryNumber,
        entryDate: invoice.invoiceDate,
        reference: `PUR-${invoice.invoiceNumber}`,
        description: desc,
        status: "draft",
        periodId: period?.id || null,
        sourceType: "purchase_invoice",
        sourceDocumentId: invoiceId,
        totalDebit: String(totalDebits.toFixed(2)),
        totalCredit: String(totalCredits.toFixed(2)),
      }).returning();

      const linesWithEntryId = journalLineData.map((l, idx) => ({
        ...l,
        journalEntryId: entry.id,
        lineNumber: idx + 1,
      }));

      await tx.insert(journalLines).values(linesWithEntryId);
      return entry;
    });
  }

  private async generateWarehouseTransferJournal(
    transferId: string, transfer: any, totalCost: number
  ): Promise<JournalEntry | null> {
    const existingEntries = await db.select().from(journalEntries)
      .where(and(
        eq(journalEntries.sourceType, "warehouse_transfer"),
        eq(journalEntries.sourceDocumentId, transferId)
      ));
    if (existingEntries.length > 0) return existingEntries[0];

    const [sourceWh] = await db.select().from(warehouses)
      .where(eq(warehouses.id, transfer.sourceWarehouseId));
    const [destWh] = await db.select().from(warehouses)
      .where(eq(warehouses.id, transfer.destinationWarehouseId));

    if (!sourceWh?.glAccountId || !destWh?.glAccountId) {
      console.error("Warehouse transfer journal skipped: warehouses missing GL accounts");
      return null;
    }

    if (sourceWh.glAccountId === destWh.glAccountId) {
      console.log("Warehouse transfer journal skipped: same GL account for both warehouses");
      return null;
    }

    const journalLineData: InsertJournalLine[] = [
      {
        journalEntryId: "",
        lineNumber: 1,
        accountId: destWh.glAccountId,
        debit: String(totalCost.toFixed(2)),
        credit: "0",
        description: `تحويل إلى ${destWh.nameAr}`,
      },
      {
        journalEntryId: "",
        lineNumber: 2,
        accountId: sourceWh.glAccountId,
        debit: "0",
        credit: String(totalCost.toFixed(2)),
        description: `تحويل من ${sourceWh.nameAr}`,
      },
    ];

    return db.transaction(async (tx) => {
      const [period] = await tx.select().from(fiscalPeriods)
        .where(and(
          lte(fiscalPeriods.startDate, transfer.transferDate),
          gte(fiscalPeriods.endDate, transfer.transferDate),
          eq(fiscalPeriods.isClosed, false)
        ))
        .limit(1);

      const entryNumber = await this.getNextEntryNumber();

      const [entry] = await tx.insert(journalEntries).values({
        entryNumber,
        entryDate: transfer.transferDate,
        reference: `TRF-${transfer.transferNumber}`,
        description: `قيد تحويل مخزني رقم ${transfer.transferNumber} من ${sourceWh.nameAr} إلى ${destWh.nameAr}`,
        status: "draft",
        periodId: period?.id || null,
        sourceType: "warehouse_transfer",
        sourceDocumentId: transferId,
        totalDebit: String(totalCost.toFixed(2)),
        totalCredit: String(totalCost.toFixed(2)),
      }).returning();

      const linesWithEntryId = journalLineData.map((l, idx) => ({
        ...l,
        journalEntryId: entry.id,
        lineNumber: idx + 1,
      }));

      await tx.insert(journalLines).values(linesWithEntryId);
      return entry;
    });
  }

  async createReceivingCorrection(originalId: string): Promise<ReceivingHeader> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM receiving_headers WHERE id = ${originalId} FOR UPDATE`);
      const original = lockResult.rows?.[0] as any;
      if (!original) throw new Error('المستند غير موجود');
      if (original.status !== 'posted_qty_only') throw new Error('يمكن تصحيح المستندات المرحّلة فقط');
      if (original.correction_status === 'corrected') throw new Error('تم تصحيح هذا المستند مسبقاً');
      if (original.converted_to_invoice_id) {
        const [invoice] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, original.converted_to_invoice_id));
        if (invoice && invoice.status !== 'draft') {
          throw new Error('لا يمكن تصحيح إذن استلام محوّل لفاتورة معتمدة');
        }
      }

      const [maxNum] = await tx.select({ max: sql<number>`COALESCE(MAX(receiving_number), 0)` }).from(receivingHeaders);
      const nextNum = (maxNum?.max || 0) + 1;

      const [newHeader] = await tx.insert(receivingHeaders).values({
        receivingNumber: nextNum,
        supplierId: original.supplier_id,
        supplierInvoiceNo: `${original.supplier_invoice_no || 'N/A'}-COR-${nextNum}`,
        warehouseId: original.warehouse_id,
        receiveDate: original.receive_date,
        notes: original.notes ? `تصحيح للإذن رقم ${original.receiving_number} - ${original.notes}` : `تصحيح للإذن رقم ${original.receiving_number}`,
        status: 'draft',
        correctionOfId: originalId,
        correctionStatus: 'correction',
      }).returning();

      const originalLines = await tx.select().from(receivingLines).where(eq(receivingLines.receivingId, originalId));
      let totalQty = 0;
      let totalCost = 0;

      for (const line of originalLines) {
        await tx.insert(receivingLines).values({
          receivingId: newHeader.id,
          itemId: line.itemId,
          unitLevel: line.unitLevel,
          qtyEntered: line.qtyEntered,
          qtyInMinor: line.qtyInMinor,
          bonusQty: line.bonusQty,
          bonusQtyInMinor: line.bonusQtyInMinor,
          purchasePrice: line.purchasePrice,
          lineTotal: line.lineTotal,
          batchNumber: line.batchNumber,
          expiryDate: line.expiryDate,
          expiryMonth: line.expiryMonth,
          expiryYear: line.expiryYear,
          salePrice: line.salePrice,
          salePriceHint: line.salePriceHint,
          notes: line.notes,
          isRejected: line.isRejected,
          rejectionReason: line.rejectionReason,
        });
        if (!line.isRejected) {
          totalQty += parseFloat(line.qtyInMinor as string) || 0;
          totalCost += parseFloat(line.lineTotal as string) || 0;
        }
      }

      await tx.update(receivingHeaders).set({
        totalQty: totalQty.toFixed(4),
        totalCost: roundMoney(totalCost),
      }).where(eq(receivingHeaders.id, newHeader.id));

      await tx.update(receivingHeaders).set({
        correctedById: newHeader.id,
        correctionStatus: 'corrected',
        updatedAt: new Date(),
      }).where(eq(receivingHeaders.id, originalId));

      const [result] = await tx.select().from(receivingHeaders).where(eq(receivingHeaders.id, newHeader.id));
      return result;
    });
  }

  async postReceivingCorrection(correctionId: string): Promise<ReceivingHeader> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM receiving_headers WHERE id = ${correctionId} FOR UPDATE`);
      const correction = lockResult.rows?.[0] as any;
      if (!correction) throw new Error('المستند غير موجود');
      if (correction.status !== 'draft') throw new Error('لا يمكن ترحيل مستند غير مسودة');
      if (correction.correction_status !== 'correction') throw new Error('هذا المستند ليس مستند تصحيح');

      const originalId = correction.correction_of_id;
      if (!originalId) throw new Error('لا يوجد مستند أصلي للتصحيح');

      const [corrSupplier] = correction.supplier_id
        ? await tx.select().from(suppliers).where(eq(suppliers.id, correction.supplier_id))
        : [null];
      const corrSupplierName = corrSupplier?.nameAr || corrSupplier?.nameEn || null;

      const origLockResult = await tx.execute(sql`SELECT * FROM receiving_headers WHERE id = ${originalId} FOR UPDATE`);
      const original = origLockResult.rows?.[0] as any;
      if (!original) throw new Error('المستند الأصلي غير موجود');

      const originalMovements = await tx.select().from(inventoryLotMovements)
        .where(and(
          eq(inventoryLotMovements.referenceType, 'receiving'),
          eq(inventoryLotMovements.referenceId, originalId),
        ));

      for (const mov of originalMovements) {
        const qtyToReverse = parseFloat(mov.qtyChangeInMinor as string);
        if (qtyToReverse <= 0) continue;

        const [lot] = await tx.select().from(inventoryLots).where(eq(inventoryLots.id, mov.lotId));
        if (!lot) continue;

        const currentQty = parseFloat(lot.qtyInMinor as string);
        if (currentQty < qtyToReverse) {
          const [item] = await tx.select().from(items).where(eq(items.id, lot.itemId));
          throw new Error(`لا يمكن التصحيح: الصنف "${item?.nameAr || ''}" سيصبح رصيده سالباً في المستودع (المتاح: ${currentQty.toFixed(2)}, المطلوب عكسه: ${qtyToReverse.toFixed(2)})`);
        }

        const newQty = currentQty - qtyToReverse;
        await tx.update(inventoryLots).set({ 
          qtyInMinor: newQty.toFixed(4),
          updatedAt: new Date(),
        }).where(eq(inventoryLots.id, mov.lotId));

        await tx.insert(inventoryLotMovements).values({
          lotId: mov.lotId,
          warehouseId: mov.warehouseId,
          txType: 'out',
          qtyChangeInMinor: (-qtyToReverse).toFixed(4),
          unitCost: mov.unitCost,
          referenceType: 'receiving_correction_reversal',
          referenceId: correctionId,
        });
      }

      const correctionLines = await tx.select().from(receivingLines).where(eq(receivingLines.receivingId, correctionId));
      const activeLines = correctionLines.filter(l => !l.isRejected);

      for (const line of activeLines) {
        const qtyMinor = parseFloat(line.qtyInMinor as string) + parseFloat(line.bonusQtyInMinor as string || "0");
        if (qtyMinor <= 0) continue;

        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
        if (!item) continue;

        const costPerMinor = convertPriceToMinorUnit(parseFloat(line.purchasePrice as string), (line as any).unitLevel || 'minor', item);
        const costPerMinorStr = costPerMinor.toFixed(4);

        const lotConditions = [
          eq(inventoryLots.itemId, line.itemId),
          eq(inventoryLots.warehouseId, correction.warehouse_id),
        ];
        if (line.expiryMonth && line.expiryYear) {
          lotConditions.push(eq(inventoryLots.expiryMonth, line.expiryMonth));
          lotConditions.push(eq(inventoryLots.expiryYear, line.expiryYear));
        } else {
          lotConditions.push(sql`${inventoryLots.expiryMonth} IS NULL`);
        }

        const existingLots = await tx.select().from(inventoryLots).where(and(...lotConditions));
        let lotId: string;

        const corrLotSalePrice = line.salePrice || "0";
        
        if (existingLots.length > 0) {
          const lot = existingLots[0];
          const newQty = parseFloat(lot.qtyInMinor as string) + qtyMinor;
          await tx.update(inventoryLots).set({ 
            qtyInMinor: newQty.toFixed(4),
            purchasePrice: costPerMinorStr,
            salePrice: corrLotSalePrice,
            updatedAt: new Date(),
          }).where(eq(inventoryLots.id, lot.id));
          lotId = lot.id;
        } else {
          const [newLot] = await tx.insert(inventoryLots).values({
            itemId: line.itemId,
            warehouseId: correction.warehouse_id,
            expiryDate: line.expiryDate || null,
            expiryMonth: line.expiryMonth || null,
            expiryYear: line.expiryYear || null,
            receivedDate: correction.receive_date,
            purchasePrice: costPerMinorStr,
            salePrice: corrLotSalePrice,
            qtyInMinor: qtyMinor.toFixed(4),
          }).returning();
          lotId = newLot.id;
        }

        await tx.insert(inventoryLotMovements).values({
          lotId,
          warehouseId: correction.warehouse_id,
          txType: 'in',
          qtyChangeInMinor: qtyMinor.toFixed(4),
          unitCost: costPerMinorStr,
          referenceType: 'receiving_correction',
          referenceId: correctionId,
        });

        const corrPurchaseTotal = (parseFloat(line.qtyInMinor as string) * costPerMinor).toFixed(2);
        await tx.insert(purchaseTransactions).values({
          itemId: line.itemId,
          txDate: correction.receive_date,
          supplierName: corrSupplierName,
          qty: (line as any).qtyEntered || line.qtyInMinor as string,
          unitLevel: (line as any).unitLevel || 'minor',
          purchasePrice: line.purchasePrice as string,
          salePriceSnapshot: line.salePrice || null,
          total: corrPurchaseTotal,
        });

        const updateFields: any = { purchasePriceLast: line.purchasePrice, updatedAt: new Date() };
        if (line.salePrice) updateFields.salePriceCurrent = line.salePrice;
        await tx.update(items).set(updateFields).where(eq(items.id, line.itemId));
      }

      const [posted] = await tx.update(receivingHeaders).set({
        status: 'posted_qty_only',
        postedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(receivingHeaders.id, correctionId)).returning();

      return posted;
    });
  }

  async deletePurchaseInvoice(id: string, reason?: string): Promise<boolean> {
    const [invoice] = await db.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
    if (!invoice) return false;
    if (invoice.status !== "draft") throw new Error("لا يمكن إلغاء فاتورة معتمدة ومُسعّرة");
    await db.update(purchaseInvoiceHeaders).set({
      status: "cancelled" as any,
      notes: reason ? `[ملغي] ${reason}` : (invoice.notes ? `[ملغي] ${invoice.notes}` : "[ملغي]"),
    }).where(eq(purchaseInvoiceHeaders.id, id));
    return true;
  }

  // ===== Services =====

  async getServices(params: { search?: string; departmentId?: string; category?: string; active?: string; page?: number; pageSize?: number }): Promise<{ data: ServiceWithDepartment[]; total: number }> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];
    if (params.search) {
      conditions.push(or(ilike(services.code, `%${params.search}%`), ilike(services.nameAr, `%${params.search}%`)));
    }
    if (params.departmentId) {
      conditions.push(eq(services.departmentId, params.departmentId));
    }
    if (params.category) {
      conditions.push(eq(services.category, params.category));
    }
    if (params.active !== undefined && params.active !== '') {
      conditions.push(eq(services.isActive, params.active === 'true'));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(services).where(whereClause);
    const total = countResult.count;

    const rows = await db.select({
      service: services,
      department: departments,
      revenueAccount: accounts,
      costCenter: costCenters,
    })
      .from(services)
      .leftJoin(departments, eq(services.departmentId, departments.id))
      .leftJoin(accounts, eq(services.revenueAccountId, accounts.id))
      .leftJoin(costCenters, eq(services.costCenterId, costCenters.id))
      .where(whereClause)
      .orderBy(asc(services.code))
      .limit(pageSize)
      .offset(offset);

    const data: ServiceWithDepartment[] = rows.map((r) => ({
      ...r.service,
      department: r.department || undefined,
      revenueAccount: r.revenueAccount || undefined,
      costCenter: r.costCenter || undefined,
    }));

    return { data, total };
  }

  async createService(data: InsertService): Promise<Service> {
    const [row] = await db.insert(services).values(data).returning();
    return row;
  }

  async updateService(id: string, data: Partial<InsertService>): Promise<Service | null> {
    const [row] = await db.update(services).set({ ...data, updatedAt: new Date() }).where(eq(services.id, id)).returning();
    return row || null;
  }

  async getServiceCategories(): Promise<string[]> {
    const rows = await db.selectDistinct({ category: services.category }).from(services).where(isNotNull(services.category));
    return rows.map((r) => r.category).filter(Boolean) as string[];
  }

  // ===== Service Consumables =====

  async getServiceConsumables(serviceId: string): Promise<ServiceConsumableWithItem[]> {
    const rows = await db
      .select({
        id: serviceConsumables.id,
        serviceId: serviceConsumables.serviceId,
        itemId: serviceConsumables.itemId,
        quantity: serviceConsumables.quantity,
        unitLevel: serviceConsumables.unitLevel,
        notes: serviceConsumables.notes,
        itemCode: items.itemCode,
        itemNameAr: items.nameAr,
        itemNameEn: items.nameEn,
        majorUnitName: items.majorUnitName,
        mediumUnitName: items.mediumUnitName,
        minorUnitName: items.minorUnitName,
      })
      .from(serviceConsumables)
      .leftJoin(items, eq(serviceConsumables.itemId, items.id))
      .where(eq(serviceConsumables.serviceId, serviceId));

    return rows.map(r => ({
      id: r.id,
      serviceId: r.serviceId,
      itemId: r.itemId,
      quantity: r.quantity,
      unitLevel: r.unitLevel,
      notes: r.notes,
      item: r.itemCode ? {
        id: r.itemId,
        itemCode: r.itemCode,
        nameAr: r.itemNameAr!,
        nameEn: r.itemNameEn,
        majorUnitName: r.majorUnitName,
        mediumUnitName: r.mediumUnitName,
        minorUnitName: r.minorUnitName,
      } as any : undefined,
    }));
  }

  async replaceServiceConsumables(serviceId: string, lines: { itemId: string; quantity: string; unitLevel: string; notes?: string | null }[]): Promise<ServiceConsumable[]> {
    await db.delete(serviceConsumables).where(eq(serviceConsumables.serviceId, serviceId));
    if (lines.length === 0) return [];
    const rows = await db.insert(serviceConsumables).values(
      lines.map(l => ({ serviceId, itemId: l.itemId, quantity: l.quantity, unitLevel: l.unitLevel, notes: l.notes || null }))
    ).returning();
    return rows;
  }

  // ===== Price Lists =====

  async getPriceLists(): Promise<PriceList[]> {
    return db.select().from(priceLists).orderBy(asc(priceLists.code));
  }

  async createPriceList(data: InsertPriceList): Promise<PriceList> {
    const [row] = await db.insert(priceLists).values(data).returning();
    return row;
  }

  async updatePriceList(id: string, data: Partial<InsertPriceList>): Promise<PriceList | null> {
    const [row] = await db.update(priceLists).set({ ...data, updatedAt: new Date() }).where(eq(priceLists.id, id)).returning();
    return row || null;
  }

  // ===== Price List Items =====

  async getPriceListItems(priceListId: string, params: { search?: string; departmentId?: string; category?: string; page?: number; pageSize?: number }): Promise<{ data: PriceListItemWithService[]; total: number }> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [eq(priceListItems.priceListId, priceListId)];
    if (params.search) {
      conditions.push(or(ilike(services.code, `%${params.search}%`), ilike(services.nameAr, `%${params.search}%`)));
    }
    if (params.departmentId) {
      conditions.push(eq(services.departmentId, params.departmentId));
    }
    if (params.category) {
      conditions.push(eq(services.category, params.category));
    }

    const whereClause = and(...conditions);

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(priceListItems)
      .innerJoin(services, eq(priceListItems.serviceId, services.id))
      .where(whereClause);
    const total = countResult.count;

    const rows = await db.select({
      item: priceListItems,
      service: services,
      department: departments,
    })
      .from(priceListItems)
      .innerJoin(services, eq(priceListItems.serviceId, services.id))
      .leftJoin(departments, eq(services.departmentId, departments.id))
      .where(whereClause)
      .orderBy(asc(services.code))
      .limit(pageSize)
      .offset(offset);

    const data: PriceListItemWithService[] = rows.map((r) => ({
      ...r.item,
      service: { ...r.service, department: r.department || undefined },
    }));

    return { data, total };
  }

  async upsertPriceListItems(priceListId: string, itemsData: { serviceId: string; price: string; minDiscountPct?: string; maxDiscountPct?: string }[]): Promise<void> {
    if (itemsData.length === 0) return;

    const values = itemsData.map((item) => ({
      priceListId,
      serviceId: item.serviceId,
      price: item.price,
      minDiscountPct: item.minDiscountPct || null,
      maxDiscountPct: item.maxDiscountPct || null,
    }));

    await db.insert(priceListItems).values(values).onConflictDoUpdate({
      target: [priceListItems.priceListId, priceListItems.serviceId],
      set: {
        price: sql`excluded.price`,
        minDiscountPct: sql`excluded.min_discount_pct`,
        maxDiscountPct: sql`excluded.max_discount_pct`,
        updatedAt: new Date(),
      },
    });
  }

  async copyPriceList(targetListId: string, sourceListId: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO price_list_items (id, price_list_id, service_id, price, min_discount_pct, max_discount_pct, created_at, updated_at)
      SELECT gen_random_uuid(), ${targetListId}, service_id, price, min_discount_pct, max_discount_pct, now(), now()
      FROM price_list_items
      WHERE price_list_id = ${sourceListId}
      ON CONFLICT (price_list_id, service_id)
      DO UPDATE SET price = excluded.price, min_discount_pct = excluded.min_discount_pct, max_discount_pct = excluded.max_discount_pct, updated_at = now()
    `);
  }

  // ===== Bulk Adjustment =====

  private _buildBulkAdjustQuery(priceListId: string, params: { mode: 'PCT' | 'FIXED'; direction: 'INCREASE' | 'DECREASE'; value: number; departmentId?: string; category?: string; createMissingFromBasePrice?: boolean }) {
    const sign = params.direction === 'INCREASE' ? 1 : -1;
    let newPriceExpr: string;
    if (params.mode === 'PCT') {
      newPriceExpr = `ROUND(old_price + old_price * ${sign} * ${params.value} / 100.0, 2)`;
    } else {
      newPriceExpr = `ROUND(old_price + ${sign} * ${params.value}, 2)`;
    }

    const filterParts: string[] = [];
    if (params.departmentId) {
      filterParts.push(`s.department_id = '${params.departmentId}'`);
    }
    if (params.category) {
      filterParts.push(`s.category = '${params.category}'`);
    }
    const filterWhere = filterParts.length > 0 ? `AND ${filterParts.join(' AND ')}` : '';

    return { newPriceExpr, filterWhere };
  }

  async bulkAdjustPreview(priceListId: string, params: { mode: 'PCT' | 'FIXED'; direction: 'INCREASE' | 'DECREASE'; value: number; departmentId?: string; category?: string; createMissingFromBasePrice?: boolean }): Promise<{ affectedCount: number; preview: { serviceCode: string; serviceNameAr: string; oldPrice: string; newPrice: string }[] }> {
    const { newPriceExpr, filterWhere } = this._buildBulkAdjustQuery(priceListId, params);

    let unionPart = '';
    if (params.createMissingFromBasePrice) {
      unionPart = `
        UNION ALL
        SELECT s.code AS service_code, s.name_ar AS service_name_ar, s.base_price::numeric AS old_price, (${newPriceExpr.replace(/old_price/g, 's.base_price::numeric')}) AS new_price
        FROM services s
        WHERE s.is_active = true
          AND NOT EXISTS (SELECT 1 FROM price_list_items pli WHERE pli.price_list_id = '${priceListId}' AND pli.service_id = s.id)
          ${filterWhere}
      `;
    }

    const result = await db.execute(sql.raw(`
      WITH adjusted AS (
        SELECT s.code AS service_code, s.name_ar AS service_name_ar, pli.price::numeric AS old_price, (${newPriceExpr.replace(/old_price/g, 'pli.price::numeric')}) AS new_price
        FROM price_list_items pli
        JOIN services s ON s.id = pli.service_id
        WHERE pli.price_list_id = '${priceListId}'
          ${filterWhere}
        ${unionPart}
      )
      SELECT service_code, service_name_ar, old_price::text, new_price::text, count(*) OVER() AS total_count
      FROM adjusted
      ORDER BY service_code
      LIMIT 20
    `));

    const rows = result.rows as any[];
    const affectedCount = rows.length > 0 ? parseInt(rows[0].total_count) : 0;
    const preview = rows.map((r: any) => ({
      serviceCode: r.service_code,
      serviceNameAr: r.service_name_ar,
      oldPrice: r.old_price,
      newPrice: r.new_price,
    }));

    return { affectedCount, preview };
  }

  async bulkAdjustApply(priceListId: string, params: { mode: 'PCT' | 'FIXED'; direction: 'INCREASE' | 'DECREASE'; value: number; departmentId?: string; category?: string; createMissingFromBasePrice?: boolean }): Promise<{ affectedCount: number }> {
    const { newPriceExpr, filterWhere } = this._buildBulkAdjustQuery(priceListId, params);

    return await db.transaction(async (tx) => {
      const negativeCheck = await tx.execute(sql.raw(`
        SELECT count(*) AS cnt FROM (
          SELECT (${newPriceExpr.replace(/old_price/g, 'pli.price::numeric')}) AS new_price
          FROM price_list_items pli
          JOIN services s ON s.id = pli.service_id
          WHERE pli.price_list_id = '${priceListId}'
            ${filterWhere}
          ${params.createMissingFromBasePrice ? `
          UNION ALL
          SELECT (${newPriceExpr.replace(/old_price/g, 's.base_price::numeric')}) AS new_price
          FROM services s
          WHERE s.is_active = true
            AND NOT EXISTS (SELECT 1 FROM price_list_items pli2 WHERE pli2.price_list_id = '${priceListId}' AND pli2.service_id = s.id)
            ${filterWhere}
          ` : ''}
        ) sub WHERE sub.new_price < 0
      `));

      const negCount = parseInt((negativeCheck.rows as any[])[0].cnt);
      if (negCount > 0) {
        throw new Error(`التعديل سيؤدي إلى أسعار سالبة لـ ${negCount} خدمة. يُرجى تقليل القيمة.`);
      }

      const updateResult = await tx.execute(sql.raw(`
        UPDATE price_list_items pli
        SET price = GREATEST(0, (${newPriceExpr.replace(/old_price/g, 'pli.price::numeric')})),
            updated_at = now()
        FROM services s
        WHERE s.id = pli.service_id
          AND pli.price_list_id = '${priceListId}'
          ${filterWhere}
      `));

      let updatedCount = (updateResult as any).rowCount || 0;

      if (params.createMissingFromBasePrice) {
        const insertResult = await tx.execute(sql.raw(`
          INSERT INTO price_list_items (id, price_list_id, service_id, price, created_at, updated_at)
          SELECT gen_random_uuid(), '${priceListId}', s.id, GREATEST(0, (${newPriceExpr.replace(/old_price/g, 's.base_price::numeric')})), now(), now()
          FROM services s
          WHERE s.is_active = true
            AND NOT EXISTS (SELECT 1 FROM price_list_items pli WHERE pli.price_list_id = '${priceListId}' AND pli.service_id = s.id)
            ${filterWhere}
        `));
        updatedCount += (insertResult as any).rowCount || 0;
      }

      await tx.insert(priceAdjustmentsLog).values({
        priceListId,
        actionType: params.mode,
        direction: params.direction,
        value: params.value.toString(),
        filterDepartmentId: params.departmentId || null,
        filterCategory: params.category || null,
        affectedCount: updatedCount,
      });

      return { affectedCount: updatedCount };
    });
  }

  async getNextSalesInvoiceNumber(): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(invoice_number), 0)` }).from(salesInvoiceHeaders);
    return (result?.max || 0) + 1;
  }

  async getSalesInvoices(filters: { status?: string; dateFrom?: string; dateTo?: string; customerType?: string; search?: string; pharmacistId?: string; warehouseId?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: any[]; total: number; totals: { subtotal: number; discountValue: number; netTotal: number }}> {
    const conditions: any[] = [];
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(salesInvoiceHeaders.status, filters.status as any));
    } else if (!filters.includeCancelled && (!filters.status || filters.status === "all")) {
      conditions.push(sql`${salesInvoiceHeaders.status} != 'cancelled'`);
    }
    if (filters.dateFrom) conditions.push(sql`${salesInvoiceHeaders.invoiceDate} >= ${filters.dateFrom}`);
    if (filters.dateTo) conditions.push(sql`${salesInvoiceHeaders.invoiceDate} <= ${filters.dateTo}`);
    if (filters.customerType && filters.customerType !== "all") conditions.push(eq(salesInvoiceHeaders.customerType, filters.customerType as any));
    if (filters.pharmacistId && filters.pharmacistId !== "all") conditions.push(eq(salesInvoiceHeaders.createdBy, filters.pharmacistId));
    if (filters.warehouseId && filters.warehouseId !== "all") conditions.push(eq(salesInvoiceHeaders.warehouseId, filters.warehouseId));
    if (filters.search) {
      const searchTerm = filters.search.replace(/^SI-/i, '').trim();
      conditions.push(or(
        ilike(salesInvoiceHeaders.customerName, `%${filters.search}%`),
        sql`${salesInvoiceHeaders.invoiceNumber}::text LIKE ${`%${searchTerm}%`}`
      ));
    }

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // count + totals in one query
    const [agg] = await db.select({
      count: sql<number>`count(*)`,
      subtotal: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.subtotal}::numeric), 0)`,
      discountValue: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.discountValue}::numeric), 0)`,
      netTotal: sql<number>`COALESCE(SUM(${salesInvoiceHeaders.netTotal}::numeric), 0)`,
    }).from(salesInvoiceHeaders).where(whereClause);

    // main query: JOIN warehouse + user + line count
    const rows = await db.select({
      h: salesInvoiceHeaders,
      warehouseNameAr: warehouses.nameAr,
      pharmacistName: users.fullName,
      itemCount: sql<number>`COUNT(DISTINCT ${salesInvoiceLines.id})`,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .leftJoin(users, eq(salesInvoiceHeaders.createdBy, users.id))
    .leftJoin(salesInvoiceLines, eq(salesInvoiceLines.invoiceId, salesInvoiceHeaders.id))
    .where(whereClause)
    .groupBy(salesInvoiceHeaders.id, warehouses.nameAr, users.fullName)
    .orderBy(desc(salesInvoiceHeaders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

    const data = rows.map(r => ({
      ...r.h,
      warehouse: r.warehouseNameAr ? { nameAr: r.warehouseNameAr } : undefined,
      pharmacistName: r.pharmacistName || null,
      itemCount: Number(r.itemCount) || 0,
    }));

    return {
      data,
      total: Number(agg.count),
      totals: {
        subtotal: Number(agg.subtotal),
        discountValue: Number(agg.discountValue),
        netTotal: Number(agg.netTotal),
      },
    };
  }

  async getSalesInvoice(id: string): Promise<SalesInvoiceWithDetails | undefined> {
    const [h] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
    if (!h) return undefined;
    const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
    const lines = await db.select().from(salesInvoiceLines)
      .where(eq(salesInvoiceLines.invoiceId, h.id))
      .orderBy(asc(salesInvoiceLines.lineNo));
    const linesWithItems: SalesInvoiceLineWithItem[] = [];
    for (const line of lines) {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      linesWithItems.push({ ...line, item });
    }
    return { ...h, warehouse: wh, lines: linesWithItems };
  }

  private async expandLinesFEFO(tx: any, warehouseId: string, rawLines: any[]): Promise<any[]> {
    const expanded: any[] = [];
    for (const line of rawLines) {
      const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
      if (!item || !item.hasExpiry || line.expiryMonth || line.expiryYear) {
        expanded.push(line);
        continue;
      }

      let totalMinor = parseFloat(line.qty) || 0;
      if (line.unitLevel === "major" || !line.unitLevel) {
        totalMinor *= parseFloat(item.majorToMinor || "1") || 1;
      } else if (line.unitLevel === "medium") {
        const m2m = parseFloat(item.mediumToMinor || "0");
        const effectiveMediumToMinor = m2m > 0 ? m2m : (parseFloat(item.majorToMinor || "1") || 1) / (parseFloat(item.majorToMedium || "1") || 1);
        totalMinor *= effectiveMediumToMinor;
      }

      const lots = await tx.select().from(inventoryLots)
        .where(and(
          eq(inventoryLots.itemId, line.itemId),
          eq(inventoryLots.warehouseId, warehouseId),
          eq(inventoryLots.isActive, true),
          sql`${inventoryLots.qtyInMinor}::numeric > 0`
        ))
        .orderBy(asc(inventoryLots.expiryYear), asc(inventoryLots.expiryMonth));

      let remaining = totalMinor;
      const beforeLen = expanded.length;
      for (const lot of lots) {
        if (remaining <= 0) break;
        const available = parseFloat(lot.qtyInMinor);
        const take = Math.min(available, remaining);

        expanded.push({
          ...line,
          unitLevel: "minor",
          qty: String(take),
          salePrice: line.salePrice,
          expiryMonth: lot.expiryMonth,
          expiryYear: lot.expiryYear,
          lotId: lot.id,
        });
        remaining -= take;
      }

      if (expanded.length === beforeLen || remaining > 0) {
        if (remaining === totalMinor) {
          expanded.push(line);
        }
      }
    }
    return expanded;
  }

  async createSalesInvoice(header: any, lines: any[]): Promise<SalesInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const nextNum = await this.getNextSalesInvoiceNumber();

      const expandedLines = await this.expandLinesFEFO(tx, header.warehouseId, lines);

      let subtotal = 0;
      const processedLines: { line: any; qty: number; salePrice: number; qtyInMinor: number; lineTotal: number }[] = [];

      for (const line of expandedLines) {
        const qty = parseFloat(line.qty) || 0;
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));

        let salePrice = parseFloat(line.salePrice) || 0;
        if (item) {
          const masterPrice = parseFloat(item.salePriceCurrent || "0") || 0;
          const majorToMedium = parseFloat(item.majorToMedium || "0") || 0;
          const majorToMinor  = parseFloat(item.majorToMinor  || "0") || 0;
          const mediumToMinor = parseFloat(item.mediumToMinor || "0") || 0;
          if (line.unitLevel === "medium") {
            if (majorToMedium > 0) {
              salePrice = masterPrice / majorToMedium;
            } else if (majorToMinor > 0 && mediumToMinor > 0) {
              salePrice = masterPrice / (majorToMinor / mediumToMinor);
            } else {
              salePrice = masterPrice;
            }
          } else if (line.unitLevel === "minor") {
            if (majorToMinor > 0) {
              salePrice = masterPrice / majorToMinor;
            } else if (majorToMedium > 0 && mediumToMinor > 0) {
              salePrice = masterPrice / (majorToMedium * mediumToMinor);
            } else {
              salePrice = masterPrice;
            }
          } else {
            salePrice = masterPrice;
          }
        }

        let qtyInMinor = qty;
        if (line.unitLevel !== "minor") {
          if (item) {
            if (line.unitLevel === "medium") {
              const m2m = parseFloat(item.mediumToMinor || "0");
              const conv = m2m > 0 ? m2m : (parseFloat(item.majorToMinor || "1") || 1) / (parseFloat(item.majorToMedium || "1") || 1);
              qtyInMinor = qty * conv;
            } else {
              const conv = parseFloat(item.majorToMinor || "1") || 1;
              qtyInMinor = qty * conv;
            }
          }
        }

        const lineTotal = qty * salePrice;
        subtotal += lineTotal;
        processedLines.push({ line, qty, salePrice, qtyInMinor, lineTotal });
      }

      const discountPercent = parseFloat(header.discountPercent) || 0;
      const discountValue = parseFloat(header.discountValue) || 0;
      const discountType = header.discountType || "percent";
      let actualDiscount = 0;
      if (discountType === "percent") {
        actualDiscount = subtotal * (discountPercent / 100);
      } else {
        actualDiscount = discountValue;
      }
      const netTotal = subtotal - actualDiscount;

      let pharmacyId = header.pharmacyId || null;
      if (!pharmacyId && header.warehouseId) {
        const [wh] = await tx.select({ pharmacyId: warehouses.pharmacyId }).from(warehouses).where(eq(warehouses.id, header.warehouseId));
        if (wh?.pharmacyId) pharmacyId = wh.pharmacyId;
      }

      const [invoice] = await tx.insert(salesInvoiceHeaders).values({
        invoiceNumber: nextNum,
        invoiceDate: header.invoiceDate,
        warehouseId: header.warehouseId,
        pharmacyId,
        customerType: header.customerType || "cash",
        customerName: header.customerName || null,
        contractCompany: header.contractCompany || null,
        status: "draft",
        subtotal: roundMoney(subtotal),
        discountType,
        discountPercent: String(discountPercent),
        discountValue: String(actualDiscount.toFixed(2)),
        netTotal: roundMoney(netTotal),
        notes: header.notes || null,
      }).returning();

      for (let i = 0; i < processedLines.length; i++) {
        const { line, qty, salePrice, qtyInMinor, lineTotal } = processedLines[i];

        await tx.insert(salesInvoiceLines).values({
          invoiceId: invoice.id,
          lineNo: i + 1,
          itemId: line.itemId,
          unitLevel: line.unitLevel || "major",
          qty: String(qty),
          qtyInMinor: String(qtyInMinor),
          salePrice: String(salePrice),
          lineTotal: roundMoney(lineTotal),
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
          lotId: line.lotId || null,
        });
      }

      return invoice;
    });
  }

  async updateSalesInvoice(id: string, header: any, lines: any[]): Promise<SalesInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");
      if (invoice.status !== "draft") throw new Error("لا يمكن تعديل فاتورة نهائية");

      await tx.delete(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));

      const expandedLines = await this.expandLinesFEFO(tx, header.warehouseId || invoice.warehouseId, lines);

      let subtotal = 0;
      const processedLines: { line: any; qty: number; salePrice: number; qtyInMinor: number; lineTotal: number }[] = [];

      for (const line of expandedLines) {
        const qty = parseFloat(line.qty) || 0;
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));

        let salePrice = parseFloat(line.salePrice) || 0;
        if (item) {
          const masterPrice = parseFloat(item.salePriceCurrent || "0") || 0;
          const majorToMedium = parseFloat(item.majorToMedium || "0") || 0;
          const majorToMinor  = parseFloat(item.majorToMinor  || "0") || 0;
          const mediumToMinor = parseFloat(item.mediumToMinor || "0") || 0;
          if (line.unitLevel === "medium") {
            if (majorToMedium > 0) {
              salePrice = masterPrice / majorToMedium;
            } else if (majorToMinor > 0 && mediumToMinor > 0) {
              salePrice = masterPrice / (majorToMinor / mediumToMinor);
            } else {
              salePrice = masterPrice;
            }
          } else if (line.unitLevel === "minor") {
            if (majorToMinor > 0) {
              salePrice = masterPrice / majorToMinor;
            } else if (majorToMedium > 0 && mediumToMinor > 0) {
              salePrice = masterPrice / (majorToMedium * mediumToMinor);
            } else {
              salePrice = masterPrice;
            }
          } else {
            salePrice = masterPrice;
          }
        }

        let qtyInMinor = qty;
        if (line.unitLevel !== "minor") {
          if (item) {
            if (line.unitLevel === "medium") {
              const m2m = parseFloat(item.mediumToMinor || "0");
              const conv = m2m > 0 ? m2m : (parseFloat(item.majorToMinor || "1") || 1) / (parseFloat(item.majorToMedium || "1") || 1);
              qtyInMinor = qty * conv;
            } else {
              const conv = parseFloat(item.majorToMinor || "1") || 1;
              qtyInMinor = qty * conv;
            }
          }
        }

        const lineTotal = qty * salePrice;
        subtotal += lineTotal;
        processedLines.push({ line, qty, salePrice, qtyInMinor, lineTotal });
      }

      for (let i = 0; i < processedLines.length; i++) {
        const { line, qty, salePrice, qtyInMinor, lineTotal } = processedLines[i];

        await tx.insert(salesInvoiceLines).values({
          invoiceId: id,
          lineNo: i + 1,
          itemId: line.itemId,
          unitLevel: line.unitLevel || "major",
          qty: String(qty),
          qtyInMinor: String(qtyInMinor),
          salePrice: String(salePrice),
          lineTotal: roundMoney(lineTotal),
          expiryMonth: line.expiryMonth || null,
          expiryYear: line.expiryYear || null,
          lotId: line.lotId || null,
        });
      }

      const discountPercent = parseFloat(header.discountPercent) || 0;
      const discountValue = parseFloat(header.discountValue) || 0;
      const discountType = header.discountType || invoice.discountType || "percent";
      let actualDiscount = 0;
      if (discountType === "percent") {
        actualDiscount = subtotal * (discountPercent / 100);
      } else {
        actualDiscount = discountValue;
      }
      const netTotal = subtotal - actualDiscount;

      let pharmacyId = header.pharmacyId || invoice.pharmacyId || null;
      const effectiveWarehouseId = header.warehouseId || invoice.warehouseId;
      if (header.warehouseId && header.warehouseId !== invoice.warehouseId) {
        const [wh] = await tx.select({ pharmacyId: warehouses.pharmacyId }).from(warehouses).where(eq(warehouses.id, header.warehouseId));
        if (wh?.pharmacyId) pharmacyId = wh.pharmacyId;
      }

      await tx.update(salesInvoiceHeaders).set({
        invoiceDate: header.invoiceDate || invoice.invoiceDate,
        warehouseId: effectiveWarehouseId,
        pharmacyId,
        customerType: header.customerType || invoice.customerType,
        customerName: header.customerName !== undefined ? header.customerName : invoice.customerName,
        contractCompany: header.contractCompany !== undefined ? header.contractCompany : invoice.contractCompany,
        subtotal: roundMoney(subtotal),
        discountType,
        discountPercent: String(discountPercent),
        discountValue: String(actualDiscount.toFixed(2)),
        netTotal: roundMoney(netTotal),
        notes: header.notes !== undefined ? header.notes : invoice.notes,
        updatedAt: new Date(),
      }).where(eq(salesInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      return updated;
    });
  }

  private async allocateStockInTx(
    tx: any,
    params: {
      operationType: string;
      referenceType: string;
      referenceId: string;
      warehouseId: string;
      lines: Array<{
        lineIdx: number;
        itemId: string;
        qtyMinor: number;
        hasExpiry: boolean;
        expiryMonth?: number | null;
        expiryYear?: number | null;
      }>;
      createdBy?: string;
    }
  ): Promise<{ movementHeaderId: string; lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> }> {
    const { operationType, referenceType, referenceId, warehouseId, lines, createdBy } = params;

    // Idempotency: if a movement header already exists for this reference, return it
    const existingResult = await tx.execute(
      sql`SELECT id FROM stock_movement_headers WHERE reference_type = ${referenceType} AND reference_id = ${referenceId} LIMIT 1`
    );
    if (existingResult.rows?.length > 0) {
      const movementHeaderId = (existingResult.rows[0] as any).id as string;
      const allocRows = await tx.execute(
        sql`SELECT alloc_key, cost_allocated FROM stock_movement_allocations WHERE movement_header_id = ${movementHeaderId}`
      );
      const lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> = lines.map(l => ({
        lineIdx: l.lineIdx,
        itemId: l.itemId,
        totalCost: allocRows.rows
          .filter((r: any) => r.alloc_key.startsWith(`line:${l.lineIdx}:`))
          .reduce((s: number, r: any) => s + parseFloat(r.cost_allocated), 0),
      }));
      return { movementHeaderId, lineResults };
    }

    // Insert movement header
    const [movHeader] = await tx.insert(stockMovementHeaders).values({
      operationType,
      referenceType,
      referenceId,
      warehouseId,
      totalCost: "0",
      status: "posted",
      createdBy: createdBy || null,
    }).returning();
    const movementHeaderId = movHeader.id;

    const lineResults: Array<{ lineIdx: number; itemId: string; totalCost: number }> = [];
    let movementTotalCost = 0;

    for (const line of lines) {
      const { lineIdx, itemId, qtyMinor, hasExpiry, expiryMonth, expiryYear } = line;
      if (qtyMinor <= 0) {
        lineResults.push({ lineIdx, itemId, totalCost: 0 });
        continue;
      }

      // Build FOR UPDATE lot query — FEFO if has expiry, FIFO (receivedDate ASC) otherwise
      const specificExpiry = hasExpiry && expiryMonth && expiryYear;
      const lotsResult = await tx.execute(
        specificExpiry
          ? sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year, received_date
                FROM inventory_lots
                WHERE item_id = ${itemId}
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                  AND qty_in_minor::numeric > 0
                  AND expiry_month = ${expiryMonth}
                  AND expiry_year = ${expiryYear}
                ORDER BY expiry_year ASC, expiry_month ASC, received_date ASC
                FOR UPDATE`
          : hasExpiry
          ? sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year, received_date
                FROM inventory_lots
                WHERE item_id = ${itemId}
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                  AND qty_in_minor::numeric > 0
                ORDER BY expiry_year ASC NULLS LAST, expiry_month ASC NULLS LAST, received_date ASC
                FOR UPDATE`
          : sql`SELECT id, qty_in_minor, purchase_price, expiry_month, expiry_year, received_date
                FROM inventory_lots
                WHERE item_id = ${itemId}
                  AND warehouse_id = ${warehouseId}
                  AND is_active = true
                  AND qty_in_minor::numeric > 0
                ORDER BY received_date ASC, created_at ASC
                FOR UPDATE`
      );
      const lots = lotsResult.rows as any[];

      let remaining = qtyMinor;
      let lotSeq = 0;
      const rawAllocs: Array<{ lotId: string; allocKey: string; qty: number; unitCost: number; rawCost: number }> = [];

      for (const lot of lots) {
        if (remaining <= 0.00005) break;
        const available = parseFloat(lot.qty_in_minor);
        const deduct = Math.min(available, remaining);
        const unitCostNum = parseFloat(lot.purchase_price);

        rawAllocs.push({
          lotId: lot.id,
          allocKey: `line:${lineIdx}:lot:${lot.id}:seq:${lotSeq}`,
          qty: deduct,
          unitCost: unitCostNum,
          rawCost: deduct * unitCostNum,
        });

        // Deduct from lot (raw SQL avoids floating-point string conversion issues)
        await tx.execute(
          sql`UPDATE inventory_lots SET qty_in_minor = qty_in_minor::numeric - ${deduct}, updated_at = NOW() WHERE id = ${lot.id}`
        );

        // Record lot movement
        await tx.insert(inventoryLotMovements).values({
          lotId: lot.id,
          warehouseId,
          txType: "out",
          qtyChangeInMinor: String(-deduct),
          unitCost: String(unitCostNum),
          referenceType,
          referenceId,
        });

        remaining -= deduct;
        lotSeq++;
      }

      // Prevent negative stock
      if (remaining > 0.00005) {
        const itemRow = await tx.execute(sql`SELECT name_ar FROM items WHERE id = ${itemId} LIMIT 1`);
        const nameAr = (itemRow.rows[0] as any)?.name_ar || itemId;
        throw new Error(`رصيد غير كاف للصنف "${nameAr}" - النقص: ${remaining.toFixed(4)}`);
      }

      // HALF_UP cost allocation — last absorbs delta so sum == totalCostRounded exactly
      const totalRawCost = rawAllocs.reduce((s, a) => s + a.rawCost, 0);
      const totalCostRounded = parseFloat(roundMoney(totalRawCost));
      let allocatedSoFar = 0;

      for (let i = 0; i < rawAllocs.length; i++) {
        const a = rawAllocs[i];
        const isLast = i === rawAllocs.length - 1;
        const costAllocated = isLast
          ? parseFloat((totalCostRounded - allocatedSoFar).toFixed(2))
          : parseFloat(roundMoney(a.rawCost));

        const sourceId = `${movementHeaderId}:${referenceId}:${a.allocKey}`;

        await tx.insert(stockMovementAllocations).values({
          movementHeaderId,
          lotId: a.lotId,
          allocKey: a.allocKey,
          qtyAllocatedMinor: String(a.qty),
          unitCost: String(a.unitCost),
          costAllocated: String(costAllocated),
          sourceType: "STOCK_MOVEMENT_ALLOC",
          sourceId,
        });

        allocatedSoFar += costAllocated;
      }

      lineResults.push({ lineIdx, itemId, totalCost: totalCostRounded });
      movementTotalCost += totalCostRounded;
    }

    // Stamp total cost on movement header
    await tx.update(stockMovementHeaders).set({
      totalCost: roundMoney(movementTotalCost),
    }).where(eq(stockMovementHeaders.id, movementHeaderId));

    return { movementHeaderId, lineResults };
  }

  async finalizeSalesInvoice(id: string): Promise<SalesInvoiceHeader> {
    let cogsDrugs = 0;
    let cogsSupplies = 0;
    let revenueDrugs = 0;
    let revenueSupplies = 0;

    const finalResult = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM sales_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const locked = lockResult.rows?.[0] as any;
      if (!locked) throw new Error("الفاتورة غير موجودة");
      if (locked.status !== "draft") throw new Error("الفاتورة ليست مسودة");
      const [invoice] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");

      const lines = await tx.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));
      if (lines.length === 0) throw new Error("لا يمكن اعتماد فاتورة بدون أصناف");

      // Phase 1: collect item data + validate expiry; split service vs inventory lines
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const itemMap: Record<string, any> = {};
      const stockLines: Array<{
        lineIdx: number; itemId: string; qtyMinor: number;
        hasExpiry: boolean; expiryMonth?: number | null; expiryYear?: number | null;
      }> = [];

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        let item = itemMap[line.itemId];
        if (!item) {
          const [fetched] = await tx.select().from(items).where(eq(items.id, line.itemId));
          if (!fetched) throw new Error(`الصنف غير موجود: ${line.itemId}`);
          item = fetched;
          itemMap[line.itemId] = item;
        }

        if (item.category === "service") {
          revenueDrugs += parseFloat(line.lineTotal);
          continue;
        }

        if (item.hasExpiry && !line.expiryMonth) {
          throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية`);
        }
        if (item.hasExpiry && line.expiryMonth && line.expiryYear) {
          if (line.expiryYear < currentYear || (line.expiryYear === currentYear && line.expiryMonth < currentMonth)) {
            throw new Error(`الصنف "${item.nameAr}" - لا يمكن بيع دفعة منتهية الصلاحية (${line.expiryMonth}/${line.expiryYear})`);
          }
        }

        stockLines.push({
          lineIdx: li,
          itemId: line.itemId,
          qtyMinor: parseFloat(line.qtyInMinor),
          hasExpiry: !!item.hasExpiry,
          expiryMonth: line.expiryMonth,
          expiryYear: line.expiryYear,
        });
      }

      // Phase 2: allocate stock with engine (FOR UPDATE locks, FEFO/FIFO, idempotent allocs)
      const { lineResults } = await this.allocateStockInTx(tx, {
        operationType: "sales_finalize",
        referenceType: "sales_invoice",
        referenceId: id,
        warehouseId: invoice.warehouseId,
        lines: stockLines,
      });

      // Phase 3: accumulate COGS by category + insert sales transactions
      for (const lr of lineResults) {
        const item = itemMap[lr.itemId];
        const line = lines[lr.lineIdx];
        const lineRevenue = parseFloat(line.lineTotal);

        if (item.category === "drug") {
          cogsDrugs += lr.totalCost;
          revenueDrugs += lineRevenue;
        } else if (item.category === "supply") {
          cogsSupplies += lr.totalCost;
          revenueSupplies += lineRevenue;
        } else {
          cogsDrugs += lr.totalCost;
          revenueDrugs += lineRevenue;
        }

        await tx.insert(salesTransactions).values({
          itemId: line.itemId,
          txDate: invoice.invoiceDate,
          qty: line.qtyInMinor,
          unitLevel: "minor",
          salePrice: line.salePrice,
          total: line.lineTotal,
        });
      }

      await tx.update(salesInvoiceHeaders).set({
        status: "finalized",
        finalizedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(salesInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      return updated;
    });

    if (finalResult) {
      this.generateSalesInvoiceJournal(id, finalResult, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies)
        .catch(err => console.error("Auto journal for sales invoice failed:", err));
    }

    return finalResult;
  }

  async regenerateJournalForInvoice(invoiceId: string): Promise<JournalEntry | null> {
    const [invoice] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));
    if (!invoice || invoice.status !== "finalized") return null;
    
    const lines = await db.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, invoiceId));
    let cogsDrugs = 0, cogsSupplies = 0, revenueDrugs = 0, revenueSupplies = 0;
    
    for (const line of lines) {
      const [item] = await db.select().from(items).where(eq(items.id, line.itemId));
      if (!item) continue;
      const lineRevenue = parseFloat(line.lineTotal);
      if (item.category === "service") {
        revenueDrugs += lineRevenue;
        continue;
      }
      
      const movements = await db.select().from(inventoryLotMovements)
        .where(and(
          eq(inventoryLotMovements.referenceType, "sales_invoice"),
          eq(inventoryLotMovements.referenceId, invoiceId)
        ));
      
      let lineCost = 0;
      for (const mov of movements) {
        const [lot] = await db.select().from(inventoryLots).where(eq(inventoryLots.id, mov.lotId));
        if (lot && lot.itemId === line.itemId) {
          lineCost += Math.abs(parseFloat(mov.qtyChangeInMinor)) * parseFloat(mov.unitCost);
        }
      }
      
      if (item.category === "drug") {
        cogsDrugs += lineCost;
        revenueDrugs += lineRevenue;
      } else if (item.category === "supply") {
        cogsSupplies += lineCost;
        revenueSupplies += lineRevenue;
      } else {
        cogsDrugs += lineCost;
        revenueDrugs += lineRevenue;
      }
    }
    
    return this.generateSalesInvoiceJournal(invoiceId, invoice, cogsDrugs, cogsSupplies, revenueDrugs, revenueSupplies);
  }

  private async generateSalesInvoiceJournal(
    invoiceId: string, invoice: any, cogsDrugs: number, cogsSupplies: number, revenueDrugs: number, revenueSupplies: number
  ): Promise<JournalEntry | null> {
    console.log(`[Journal] Starting generateSalesInvoiceJournal for invoice ${invoiceId}, cogsDrugs=${cogsDrugs}, cogsSupplies=${cogsSupplies}, revenueDrugs=${revenueDrugs}, revenueSupplies=${revenueSupplies}`);
    const existingEntries = await db.select().from(journalEntries)
      .where(and(
        eq(journalEntries.sourceType, "sales_invoice"),
        eq(journalEntries.sourceDocumentId, invoiceId)
      ));
    if (existingEntries.length > 0) return existingEntries[0];

    const mappings = await this.getMappingsForTransaction("sales_invoice", invoice.warehouseId);
    const mappingMap = new Map<string, AccountMapping>();
    for (const m of mappings) {
      mappingMap.set(m.lineType, m);
    }

    const subtotal = parseFloat(invoice.subtotal || "0");
    const discountValue = parseFloat(invoice.discountValue || "0");
    const netTotal = parseFloat(invoice.netTotal || "0");

    const receivablesMapping = mappingMap.get("receivables");
    let debitAccountId: string | null = receivablesMapping?.debitAccountId || null;

    if (!debitAccountId) {
      console.error("Sales invoice journal: no receivables account mapping found - configure 'receivables' line type in account mappings for sales_invoice");
      return null;
    }

    let inventoryAccountId: string | null = null;
    if (invoice.warehouseId) {
      const [wh] = await db.select().from(warehouses)
        .where(eq(warehouses.id, invoice.warehouseId));
      if (wh?.glAccountId) {
        inventoryAccountId = wh.glAccountId;
      }
    }
    if (!inventoryAccountId) {
      const invMapping = mappingMap.get("inventory");
      if (invMapping?.creditAccountId) {
        inventoryAccountId = invMapping.creditAccountId;
      }
    }

    const journalLineData: InsertJournalLine[] = [];
    let lineNum = 1;

    if (debitAccountId && netTotal > 0) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: debitAccountId,
        debit: String(netTotal.toFixed(2)),
        credit: "0",
        description: "مدينون - في انتظار التحصيل",
      });
    }

    const discountMapping = mappingMap.get("discount_allowed");
    if (discountMapping?.debitAccountId && discountValue > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: discountMapping.debitAccountId,
        debit: String(discountValue.toFixed(2)),
        credit: "0",
        description: "خصم مسموح به",
      });
    }

    const totalCogs = cogsDrugs + cogsSupplies;
    const hasInventoryAccount = !!inventoryAccountId;

    if (hasInventoryAccount) {
      const cogsDrugsMapping = mappingMap.get("cogs_drugs");
      if (cogsDrugsMapping?.debitAccountId && cogsDrugs > 0.001) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: cogsDrugsMapping.debitAccountId,
          debit: String(cogsDrugs.toFixed(2)),
          credit: "0",
          description: "تكلفة أدوية مباعة",
        });
      }

      const cogsSuppliesMapping = mappingMap.get("cogs_supplies");
      const cogsGeneralMapping = mappingMap.get("cogs");
      if (cogsSuppliesMapping?.debitAccountId && cogsSupplies > 0.001) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: cogsSuppliesMapping.debitAccountId,
          debit: String(cogsSupplies.toFixed(2)),
          credit: "0",
          description: "تكلفة مستلزمات مباعة",
        });
      } else if (cogsGeneralMapping?.debitAccountId && cogsSupplies > 0.001) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: cogsGeneralMapping.debitAccountId,
          debit: String(cogsSupplies.toFixed(2)),
          credit: "0",
          description: "تكلفة مستلزمات مباعة",
        });
      } else if (cogsDrugsMapping?.debitAccountId && cogsSupplies > 0.001) {
        journalLineData.push({
          journalEntryId: "",
          lineNumber: lineNum++,
          accountId: cogsDrugsMapping.debitAccountId,
          debit: String(cogsSupplies.toFixed(2)),
          credit: "0",
          description: "تكلفة مستلزمات مباعة",
        });
      }
    }

    const revenueDrugsMapping = mappingMap.get("revenue_drugs");
    const revenueSuppliesMapping = mappingMap.get("revenue_consumables");
    const revenueGeneralMapping = mappingMap.get("revenue_general");

    if (revenueDrugsMapping?.creditAccountId && revenueDrugs > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueDrugsMapping.creditAccountId,
        debit: "0",
        credit: String(revenueDrugs.toFixed(2)),
        description: "إيراد مبيعات أدوية",
      });
    } else if (revenueGeneralMapping?.creditAccountId && revenueDrugs > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueGeneralMapping.creditAccountId,
        debit: "0",
        credit: String(revenueDrugs.toFixed(2)),
        description: "إيراد مبيعات أدوية",
      });
    }

    if (revenueSuppliesMapping?.creditAccountId && revenueSupplies > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueSuppliesMapping.creditAccountId,
        debit: "0",
        credit: String(revenueSupplies.toFixed(2)),
        description: "إيراد مبيعات مستلزمات",
      });
    } else if (revenueGeneralMapping?.creditAccountId && revenueSupplies > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueGeneralMapping.creditAccountId,
        debit: "0",
        credit: String(revenueSupplies.toFixed(2)),
        description: "إيراد مبيعات مستلزمات",
      });
    } else if (revenueDrugsMapping?.creditAccountId && revenueSupplies > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: revenueDrugsMapping.creditAccountId,
        debit: "0",
        credit: String(revenueSupplies.toFixed(2)),
        description: "إيراد مبيعات مستلزمات",
      });
    }

    const vatMapping = mappingMap.get("vat_output");
    const vatAmount = parseFloat(invoice.vatAmount || invoice.totalVat || "0");
    if (vatMapping?.creditAccountId && vatAmount > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: vatMapping.creditAccountId,
        debit: "0",
        credit: String(vatAmount.toFixed(2)),
        description: "ضريبة قيمة مضافة مخرجات",
      });
    }

    if (hasInventoryAccount && totalCogs > 0.001) {
      journalLineData.push({
        journalEntryId: "",
        lineNumber: lineNum++,
        accountId: inventoryAccountId!,
        debit: "0",
        credit: String(totalCogs.toFixed(2)),
        description: "مخزون مباع",
      });
    }

    if (journalLineData.length === 0) return null;

    const totalDebits = journalLineData.reduce((s, l) => s + parseFloat(l.debit || "0"), 0);
    const totalCredits = journalLineData.reduce((s, l) => s + parseFloat(l.credit || "0"), 0);
    const diff = Math.abs(totalDebits - totalCredits);

    if (diff > 0.01) {
      console.error(`[Journal] Sales invoice journal unbalanced: debits=${totalDebits}, credits=${totalCredits}, diff=${diff}, lines=${JSON.stringify(journalLineData)}`);
      return null;
    }
    console.log(`[Journal] Journal balanced: debits=${totalDebits}, credits=${totalCredits}, lines=${journalLineData.length}`);

    return db.transaction(async (tx) => {
      const [period] = await tx.select().from(fiscalPeriods)
        .where(and(
          lte(fiscalPeriods.startDate, invoice.invoiceDate),
          gte(fiscalPeriods.endDate, invoice.invoiceDate),
          eq(fiscalPeriods.isClosed, false)
        ))
        .limit(1);

      const entryNumber = await this.getNextEntryNumber();

      const [entry] = await tx.insert(journalEntries).values({
        entryNumber,
        entryDate: invoice.invoiceDate,
        reference: `SI-${invoice.invoiceNumber}`,
        description: `قيد فاتورة مبيعات رقم ${invoice.invoiceNumber}`,
        status: "draft",
        periodId: period?.id || null,
        sourceType: "sales_invoice",
        sourceDocumentId: invoiceId,
        totalDebit: String(totalDebits.toFixed(2)),
        totalCredit: String(totalCredits.toFixed(2)),
      }).returning();

      const linesWithEntryId = journalLineData.map((l, idx) => ({
        ...l,
        journalEntryId: entry.id,
        lineNumber: idx + 1,
      }));

      await tx.insert(journalLines).values(linesWithEntryId);
      return entry;
    });
  }

  private async completeSalesJournalsWithCash(
    invoiceIds: string[], cashGlAccountId: string | null, _pharmacyId: string
  ): Promise<void> {
    let cashAccountId = cashGlAccountId;
    if (!cashAccountId) {
      const cashMappings = await this.getMappingsForTransaction("cashier_collection");
      const cashMapping = cashMappings.find(m => m.lineType === "cash");
      if (cashMapping?.debitAccountId) {
        cashAccountId = cashMapping.debitAccountId;
      }
    }
    if (!cashAccountId) {
      console.error("completeSalesJournalsWithCash: no cash GL account found");
      return;
    }

    for (const invoiceId of invoiceIds) {
      const [invoice] = await db.select({
        warehouseId: salesInvoiceHeaders.warehouseId,
        isReturn: salesInvoiceHeaders.isReturn,
      }).from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));

      const invoiceReceivableIds = new Set<string>();
      const mappings = await this.getMappingsForTransaction("sales_invoice", invoice?.warehouseId || undefined);
      for (const m of mappings) {
        if (m.lineType === "receivables" && m.debitAccountId) {
          invoiceReceivableIds.add(m.debitAccountId);
        }
      }

      if (invoiceReceivableIds.size === 0) continue;

      const [existingEntry] = await db.select().from(journalEntries)
        .where(and(
          eq(journalEntries.sourceType, "sales_invoice"),
          eq(journalEntries.sourceDocumentId, invoiceId)
        ));

      if (!existingEntry) continue;
      if (existingEntry.status === "posted") continue;

      const existingLines = await db.select().from(journalLines)
        .where(eq(journalLines.journalEntryId, existingEntry.id))
        .orderBy(asc(journalLines.lineNumber));

      const receivablesLine = existingLines.find(l =>
        invoiceReceivableIds.has(l.accountId) &&
        (parseFloat(l.debit || "0") > 0 || parseFloat(l.credit || "0") > 0)
      );

      if (receivablesLine) {
        const isReturn = invoice?.isReturn || false;
        const hasDebit = parseFloat(receivablesLine.debit || "0") > 0;
        const desc = isReturn ? "نقدية مرتجع - تم الصرف" : "نقدية مبيعات - تم التحصيل";
        const entryDesc = isReturn ? "(تم صرف المرتجع)" : "(تم التحصيل)";

        await db.update(journalLines).set({
          accountId: cashAccountId,
          description: desc,
        }).where(eq(journalLines.id, receivablesLine.id));

        await db.update(journalEntries).set({
          description: `${existingEntry.description} ${entryDesc}`,
        }).where(eq(journalEntries.id, existingEntry.id));
      }
    }
  }

  async deleteSalesInvoice(id: string, reason?: string): Promise<boolean> {
    const [invoice] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
    if (!invoice) throw new Error("الفاتورة غير موجودة");
    if (invoice.status !== "draft") throw new Error("لا يمكن إلغاء فاتورة نهائية");
    await db.update(salesInvoiceHeaders).set({
      status: "cancelled" as any,
      notes: reason ? `[ملغي] ${reason}` : (invoice.notes ? `[ملغي] ${invoice.notes}` : "[ملغي]"),
    }).where(eq(salesInvoiceHeaders.id, id));
    return true;
  }

  // Patient Invoices
  async getNextPatientInvoiceNumber(): Promise<number> {
    const result = await db.select({ max: sql<string>`COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0)` }).from(patientInvoiceHeaders);
    return (parseInt(result[0]?.max || "0") || 0) + 1;
  }

  async getNextPaymentRefNumber(offset: number = 0): Promise<string> {
    const result = await db.execute(sql`
      SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(reference_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) AS max_num
      FROM patient_invoice_payments
      WHERE reference_number LIKE 'RCP-%'
    `);
    const maxNum = parseInt((result.rows[0] as any).max_num || "0") || 0;
    return `RCP-${String(maxNum + 1 + offset).padStart(6, "0")}`;
  }

  async getPatientInvoices(filters: { status?: string; dateFrom?: string; dateTo?: string; patientName?: string; doctorName?: string; page?: number; pageSize?: number; includeCancelled?: boolean }): Promise<{data: any[]; total: number}> {
    const conditions: any[] = [];
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(patientInvoiceHeaders.status, filters.status as any));
    } else if (!filters.includeCancelled && (!filters.status || filters.status === "all")) {
      conditions.push(sql`${patientInvoiceHeaders.status} != 'cancelled'`);
    }
    if (filters.dateFrom) conditions.push(gte(patientInvoiceHeaders.invoiceDate, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(patientInvoiceHeaders.invoiceDate, filters.dateTo));
    if (filters.patientName) conditions.push(ilike(patientInvoiceHeaders.patientName, `%${filters.patientName}%`));
    if (filters.doctorName) conditions.push(ilike(patientInvoiceHeaders.doctorName, `%${filters.doctorName}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(patientInvoiceHeaders).where(where);
    const total = Number(countResult?.count || 0);

    const data = await db.select({
      header: patientInvoiceHeaders,
      department: departments,
    })
      .from(patientInvoiceHeaders)
      .leftJoin(departments, eq(patientInvoiceHeaders.departmentId, departments.id))
      .where(where)
      .orderBy(desc(patientInvoiceHeaders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      data: data.map(r => ({ ...r.header, department: r.department })),
      total,
    };
  }

  async getPatientInvoice(id: string): Promise<PatientInvoiceWithDetails | undefined> {
    const [headerRow] = await db.select({
      header: patientInvoiceHeaders,
      department: departments,
    })
      .from(patientInvoiceHeaders)
      .leftJoin(departments, eq(patientInvoiceHeaders.departmentId, departments.id))
      .where(eq(patientInvoiceHeaders.id, id));

    if (!headerRow) return undefined;

    const lines = await db.select({
      line: patientInvoiceLines,
      service: services,
      item: items,
    })
      .from(patientInvoiceLines)
      .leftJoin(services, eq(patientInvoiceLines.serviceId, services.id))
      .leftJoin(items, eq(patientInvoiceLines.itemId, items.id))
      .where(eq(patientInvoiceLines.headerId, id))
      .orderBy(asc(patientInvoiceLines.sortOrder));

    const payments = await db.select()
      .from(patientInvoicePayments)
      .where(eq(patientInvoicePayments.headerId, id))
      .orderBy(asc(patientInvoicePayments.createdAt));

    return {
      ...headerRow.header,
      department: headerRow.department || undefined,
      lines: lines.map(l => ({ ...l.line, service: l.service || undefined, item: l.item || undefined })),
      payments,
    };
  }

  async createPatientInvoice(header: any, lines: any[], payments: any[]): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(patientInvoiceHeaders).values({ ...header, version: 1 }).returning();

      if (lines.length > 0) {
        await tx.insert(patientInvoiceLines).values(
          lines.map((l: any, i: number) => ({ ...l, headerId: created.id, sortOrder: i }))
        );
      }

      if (payments.length > 0) {
        await tx.insert(patientInvoicePayments).values(
          payments.map((p: any) => ({ ...p, headerId: created.id }))
        );
      }

      const totals = this.computeInvoiceTotals(lines, payments);
      await tx.update(patientInvoiceHeaders).set(totals).where(eq(patientInvoiceHeaders.id, created.id));

      const [result] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, created.id));
      return result;
    });
  }

  async updatePatientInvoice(id: string, header: any, lines: any[], payments: any[], expectedVersion?: number): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const existing = lockResult.rows?.[0] as any;
      if (!existing) throw new Error("فاتورة المريض غير موجودة");
      if (existing.status !== "draft") throw new Error("لا يمكن تعديل فاتورة نهائية");

      if (expectedVersion != null && existing.version !== expectedVersion) {
        throw new Error("تم تعديل الفاتورة من مستخدم آخر – يرجى إعادة تحميل الصفحة");
      }

      const newVersion = (existing.version || 1) + 1;

      const oldLines = await tx.select().from(patientInvoiceLines)
        .where(eq(patientInvoiceLines.headerId, id));

      await tx.delete(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, id));
      if (lines.length > 0) {
        await tx.insert(patientInvoiceLines).values(
          lines.map((l: any, i: number) => ({ ...l, headerId: id, sortOrder: i }))
        );
      }

      await tx.delete(patientInvoicePayments).where(eq(patientInvoicePayments.headerId, id));
      if (payments.length > 0) {
        await tx.insert(patientInvoicePayments).values(
          payments.map((p: any) => ({ ...p, headerId: id }))
        );
      }

      const totals = this.computeInvoiceTotals(lines, payments);
      // Preserve existing header-level discount when recomputing line totals
      const existingHeaderDiscount = parseMoney(existing.header_discount_amount || "0");
      const adjustedNetAmount = roundMoney(parseMoney(totals.netAmount) - existingHeaderDiscount);
      await tx.update(patientInvoiceHeaders).set({
        ...header,
        ...totals,
        netAmount: adjustedNetAmount,
        version: newVersion,
        updatedAt: new Date(),
      }).where(eq(patientInvoiceHeaders.id, id));

      const oldStayLines = oldLines.filter((l: any) => l.sourceType === "STAY_ENGINE");
      const newStayLines = lines.filter((l: any) => l.sourceType === "STAY_ENGINE");
      for (const ns of newStayLines) {
        const match = oldStayLines.find((os: any) => os.sourceId === ns.sourceId);
        if (match && (String(match.quantity) !== String(ns.quantity) || String(match.unitPrice) !== String(ns.unitPrice) || String(match.totalPrice) !== String(ns.totalPrice))) {
          await tx.insert(auditLog).values({
            tableName: "patient_invoice_lines",
            recordId: id,
            action: "stay_edit",
            oldValues: JSON.stringify({ sourceId: match.sourceId, quantity: match.quantity, unitPrice: match.unitPrice, totalPrice: match.totalPrice }),
            newValues: JSON.stringify({ sourceId: ns.sourceId, quantity: ns.quantity, unitPrice: ns.unitPrice, totalPrice: ns.totalPrice }),
          });
          console.log(`[STAY_EDIT] Invoice ${id}: stay line ${ns.sourceId} qty ${match.quantity} → ${ns.quantity}`);
        }
      }
      for (const os of oldStayLines) {
        if (!newStayLines.find((ns: any) => ns.sourceId === os.sourceId)) {
          await tx.insert(auditLog).values({
            tableName: "patient_invoice_lines",
            recordId: id,
            action: "stay_void",
            oldValues: JSON.stringify({ sourceId: os.sourceId, quantity: os.quantity, totalPrice: os.totalPrice }),
            newValues: JSON.stringify({ removed: true }),
          });
          console.log(`[STAY_EDIT] Invoice ${id}: stay line ${os.sourceId} REMOVED`);
        }
      }

      const [result] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, id));
      return result;
    });
  }

  async finalizePatientInvoice(id: string, expectedVersion?: number): Promise<PatientInvoiceHeader> {
    const result = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const locked = lockResult.rows?.[0] as any;
      if (!locked) throw new Error("فاتورة المريض غير موجودة");
      if (locked.status !== "draft") throw new Error("الفاتورة ليست مسودة");

      if (expectedVersion != null && locked.version !== expectedVersion) {
        throw new Error("تم تعديل الفاتورة من مستخدم آخر – يرجى إعادة تحميل الصفحة");
      }

      const dbLines = await tx.select().from(patientInvoiceLines)
        .where(and(eq(patientInvoiceLines.headerId, id), eq(patientInvoiceLines.isVoid, false)));
      const dbPayments = await tx.select().from(patientInvoicePayments)
        .where(eq(patientInvoicePayments.headerId, id));

      // Stock deduction for drug/consumable lines (only when warehouseId is set)
      const warehouseId = locked.warehouse_id as string | null;
      if (warehouseId) {
        const inventoryLineTypes = new Set(["drug", "consumable"]);
        const invLines = dbLines.filter(l => inventoryLineTypes.has(l.lineType) && l.itemId);

        if (invLines.length > 0) {
          // Fetch item data for unit conversion
          const invItemIds = Array.from(new Set(invLines.map(l => l.itemId!)));
          const invItemRows = await tx.execute(
            sql`SELECT id, name_ar, has_expiry, major_to_medium, major_to_minor, medium_to_minor FROM items WHERE id IN (${sql.join(invItemIds.map(i => sql`${i}`), sql`, `)})`
          );
          const invItemMap: Record<string, any> = {};
          for (const row of invItemRows.rows as any[]) invItemMap[row.id] = row;

          const now = new Date();
          const currentMonth = now.getMonth() + 1;
          const currentYear = now.getFullYear();

          const stockLines: Array<{
            lineIdx: number; itemId: string; qtyMinor: number;
            hasExpiry: boolean; expiryMonth?: number | null; expiryYear?: number | null;
          }> = [];

          for (let li = 0; li < invLines.length; li++) {
            const line = invLines[li];
            const item = invItemMap[line.itemId!];
            if (!item) continue;

            // Expired lot guard
            if (item.has_expiry && line.expiryMonth && line.expiryYear) {
              if (line.expiryYear < currentYear || (line.expiryYear === currentYear && line.expiryMonth < currentMonth)) {
                throw new Error(`الصنف "${item.name_ar}" - لا يمكن صرف دفعة منتهية الصلاحية (${line.expiryMonth}/${line.expiryYear})`);
              }
            }

            // Convert quantity to minor units
            const qty = parseFloat(line.quantity);
            const unitLevel = line.unitLevel || "minor";
            let qtyMinor = qty;
            if (unitLevel === "major") {
              let majorToMinor = parseFloat(String(item.major_to_minor)) || 0;
              if (majorToMinor <= 0) {
                const majorToMedium = parseFloat(String(item.major_to_medium)) || 1;
                const mediumToMinor = parseFloat(String(item.medium_to_minor)) || 1;
                majorToMinor = majorToMedium * mediumToMinor;
              }
              qtyMinor = qty * (majorToMinor || 1);
            } else if (unitLevel === "medium") {
              const mediumToMinor = parseFloat(String(item.medium_to_minor)) || 1;
              qtyMinor = qty * mediumToMinor;
            }

            stockLines.push({
              lineIdx: li,
              itemId: line.itemId!,
              qtyMinor,
              hasExpiry: !!item.has_expiry,
              expiryMonth: line.expiryMonth,
              expiryYear: line.expiryYear,
            });
          }

          if (stockLines.length > 0) {
            await this.allocateStockInTx(tx, {
              operationType: "patient_finalize",
              referenceType: "patient_invoice",
              referenceId: id,
              warehouseId,
              lines: stockLines,
            });
          }
        }
      }

      const recomputedTotals = this.computeInvoiceTotals(dbLines, dbPayments);
      const newVersion = (locked.version || 1) + 1;

      const [updated] = await tx.update(patientInvoiceHeaders).set({
        ...recomputedTotals,
        status: "finalized",
        finalizedAt: new Date(),
        updatedAt: new Date(),
        version: newVersion,
      }).where(and(
        eq(patientInvoiceHeaders.id, id),
        eq(patientInvoiceHeaders.status, 'draft')
      )).returning();

      if (!updated) throw new Error("الفاتورة ليست مسودة");
      return updated;
    });

    return result;
  }

  buildPatientInvoiceGLLines(header: PatientInvoiceHeader, lines: PatientInvoiceLine[]): { lineType: string; amount: string }[] {
    const lineTypeMap: Record<string, string> = {
      service: "revenue_services",
      drug: "revenue_drugs",
      consumable: "revenue_consumables",
      equipment: "revenue_equipment",
    };
    const totals: Record<string, number> = {};
    for (const line of lines) {
      if (line.isVoid) continue;
      const mappingType = lineTypeMap[line.lineType] || "revenue_general";
      totals[mappingType] = (totals[mappingType] || 0) + parseMoney(line.totalPrice);
    }

    const journalLines: { lineType: string; amount: string }[] = [];
    const totalNet = parseMoney(header.netAmount);
    if (totalNet > 0) {
      const paymentType = header.patientType === "cash" ? "cash" : "receivables";
      journalLines.push({ lineType: paymentType, amount: roundMoney(totalNet) });
    }
    for (const [lt, amt] of Object.entries(totals)) {
      if (amt > 0) journalLines.push({ lineType: lt, amount: roundMoney(amt) });
    }
    return journalLines;
  }

  async deletePatientInvoice(id: string, reason?: string): Promise<boolean> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${id} FOR UPDATE`);
      const invoice = lockResult.rows?.[0] as any;
      if (!invoice) throw new Error("فاتورة المريض غير موجودة");
      if (invoice.status !== "draft") throw new Error("لا يمكن إلغاء فاتورة نهائية");
      await tx.update(patientInvoiceHeaders).set({
        status: "cancelled" as any,
        version: (invoice.version || 1) + 1,
        notes: reason ? `[ملغي] ${reason}` : (invoice.notes ? `[ملغي] ${invoice.notes}` : "[ملغي]"),
      }).where(eq(patientInvoiceHeaders.id, id));
      return true;
    });
  }

  async distributePatientInvoice(sourceId: string, patients: { name: string; phone?: string }[]): Promise<PatientInvoiceHeader[]> {
    return await db.transaction(async (tx) => {
      // Lock source FOR UPDATE to prevent concurrent distribution
      const lockResult = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${sourceId} FOR UPDATE`);
      const source = lockResult.rows?.[0] as any;
      if (!source) throw new Error("فاتورة المصدر غير موجودة");
      if (source.status !== "draft") throw new Error("لا يمكن توزيع فاتورة نهائية");

      const sourceLines = await tx.select().from(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, sourceId)).orderBy(asc(patientInvoiceLines.sortOrder));
      if (sourceLines.length === 0) throw new Error("الفاتورة لا تحتوي على بنود");

      const numPatients = patients.length;

      const itemIds = Array.from(new Set(sourceLines.filter(l => l.itemId).map(l => l.itemId!)));
      const itemMap: Record<string, any> = {};
      if (itemIds.length > 0) {
        const fetchedItems = await tx.select().from(items).where(
          sql`${items.id} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`
        );
        for (const it of fetchedItems) {
          itemMap[it.id] = it;
        }
      }

      const convertedLines = sourceLines.map((line) => {
        const origQty = parseFloat(line.quantity);
        const origUnitPrice = parseFloat(line.unitPrice);
        const origLevel = line.unitLevel || "minor";
        const item = line.itemId ? itemMap[line.itemId] : null;

        if (!item || origLevel === "minor") {
          return { ...line, distQty: origQty, distUnitPrice: origUnitPrice, distUnitLevel: origLevel };
        }

        const majorToMedium = parseFloat(String(item.majorToMedium)) || 0;
        const mediumToMinor = parseFloat(String(item.mediumToMinor)) || 0;
        let majorToMinor = parseFloat(String(item.majorToMinor)) || 0;
        if (majorToMinor <= 0 && majorToMedium > 0 && mediumToMinor > 0) {
          majorToMinor = majorToMedium * mediumToMinor;
        }

        let smallestLevel = origLevel;
        let convFactor = 1;

        if (origLevel === "major") {
          if (item.minorUnitName && majorToMinor > 1) {
            smallestLevel = "minor";
            convFactor = majorToMinor;
          } else if (item.mediumUnitName && majorToMedium > 1) {
            smallestLevel = "medium";
            convFactor = majorToMedium;
          }
        } else if (origLevel === "medium") {
          if (item.minorUnitName && mediumToMinor > 1) {
            smallestLevel = "minor";
            convFactor = mediumToMinor;
          }
        }

        const distQty = +(origQty * convFactor).toFixed(4);
        const distUnitPrice = +(origUnitPrice / convFactor).toFixed(4);

        return { ...line, distQty, distUnitPrice, distUnitLevel: smallestLevel };
      });

      await tx.execute(sql`LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE`);
      const maxNumResult = await tx.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM patient_invoice_headers`);
      const baseNum = (parseInt(String((maxNumResult.rows[0] as any)?.max_num || "0")) || 0) + 1;

      const createdInvoices: PatientInvoiceHeader[] = [];
      const allocatedSoFar: Record<number, number> = {};

      for (let pi = 0; pi < numPatients; pi++) {
        const patient = patients[pi];
        const invNumber = String(baseNum + pi);

        const [newHeader] = await tx.insert(patientInvoiceHeaders).values({
          invoiceNumber: invNumber,
          invoiceDate: source.invoiceDate,
          patientName: patient.name,
          patientPhone: patient.phone || null,
          patientType: source.patientType,
          departmentId: source.departmentId,
          warehouseId: source.warehouseId,
          doctorName: source.doctorName,
          contractName: source.contractName,
          notes: source.notes,
          status: "draft",
          totalAmount: "0",
          discountAmount: "0",
          netAmount: "0",
          paidAmount: "0",
          version: 1,
        }).returning();

        const newLines: any[] = [];

        for (let li = 0; li < convertedLines.length; li++) {
          const cl = convertedLines[li];
          const totalQty = cl.distQty;

          if (!allocatedSoFar[li]) allocatedSoFar[li] = 0;
          let share: number;
          if (pi === numPatients - 1) {
            share = +(totalQty - allocatedSoFar[li]).toFixed(4);
          } else {
            const intQty = Math.round(totalQty);
            const isInt = Math.abs(totalQty - intQty) < 0.0001 && intQty > 0;
            if (isInt && intQty >= numPatients) {
              const baseShare = Math.floor(intQty / numPatients);
              const remainder = intQty - baseShare * numPatients;
              share = pi < remainder ? baseShare + 1 : baseShare;
            } else {
              share = +(Math.round((totalQty / numPatients) * 10000) / 10000);
            }
          }
          allocatedSoFar[li] = +(allocatedSoFar[li] + share).toFixed(4);

          if (share <= 0) continue;

          const unitPrice = cl.distUnitPrice;
          const origDiscPct = parseFloat(cl.discountPercent || "0");
          const lineGross = +(share * unitPrice).toFixed(2);
          const lineDiscAmt = +(lineGross * origDiscPct / 100).toFixed(2);
          const lineTotal = +(lineGross - lineDiscAmt).toFixed(2);

          newLines.push({
            headerId: newHeader.id,
            lineType: cl.lineType,
            serviceId: cl.serviceId,
            itemId: cl.itemId,
            description: cl.description,
            quantity: String(share),
            unitPrice: String(unitPrice),
            discountPercent: String(origDiscPct),
            discountAmount: String(lineDiscAmt),
            totalPrice: String(lineTotal),
            unitLevel: cl.distUnitLevel,
            lotId: cl.lotId,
            expiryMonth: cl.expiryMonth,
            expiryYear: cl.expiryYear,
            priceSource: cl.priceSource,
            doctorName: cl.doctorName,
            nurseName: cl.nurseName,
            notes: cl.notes,
            sortOrder: cl.sortOrder,
            sourceType: "dist_from_invoice",
            sourceId: `${sourceId}:p${pi}:l${li}`,
          });
        }

        if (newLines.length > 0) {
          await tx.insert(patientInvoiceLines).values(newLines);
          // Recompute totals server-side with roundMoney
          const totals = this.computeInvoiceTotals(newLines, []);
          await tx.update(patientInvoiceHeaders).set({
            totalAmount: totals.totalAmount,
            discountAmount: totals.discountAmount,
            netAmount: totals.netAmount,
          }).where(eq(patientInvoiceHeaders.id, newHeader.id));

          const [finalHeader] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
          createdInvoices.push(finalHeader);
        } else {
          await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
        }
      }

      // Soft-cancel source instead of hard delete — enables retry detection
      await tx.update(patientInvoiceHeaders).set({
        status: "cancelled",
        notes: `[توزيع على ${numPatients} مرضى]`,
        version: (parseInt(String(source.version)) || 1) + 1,
      }).where(eq(patientInvoiceHeaders.id, sourceId));

      return createdInvoices;
    });
  }

  async distributePatientInvoiceDirect(data: {
    patients: { name: string; phone?: string }[];
    lines: any[];
    invoiceDate: string;
    departmentId?: string | null;
    warehouseId?: string | null;
    doctorName?: string | null;
    patientType?: string;
    contractName?: string | null;
    notes?: string | null;
  }): Promise<PatientInvoiceHeader[]> {
    const { patients, lines: sourceLines, invoiceDate, departmentId, warehouseId, doctorName, patientType, contractName, notes } = data;
    if (sourceLines.length === 0) throw new Error("لا توجد بنود للتوزيع");

    return await db.transaction(async (tx) => {
      const numPatients = patients.length;

      const itemIds = Array.from(new Set(sourceLines.filter((l: any) => l.itemId).map((l: any) => l.itemId)));
      const itemMap: Record<string, any> = {};
      if (itemIds.length > 0) {
        const fetchedItems = await tx.select().from(items).where(
          sql`${items.id} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`
        );
        for (const it of fetchedItems) {
          itemMap[it.id] = it;
        }
      }

      const convertedLines = sourceLines.map((line: any) => {
        const origQty = parseFloat(line.quantity);
        const origUnitPrice = parseFloat(line.unitPrice);
        const origLevel = line.unitLevel || "minor";
        const item = line.itemId ? itemMap[line.itemId] : null;

        if (!item || origLevel === "minor") {
          return { ...line, distQty: origQty, distUnitPrice: origUnitPrice, distUnitLevel: origLevel };
        }

        const majorToMedium = parseFloat(String(item.majorToMedium)) || 0;
        const mediumToMinor = parseFloat(String(item.mediumToMinor)) || 0;
        let majorToMinor = parseFloat(String(item.majorToMinor)) || 0;
        if (majorToMinor <= 0 && majorToMedium > 0 && mediumToMinor > 0) {
          majorToMinor = majorToMedium * mediumToMinor;
        }

        let smallestLevel = origLevel;
        let convFactor = 1;

        if (origLevel === "major") {
          if (item.minorUnitName && majorToMinor > 1) {
            smallestLevel = "minor";
            convFactor = majorToMinor;
          } else if (item.mediumUnitName && majorToMedium > 1) {
            smallestLevel = "medium";
            convFactor = majorToMedium;
          }
        } else if (origLevel === "medium") {
          if (item.minorUnitName && mediumToMinor > 1) {
            smallestLevel = "minor";
            convFactor = mediumToMinor;
          }
        }

        const distQty = +(origQty * convFactor).toFixed(4);
        const distUnitPrice = +(origUnitPrice / convFactor).toFixed(4);

        return { ...line, distQty, distUnitPrice, distUnitLevel: smallestLevel };
      });

      await tx.execute(sql`LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE`);
      const maxNumResult = await tx.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM patient_invoice_headers`);
      const baseNum = (parseInt(String((maxNumResult.rows[0] as any)?.max_num || "0")) || 0) + 1;

      const createdInvoices: PatientInvoiceHeader[] = [];
      const allocatedSoFar: Record<number, number> = {};

      for (let pi = 0; pi < numPatients; pi++) {
        const patient = patients[pi];
        const invNumber = String(baseNum + pi);

        const [newHeader] = await tx.insert(patientInvoiceHeaders).values({
          invoiceNumber: invNumber,
          invoiceDate: invoiceDate,
          patientName: patient.name,
          patientPhone: patient.phone || null,
          patientType: patientType || "cash",
          departmentId: departmentId || null,
          warehouseId: warehouseId || null,
          doctorName: doctorName || null,
          contractName: contractName || null,
          notes: notes || null,
          status: "draft",
          totalAmount: "0",
          discountAmount: "0",
          netAmount: "0",
          paidAmount: "0",
          version: 1,
        }).returning();

        const newLines: any[] = [];

        // خطوط "مباشرة": تذهب كاملةً لكل مريض بغض النظر عن العدد
        // 1. sourceType: STAY_ENGINE أو OR_ROOM (مضاف من محرك الإقامة)
        // 2. serviceType: ACCOMMODATION أو OPERATING_ROOM (مضاف يدوياً)
        const DIRECT_SOURCE_TYPES = new Set(["STAY_ENGINE", "OR_ROOM"]);
        const DIRECT_SERVICE_TYPES = new Set(["ACCOMMODATION", "OPERATING_ROOM"]);
        const isDirectLine = (cl: any) =>
          DIRECT_SOURCE_TYPES.has(cl.sourceType) || DIRECT_SERVICE_TYPES.has(cl.serviceType);

        for (let li = 0; li < convertedLines.length; li++) {
          const cl = convertedLines[li];
          const totalQty = cl.distQty;

          // Determine share: direct lines go fully to each patient; others are divided
          let share: number;
          if (isDirectLine(cl)) {
            // Full amount for every patient — إقامة وفتح غرفة عمليات
            share = totalQty;
          } else {
            if (!allocatedSoFar[li]) allocatedSoFar[li] = 0;
            if (pi === numPatients - 1) {
              share = +(totalQty - allocatedSoFar[li]).toFixed(4);
            } else {
              const intQty = Math.round(totalQty);
              const isInt = Math.abs(totalQty - intQty) < 0.0001 && intQty > 0;
              if (isInt && intQty >= numPatients) {
                const baseShare = Math.floor(intQty / numPatients);
                const remainder = intQty - baseShare * numPatients;
                share = pi < remainder ? baseShare + 1 : baseShare;
              } else {
                share = +(Math.round((totalQty / numPatients) * 10000) / 10000);
              }
            }
            allocatedSoFar[li] = +(allocatedSoFar[li] + share).toFixed(4);
          }

          if (share <= 0) continue;

          const unitPrice = cl.distUnitPrice;
          const origDiscPct = parseFloat(cl.discountPercent || "0");
          const lineGross = +(share * unitPrice).toFixed(2);
          const lineDiscAmt = +(lineGross * origDiscPct / 100).toFixed(2);
          const lineTotal = +(lineGross - lineDiscAmt).toFixed(2);

          newLines.push({
            headerId: newHeader.id,
            lineType: cl.lineType,
            serviceId: cl.serviceId || null,
            itemId: cl.itemId || null,
            description: cl.description,
            quantity: String(share),
            unitPrice: String(unitPrice),
            discountPercent: String(origDiscPct),
            discountAmount: String(lineDiscAmt),
            totalPrice: String(lineTotal),
            unitLevel: cl.distUnitLevel,
            lotId: cl.lotId || null,
            expiryMonth: cl.expiryMonth || null,
            expiryYear: cl.expiryYear || null,
            priceSource: cl.priceSource || null,
            doctorName: cl.doctorName || null,
            nurseName: cl.nurseName || null,
            notes: cl.notes || null,
            sortOrder: cl.sortOrder || 0,
            sourceType: isDirectLine(cl) ? (cl.sourceType || cl.serviceType) : "dist_direct",
            sourceId: isDirectLine(cl) && cl.sourceId
              ? `${cl.sourceId}:p${pi}`
              : `${invoiceDate}:p${pi}:l${li}`,
          });
        }

        if (newLines.length > 0) {
          await tx.insert(patientInvoiceLines).values(newLines);
          // Recompute totals server-side with roundMoney
          const totals = this.computeInvoiceTotals(newLines, []);
          await tx.update(patientInvoiceHeaders).set({
            totalAmount: totals.totalAmount,
            discountAmount: totals.discountAmount,
            netAmount: totals.netAmount,
          }).where(eq(patientInvoiceHeaders.id, newHeader.id));

          const [finalHeader] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
          createdInvoices.push(finalHeader);
        } else {
          await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
        }
      }

      return createdInvoices;
    });
  }

  // ==================== Cashier ====================

  async getPharmacies(): Promise<Pharmacy[]> {
    return db.select().from(pharmacies).orderBy(asc(pharmacies.code));
  }

  async getPharmacy(id: string): Promise<Pharmacy | undefined> {
    const [pharmacy] = await db.select().from(pharmacies).where(eq(pharmacies.id, id));
    return pharmacy;
  }

  async createPharmacy(data: InsertPharmacy): Promise<Pharmacy> {
    const [pharmacy] = await db.insert(pharmacies).values(data).returning();
    return pharmacy;
  }

  async updatePharmacy(id: string, data: Partial<InsertPharmacy>): Promise<Pharmacy> {
    const [pharmacy] = await db.update(pharmacies).set(data).where(eq(pharmacies.id, id)).returning();
    return pharmacy;
  }

  // ==================== Drawer Passwords ====================

  async setDrawerPassword(glAccountId: string, passwordHash: string): Promise<void> {
    const [existing] = await db.select().from(drawerPasswords).where(eq(drawerPasswords.glAccountId, glAccountId));
    if (existing) {
      await db.update(drawerPasswords).set({ passwordHash, updatedAt: new Date() }).where(eq(drawerPasswords.glAccountId, glAccountId));
    } else {
      await db.insert(drawerPasswords).values({ glAccountId, passwordHash });
    }
  }

  async getDrawerPassword(glAccountId: string): Promise<string | null> {
    const [row] = await db.select().from(drawerPasswords).where(eq(drawerPasswords.glAccountId, glAccountId));
    return row?.passwordHash || null;
  }

  async removeDrawerPassword(glAccountId: string): Promise<boolean> {
    const result = await db.delete(drawerPasswords).where(eq(drawerPasswords.glAccountId, glAccountId));
    return (result.rowCount || 0) > 0;
  }

  async getDrawersWithPasswordStatus(): Promise<{ glAccountId: string; hasPassword: boolean; code: string; name: string }[]> {
    const cashAccounts = await db.select().from(accounts).where(
      or(
        sql`${accounts.code} LIKE '1211%'`,
        sql`${accounts.code} LIKE '1212%'`
      )
    ).orderBy(asc(accounts.code));

    const passwords = await db.select({ glAccountId: drawerPasswords.glAccountId }).from(drawerPasswords);
    const passwordSet = new Set(passwords.map(p => p.glAccountId));

    return cashAccounts.map(a => ({
      glAccountId: a.id,
      hasPassword: passwordSet.has(a.id),
      code: a.code,
      name: a.name,
    }));
  }

  async getMyOpenShift(cashierId: string): Promise<CashierShift | null> {
    const [shift] = await db.select().from(cashierShifts)
      .where(and(eq(cashierShifts.cashierId, cashierId), eq(cashierShifts.status, "open")))
      .limit(1);
    return shift || null;
  }

  async getUserCashierGlAccount(userId: string): Promise<{ glAccountId: string; code: string; name: string; hasPassword: boolean } | null> {
    const [user] = await db.select({ cashierGlAccountId: users.cashierGlAccountId }).from(users).where(eq(users.id, userId));
    if (!user?.cashierGlAccountId) return null;
    const [account] = await db.select({ id: accounts.id, code: accounts.code, name: accounts.name })
      .from(accounts).where(eq(accounts.id, user.cashierGlAccountId));
    if (!account) return null;
    const [pwd] = await db.select({ glAccountId: drawerPasswords.glAccountId }).from(drawerPasswords).where(eq(drawerPasswords.glAccountId, account.id));
    return { glAccountId: account.id, code: account.code, name: account.name, hasPassword: !!pwd };
  }

  async openCashierShift(cashierId: string, cashierName: string, openingCash: string, unitType: string, pharmacyId?: string | null, departmentId?: string | null, glAccountId?: string | null): Promise<CashierShift> {
    const existingOpen = await this.getMyOpenShift(cashierId);
    if (existingOpen) throw new Error("لديك وردية مفتوحة بالفعل — أغلق وردياتك الحالية أولاً أو استخدم حساباً آخر");

    const unitLabel = unitType === "department" ? `قسم: ${departmentId}` : `صيدلية: ${pharmacyId}`;
    const [shift] = await db.insert(cashierShifts).values({
      cashierId,
      cashierName,
      unitType,
      pharmacyId: unitType === "pharmacy" ? (pharmacyId || null) : null,
      departmentId: unitType === "department" ? (departmentId || null) : null,
      openingCash,
      glAccountId: glAccountId || null,
      status: "open",
    }).returning();

    await db.insert(cashierAuditLog).values({
      shiftId: shift.id,
      action: "open_shift",
      entityType: "shift",
      entityId: shift.id,
      details: `فتح وردية - رصيد افتتاحي: ${openingCash} - ${unitLabel}`,
      performedBy: cashierName,
    });

    return shift;
  }

  async getActiveShift(cashierId: string, unitType: string, unitId: string): Promise<CashierShift | null> {
    const conditions = [eq(cashierShifts.cashierId, cashierId), eq(cashierShifts.unitType, unitType), eq(cashierShifts.status, "open")];
    if (unitType === "pharmacy") conditions.push(eq(cashierShifts.pharmacyId, unitId));
    else conditions.push(eq(cashierShifts.departmentId, unitId));
    const [shift] = await db.select().from(cashierShifts).where(and(...conditions));
    return shift || null;
  }

  async getPendingInvoiceCountForUnit(shift: CashierShift): Promise<number> {
    if (shift.unitType === "department" && shift.departmentId) {
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(salesInvoiceHeaders)
        .innerJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
        .where(and(eq(warehouses.departmentId, shift.departmentId), eq(salesInvoiceHeaders.status, "finalized"), eq(salesInvoiceHeaders.isReturn, false)));
      return Number(result?.count) || 0;
    }
    if (shift.pharmacyId) {
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(salesInvoiceHeaders)
        .where(and(eq(salesInvoiceHeaders.pharmacyId, shift.pharmacyId), eq(salesInvoiceHeaders.status, "finalized"), eq(salesInvoiceHeaders.isReturn, false)));
      return Number(result?.count) || 0;
    }
    return 0;
  }

  private async getPendingDocCountForUnit(shift: CashierShift): Promise<number> {
    if (shift.unitType === "department" && shift.departmentId) {
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(salesInvoiceHeaders)
        .innerJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
        .where(and(eq(warehouses.departmentId, shift.departmentId), eq(salesInvoiceHeaders.status, "finalized")));
      return Number(result?.count) || 0;
    }
    if (shift.pharmacyId) {
      const [result] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(salesInvoiceHeaders)
        .where(and(eq(salesInvoiceHeaders.pharmacyId, shift.pharmacyId), eq(salesInvoiceHeaders.status, "finalized")));
      return Number(result?.count) || 0;
    }
    return 0;
  }

  private async findOtherOpenShiftForUnit(currentShiftId: string, shift: CashierShift): Promise<CashierShift | null> {
    const unitCondition = shift.unitType === "department" && shift.departmentId
      ? and(eq(cashierShifts.unitType, "department"), eq(cashierShifts.departmentId, shift.departmentId))
      : shift.pharmacyId
        ? and(eq(cashierShifts.unitType, "pharmacy"), eq(cashierShifts.pharmacyId, shift.pharmacyId))
        : null;
    if (!unitCondition) return null;
    const [found] = await db.select()
      .from(cashierShifts)
      .where(and(
        eq(cashierShifts.status, "open"),
        unitCondition,
        sql`${cashierShifts.id} != ${currentShiftId}`,
      ))
      .limit(1);
    return found || null;
  }

  async getMyOpenShifts(cashierId: string): Promise<CashierShift[]> {
    return db.select().from(cashierShifts)
      .where(and(eq(cashierShifts.cashierId, cashierId), eq(cashierShifts.status, "open")))
      .orderBy(cashierShifts.openedAt);
  }

  async validateShiftClose(shiftId: string): Promise<{ canClose: boolean; pendingCount: number; hasOtherOpenShift: boolean; otherShift: any; reasonCode: string }> {
    const shift = await this.getShiftById(shiftId);
    if (!shift) return { canClose: false, pendingCount: 0, hasOtherOpenShift: false, otherShift: null, reasonCode: "NOT_FOUND" };
    if (shift.status !== "open") return { canClose: false, pendingCount: 0, hasOtherOpenShift: false, otherShift: null, reasonCode: "ALREADY_CLOSED" };

    const [pendingCount, otherShift] = await Promise.all([
      this.getPendingDocCountForUnit(shift),
      this.findOtherOpenShiftForUnit(shiftId, shift),
    ]);
    const hasOtherOpenShift = !!otherShift;

    if (pendingCount === 0) return { canClose: true, pendingCount: 0, hasOtherOpenShift, otherShift: otherShift || null, reasonCode: "CLEAN" };
    if (hasOtherOpenShift) return { canClose: true, pendingCount, hasOtherOpenShift: true, otherShift, reasonCode: "PENDING_OTHER_SHIFT_EXISTS" };
    return { canClose: false, pendingCount, hasOtherOpenShift: false, otherShift: null, reasonCode: "PENDING_NO_OTHER_SHIFT" };
  }

  async getShiftById(shiftId: string): Promise<CashierShift | null> {
    const [shift] = await db.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
    return shift || null;
  }

  async closeCashierShift(shiftId: string, closingCash: string): Promise<CashierShift> {
    const [shift] = await db.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
    if (!shift) throw new Error("الوردية غير موجودة");
    if (shift.status !== "open") throw new Error("الوردية مغلقة بالفعل");

    const [pendingCount, otherShift] = await Promise.all([
      this.getPendingDocCountForUnit(shift),
      this.findOtherOpenShiftForUnit(shiftId, shift),
    ]);
    if (pendingCount > 0 && !otherShift) {
      throw new Error(`لا يمكن إغلاق الوردية - يوجد ${pendingCount} مستند معلّق لم يتم تحصيله`);
    }

    const totals = await this.getShiftTotals(shiftId);
    const expectedCash = (parseFloat(shift.openingCash) + parseFloat(totals.totalCollected) - parseFloat(totals.totalRefunded)).toFixed(2);
    const variance = (parseFloat(closingCash) - parseFloat(expectedCash)).toFixed(2);

    const [updated] = await db.update(cashierShifts).set({
      status: "closed",
      closingCash,
      expectedCash,
      variance,
      closedAt: new Date(),
    }).where(eq(cashierShifts.id, shiftId)).returning();

    await db.insert(cashierAuditLog).values({
      shiftId,
      action: "close_shift",
      entityType: "shift",
      entityId: shiftId,
      details: `إغلاق وردية - النقدية الفعلية: ${closingCash} | المتوقعة: ${expectedCash} | الفرق: ${variance}`,
      performedBy: shift.cashierName,
    });

    return updated;
  }

  async getPendingSalesInvoices(unitType: string, unitId: string, search?: string): Promise<any[]> {
    const baseConditions = [eq(salesInvoiceHeaders.status, "finalized"), eq(salesInvoiceHeaders.isReturn, false)];
    const unitCondition = unitType === "department"
      ? eq(warehouses.departmentId, unitId)
      : eq(salesInvoiceHeaders.pharmacyId, unitId);

    const results = await db.select({
      id: salesInvoiceHeaders.id,
      invoiceNumber: salesInvoiceHeaders.invoiceNumber,
      invoiceDate: salesInvoiceHeaders.invoiceDate,
      customerType: salesInvoiceHeaders.customerType,
      customerName: salesInvoiceHeaders.customerName,
      subtotal: salesInvoiceHeaders.subtotal,
      discountValue: salesInvoiceHeaders.discountValue,
      netTotal: salesInvoiceHeaders.netTotal,
      createdBy: salesInvoiceHeaders.createdBy,
      status: salesInvoiceHeaders.status,
      createdAt: salesInvoiceHeaders.createdAt,
      warehouseName: warehouses.nameAr,
      warehousePharmacyId: warehouses.pharmacyId,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .where(and(...baseConditions, unitCondition))
    .orderBy(asc(salesInvoiceHeaders.createdAt));

    if (search) {
      const s = search.toLowerCase();
      return results.filter(r =>
        String(r.invoiceNumber).includes(s) ||
        (r.customerName && r.customerName.toLowerCase().includes(s)) ||
        (r.createdBy && r.createdBy.toLowerCase().includes(s))
      );
    }
    return results;
  }

  async getPendingReturnInvoices(unitType: string, unitId: string, search?: string): Promise<any[]> {
    const baseConditions = [eq(salesInvoiceHeaders.status, "finalized"), eq(salesInvoiceHeaders.isReturn, true)];
    const unitCondition = unitType === "department"
      ? eq(warehouses.departmentId, unitId)
      : eq(salesInvoiceHeaders.pharmacyId, unitId);

    const results = await db.select({
      id: salesInvoiceHeaders.id,
      invoiceNumber: salesInvoiceHeaders.invoiceNumber,
      invoiceDate: salesInvoiceHeaders.invoiceDate,
      customerType: salesInvoiceHeaders.customerType,
      customerName: salesInvoiceHeaders.customerName,
      subtotal: salesInvoiceHeaders.subtotal,
      discountValue: salesInvoiceHeaders.discountValue,
      netTotal: salesInvoiceHeaders.netTotal,
      createdBy: salesInvoiceHeaders.createdBy,
      originalInvoiceId: salesInvoiceHeaders.originalInvoiceId,
      status: salesInvoiceHeaders.status,
      createdAt: salesInvoiceHeaders.createdAt,
      warehouseName: warehouses.nameAr,
      warehousePharmacyId: warehouses.pharmacyId,
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .where(and(...baseConditions, unitCondition))
    .orderBy(asc(salesInvoiceHeaders.createdAt));

    if (search) {
      const s = search.toLowerCase();
      return results.filter(r =>
        String(r.invoiceNumber).includes(s) ||
        (r.customerName && r.customerName.toLowerCase().includes(s))
      );
    }
    return results;
  }

  async getSalesInvoiceDetails(invoiceId: string): Promise<any> {
    const [header] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, invoiceId));
    if (!header) return null;

    const lines = await db.select({
      id: salesInvoiceLines.id,
      lineNo: salesInvoiceLines.lineNo,
      itemId: salesInvoiceLines.itemId,
      unitLevel: salesInvoiceLines.unitLevel,
      qty: salesInvoiceLines.qty,
      salePrice: salesInvoiceLines.salePrice,
      lineTotal: salesInvoiceLines.lineTotal,
      itemName: items.nameAr,
      itemCode: items.itemCode,
    })
    .from(salesInvoiceLines)
    .leftJoin(items, eq(salesInvoiceLines.itemId, items.id))
    .where(eq(salesInvoiceLines.invoiceId, invoiceId))
    .orderBy(asc(salesInvoiceLines.lineNo));

    return { ...header, lines };
  }

  async getNextCashierReceiptNumber(): Promise<number> {
    const [result] = await db.select({ maxNum: sql<number>`COALESCE(MAX(receipt_number), 0)` }).from(cashierReceipts);
    return (result?.maxNum || 0) + 1;
  }

  async getNextCashierRefundReceiptNumber(): Promise<number> {
    const [result] = await db.select({ maxNum: sql<number>`COALESCE(MAX(receipt_number), 0)` }).from(cashierRefundReceipts);
    return (result?.maxNum || 0) + 1;
  }

  async collectInvoices(shiftId: string, invoiceIds: string[], collectedBy: string, paymentDate?: string): Promise<any> {
    return await db.transaction(async (tx) => {
      const [shift] = await tx.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
      if (!shift || shift.status !== "open") throw new Error("الوردية غير مفتوحة");
      if (!shift.glAccountId) throw new Error("الوردية لا تحتوي على حساب خزنة - يجب إغلاق الوردية وفتح وردية جديدة مع اختيار حساب الخزنة");

      const [maxNumResult] = await tx.select({ maxNum: sql<number>`COALESCE(MAX(receipt_number), 0)` }).from(cashierReceipts);
      let nextReceiptNumber = (maxNumResult?.maxNum || 0) + 1;

      const receipts: any[] = [];
      let totalCollected = 0;

      for (const invoiceId of invoiceIds) {
        const [invoice] = await tx.select().from(salesInvoiceHeaders)
          .where(eq(salesInvoiceHeaders.id, invoiceId))
          .for("update");

        if (!invoice) throw new Error(`الفاتورة ${invoiceId} غير موجودة`);
        if (invoice.status !== "finalized") throw new Error(`الفاتورة ${invoice.invoiceNumber} ليست في حالة نهائي`);
        if (invoice.isReturn) throw new Error(`الفاتورة ${invoice.invoiceNumber} هي مرتجع`);

        const [existingReceipt] = await tx.select().from(cashierReceipts)
          .where(eq(cashierReceipts.invoiceId, invoiceId));
        if (existingReceipt) throw new Error(`الفاتورة ${invoice.invoiceNumber} محصّلة بالفعل`);

        const amount = invoice.netTotal;
        totalCollected += parseFloat(amount);

        const [receipt] = await tx.insert(cashierReceipts).values({
          receiptNumber: nextReceiptNumber++,
          shiftId,
          invoiceId,
          amount,
          paymentDate: paymentDate || new Date().toISOString().split("T")[0],
          collectedBy,
        }).returning();

        await tx.update(salesInvoiceHeaders).set({
          status: "collected",
          updatedAt: new Date(),
        }).where(eq(salesInvoiceHeaders.id, invoiceId));

        await tx.insert(cashierAuditLog).values({
          shiftId,
          action: "collect",
          entityType: "sales_invoice",
          entityId: invoiceId,
          details: `تحصيل فاتورة رقم ${invoice.invoiceNumber} - المبلغ: ${amount}`,
          performedBy: collectedBy,
        });

        receipts.push({ ...receipt, invoiceNumber: invoice.invoiceNumber });
      }

      const result = { receipts, totalCollected: totalCollected.toFixed(2), count: receipts.length };

      this.completeSalesJournalsWithCash(
        invoiceIds, shift.glAccountId || null, shift.pharmacyId || ""
      ).catch(err => console.error("Auto journal completion for cashier collection failed:", err));

      return result;
    });
  }

  async refundInvoices(shiftId: string, invoiceIds: string[], refundedBy: string, paymentDate?: string): Promise<any> {
    return await db.transaction(async (tx) => {
      const [shift] = await tx.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
      if (!shift || shift.status !== "open") throw new Error("الوردية غير مفتوحة");
      if (!shift.glAccountId) throw new Error("الوردية لا تحتوي على حساب خزنة - يجب إغلاق الوردية وفتح وردية جديدة مع اختيار حساب الخزنة");

      const [maxNumResult] = await tx.select({ maxNum: sql<number>`COALESCE(MAX(receipt_number), 0)` }).from(cashierRefundReceipts);
      let nextRefundNumber = (maxNumResult?.maxNum || 0) + 1;

      const receipts: any[] = [];
      let totalRefunded = 0;

      for (const invoiceId of invoiceIds) {
        const [invoice] = await tx.select().from(salesInvoiceHeaders)
          .where(eq(salesInvoiceHeaders.id, invoiceId))
          .for("update");

        if (!invoice) throw new Error(`الفاتورة ${invoiceId} غير موجودة`);
        if (invoice.status !== "finalized") throw new Error(`الفاتورة ${invoice.invoiceNumber} ليست في حالة نهائي`);
        if (!invoice.isReturn) throw new Error(`الفاتورة ${invoice.invoiceNumber} ليست مرتجع`);

        const [existingRefund] = await tx.select().from(cashierRefundReceipts)
          .where(eq(cashierRefundReceipts.invoiceId, invoiceId));
        if (existingRefund) throw new Error(`مرتجع الفاتورة ${invoice.invoiceNumber} مصروف بالفعل`);

        const amount = invoice.netTotal;
        totalRefunded += parseFloat(amount);

        const [receipt] = await tx.insert(cashierRefundReceipts).values({
          receiptNumber: nextRefundNumber++,
          shiftId,
          invoiceId,
          amount,
          paymentDate: paymentDate || new Date().toISOString().split("T")[0],
          refundedBy,
        }).returning();

        await tx.update(salesInvoiceHeaders).set({
          status: "collected",
          updatedAt: new Date(),
        }).where(eq(salesInvoiceHeaders.id, invoiceId));

        await tx.insert(cashierAuditLog).values({
          shiftId,
          action: "refund",
          entityType: "return_invoice",
          entityId: invoiceId,
          details: `صرف مرتجع فاتورة رقم ${invoice.invoiceNumber} - المبلغ: ${amount}`,
          performedBy: refundedBy,
        });

        receipts.push({ ...receipt, invoiceNumber: invoice.invoiceNumber });
      }

      const result = { receipts, totalRefunded: totalRefunded.toFixed(2), count: receipts.length };

      this.completeSalesJournalsWithCash(
        invoiceIds, shift.glAccountId || null, shift.pharmacyId || ""
      ).catch(err => console.error("Auto journal completion for cashier refund failed:", err));

      return result;
    });
  }

  async getShiftTotals(shiftId: string): Promise<any> {
    const [collectResult] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(cashierReceipts).where(eq(cashierReceipts.shiftId, shiftId));

    const [refundResult] = await db.select({
      total: sql<string>`COALESCE(SUM(amount), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(cashierRefundReceipts).where(eq(cashierRefundReceipts.shiftId, shiftId));

    const [shift] = await db.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));

    const totalCollected = collectResult?.total || "0";
    const totalRefunded = refundResult?.total || "0";
    const openingCash = shift?.openingCash || "0";
    const netCash = (parseFloat(openingCash) + parseFloat(totalCollected) - parseFloat(totalRefunded)).toFixed(2);

    return {
      openingCash,
      totalCollected,
      collectCount: collectResult?.count || 0,
      totalRefunded,
      refundCount: refundResult?.count || 0,
      netCash,
    };
  }

  // ==================== Print Tracking ====================

  async getCashierReceipt(receiptId: string): Promise<any> {
    const [receipt] = await db.select().from(cashierReceipts).where(eq(cashierReceipts.id, receiptId));
    return receipt || null;
  }

  async getCashierRefundReceipt(receiptId: string): Promise<any> {
    const [receipt] = await db.select().from(cashierRefundReceipts).where(eq(cashierRefundReceipts.id, receiptId));
    return receipt || null;
  }

  async markReceiptPrinted(receiptId: string, printedBy: string, reprintReason?: string): Promise<any> {
    const [receipt] = await db.select().from(cashierReceipts).where(eq(cashierReceipts.id, receiptId));
    if (!receipt) throw new Error("الإيصال غير موجود");
    if (receipt.printCount > 0 && !reprintReason) {
      throw new Error("الإيصال مطبوع مسبقاً – يجب تقديم سبب لإعادة الطباعة");
    }
    const [updated] = await db.update(cashierReceipts).set({
      printedAt: new Date(),
      printCount: (receipt.printCount || 0) + 1,
      lastPrintedBy: printedBy,
      reprintReason: reprintReason || null,
    }).where(eq(cashierReceipts.id, receiptId)).returning();
    return updated;
  }

  async markRefundReceiptPrinted(receiptId: string, printedBy: string, reprintReason?: string): Promise<any> {
    const [receipt] = await db.select().from(cashierRefundReceipts).where(eq(cashierRefundReceipts.id, receiptId));
    if (!receipt) throw new Error("إيصال المرتجع غير موجود");
    if (receipt.printCount > 0 && !reprintReason) {
      throw new Error("إيصال المرتجع مطبوع مسبقاً – يجب تقديم سبب لإعادة الطباعة");
    }
    const [updated] = await db.update(cashierRefundReceipts).set({
      printedAt: new Date(),
      printCount: (receipt.printCount || 0) + 1,
      lastPrintedBy: printedBy,
      reprintReason: reprintReason || null,
    }).where(eq(cashierRefundReceipts.id, receiptId)).returning();
    return updated;
  }

  // ==================== Patients ====================

  async getPatients(): Promise<Patient[]> {
    return db.select().from(patients).where(eq(patients.isActive, true)).orderBy(asc(patients.fullName));
  }

  async searchPatients(search: string): Promise<Patient[]> {
    if (!search.trim()) return this.getPatients();
    const tokens = search.trim().split(/\s+/).filter(Boolean);
    const conditions = tokens.map(token => {
      const pattern = token.includes('%') ? token : `%${token}%`;
      return or(
        ilike(patients.fullName, pattern),
        ilike(patients.phone, pattern),
        ilike(patients.nationalId, pattern),
      );
    });
    return db.select().from(patients)
      .where(and(eq(patients.isActive, true), ...conditions.filter(Boolean) as any))
      .orderBy(asc(patients.fullName))
      .limit(50);
  }

  async getPatientStats(filters?: { search?: string; dateFrom?: string; dateTo?: string; deptId?: string }): Promise<any[]> {
    const toCamel = (s: string) => s.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());

    // ────────────────────────────────────────────────────────────────────────────
    // سياسة الـ JOIN:
    //
    //  • فلتر التاريخ نشط  → INNER JOIN: يُظهر فقط مرضى لهم فواتير في هذه الفترة.
    //    (السلوك المطلوب: "عرض مرضى اليوم فقط" = لا يظهر مرضى بلا نشاط)
    //
    //  • فلتر القسم فقط    → LEFT JOIN: يُظهر كل المرضى لكن يُميّز (بـ opacity)
    //    مَن ليس لهم نشاط في هذا القسم — حتى لا يختفي أي مريض.
    //
    //  • بدون فلتر         → LEFT JOIN: كل المرضى المسجّلين.
    // ────────────────────────────────────────────────────────────────────────────

    // ── شروط subquery الفواتير (تاريخ + قسم + غير ملغي)
    // فلتر القسم: يطابق department_id مباشرة أو عبر warehouse المرتبط بالفاتورة
    const invConds: string[] = ["pih.status != 'cancelled'"];
    if (filters?.dateFrom) invConds.push(`pih.invoice_date >= '${filters.dateFrom}'`);
    if (filters?.dateTo)   invConds.push(`pih.invoice_date <= '${filters.dateTo}'`);
    if (filters?.deptId) {
      const d = filters.deptId.replace(/'/g, "''");
      invConds.push(
        `(pih.department_id = '${d}' OR (pih.department_id IS NULL AND EXISTS (` +
        `SELECT 1 FROM warehouses w WHERE w.id = pih.warehouse_id AND w.department_id = '${d}'` +
        `)))`
      );
    }
    const invFilter = invConds.join(" AND ");

    const hasDateFilter = !!(filters?.dateFrom || filters?.dateTo);
    const joinType = hasDateFilter ? "JOIN" : "LEFT JOIN";

    // ── فلتر البحث على مستوى المريض
    // يدعم البحث بـ: الاسم، التليفون، أو اسم الطبيب (من أي فاتورة للمريض)
    let patientFilter = "p.is_active = true";
    if (filters?.search?.trim()) {
      const tokens = filters.search.trim().split(/\s+/).filter(Boolean);
      const conds = tokens.map(t => {
        const pat = `'%${t.replace(/'/g, "''").replace(/%/g, "\\%")}%'`;
        return (
          `(p.full_name ILIKE ${pat}` +
          ` OR p.phone ILIKE ${pat}` +
          ` OR EXISTS (` +
            `SELECT 1 FROM patient_invoice_headers pih2` +
            ` WHERE pih2.patient_name = p.full_name` +
            ` AND pih2.doctor_name ILIKE ${pat}` +
          `))`
        );
      });
      patientFilter += ` AND (${conds.join(" AND ")})`;
    }

    // ── subquery ثنائي المستوى:
    //   المستوى الأول: يجمّع بنود كل فاتورة على حدة (pih.id)
    //     ← يضمن عدم تضاعف paid_amount عند الـ LEFT JOIN مع pil
    //   المستوى الثاني: يجمّع الفواتير لكل مريض (patient_name)
    const result = await db.execute(sql`
      SELECT
        p.id,
        p.full_name,
        p.phone,
        p.national_id,
        p.age,
        p.created_at,
        COALESCE(s.services_total, 0)      AS services_total,
        COALESCE(s.drugs_total, 0)         AS drugs_total,
        COALESCE(s.consumables_total, 0)   AS consumables_total,
        COALESCE(s.or_room_total, 0)       AS or_room_total,
        COALESCE(s.stay_total, 0)          AS stay_total,
        COALESCE(s.services_total, 0) + COALESCE(s.drugs_total, 0) +
          COALESCE(s.consumables_total, 0) + COALESCE(s.or_room_total, 0) +
          COALESCE(s.stay_total, 0)        AS grand_total,
        COALESCE(s.paid_total, 0)          AS paid_total,
        COALESCE(s.transferred_total, 0)   AS transferred_total,
        s.latest_invoice_id,
        s.latest_invoice_number,
        s.latest_invoice_status,
        s.latest_doctor_name
      FROM patients p
      ${sql.raw(joinType)} (
        SELECT
          inv.patient_name,
          SUM(inv.services_total)      AS services_total,
          SUM(inv.drugs_total)         AS drugs_total,
          SUM(inv.consumables_total)   AS consumables_total,
          SUM(inv.or_room_total)       AS or_room_total,
          SUM(inv.stay_total)          AS stay_total,
          SUM(inv.paid_amount)         AS paid_total,
          SUM(inv.transferred_total)   AS transferred_total,
          (ARRAY_AGG(inv.id             ORDER BY inv.created_at DESC))[1] AS latest_invoice_id,
          (ARRAY_AGG(inv.invoice_number ORDER BY inv.created_at DESC))[1] AS latest_invoice_number,
          (ARRAY_AGG(inv.status         ORDER BY inv.created_at DESC))[1] AS latest_invoice_status,
          (ARRAY_AGG(inv.doctor_name    ORDER BY inv.created_at DESC))[1] AS latest_doctor_name
        FROM (
          SELECT
            pih.id,
            pih.patient_name,
            pih.created_at,
            pih.invoice_number,
            pih.status,
            pih.paid_amount,
            pih.doctor_name,
            COALESCE((
              SELECT SUM(dt.amount)
              FROM doctor_transfers dt
              WHERE dt.invoice_id = pih.id
            ), 0) AS transferred_total,
            SUM(CASE WHEN pil.source_type IS NULL AND pil.line_type = 'service'
                THEN pil.total_price ELSE 0 END) AS services_total,
            SUM(CASE WHEN pil.line_type = 'drug'
                THEN pil.total_price ELSE 0 END) AS drugs_total,
            SUM(CASE WHEN pil.line_type = 'consumable'
                THEN pil.total_price ELSE 0 END) AS consumables_total,
            SUM(CASE WHEN pil.source_type = 'OR_ROOM'
                THEN pil.total_price ELSE 0 END) AS or_room_total,
            SUM(CASE WHEN pil.source_type = 'STAY_ENGINE'
                THEN pil.total_price ELSE 0 END) AS stay_total
          FROM patient_invoice_headers pih
          LEFT JOIN patient_invoice_lines pil
            ON pil.header_id = pih.id AND pil.is_void = false
          WHERE ${sql.raw(invFilter)}
          GROUP BY pih.id, pih.patient_name, pih.created_at,
                   pih.invoice_number, pih.status, pih.paid_amount, pih.doctor_name
        ) inv
        GROUP BY inv.patient_name
      ) s ON s.patient_name = p.full_name
      WHERE ${sql.raw(patientFilter)}
      ORDER BY p.created_at DESC
    `);
    return (result.rows as any[]).map(row =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v]))
    );
  }

  async getPatient(id: string): Promise<Patient | undefined> {
    const [p] = await db.select().from(patients).where(eq(patients.id, id));
    return p;
  }

  async createPatient(data: InsertPatient): Promise<Patient> {
    const [p] = await db.insert(patients).values(data).returning();
    return p;
  }

  async updatePatient(id: string, data: Partial<InsertPatient>): Promise<Patient> {
    return db.transaction(async (tx) => {
      // Fetch old name before update (needed for cascade)
      const [old] = await tx.select({ fullName: patients.fullName })
        .from(patients).where(eq(patients.id, id));

      const [updated] = await tx.update(patients).set(data).where(eq(patients.id, id)).returning();

      // Cascade name change to denormalized patient_name fields
      if (data.fullName && old?.fullName && data.fullName !== old.fullName) {
        await tx.execute(sql`
          UPDATE patient_invoice_headers
          SET patient_name = ${data.fullName}
          WHERE patient_name = ${old.fullName}
        `);
        await tx.execute(sql`
          UPDATE admissions
          SET patient_name = ${data.fullName}
          WHERE patient_name = ${old.fullName}
        `);
      }

      return updated;
    });
  }

  async deletePatient(id: string): Promise<boolean> {
    // تحقق من وجود فواتير غير ملغية بقيمة > 0 للمريض قبل السماح بالحذف
    const [patient] = await db.select({ fullName: patients.fullName }).from(patients).where(eq(patients.id, id));
    if (!patient) throw new Error("المريض غير موجود");

    const check = await db.execute(sql`
      SELECT COALESCE(SUM(net_amount), 0) AS total
      FROM patient_invoice_headers
      WHERE patient_name = ${patient.fullName}
        AND status != 'cancelled'
    `);
    const total = parseFloat((check.rows[0] as any)?.total ?? "0");
    if (total > 0) {
      throw new Error("لا يمكن حذف المريض لوجود فواتير بقيمة غير صفرية");
    }

    await db.update(patients).set({ isActive: false }).where(eq(patients.id, id));
    return true;
  }

  // ==================== Doctors ====================

  async getDoctors(): Promise<Doctor[]> {
    return db.select().from(doctors).where(eq(doctors.isActive, true)).orderBy(asc(doctors.name));
  }

  async searchDoctors(search: string): Promise<Doctor[]> {
    if (!search.trim()) return this.getDoctors();
    const tokens = search.trim().split(/\s+/).filter(Boolean);
    const conditions = tokens.map(token => {
      const pattern = token.includes('%') ? token : `%${token}%`;
      return or(
        ilike(doctors.name, pattern),
        ilike(doctors.specialty, pattern),
      );
    });
    return db.select().from(doctors)
      .where(and(eq(doctors.isActive, true), ...conditions.filter(Boolean) as any))
      .orderBy(asc(doctors.name))
      .limit(50);
  }

  async getDoctorBalances(): Promise<{ id: string; name: string; specialty: string | null; totalTransferred: string; totalSettled: string; remaining: string }[]> {
    const res = await db.execute(sql`
      SELECT
        d.id, d.name, d.specialty,
        COALESCE(SUM(DISTINCT dt.amount), 0)::text                              AS total_transferred,
        COALESCE((
          SELECT SUM(dsa2.amount) FROM doctor_settlement_allocations dsa2
          JOIN doctor_transfers dt2 ON dt2.id = dsa2.transfer_id
          WHERE dt2.doctor_name = d.name
        ), 0)::text                                                              AS total_settled,
        (
          COALESCE(SUM(dt.amount), 0) - COALESCE((
            SELECT SUM(dsa2.amount) FROM doctor_settlement_allocations dsa2
            JOIN doctor_transfers dt2 ON dt2.id = dsa2.transfer_id
            WHERE dt2.doctor_name = d.name
          ), 0)
        )::text                                                                  AS remaining
      FROM doctors d
      LEFT JOIN doctor_transfers dt ON dt.doctor_name = d.name
      WHERE d.is_active = true
      GROUP BY d.id, d.name, d.specialty
      ORDER BY d.name ASC
    `);
    return (res.rows as any[]).map(r => ({
      id: r.id,
      name: r.name,
      specialty: r.specialty,
      totalTransferred: r.total_transferred,
      totalSettled: r.total_settled,
      remaining: r.remaining,
    }));
  }

  async getDoctorStatement(params: { doctorName: string; dateFrom?: string; dateTo?: string }): Promise<any[]> {
    const { doctorName, dateFrom, dateTo } = params;
    const dateFromFilter = dateFrom ? sql`AND dt.transferred_at::date >= ${dateFrom}::date` : sql``;
    const dateToFilter   = dateTo   ? sql`AND dt.transferred_at::date <= ${dateTo}::date`   : sql``;
    const res = await db.execute(sql`
      SELECT
        dt.id,
        dt.invoice_id        AS "invoiceId",
        dt.doctor_name       AS "doctorName",
        dt.amount::text      AS amount,
        dt.transferred_at    AS "transferredAt",
        dt.notes,
        COALESCE(SUM(dsa.amount), 0)::text              AS settled,
        (dt.amount - COALESCE(SUM(dsa.amount), 0))::text AS remaining,
        pi.patient_name      AS "patientName",
        pi.invoice_date      AS "invoiceDate",
        pi.net_amount::text  AS "invoiceTotal",
        pi.status            AS "invoiceStatus"
      FROM doctor_transfers dt
      LEFT JOIN doctor_settlement_allocations dsa ON dsa.transfer_id = dt.id
      LEFT JOIN patient_invoice_headers pi ON pi.id = dt.invoice_id
      WHERE dt.doctor_name = ${doctorName}
      ${dateFromFilter}
      ${dateToFilter}
      GROUP BY dt.id, pi.id, pi.patient_name, pi.invoice_date, pi.net_amount, pi.status
      ORDER BY dt.transferred_at DESC
    `);
    return res.rows as any[];
  }

  async getDoctor(id: string): Promise<Doctor | undefined> {
    const [d] = await db.select().from(doctors).where(eq(doctors.id, id));
    return d;
  }

  async createDoctor(data: InsertDoctor): Promise<Doctor> {
    const [d] = await db.insert(doctors).values(data).returning();
    return d;
  }

  async updateDoctor(id: string, data: Partial<InsertDoctor>): Promise<Doctor> {
    const [d] = await db.update(doctors).set(data).where(eq(doctors.id, id)).returning();
    return d;
  }

  async deleteDoctor(id: string): Promise<boolean> {
    await db.update(doctors).set({ isActive: false }).where(eq(doctors.id, id));
    return true;
  }

  // ==================== Admissions ====================

  async getAdmissions(filters?: { status?: string; search?: string; dateFrom?: string; dateTo?: string; deptId?: string }): Promise<any[]> {
    // Build safe parameterized conditions for the outer admissions query
    const conds: any[] = [];
    if (filters?.status)   conds.push(sql`a.status = ${filters.status}`);
    if (filters?.dateFrom) conds.push(sql`a.admission_date >= ${filters.dateFrom}`);
    if (filters?.dateTo)   conds.push(sql`a.admission_date <= ${filters.dateTo}`);
    if (filters?.search) {
      const s = `%${filters.search}%`;
      conds.push(sql`(a.patient_name ILIKE ${s} OR a.admission_number ILIKE ${s} OR a.patient_phone ILIKE ${s} OR a.doctor_name ILIKE ${s})`);
    }
    // فلتر القسم: تُعرض الإقامة فقط إذا كانت آخر فاتورة مرتبطة بها تنتمي للقسم المحدد
    if (filters?.deptId) {
      conds.push(sql`inv_agg.latest_invoice_dept_id = ${filters.deptId}`);
    }

    const whereExpr = conds.length > 0
      ? sql`WHERE ${sql.join(conds, sql` AND `)}`
      : sql``;

    const result = await db.execute(sql`
      SELECT
        a.*,
        COALESCE(inv_agg.total_net_amount, 0)          AS total_net_amount,
        COALESCE(inv_agg.total_paid_amount, 0)         AS total_paid_amount,
        COALESCE(inv_agg.total_transferred, 0)         AS total_transferred_amount,
        inv_agg.latest_invoice_number                   AS latest_invoice_number,
        inv_agg.latest_invoice_id                       AS latest_invoice_id,
        inv_agg.latest_invoice_status                   AS latest_invoice_status,
        inv_agg.latest_invoice_dept_id                  AS latest_invoice_dept_id,
        inv_agg.latest_invoice_dept_name                AS latest_invoice_dept_name
      FROM admissions a
      LEFT JOIN (
        /*
         * نجمع فواتير المريض لكل إقامة بطريقتين:
         *   1. مباشرة عبر admission_id (الحالة المثلى)
         *   2. عبر اسم المريض لأحدث إقامة له عند غياب admission_id
         *      (يحدث عند إنشاء الفاتورة يدوياً بدون ربطها بإقامة)
         */
        SELECT
          COALESCE(pi.admission_id, a_fb.id)                                       AS eff_admission_id,
          SUM(pi.net_amount::numeric)                                               AS total_net_amount,
          SUM(pi.paid_amount::numeric)                                              AS total_paid_amount,
          COALESCE(SUM(dt_agg.dt_total), 0)                                        AS total_transferred,
          (ARRAY_AGG(pi.invoice_number ORDER BY pi.created_at DESC))[1]            AS latest_invoice_number,
          (ARRAY_AGG(pi.id             ORDER BY pi.created_at DESC))[1]            AS latest_invoice_id,
          (ARRAY_AGG(pi.status         ORDER BY pi.created_at DESC))[1]            AS latest_invoice_status,
          (ARRAY_AGG(pi.department_id  ORDER BY pi.created_at DESC))[1]            AS latest_invoice_dept_id,
          (ARRAY_AGG(d.name_ar         ORDER BY pi.created_at DESC))[1]            AS latest_invoice_dept_name
        FROM patient_invoice_headers pi
        /* اسم القسم من جدول departments */
        LEFT JOIN departments d ON d.id = pi.department_id
        /* fallback: آخر إقامة بنفس اسم المريض عند غياب admission_id */
        LEFT JOIN (
          SELECT DISTINCT ON (patient_name) id, patient_name
          FROM admissions
          ORDER BY patient_name, created_at DESC
        ) a_fb ON a_fb.patient_name = pi.patient_name AND pi.admission_id IS NULL
        LEFT JOIN (
          SELECT invoice_id, SUM(amount::numeric) AS dt_total
          FROM doctor_transfers
          GROUP BY invoice_id
        ) dt_agg ON dt_agg.invoice_id = pi.id
        WHERE pi.status != 'cancelled'
          AND COALESCE(pi.admission_id, a_fb.id) IS NOT NULL
        GROUP BY COALESCE(pi.admission_id, a_fb.id)
      ) inv_agg ON inv_agg.eff_admission_id = a.id
      ${whereExpr}
      ORDER BY a.created_at DESC
    `);

    // Convert snake_case keys to camelCase (raw SQL returns snake_case)
    const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return (result.rows as any[]).map(row =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v]))
    );
  }

  async getAdmission(id: string): Promise<Admission | undefined> {
    const [a] = await db.select().from(admissions).where(eq(admissions.id, id));
    return a;
  }

  async createAdmission(data: InsertAdmission): Promise<Admission> {
    const maxNumResult = await db.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(admission_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM admissions`);
    const nextNum = (parseInt(String((maxNumResult.rows[0] as any)?.max_num || "0")) || 0) + 1;

    const [a] = await db.insert(admissions).values({
      ...data,
      admissionNumber: data.admissionNumber || String(nextNum),
    }).returning();
    return a;
  }

  async updateAdmission(id: string, data: Partial<InsertAdmission>): Promise<Admission> {
    const [a] = await db.update(admissions).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(admissions.id, id)).returning();
    return a;
  }

  async dischargeAdmission(id: string): Promise<Admission> {
    const [a] = await db.update(admissions).set({
      status: "discharged",
      dischargeDate: new Date().toISOString().split("T")[0],
      updatedAt: new Date(),
    }).where(eq(admissions.id, id)).returning();
    return a;
  }

  async getAdmissionInvoices(admissionId: string): Promise<PatientInvoiceHeader[]> {
    return await db.select().from(patientInvoiceHeaders)
      .where(eq(patientInvoiceHeaders.admissionId, admissionId))
      .orderBy(asc(patientInvoiceHeaders.createdAt));
  }

  async consolidateAdmissionInvoices(admissionId: string): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [admission] = await tx.select().from(admissions).where(eq(admissions.id, admissionId));
      if (!admission) throw new Error("الإقامة غير موجودة");

      const invoices = await tx.select().from(patientInvoiceHeaders)
        .where(and(
          eq(patientInvoiceHeaders.admissionId, admissionId),
          eq(patientInvoiceHeaders.isConsolidated, false),
        ))
        .orderBy(asc(patientInvoiceHeaders.createdAt));

      if (invoices.length === 0) throw new Error("لا توجد فواتير لتجميعها");

      const existingConsolidated = await tx.select().from(patientInvoiceHeaders)
        .where(and(
          eq(patientInvoiceHeaders.admissionId, admissionId),
          eq(patientInvoiceHeaders.isConsolidated, true),
        ));

      if (existingConsolidated.length > 0) {
        for (const ec of existingConsolidated) {
          await tx.delete(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, ec.id));
          await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, ec.id));
        }
      }

      await tx.execute(sql`LOCK TABLE patient_invoice_headers IN EXCLUSIVE MODE`);
      const maxNumResult = await tx.execute(sql`SELECT COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) as max_num FROM patient_invoice_headers`);
      const nextNum = (parseInt(String((maxNumResult.rows[0] as any)?.max_num || "0")) || 0) + 1;

      const totalAmount = invoices.reduce((s, inv) => s + parseFloat(inv.totalAmount), 0);
      const discountAmount = invoices.reduce((s, inv) => s + parseFloat(inv.discountAmount), 0);
      const netAmount = invoices.reduce((s, inv) => s + parseFloat(inv.netAmount), 0);
      const paidAmount = invoices.reduce((s, inv) => s + parseFloat(inv.paidAmount), 0);

      const [consolidated] = await tx.insert(patientInvoiceHeaders).values({
        invoiceNumber: String(nextNum),
        invoiceDate: new Date().toISOString().split("T")[0],
        patientName: admission.patientName,
        patientPhone: admission.patientPhone,
        patientType: invoices[0].patientType,
        admissionId: admissionId,
        isConsolidated: true,
        sourceInvoiceIds: JSON.stringify(invoices.map(i => i.id)),
        doctorName: admission.doctorName,
        notes: `فاتورة مجمعة - إقامة رقم ${admission.admissionNumber}`,
        status: "draft",
        totalAmount: String(+totalAmount.toFixed(2)),
        discountAmount: String(+discountAmount.toFixed(2)),
        netAmount: String(+netAmount.toFixed(2)),
        paidAmount: String(+paidAmount.toFixed(2)),
      }).returning();

      let sortOrder = 0;
      for (const inv of invoices) {
        const lines = await tx.select().from(patientInvoiceLines)
          .where(eq(patientInvoiceLines.headerId, inv.id))
          .orderBy(asc(patientInvoiceLines.sortOrder));

        if (lines.length > 0) {
          const newLines = lines.map(l => ({
            headerId: consolidated.id,
            lineType: l.lineType,
            serviceId: l.serviceId,
            itemId: l.itemId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountPercent: l.discountPercent,
            discountAmount: l.discountAmount,
            totalPrice: l.totalPrice,
            unitLevel: l.unitLevel,
            lotId: l.lotId,
            expiryMonth: l.expiryMonth,
            expiryYear: l.expiryYear,
            priceSource: l.priceSource,
            doctorName: l.doctorName,
            nurseName: l.nurseName,
            notes: l.notes ? `[${inv.invoiceNumber}] ${l.notes}` : `[فاتورة ${inv.invoiceNumber}]`,
            sortOrder: sortOrder++,
          }));
          await tx.insert(patientInvoiceLines).values(newLines);
        }
      }

      const [finalHeader] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, consolidated.id));
      return finalHeader;
    });
  }

  // ==================== Stay Engine ====================

  async getStaySegments(admissionId: string): Promise<StaySegment[]> {
    const result = await db.execute(
      sql`SELECT * FROM stay_segments WHERE admission_id = ${admissionId} ORDER BY started_at ASC`
    );
    return result.rows as any[];
  }

  async openStaySegment(params: {
    admissionId: string;
    serviceId?: string;
    invoiceId: string;
    notes?: string;
  }): Promise<StaySegment> {
    return await db.transaction(async (tx) => {
      // Lock admission FOR UPDATE
      const admResult = await tx.execute(sql`SELECT * FROM admissions WHERE id = ${params.admissionId} FOR UPDATE`);
      const admission = admResult.rows?.[0] as any;
      if (!admission) throw new Error("الإقامة غير موجودة");
      if (admission.status !== "active") throw new Error("الإقامة غير نشطة");

      // Enforce 1 ACTIVE per admission (also backed by partial unique index)
      const activeCheck = await tx.execute(
        sql`SELECT id FROM stay_segments WHERE admission_id = ${params.admissionId} AND status = 'ACTIVE' FOR UPDATE`
      );
      if ((activeCheck.rows?.length || 0) > 0) {
        throw new Error("يوجد قطاع إقامة نشط بالفعل – استخدم تحويل الإقامة لتغيير الخدمة");
      }

      // Resolve rate from service
      let ratePerDay = "0";
      if (params.serviceId) {
        const svcResult = await tx.execute(
          sql`SELECT base_price FROM services WHERE id = ${params.serviceId} AND is_active = true LIMIT 1`
        );
        ratePerDay = String((svcResult.rows[0] as any)?.base_price ?? "0");
      }

      const [seg] = await tx.insert(staySegments).values({
        admissionId: params.admissionId,
        serviceId: params.serviceId || null,
        invoiceId: params.invoiceId,
        startedAt: new Date(),
        status: "ACTIVE",
        ratePerDay,
        notes: params.notes || null,
      }).returning();
      return seg;
    });
  }

  async closeStaySegment(segmentId: string): Promise<StaySegment> {
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(
        sql`SELECT * FROM stay_segments WHERE id = ${segmentId} FOR UPDATE`
      );
      const seg = lockResult.rows?.[0] as any;
      if (!seg) throw new Error("القطاع غير موجود");
      if (seg.status === "CLOSED") throw new Error("القطاع مغلق بالفعل");

      const [updated] = await tx.update(staySegments).set({
        status: "CLOSED",
        endedAt: new Date(),
      }).where(eq(staySegments.id, segmentId)).returning();
      return updated;
    });
  }

  async transferStaySegment(params: {
    admissionId: string;
    oldSegmentId: string;
    newServiceId?: string;
    newInvoiceId: string;
    notes?: string;
  }): Promise<StaySegment> {
    return await db.transaction(async (tx) => {
      // Lock admission + old segment atomically — prevents duplicate open
      const admResult = await tx.execute(
        sql`SELECT * FROM admissions WHERE id = ${params.admissionId} FOR UPDATE`
      );
      const admission = admResult.rows?.[0] as any;
      if (!admission) throw new Error("الإقامة غير موجودة");
      if (admission.status !== "active") throw new Error("الإقامة غير نشطة");

      const segResult = await tx.execute(
        sql`SELECT * FROM stay_segments WHERE id = ${params.oldSegmentId} AND admission_id = ${params.admissionId} FOR UPDATE`
      );
      const oldSeg = segResult.rows?.[0] as any;
      if (!oldSeg) throw new Error("القطاع المصدر غير موجود");
      if (oldSeg.status !== "ACTIVE") throw new Error("القطاع المصدر ليس نشطاً");

      // Close old segment
      await tx.update(staySegments).set({
        status: "CLOSED",
        endedAt: new Date(),
      }).where(eq(staySegments.id, params.oldSegmentId));

      // Resolve rate for new segment
      let ratePerDay = "0";
      if (params.newServiceId) {
        const svcResult = await tx.execute(
          sql`SELECT base_price FROM services WHERE id = ${params.newServiceId} AND is_active = true LIMIT 1`
        );
        ratePerDay = String((svcResult.rows[0] as any)?.base_price ?? "0");
      }

      // Open new segment — partial unique index now unblocked since old is CLOSED
      const [newSeg] = await tx.insert(staySegments).values({
        admissionId: params.admissionId,
        serviceId: params.newServiceId || null,
        invoiceId: params.newInvoiceId,
        startedAt: new Date(),
        status: "ACTIVE",
        ratePerDay,
        notes: params.notes || null,
      }).returning();

      return newSeg;
    });
  }

  async accrueStayLines(): Promise<{ segmentsProcessed: number; linesUpserted: number }> {
    // Fetch all ACTIVE segments with service name for description
    const activeResult = await db.execute(sql`
      SELECT s.id, s.admission_id, s.invoice_id, s.service_id, s.started_at,
             s.rate_per_day, COALESCE(srv.name_ar, 'إقامة') AS service_name_ar
      FROM stay_segments s
      LEFT JOIN services srv ON s.service_id = srv.id
      WHERE s.status = 'ACTIVE'
    `);
    const segments = activeResult.rows as any[];
    let totalLinesUpserted = 0;

    for (const seg of segments) {
      try {
        await db.transaction(async (tx) => {
          // Lock invoice FOR UPDATE to prevent concurrent total recompute
          await tx.execute(
            sql`SELECT id FROM patient_invoice_headers WHERE id = ${seg.invoice_id} FOR UPDATE`
          );

          // Compute daily buckets based on billing mode
          const billingMode = getSetting("stay_billing_mode", "hours_24");
          const startedAt = new Date(seg.started_at);
          const now = new Date();

          type BucketEntry = { key: string; desc: string };
          const bucketEntries: BucketEntry[] = [];

          if (billingMode === "hotel_noon") {
            // Hotel noon: day boundaries at 12:00 UTC
            // Period 1: from startedAt to first noon checkpoint (charge immediately)
            const firstNoon = new Date(startedAt);
            firstNoon.setUTCHours(12, 0, 0, 0);
            if (startedAt.getTime() >= firstNoon.getTime()) {
              firstNoon.setUTCDate(firstNoon.getUTCDate() + 1);
            }
            const startDateStr = startedAt.toISOString().split("T")[0];
            bucketEntries.push({ key: `noon:${startDateStr}`, desc: `${seg.service_name_ar} – ${startDateStr}` });

            // Each noon checkpoint that has passed opens a new period
            const cur = new Date(firstNoon);
            while (cur.getTime() <= now.getTime()) {
              const dateStr = cur.toISOString().split("T")[0];
              bucketEntries.push({ key: `noon:${dateStr}`, desc: `${seg.service_name_ar} – ${dateStr}` });
              cur.setUTCDate(cur.getUTCDate() + 1);
            }
          } else {
            // hours_24 (default): فوترة بـ 24 ساعة من وقت الدخول بالضبط
            // يوم 1 = فور الدخول، يوم 2 = بعد 24 ساعة من الدخول، إلخ.
            // مثال: دخل 8:15 صباحاً → يوم 2 يُحسب 8:15 صباحاً اليوم التالي
            //        (أو عند أول tick بعد مرور 24 ساعة — كل 5 دقائق)
            //
            // periodsCompleted = 0 → يوم 1 فقط (أقل من 24 ساعة)
            // periodsCompleted = 1 → يوم 2 (بعد 24 ساعة)
            // periodsCompleted = 2 → يوم 3 (بعد 48 ساعة)  إلخ.
            //
            // الـ source_id يستخدم تاريخ بداية كل فترة لضمان idempotency
            const elapsedMs        = now.getTime() - startedAt.getTime();
            const periodsCompleted = Math.max(0, Math.floor(elapsedMs / 86_400_000));

            for (let n = 0; n <= periodsCompleted; n++) {
              const periodStart = new Date(startedAt.getTime() + n * 86_400_000);
              const dateStr     = periodStart.toISOString().split("T")[0];
              bucketEntries.push({ key: dateStr, desc: `${seg.service_name_ar} – يوم ${n + 1}` });
            }
          }

          const rateStr = String(parseFloat(seg.rate_per_day) || 0);
          let linesInserted = 0;

          for (const { key: bucketKey, desc: description } of bucketEntries) {
            const sourceId = `${seg.invoice_id}:${seg.id}:${bucketKey}`;

            // Idempotent UPSERT — ON CONFLICT with the partial unique index
            const upsertResult = await tx.execute(sql`
              INSERT INTO patient_invoice_lines
                (header_id, line_type, service_id, description,
                 quantity, unit_price, discount_percent, discount_amount,
                 total_price, unit_level, sort_order, source_type, source_id)
              VALUES
                (${seg.invoice_id}, 'service', ${seg.service_id}, ${description},
                 '1', ${rateStr}, '0', '0',
                 ${rateStr}, 'minor', 0, 'STAY_ENGINE', ${sourceId})
              ON CONFLICT (source_type, source_id)
                WHERE is_void = false AND source_type IS NOT NULL AND source_id IS NOT NULL
              DO NOTHING
            `);
            if ((upsertResult.rowCount || 0) > 0) linesInserted++;
          }

          if (linesInserted > 0) {
            // Recompute invoice totals server-side
            const dbLines = await tx.select().from(patientInvoiceLines)
              .where(and(eq(patientInvoiceLines.headerId, seg.invoice_id), eq(patientInvoiceLines.isVoid, false)));
            const dbPayments = await tx.select().from(patientInvoicePayments)
              .where(eq(patientInvoicePayments.headerId, seg.invoice_id));
            const totals = this.computeInvoiceTotals(dbLines, dbPayments);

            await tx.update(patientInvoiceHeaders).set({
              ...totals,
              updatedAt: new Date(),
            }).where(eq(patientInvoiceHeaders.id, seg.invoice_id));

            // Audit after commit
            await tx.insert(auditLog).values({
              tableName: "patient_invoice_headers",
              recordId: seg.invoice_id,
              action: "stay_accrual",
              newValues: JSON.stringify({ segmentId: seg.id, linesInserted, buckets: bucketEntries.length }),
            });

            console.log(`[STAY_ENGINE] Accrued ${linesInserted} line(s) for segment ${seg.id} → invoice ${seg.invoice_id}`);
          }

          totalLinesUpserted += linesInserted;
        });
      } catch (err: any) {
        console.error(`[STAY_ENGINE] Segment ${seg.id} accrual failed:`, err.message);
      }
    }

    return { segmentsProcessed: segments.length, linesUpserted: totalLinesUpserted };
  }

  // ==================== Surgery Types ====================

  async getSurgeryTypes(search?: string): Promise<SurgeryType[]> {
    if (search) {
      return db.select().from(surgeryTypes)
        .where(ilike(surgeryTypes.nameAr, `%${search}%`))
        .orderBy(surgeryTypes.category, asc(surgeryTypes.nameAr));
    }
    return db.select().from(surgeryTypes).orderBy(surgeryTypes.category, asc(surgeryTypes.nameAr));
  }

  async createSurgeryType(data: InsertSurgeryType): Promise<SurgeryType> {
    const [row] = await db.insert(surgeryTypes).values(data).returning();
    return row;
  }

  async updateSurgeryType(id: string, data: Partial<InsertSurgeryType>): Promise<SurgeryType> {
    const [row] = await db.update(surgeryTypes).set(data).where(eq(surgeryTypes.id, id)).returning();
    if (!row) throw new Error("نوع العملية غير موجود");
    return row;
  }

  async deleteSurgeryType(id: string): Promise<void> {
    const linked = await db.execute(
      sql`SELECT id FROM admissions WHERE surgery_type_id = ${id} LIMIT 1`
    );
    if (linked.rows.length > 0) throw new Error("لا يمكن حذف نوع العملية — مرتبط بقبول مريض");
    await db.delete(surgeryTypes).where(eq(surgeryTypes.id, id));
  }

  async getSurgeryCategoryPrices(): Promise<SurgeryCategoryPrice[]> {
    return db.select().from(surgeryCategoryPrices).orderBy(asc(surgeryCategoryPrices.category));
  }

  async upsertSurgeryCategoryPrice(category: string, price: string): Promise<SurgeryCategoryPrice> {
    const [row] = await db.insert(surgeryCategoryPrices)
      .values({ category, price })
      .onConflictDoUpdate({ target: surgeryCategoryPrices.category, set: { price } })
      .returning();
    return row;
  }

  /**
   * Change surgery type on a patient invoice:
   * 1. Updates/removes the OR_ROOM line with the new category price
   * 2. Recomputes invoice totals
   */
  async updateInvoiceSurgeryType(invoiceId: string, surgeryTypeId: string | null): Promise<void> {
    await db.transaction(async (tx) => {
      // Lock invoice
      const hdrRes = await tx.execute(
        sql`SELECT * FROM patient_invoice_headers WHERE id = ${invoiceId} FOR UPDATE`
      );
      const hdr = hdrRes.rows[0] as any;
      if (!hdr) throw new Error("الفاتورة غير موجودة");
      if (hdr.status === "finalized") throw new Error("لا يمكن تعديل فاتورة نهائية");

      // Remove existing OR_ROOM line for this invoice
      await tx.execute(
        sql`DELETE FROM patient_invoice_lines WHERE header_id = ${invoiceId} AND source_type = 'OR_ROOM'`
      );

      if (surgeryTypeId) {
        // Fetch surgery type and its category price
        const stRes = await tx.execute(
          sql`SELECT st.id, st.name_ar, st.category, scp.price
              FROM surgery_types st
              LEFT JOIN surgery_category_prices scp ON scp.category = st.category
              WHERE st.id = ${surgeryTypeId} AND st.is_active = true
              LIMIT 1`
        );
        const st = stRes.rows[0] as any;
        if (!st) throw new Error("نوع العملية غير موجود أو غير نشط");

        const price = parseFloat(st.price || "0");
        const desc = `فتح غرفة عمليات — ${st.name_ar}`;

        await tx.execute(
          sql`INSERT INTO patient_invoice_lines
              (header_id, line_type, description, quantity, unit_price, discount_percent, discount_amount, total_price, unit_level, sort_order, source_type, source_id)
              VALUES
              (${invoiceId}, 'service', ${desc}, '1', ${String(price)}, '0', '0', ${String(price)}, 'minor', 5, 'OR_ROOM', ${`or_room:${invoiceId}:${surgeryTypeId}`})`
        );

        // Update admission surgery_type_id
        await tx.execute(
          sql`UPDATE admissions SET surgery_type_id = ${surgeryTypeId} WHERE id = (
            SELECT admission_id FROM patient_invoice_headers WHERE id = ${invoiceId} LIMIT 1
          )`
        );
      } else {
        // Clear surgery type from admission
        await tx.execute(
          sql`UPDATE admissions SET surgery_type_id = NULL WHERE id = (
            SELECT admission_id FROM patient_invoice_headers WHERE id = ${invoiceId} LIMIT 1
          )`
        );
      }

      // Recompute totals
      const linesRes = await tx.execute(
        sql`SELECT unit_price, quantity, discount_percent FROM patient_invoice_lines WHERE header_id = ${invoiceId}`
      );
      let total = 0;
      let disc = 0;
      for (const l of linesRes.rows as any[]) {
        const gross = parseFloat(l.unit_price) * parseFloat(l.quantity);
        const d = gross * parseFloat(l.discount_percent || "0") / 100;
        total += gross; disc += d;
      }
      const net = Math.round((total - disc) * 100) / 100;
      await tx.execute(
        sql`UPDATE patient_invoice_headers
            SET total_amount = ${String(Math.round(total * 100) / 100)},
                discount_amount = ${String(Math.round(disc * 100) / 100)},
                net_amount = ${String(net)}
            WHERE id = ${invoiceId}`
      );
    });
  }

  // ==================== Bed Board ====================

  async getBedBoard() {
    const result = await db.execute(sql`
      SELECT
        f.id   AS floor_id,   f.name_ar AS floor_name_ar, f.sort_order AS floor_sort,
        r.id   AS room_id,    r.name_ar AS room_name_ar,  r.room_number, r.sort_order AS room_sort,
        r.service_id AS room_service_id,
        svc.name_ar AS room_service_name_ar, svc.base_price AS room_service_price,
        b.id   AS bed_id,     b.bed_number, b.status,
        b.current_admission_id,
        a.patient_name, a.admission_number
      FROM floors f
      JOIN rooms r  ON r.floor_id = f.id
      LEFT JOIN services svc ON svc.id = r.service_id
      JOIN beds  b  ON b.room_id  = r.id
      LEFT JOIN admissions a ON a.id = b.current_admission_id
      ORDER BY f.sort_order, r.sort_order, b.bed_number
    `);

    const floorsMap = new Map<string, any>();
    for (const row of result.rows as any[]) {
      if (!floorsMap.has(row.floor_id)) {
        floorsMap.set(row.floor_id, {
          id: row.floor_id, nameAr: row.floor_name_ar, sortOrder: row.floor_sort,
          rooms: new Map<string, any>(),
        });
      }
      const floor = floorsMap.get(row.floor_id);
      if (!floor.rooms.has(row.room_id)) {
        floor.rooms.set(row.room_id, {
          id: row.room_id, nameAr: row.room_name_ar, roomNumber: row.room_number,
          serviceId: row.room_service_id || null,
          serviceNameAr: row.room_service_name_ar || null,
          servicePrice: row.room_service_price || null,
          sortOrder: row.room_sort, beds: [],
        });
      }
      floor.rooms.get(row.room_id).beds.push({
        id: row.bed_id, bedNumber: row.bed_number, status: row.status,
        currentAdmissionId: row.current_admission_id,
        patientName: row.patient_name || undefined,
        admissionNumber: row.admission_number || undefined,
        roomId: row.room_id,
        createdAt: null, updatedAt: null,
      });
    }

    return Array.from(floorsMap.values()).map(f => ({
      ...f,
      rooms: Array.from(f.rooms.values()),
    }));
  }

  async getAvailableBeds() {
    const result = await db.execute(sql`
      SELECT b.id, b.bed_number, b.status, b.room_id, b.current_admission_id,
             b.created_at, b.updated_at,
             r.name_ar AS room_name_ar, r.id AS room_id_ref,
             f.name_ar AS floor_name_ar, f.sort_order AS floor_sort,
             r.service_id AS room_service_id,
             s.name_ar   AS room_service_name_ar,
             s.base_price AS room_service_price
      FROM beds b
      JOIN rooms r  ON r.id = b.room_id
      JOIN floors f ON f.id = r.floor_id
      LEFT JOIN services s ON s.id = r.service_id AND s.is_active = true
      WHERE b.status = 'EMPTY'
      ORDER BY f.sort_order, r.sort_order, b.bed_number
    `);
    return result.rows.map((row: any) => ({
      id: row.id,
      bedNumber: row.bed_number,
      status: row.status,
      roomId: row.room_id,
      currentAdmissionId: row.current_admission_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      roomNameAr: row.room_name_ar,
      floorNameAr: row.floor_name_ar,
      roomServiceId: row.room_service_id ?? null,
      roomServiceNameAr: row.room_service_name_ar ?? null,
      roomServicePrice: row.room_service_price ? String(row.room_service_price) : null,
    }));
  }

  async admitPatientToBed(params: {
    bedId: string; patientName: string; patientPhone?: string;
    departmentId?: string; serviceId?: string; doctorName?: string; notes?: string;
    paymentType?: string; insuranceCompany?: string; surgeryTypeId?: string;
  }) {
    const result = await db.transaction(async (tx) => {
      // 1. Lock bed FOR UPDATE — guards against race conditions
      const bedRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${params.bedId} FOR UPDATE`);
      const bed = bedRes.rows[0] as any;
      if (!bed) throw new Error("السرير غير موجود");
      if (bed.status !== "EMPTY") throw new Error("السرير غير فارغ — يرجى اختيار سرير آخر");

      // 2. Generate admission number (safe within tx — UNIQUE constraint is final guard)
      const cntRes = await tx.execute(sql`SELECT COUNT(*) AS cnt FROM admissions`);
      const seq = parseInt((cntRes.rows[0] as any)?.cnt || "0") + 1;
      const admissionNumber = `ADM-${String(seq).padStart(6, "0")}`;

      // 3a. Upsert patient into patients table (so they appear in the patient registry)
      const existingPatient = await tx.execute(
        sql`SELECT id FROM patients WHERE full_name = ${params.patientName} AND is_active = true LIMIT 1`
      );
      if (existingPatient.rows.length === 0) {
        await tx.execute(sql`
          INSERT INTO patients (id, full_name, phone, national_id, age, is_active, created_at)
          VALUES (
            gen_random_uuid(),
            ${params.patientName},
            ${params.patientPhone || null},
            null,
            null,
            true,
            NOW()
          )
        `);
      } else if (params.patientPhone) {
        await tx.execute(sql`
          UPDATE patients SET phone = ${params.patientPhone}
          WHERE id = ${(existingPatient.rows[0] as any).id}
        `);
      }

      // 3b. Create admission
      const [admission] = await tx.insert(admissions).values({
        admissionNumber,
        patientName: params.patientName,
        patientPhone: params.patientPhone || "",
        admissionDate: new Date().toISOString().split("T")[0] as unknown as Date,
        doctorName: params.doctorName || null,
        notes: params.notes || null,
        status: "active" as any,
        paymentType: (params.paymentType === "contract" ? "contract" : "CASH") as any,
        insuranceCompany: params.insuranceCompany || null,
        surgeryTypeId: params.surgeryTypeId || null,
      } as any).returning();

      // 4. Find warehouse (prefer department-mapped, fallback to first)
      let warehouseId: string | null = null;
      if (params.departmentId) {
        const whRes = await tx.execute(
          sql`SELECT id FROM warehouses WHERE department_id = ${params.departmentId} LIMIT 1`
        );
        warehouseId = (whRes.rows[0] as any)?.id || null;
      }
      if (!warehouseId) {
        const whRes = await tx.execute(sql`SELECT id FROM warehouses ORDER BY created_at LIMIT 1`);
        warehouseId = (whRes.rows[0] as any)?.id || null;
      }
      if (!warehouseId) throw new Error("لا يوجد مخزن متاح — يرجى إنشاء مخزن أولاً");

      // 5. Generate invoice number
      const invCntRes = await tx.execute(sql`SELECT COUNT(*) AS cnt FROM patient_invoice_headers`);
      const invSeq = parseInt((invCntRes.rows[0] as any)?.cnt || "0") + 1;
      const invoiceNumber = `PI-${String(invSeq).padStart(6, "0")}`;

      // 6. Create draft patient invoice linked to admission
      const [invoice] = await tx.insert(patientInvoiceHeaders).values({
        invoiceNumber,
        patientName: params.patientName,
        patientPhone: params.patientPhone || "",
        admissionId: admission.id,
        warehouseId,
        departmentId: params.departmentId || null,
        doctorName: params.doctorName || null,
        patientType: (params.paymentType === "contract" ? "contract" : "cash") as any,
        contractName: params.paymentType === "contract" ? (params.insuranceCompany || null) : null,
        status: "draft" as any,
        invoiceDate: new Date().toISOString().split("T")[0] as unknown as Date,
        totalAmount: "0",
        discountAmount: "0",
        netAmount: "0",
        paidAmount: "0",
        version: 1,
      }).returning();

      // 7. Resolve accommodation service: explicit param > room's service
      const roomRes = await tx.execute(
        sql`SELECT r.service_id, COALESCE(s.base_price, '0') AS base_price, COALESCE(s.name_ar, 'إقامة') AS service_name_ar
            FROM beds b JOIN rooms r ON r.id = b.room_id
            LEFT JOIN services s ON s.id = r.service_id
            WHERE b.id = ${params.bedId} LIMIT 1`
      );
      const roomRow = roomRes.rows[0] as any;
      const effectiveServiceId: string | null = params.serviceId || roomRow?.service_id || null;
      const ratePerDay = params.serviceId
        ? String(((await tx.execute(sql`SELECT base_price FROM services WHERE id = ${params.serviceId} LIMIT 1`)).rows[0] as any)?.base_price ?? "0")
        : String(roomRow?.base_price ?? "0");
      const serviceNameAr: string = String(roomRow?.service_name_ar ?? "إقامة");

      // Open stay segment if we have a service
      let segmentId: string | undefined;
      if (effectiveServiceId) {
        const [seg] = await tx.insert(staySegments).values({
          admissionId: admission.id,
          serviceId: effectiveServiceId,
          invoiceId: invoice.id,
          startedAt: new Date(),
          status: "ACTIVE",
          ratePerDay,
        }).returning();
        segmentId = seg.id;

        // Immediately insert first stay line (يوم 1) so it appears at once — idempotent
        const admittedAt = new Date();
        const dateStr = admittedAt.toISOString().split("T")[0];
        const sourceId = `${invoice.id}:${seg.id}:${dateStr}`;
        await tx.execute(sql`
          INSERT INTO patient_invoice_lines
            (header_id, line_type, service_id, description,
             quantity, unit_price, discount_percent, discount_amount,
             total_price, unit_level, sort_order, source_type, source_id)
          VALUES
            (${invoice.id}, 'service', ${effectiveServiceId}, ${serviceNameAr + " – يوم 1"},
             '1', ${ratePerDay}, '0', '0',
             ${ratePerDay}, 'minor', 0, 'STAY_ENGINE', ${sourceId})
          ON CONFLICT (source_type, source_id)
            WHERE is_void = false AND source_type IS NOT NULL AND source_id IS NOT NULL
          DO NOTHING
        `);

        // Recompute invoice totals after first line (will be updated again if OR_ROOM added)
        const allLines1 = await tx.select().from(patientInvoiceLines)
          .where(and(eq(patientInvoiceLines.headerId, invoice.id), eq(patientInvoiceLines.isVoid, false)));
        const totals1 = this.computeInvoiceTotals(allLines1, []);
        await tx.update(patientInvoiceHeaders).set({ ...totals1, updatedAt: new Date() })
          .where(eq(patientInvoiceHeaders.id, invoice.id));
      }

      // 8. Insert OR_ROOM line if surgery type is specified
      if (params.surgeryTypeId) {
        const stRes = await tx.execute(
          sql`SELECT st.name_ar, st.category, COALESCE(scp.price, 0) AS price
              FROM surgery_types st
              LEFT JOIN surgery_category_prices scp ON scp.category = st.category
              WHERE st.id = ${params.surgeryTypeId} AND st.is_active = true
              LIMIT 1`
        );
        const st = stRes.rows[0] as any;
        if (st) {
          const orPrice = String(parseFloat(st.price || "0"));
          const orDesc = `فتح غرفة عمليات — ${st.name_ar}`;
          const orSourceId = `or_room:${invoice.id}:${params.surgeryTypeId}`;
          await tx.execute(sql`
            INSERT INTO patient_invoice_lines
              (header_id, line_type, description, quantity, unit_price, discount_percent, discount_amount,
               total_price, unit_level, sort_order, source_type, source_id)
            VALUES
              (${invoice.id}, 'service', ${orDesc}, '1', ${orPrice}, '0', '0',
               ${orPrice}, 'minor', 5, 'OR_ROOM', ${orSourceId})
            ON CONFLICT (source_type, source_id)
              WHERE is_void = false AND source_type IS NOT NULL AND source_id IS NOT NULL
            DO NOTHING
          `);
          // Recompute totals after OR_ROOM line
          const allLines2 = await tx.select().from(patientInvoiceLines)
            .where(and(eq(patientInvoiceLines.headerId, invoice.id), eq(patientInvoiceLines.isVoid, false)));
          const totals2 = this.computeInvoiceTotals(allLines2, []);
          await tx.update(patientInvoiceHeaders).set({ ...totals2, updatedAt: new Date() })
            .where(eq(patientInvoiceHeaders.id, invoice.id));
        }
      }

      // 9. Mark bed OCCUPIED
      const [updatedBed] = await tx.update(beds).set({
        status: "OCCUPIED",
        currentAdmissionId: admission.id,
        updatedAt: new Date(),
      }).where(eq(beds.id, params.bedId)).returning();

      // 9. Audit (inside tx — commits with business data)
      await tx.insert(auditLog).values({
        tableName: "beds",
        recordId: params.bedId,
        action: "admit",
        newValues: JSON.stringify({ admissionId: admission.id, invoiceId: invoice.id, segmentId }),
      });

      return { bed: updatedBed, admissionId: admission.id, invoiceId: invoice.id, segmentId };
    });

    // Emit after commit
    console.log(`[BED_BOARD] Admitted ${params.patientName} → bed ${params.bedId} admission ${result.admissionId}`);
    return result;
  }

  async transferPatientBed(params: {
    sourceBedId: string;
    targetBedId: string;
    newServiceId?: string;
    newInvoiceId?: string;
  }) {
    const result = await db.transaction(async (tx) => {
      // ── 1. Lock beds (deterministic order → no deadlock) ──────────────────
      const [id1, id2] = [params.sourceBedId, params.targetBedId].sort();
      await tx.execute(sql`SELECT id FROM beds WHERE id IN (${id1}, ${id2}) FOR UPDATE`);

      const srcRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${params.sourceBedId}`);
      const src = srcRes.rows[0] as any;
      if (!src) throw new Error("سرير المصدر غير موجود");
      if (src.status !== "OCCUPIED") throw new Error("لا يوجد مريض في سرير المصدر");

      const tgtRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${params.targetBedId}`);
      const tgt = tgtRes.rows[0] as any;
      if (!tgt) throw new Error("السرير الهدف غير موجود");
      if (tgt.status !== "EMPTY") throw new Error("السرير الهدف غير فارغ — اختر سريراً آخر");

      const admissionId = src.current_admission_id;

      // ── 2. Resolve target room grade (serviceId + price + name) ───────────
      const tgtRoomRes = await tx.execute(sql`
        SELECT r.service_id,
               COALESCE(s.base_price, '0') AS base_price,
               COALESCE(s.name_ar, 'إقامة') AS service_name_ar
        FROM beds b
        JOIN rooms r ON r.id = b.room_id
        LEFT JOIN services s ON s.id = r.service_id AND s.is_active = true
        WHERE b.id = ${params.targetBedId}
        LIMIT 1
      `);
      const tgtRoom = tgtRoomRes.rows[0] as any;

      // explicit override wins; otherwise use target room's service
      const effectiveServiceId: string | null =
        params.newServiceId || tgtRoom?.service_id || null;
      const ratePerDay = effectiveServiceId
        ? params.newServiceId
          ? String(((await tx.execute(
              sql`SELECT base_price FROM services WHERE id = ${params.newServiceId} AND is_active = true LIMIT 1`
            )).rows[0] as any)?.base_price ?? "0")
          : String(tgtRoom?.base_price ?? "0")
        : "0";
      const serviceNameAr: string = String(tgtRoom?.service_name_ar ?? "إقامة");

      // ── 3. Handle active stay segment ─────────────────────────────────────
      const activeSegRes = await tx.execute(
        sql`SELECT id, invoice_id FROM stay_segments
            WHERE admission_id = ${admissionId} AND status = 'ACTIVE'
            LIMIT 1`
      );
      const activeSeg = activeSegRes.rows[0] as any;

      let invoiceId: string | null = activeSeg?.invoice_id || params.newInvoiceId || null;

      if (activeSeg) {
        // Close old segment
        await tx.update(staySegments)
          .set({ status: "CLOSED", endedAt: new Date() })
          .where(eq(staySegments.id, activeSeg.id));
      }

      // Open new segment (only when we have a grade)
      let newSegId: string | undefined;
      if (effectiveServiceId && invoiceId) {
        const [seg] = await tx.insert(staySegments).values({
          admissionId,
          serviceId: effectiveServiceId,
          invoiceId,
          startedAt: new Date(),
          status: "ACTIVE",
          ratePerDay,
        }).returning();
        newSegId = seg.id;

        // ── 4. Immediately add accommodation line to invoice ───────────────
        const dateStr = new Date().toISOString().split("T")[0];
        const sourceId = `transfer:${invoiceId}:${seg.id}:${dateStr}`;

        // Count existing STAY_ENGINE lines to generate a sensible label
        const lineCountRes = await tx.execute(
          sql`SELECT COUNT(*) AS cnt FROM patient_invoice_lines
              WHERE header_id = ${invoiceId}
                AND source_type = 'STAY_ENGINE'
                AND is_void = false`
        );
        const existingCount = parseInt((lineCountRes.rows[0] as any)?.cnt || "0");
        const lineDesc = `${serviceNameAr} — إقامة إضافية (تحويل)`;

        await tx.execute(sql`
          INSERT INTO patient_invoice_lines
            (header_id, line_type, service_id, description,
             quantity, unit_price, discount_percent, discount_amount,
             total_price, unit_level, sort_order, source_type, source_id)
          VALUES
            (${invoiceId}, 'service', ${effectiveServiceId}, ${lineDesc},
             '1', ${ratePerDay}, '0', '0',
             ${ratePerDay}, 'minor', ${existingCount + 10},
             'STAY_ENGINE', ${sourceId})
          ON CONFLICT (source_type, source_id)
            WHERE is_void = false
              AND source_type IS NOT NULL
              AND source_id IS NOT NULL
          DO NOTHING
        `);

        // Recompute invoice totals
        const allLines = await tx.select().from(patientInvoiceLines)
          .where(and(
            eq(patientInvoiceLines.headerId, invoiceId),
            eq(patientInvoiceLines.isVoid, false),
          ));
        const totals = this.computeInvoiceTotals(allLines, []);
        await tx.update(patientInvoiceHeaders)
          .set({ ...totals, updatedAt: new Date() })
          .where(eq(patientInvoiceHeaders.id, invoiceId));
      }

      // ── 5. Atomic bed status swap ─────────────────────────────────────────
      // Source → NEEDS_CLEANING (freed)
      const [updatedSrc] = await tx.update(beds).set({
        status: "NEEDS_CLEANING",
        currentAdmissionId: null,
        updatedAt: new Date(),
      }).where(eq(beds.id, params.sourceBedId)).returning();

      // Target → OCCUPIED
      const [updatedTgt] = await tx.update(beds).set({
        status: "OCCUPIED",
        currentAdmissionId: admissionId,
        updatedAt: new Date(),
      }).where(eq(beds.id, params.targetBedId)).returning();

      // ── 6. Audit ──────────────────────────────────────────────────────────
      await tx.insert(auditLog).values({
        tableName: "beds",
        recordId: params.sourceBedId,
        action: "transfer",
        newValues: JSON.stringify({
          admissionId,
          targetBedId: params.targetBedId,
          newServiceId: effectiveServiceId,
          invoiceId,
          newSegmentId: newSegId,
        }),
      });

      return {
        sourceBed: updatedSrc,
        targetBed: updatedTgt,
        invoiceId,
        newServiceId: effectiveServiceId,
        ratePerDay,
      };
    });

    console.log(
      `[BED_BOARD] Transfer ${params.sourceBedId} → ${params.targetBedId}` +
      (result.newServiceId ? ` | grade service=${result.newServiceId} rate=${result.ratePerDay}/day` : " | no grade"),
    );
    return result;
  }

  async dischargeFromBed(bedId: string) {
    const result = await db.transaction(async (tx) => {
      const bedRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${bedId} FOR UPDATE`);
      const bed = bedRes.rows[0] as any;
      if (!bed) throw new Error("السرير غير موجود");
      if (bed.status !== "OCCUPIED") throw new Error("لا يوجد مريض في هذا السرير");

      const admissionId = bed.current_admission_id;

      // Close any active stay segment
      const segRes = await tx.execute(
        sql`SELECT id FROM stay_segments WHERE admission_id = ${admissionId} AND status = 'ACTIVE' FOR UPDATE`
      );
      for (const seg of segRes.rows as any[]) {
        await tx.update(staySegments).set({ status: "CLOSED", endedAt: new Date() })
          .where(eq(staySegments.id, seg.id));
      }

      // Discharge admission
      await tx.update(admissions).set({
        status: "discharged" as any,
        dischargeDate: new Date().toISOString().split("T")[0] as unknown as Date,
        updatedAt: new Date(),
      }).where(eq(admissions.id, admissionId));

      // Bed → NEEDS_CLEANING
      const [updatedBed] = await tx.update(beds).set({
        status: "NEEDS_CLEANING",
        currentAdmissionId: null,
        updatedAt: new Date(),
      }).where(eq(beds.id, bedId)).returning();

      await tx.insert(auditLog).values({
        tableName: "beds",
        recordId: bedId,
        action: "discharge",
        newValues: JSON.stringify({ admissionId }),
      });

      return { bed: updatedBed };
    });

    console.log(`[BED_BOARD] Discharged from bed ${bedId}`);
    return result;
  }

  async setBedStatus(bedId: string, status: string) {
    return await db.transaction(async (tx) => {
      const bedRes = await tx.execute(sql`SELECT * FROM beds WHERE id = ${bedId} FOR UPDATE`);
      const bed = bedRes.rows[0] as any;
      if (!bed) throw new Error("السرير غير موجود");
      if (bed.status === "OCCUPIED" && status !== "OCCUPIED") {
        throw new Error("لا يمكن تغيير حالة سرير مشغول");
      }

      const [updated] = await tx.update(beds).set({
        status,
        updatedAt: new Date(),
      }).where(eq(beds.id, bedId)).returning();

      await tx.insert(auditLog).values({
        tableName: "beds",
        recordId: bedId,
        action: "status_change",
        newValues: JSON.stringify({ from: bed.status, to: status }),
      });

      return updated;
    });
  }

  // Doctor Payable Transfers
  async getDoctorTransfers(invoiceId: string): Promise<DoctorTransfer[]> {
    return db.select().from(doctorTransfers)
      .where(eq(doctorTransfers.invoiceId, invoiceId))
      .orderBy(asc(doctorTransfers.createdAt));
  }

  async transferToDoctorPayable(params: { invoiceId: string; doctorName: string; amount: string; clientRequestId: string; notes?: string }): Promise<DoctorTransfer> {
    return await db.transaction(async (tx) => {
      const invRes = await tx.execute(sql`SELECT * FROM patient_invoice_headers WHERE id = ${params.invoiceId} FOR UPDATE`);
      const inv = invRes.rows[0] as any;
      if (!inv) throw Object.assign(new Error("الفاتورة غير موجودة"), { statusCode: 404 });
      if (inv.status !== "finalized") throw Object.assign(new Error("يمكن التحويل فقط للفواتير المعتمدة"), { statusCode: 400 });

      const already = await tx.execute(sql`SELECT COALESCE(SUM(amount), 0) AS total FROM doctor_transfers WHERE invoice_id = ${params.invoiceId}`);
      const alreadyAmount = parseFloat((already.rows[0] as any)?.total ?? "0");
      const netAmount = parseFloat(inv.net_amount ?? "0");
      const requested = parseFloat(params.amount);
      const remaining = netAmount - alreadyAmount;

      if (requested <= 0) throw Object.assign(new Error("يجب أن يكون المبلغ أكبر من الصفر"), { statusCode: 400 });
      if (requested > remaining + 0.001) throw Object.assign(new Error(`المبلغ يتجاوز المتبقي القابل للتحويل (${remaining.toFixed(2)})`), { statusCode: 400 });

      const existing = await tx.execute(sql`SELECT id FROM doctor_transfers WHERE client_request_id = ${params.clientRequestId}`);
      if ((existing.rows as any[]).length > 0) {
        const [row] = await tx.select().from(doctorTransfers).where(eq(doctorTransfers.clientRequestId, params.clientRequestId));
        return row;
      }

      const [transfer] = await tx.insert(doctorTransfers).values({
        invoiceId: params.invoiceId,
        doctorName: params.doctorName,
        amount: params.amount,
        clientRequestId: params.clientRequestId,
        notes: params.notes ?? null,
      }).returning();

      await tx.insert(auditLog).values({
        tableName: "doctor_transfers",
        recordId: transfer.id,
        action: "create",
        newValues: JSON.stringify({ invoiceId: params.invoiceId, doctorName: params.doctorName, amount: params.amount }),
      });

      return transfer;
    });
  }

  // Doctor Settlements
  async getDoctorSettlements(params?: { doctorName?: string }): Promise<(DoctorSettlement & { allocations: DoctorSettlementAllocation[] })[]> {
    const rows = params?.doctorName
      ? await db.select().from(doctorSettlements)
          .where(eq(doctorSettlements.doctorName, params.doctorName))
          .orderBy(desc(doctorSettlements.createdAt))
      : await db.select().from(doctorSettlements).orderBy(desc(doctorSettlements.createdAt));

    const results: (DoctorSettlement & { allocations: DoctorSettlementAllocation[] })[] = [];
    for (const row of rows) {
      const allocs = await db.select().from(doctorSettlementAllocations)
        .where(eq(doctorSettlementAllocations.settlementId, row.id))
        .orderBy(asc(doctorSettlementAllocations.createdAt));
      results.push({ ...row, allocations: allocs });
    }
    return results;
  }

  async getDoctorOutstandingTransfers(doctorName: string): Promise<(DoctorTransfer & { settled: string; remaining: string })[]> {
    const res = await db.execute(sql`
      SELECT
        dt.id,
        dt.invoice_id        AS "invoiceId",
        dt.doctor_name       AS "doctorName",
        dt.amount::text      AS amount,
        dt.client_request_id AS "clientRequestId",
        dt.transferred_at    AS "transferredAt",
        dt.notes,
        dt.created_at        AS "createdAt",
        COALESCE(SUM(dsa.amount), 0)::text              AS settled,
        (dt.amount - COALESCE(SUM(dsa.amount), 0))::text AS remaining
      FROM doctor_transfers dt
      LEFT JOIN doctor_settlement_allocations dsa ON dsa.transfer_id = dt.id
      WHERE dt.doctor_name = ${doctorName}
      GROUP BY dt.id
      HAVING (dt.amount - COALESCE(SUM(dsa.amount), 0)) > 0.001
      ORDER BY dt.transferred_at ASC
    `);
    return res.rows as any[];
  }

  async createDoctorSettlement(params: {
    doctorName: string;
    paymentDate: string;
    amount: string;
    paymentMethod: string;
    settlementUuid: string;
    notes?: string;
    allocations?: { transferId: string; amount: string }[];
  }): Promise<DoctorSettlement & { allocations: DoctorSettlementAllocation[] }> {

    let settlementId: string | null = null;
    let glSourceId: string | null = null;

    await db.transaction(async (tx) => {
      // Idempotency check
      const existingRes = await tx.execute(sql`SELECT id FROM doctor_settlements WHERE settlement_uuid = ${params.settlementUuid}`);
      if ((existingRes.rows as any[]).length > 0) {
        settlementId = (existingRes.rows[0] as any).id;
        return;
      }

      const paymentTotal = parseMoney(params.amount);
      if (paymentTotal <= 0) throw Object.assign(new Error("المبلغ يجب أن يكون أكبر من الصفر"), { statusCode: 400 });

      // Resolve allocations: user-provided OR FIFO
      let resolvedAllocations: { transferId: string; amount: number }[];

      if (params.allocations && params.allocations.length > 0) {
        resolvedAllocations = params.allocations.map(a => ({ transferId: a.transferId, amount: parseMoney(a.amount) }));
      } else {
        // FIFO from outstanding transfers
        const outstanding = await tx.execute(sql`
          SELECT dt.id, dt.amount - COALESCE(SUM(dsa.amount), 0) AS remaining
          FROM doctor_transfers dt
          LEFT JOIN doctor_settlement_allocations dsa ON dsa.transfer_id = dt.id
          WHERE dt.doctor_name = ${params.doctorName}
          GROUP BY dt.id, dt.amount
          HAVING dt.amount - COALESCE(SUM(dsa.amount), 0) > 0.001
          ORDER BY dt.transferred_at ASC
        `);
        resolvedAllocations = [];
        let leftover = paymentTotal;
        for (const row of outstanding.rows as any[]) {
          if (leftover <= 0.001) break;
          const rem = parseMoney(String(row.remaining));
          const alloc = Math.min(rem, leftover);
          resolvedAllocations.push({ transferId: row.id, amount: alloc });
          leftover = parseMoney(roundMoney(leftover - alloc));
        }
        if (leftover > 0.001) throw Object.assign(new Error(`مبلغ التسوية (${paymentTotal.toFixed(2)}) يتجاوز المستحقات المتبقية`), { statusCode: 400 });
      }

      // Enforce sum == payment amount exactly (last absorbs delta)
      const sumAlloc = resolvedAllocations.reduce((s, a) => s + a.amount, 0);
      const delta = parseMoney(roundMoney(paymentTotal - sumAlloc));
      if (Math.abs(delta) > 0.1) throw Object.assign(new Error("مجموع التخصيصات لا يساوي مبلغ التسوية"), { statusCode: 400 });
      if (resolvedAllocations.length > 0 && Math.abs(delta) > 0) {
        resolvedAllocations[resolvedAllocations.length - 1].amount = parseMoney(roundMoney(resolvedAllocations[resolvedAllocations.length - 1].amount + delta));
      }

      // Insert settlement
      const [settlement] = await tx.insert(doctorSettlements).values({
        doctorName: params.doctorName,
        paymentDate: params.paymentDate,
        amount: params.amount,
        paymentMethod: params.paymentMethod,
        settlementUuid: params.settlementUuid,
        notes: params.notes ?? null,
      }).returning();

      settlementId = settlement.id;
      glSourceId = settlement.id;

      // Insert allocations
      for (const alloc of resolvedAllocations) {
        await tx.insert(doctorSettlementAllocations).values({
          settlementId: settlement.id,
          transferId: alloc.transferId,
          amount: roundMoney(alloc.amount),
        });
      }

      // Audit
      await tx.insert(auditLog).values({
        tableName: "doctor_settlements",
        recordId: settlement.id,
        action: "create",
        newValues: JSON.stringify({ doctorName: params.doctorName, amount: params.amount, paymentMethod: params.paymentMethod, allocationCount: resolvedAllocations.length }),
      });
    });

    // GL posting AFTER commit (idempotent via generateJournalEntry)
    if (glSourceId) {
      try {
        await this.generateJournalEntry({
          sourceType: "doctor_payable_settlement",
          sourceDocumentId: glSourceId,
          reference: `SETTLE-${glSourceId.slice(0, 8).toUpperCase()}`,
          description: `تسوية مستحقات الطبيب: ${params.doctorName}`,
          entryDate: params.paymentDate,
          lines: [{ lineType: "doctor_payable_settlement", amount: params.amount }],
        });
        if (glSourceId) {
          await db.update(doctorSettlements)
            .set({ glPosted: true })
            .where(eq(doctorSettlements.id, glSourceId));
        }
      } catch (e) {
        console.log(`[DOCTOR_SETTLEMENT] GL skipped for ${glSourceId}: ${(e as Error).message}`);
      }
    }

    console.log(`[DOCTOR_SETTLEMENT] settlement=${settlementId} doctor=${params.doctorName} amount=${params.amount}`);

    // Return full record
    const [final] = await db.select().from(doctorSettlements).where(eq(doctorSettlements.id, settlementId!));
    const allocs = await db.select().from(doctorSettlementAllocations)
      .where(eq(doctorSettlementAllocations.settlementId, settlementId!))
      .orderBy(asc(doctorSettlementAllocations.createdAt));
    return { ...final, allocations: allocs };
  }

  // Account Mappings
  async getAccountMappings(transactionType?: string): Promise<AccountMapping[]> {
    if (transactionType) {
      return db.select().from(accountMappings)
        .where(eq(accountMappings.transactionType, transactionType))
        .orderBy(asc(accountMappings.lineType));
    }
    return db.select().from(accountMappings).orderBy(asc(accountMappings.transactionType), asc(accountMappings.lineType));
  }

  async getAccountMapping(id: string): Promise<AccountMapping | undefined> {
    const [mapping] = await db.select().from(accountMappings).where(eq(accountMappings.id, id));
    return mapping;
  }

  async upsertAccountMapping(data: InsertAccountMapping): Promise<AccountMapping> {
    const conditions = [
      eq(accountMappings.transactionType, data.transactionType),
      eq(accountMappings.lineType, data.lineType),
    ];
    if (data.warehouseId) {
      conditions.push(eq(accountMappings.warehouseId, data.warehouseId));
    } else {
      conditions.push(isNull(accountMappings.warehouseId));
    }

    const existing = await db.select().from(accountMappings)
      .where(and(...conditions));
    
    if (existing.length > 0) {
      const [updated] = await db.update(accountMappings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(accountMappings.id, existing[0].id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(accountMappings).values(data).returning();
    return created;
  }

  async deleteAccountMapping(id: string): Promise<boolean> {
    const result = await db.delete(accountMappings).where(eq(accountMappings.id, id));
    return (result as any).rowCount > 0;
  }

  async getMappingsForTransaction(transactionType: string, warehouseId?: string | null): Promise<AccountMapping[]> {
    const allMappings = await db.select().from(accountMappings)
      .where(and(
        eq(accountMappings.transactionType, transactionType),
        eq(accountMappings.isActive, true)
      ))
      .orderBy(asc(accountMappings.lineType));

    if (!warehouseId) {
      return allMappings.filter(m => !m.warehouseId);
    }

    const warehouseSpecific = allMappings.filter(m => m.warehouseId === warehouseId);
    const generic = allMappings.filter(m => !m.warehouseId);

    const warehouseLineTypes = new Set(warehouseSpecific.map(m => m.lineType));
    const fallbackGeneric = generic.filter(m => !warehouseLineTypes.has(m.lineType));

    return [...warehouseSpecific, ...fallbackGeneric];
  }

  async generateJournalEntry(params: {
    sourceType: string;
    sourceDocumentId: string;
    reference: string;
    description: string;
    entryDate: string;
    lines: { lineType: string; amount: string }[];
    periodId?: string;
  }): Promise<JournalEntry | null> {
    return await db.transaction(async (tx) => {
      // Advisory lock keyed on source to prevent concurrent duplicate creation
      const lockKey = Math.abs(params.sourceDocumentId.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0));
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      // Idempotency: return existing posting if already created
      const existing = await tx.select().from(journalEntries)
        .where(and(
          eq(journalEntries.sourceType, params.sourceType),
          eq(journalEntries.sourceDocumentId, params.sourceDocumentId)
        ))
        .limit(1);

      if (existing.length > 0) {
        console.log(`[GL] Idempotent: journal entry already exists for ${params.sourceType}/${params.sourceDocumentId}`);
        return existing[0];
      }

      // Resolve account mappings — do NOT hardcode account IDs
      const mappings = await this.getMappingsForTransaction(params.sourceType);
      if (mappings.length === 0) {
        console.log(`[GL] SKIPPED: No account mappings configured for transaction type "${params.sourceType}". Configure mappings at /account-mappings to enable automatic GL posting.`);
        return null;
      }

      const mappingMap = new Map<string, AccountMapping>();
      for (const m of mappings) {
        mappingMap.set(m.lineType, m);
      }

      const journalLineData: InsertJournalLine[] = [];
      const unmappedTypes: string[] = [];

      for (const line of params.lines) {
        const mapping = mappingMap.get(line.lineType);
        if (!mapping || !mapping.debitAccountId || !mapping.creditAccountId) {
          unmappedTypes.push(line.lineType);
          continue;
        }
        const amount = parseMoney(line.amount);
        if (amount <= 0) continue;

        journalLineData.push({
          journalEntryId: "",
          lineNumber: 0,
          accountId: mapping.debitAccountId,
          debit: roundMoney(amount),
          credit: "0.00",
          description: mapping.description || params.description,
        });
        journalLineData.push({
          journalEntryId: "",
          lineNumber: 0,
          accountId: mapping.creditAccountId,
          debit: "0.00",
          credit: roundMoney(amount),
          description: mapping.description || params.description,
        });
      }

      if (unmappedTypes.length > 0) {
        console.log(`[GL] WARNING: Unmapped line types for ${params.sourceType}: ${unmappedTypes.join(', ')}. These lines will be skipped. Configure at /account-mappings.`);
      }

      if (journalLineData.length === 0) {
        console.log(`[GL] SKIPPED: All lines unmapped for ${params.sourceType}/${params.sourceDocumentId}. No journal entry created.`);
        return null;
      }

      // Resolve fiscal period
      let periodId = params.periodId;
      if (!periodId) {
        const [period] = await tx.select().from(fiscalPeriods)
          .where(and(
            lte(fiscalPeriods.startDate, params.entryDate),
            gte(fiscalPeriods.endDate, params.entryDate),
            eq(fiscalPeriods.isClosed, false)
          ))
          .limit(1);
        periodId = period?.id;
      }

      const totalDebit = journalLineData.reduce((s, l) => s + parseMoney(l.debit), 0);
      const totalCredit = journalLineData.reduce((s, l) => s + parseMoney(l.credit), 0);

      const entryNumber = await this.getNextEntryNumber();

      const [entry] = await tx.insert(journalEntries).values({
        entryNumber,
        entryDate: params.entryDate,
        reference: params.reference,
        description: params.description,
        status: "draft",
        periodId: periodId || null,
        sourceType: params.sourceType,
        sourceDocumentId: params.sourceDocumentId,
        totalDebit: roundMoney(totalDebit),
        totalCredit: roundMoney(totalCredit),
      }).returning();

      const linesWithEntryId = journalLineData.map((l, idx) => ({
        ...l,
        journalEntryId: entry.id,
        lineNumber: idx + 1,
      }));

      await tx.insert(journalLines).values(linesWithEntryId);
      console.log(`[GL] Created journal entry ${entry.entryNumber} for ${params.sourceType}/${params.sourceDocumentId}`);
      return entry;
    });
  }

  async batchPostJournalEntries(ids: string[], userId: string): Promise<number> {
    let posted = 0;
    for (const id of ids) {
      try {
        const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
        if (!entry || entry.status !== 'draft') continue;
        await this.assertPeriodOpen(entry.entryDate);
        const result = await this.postJournalEntry(id, userId);
        if (result) {
          await this.createAuditLog({ tableName: "journal_entries", recordId: id, action: "post", oldValues: JSON.stringify({ status: "draft" }), newValues: JSON.stringify({ status: "posted" }) });
          posted++;
        }
      } catch (e) {
      }
    }
    return posted;
  }

  // ==================== الخزن ====================

  async getTreasuriesSummary(): Promise<(Treasury & {
    glAccountCode: string; glAccountName: string;
    openingBalance: string; totalIn: string; totalOut: string; balance: string; hasPassword: boolean;
  })[]> {
    const rows = await db.execute(sql`
      SELECT
        t.id, t.name, t.gl_account_id, t.is_active, t.notes, t.created_at,
        a.code                AS gl_account_code,
        a.name                AS gl_account_name,
        COALESCE(a.opening_balance, 0) AS opening_balance,
        COALESCE(SUM(CASE WHEN tt.type = 'in'  THEN tt.amount::numeric ELSE 0 END), 0) AS total_in,
        COALESCE(SUM(CASE WHEN tt.type = 'out' THEN tt.amount::numeric ELSE 0 END), 0) AS total_out,
        CASE WHEN dp.gl_account_id IS NOT NULL THEN true ELSE false END AS has_password
      FROM treasuries t
      JOIN accounts a ON a.id = t.gl_account_id
      LEFT JOIN treasury_transactions tt ON tt.treasury_id = t.id
      LEFT JOIN drawer_passwords dp ON dp.gl_account_id = t.gl_account_id
      GROUP BY t.id, a.code, a.name, a.opening_balance, dp.gl_account_id
      ORDER BY t.name
    `);
    return (rows.rows as any[]).map(r => {
      const ob  = parseFloat(r.opening_balance)  || 0;
      const tin = parseFloat(r.total_in)  || 0;
      const tout = parseFloat(r.total_out) || 0;
      return {
        id: r.id, name: r.name, glAccountId: r.gl_account_id,
        isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
        glAccountCode: r.gl_account_code, glAccountName: r.gl_account_name,
        openingBalance: ob.toFixed(2),
        totalIn:   tin.toFixed(2),
        totalOut:  tout.toFixed(2),
        balance:   (ob + tin - tout).toFixed(2),
        hasPassword: r.has_password,
      };
    });
  }

  async getTreasuries(): Promise<(Treasury & { glAccountCode: string; glAccountName: string })[]> {
    const rows = await db.execute(sql`
      SELECT t.*, a.code AS gl_account_code, a.name AS gl_account_name
      FROM treasuries t
      JOIN accounts a ON a.id = t.gl_account_id
      ORDER BY t.name
    `);
    return (rows.rows as any[]).map(r => ({
      id: r.id, name: r.name, glAccountId: r.gl_account_id,
      isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
      glAccountCode: r.gl_account_code, glAccountName: r.gl_account_name,
    }));
  }

  async getTreasury(id: string): Promise<Treasury | undefined> {
    const [row] = await db.select().from(treasuries).where(eq(treasuries.id, id));
    return row;
  }

  async createTreasury(data: InsertTreasury): Promise<Treasury> {
    const [row] = await db.insert(treasuries).values(data).returning();
    return row;
  }

  async updateTreasury(id: string, data: Partial<InsertTreasury>): Promise<Treasury> {
    const [row] = await db.update(treasuries).set(data).where(eq(treasuries.id, id)).returning();
    if (!row) throw new Error("الخزنة غير موجودة");
    return row;
  }

  async deleteTreasury(id: string): Promise<boolean> {
    const res = await db.delete(treasuries).where(eq(treasuries.id, id)).returning();
    return res.length > 0;
  }

  async getUserTreasury(userId: string): Promise<(Treasury & { glAccountCode: string; glAccountName: string }) | null> {
    const rows = await db.execute(sql`
      SELECT t.*, a.code AS gl_account_code, a.name AS gl_account_name
      FROM user_treasuries ut
      JOIN treasuries t ON t.id = ut.treasury_id
      JOIN accounts a ON a.id = t.gl_account_id
      WHERE ut.user_id = ${userId}
    `);
    if (!rows.rows.length) return null;
    const r = rows.rows[0] as any;
    return {
      id: r.id, name: r.name, glAccountId: r.gl_account_id,
      isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
      glAccountCode: r.gl_account_code, glAccountName: r.gl_account_name,
    };
  }

  async getAllUserTreasuries(): Promise<{ userId: string; treasuryId: string; treasuryName: string; userName: string }[]> {
    const rows = await db.execute(sql`
      SELECT ut.user_id, ut.treasury_id, t.name AS treasury_name, u.full_name AS user_name
      FROM user_treasuries ut
      JOIN treasuries t ON t.id = ut.treasury_id
      JOIN users u ON u.id = ut.user_id
      ORDER BY u.full_name
    `);
    return (rows.rows as any[]).map(r => ({
      userId: r.user_id, treasuryId: r.treasury_id,
      treasuryName: r.treasury_name, userName: r.user_name,
    }));
  }

  async assignUserTreasury(userId: string, treasuryId: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO user_treasuries (user_id, treasury_id)
      VALUES (${userId}, ${treasuryId})
      ON CONFLICT (user_id) DO UPDATE SET treasury_id = ${treasuryId}, created_at = NOW()
    `);
  }

  async removeUserTreasury(userId: string): Promise<void> {
    await db.delete(userTreasuries).where(eq(userTreasuries.userId, userId));
  }

  async getTreasuryStatement(params: { treasuryId: string; dateFrom?: string; dateTo?: string }): Promise<{ transactions: TreasuryTransaction[]; totalIn: string; totalOut: string; balance: string }> {
    let conds = [eq(treasuryTransactions.treasuryId, params.treasuryId)];
    if (params.dateFrom) conds.push(sql`${treasuryTransactions.transactionDate} >= ${params.dateFrom}`);
    if (params.dateTo)   conds.push(sql`${treasuryTransactions.transactionDate} <= ${params.dateTo}`);
    const rows = await db.select().from(treasuryTransactions)
      .where(and(...conds))
      .orderBy(treasuryTransactions.transactionDate, treasuryTransactions.createdAt);
    let totalIn = 0, totalOut = 0;
    for (const r of rows) {
      if (r.type === "in")  totalIn  += parseFloat(r.amount);
      else                  totalOut += parseFloat(r.amount);
    }
    return {
      transactions: rows,
      totalIn:  totalIn.toFixed(2),
      totalOut: totalOut.toFixed(2),
      balance:  (totalIn - totalOut).toFixed(2),
    };
  }

  async createTreasuryTransactionsForInvoice(invoiceId: string, finalizationDate: string): Promise<void> {
    const payments = await db.execute(sql`
      SELECT p.id, p.amount, p.payment_method, p.treasury_id, p.notes, p.reference_number
      FROM patient_invoice_payments p
      WHERE p.header_id = ${invoiceId} AND p.treasury_id IS NOT NULL
    `);
    if (!payments.rows.length) return;
    const header = await db.execute(sql`
      SELECT h.invoice_number, pa.name AS patient_name
      FROM patient_invoice_headers h
      LEFT JOIN patients pa ON pa.id = h.patient_id
      WHERE h.id = ${invoiceId}
    `);
    const row = header.rows[0] as any;
    const invNum = row?.invoice_number ?? invoiceId;
    const patientName = row?.patient_name ?? "";
    for (const p of payments.rows as any[]) {
      const ref = p.reference_number ? `[${p.reference_number}] ` : "";
      const desc = `${ref}تحصيل فاتورة مريض رقم ${invNum}${patientName ? ` - ${patientName}` : ""}`;
      await db.execute(sql`
        INSERT INTO treasury_transactions (treasury_id, type, amount, description, source_type, source_id, transaction_date)
        VALUES (${p.treasury_id}, 'in', ${p.amount}, ${desc}, 'patient_invoice', ${p.id}, ${finalizationDate})
        ON CONFLICT (source_type, source_id, treasury_id) DO NOTHING
      `);
    }
  }
}

export const storage = new DatabaseStorage();
