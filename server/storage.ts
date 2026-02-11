import { db } from "./db";
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
  type Patient,
  type InsertPatient,
  type Doctor,
  type InsertDoctor,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
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
  }): Promise<{data: StoreTransferWithDetails[]; total: number}>;
  getTransfer(id: string): Promise<StoreTransferWithDetails | undefined>;
  createDraftTransfer(header: InsertStoreTransfer, lines: { itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; selectedExpiryDate?: string; expiryMonth?: number; expiryYear?: number; availableAtSaveMinor?: string; notes?: string }[]): Promise<StoreTransfer>;
  updateDraftTransfer(transferId: string, header: any, lines: any[]): Promise<StoreTransfer>;
  postTransfer(transferId: string): Promise<StoreTransfer>;
  deleteTransfer(id: string): Promise<boolean>;
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
  getReceivings(params: { supplierId?: string; warehouseId?: string; status?: string; statusFilter?: string; fromDate?: string; toDate?: string; search?: string; page: number; pageSize: number }): Promise<{ data: ReceivingHeaderWithDetails[]; total: number }>;
  getReceiving(id: string): Promise<ReceivingHeaderWithDetails | undefined>;
  getNextReceivingNumber(): Promise<number>;
  checkSupplierInvoiceUnique(supplierId: string, supplierInvoiceNo: string, excludeId?: string): Promise<boolean>;
  saveDraftReceiving(header: InsertReceivingHeader, lines: { itemId: string; unitLevel: string; qtyEntered: string; qtyInMinor: string; purchasePrice: string; lineTotal: string; batchNumber?: string; expiryDate?: string; expiryMonth?: number; expiryYear?: number; salePrice?: string; salePriceHint?: string; notes?: string; isRejected?: boolean; rejectionReason?: string; bonusQty?: string; bonusQtyInMinor?: string }[], existingId?: string): Promise<ReceivingHeader>;
  postReceiving(id: string): Promise<ReceivingHeader>;
  deleteReceiving(id: string): Promise<boolean>;
  getItemHints(itemId: string, supplierId: string, warehouseId: string): Promise<{ lastPurchasePrice: string | null; lastSalePrice: string | null; currentSalePrice: string; onHandMinor: string }>;
  getItemWarehouseStats(itemId: string): Promise<{ warehouseId: string; warehouseName: string; warehouseCode: string; qtyMinor: string; expiryBreakdown: { expiryMonth: number | null; expiryYear: number | null; qty: string }[] }[]>;

  convertReceivingToInvoice(receivingId: string): Promise<any>;
  getNextPurchaseInvoiceNumber(): Promise<number>;
  getPurchaseInvoices(filters: any): Promise<{data: any[]; total: number}>;
  getPurchaseInvoice(id: string): Promise<any>;
  savePurchaseInvoice(invoiceId: string, lines: any[], headerUpdates?: any): Promise<any>;
  approvePurchaseInvoice(id: string): Promise<any>;
  deletePurchaseInvoice(id: string): Promise<boolean>;

  // Service Consumables
  getServiceConsumables(serviceId: string): Promise<ServiceConsumableWithItem[]>;
  replaceServiceConsumables(serviceId: string, lines: { itemId: string; quantity: string; unitLevel: string; notes?: string | null }[]): Promise<ServiceConsumable[]>;

  // Sales Invoices
  getNextSalesInvoiceNumber(): Promise<number>;
  getSalesInvoices(filters: { status?: string; dateFrom?: string; dateTo?: string; customerType?: string; search?: string; page?: number; pageSize?: number }): Promise<{data: any[]; total: number}>;
  getSalesInvoice(id: string): Promise<SalesInvoiceWithDetails | undefined>;
  createSalesInvoice(header: any, lines: any[]): Promise<SalesInvoiceHeader>;
  updateSalesInvoice(id: string, header: any, lines: any[]): Promise<SalesInvoiceHeader>;
  finalizeSalesInvoice(id: string): Promise<SalesInvoiceHeader>;
  deleteSalesInvoice(id: string): Promise<boolean>;

  // Patient Invoices
  getNextPatientInvoiceNumber(): Promise<number>;
  getPatientInvoices(filters: { status?: string; dateFrom?: string; dateTo?: string; patientName?: string; doctorName?: string; page?: number; pageSize?: number }): Promise<{data: any[]; total: number}>;
  getPatientInvoice(id: string): Promise<PatientInvoiceWithDetails | undefined>;
  createPatientInvoice(header: any, lines: any[], payments: any[]): Promise<PatientInvoiceHeader>;
  updatePatientInvoice(id: string, header: any, lines: any[], payments: any[]): Promise<PatientInvoiceHeader>;
  finalizePatientInvoice(id: string): Promise<PatientInvoiceHeader>;
  deletePatientInvoice(id: string): Promise<boolean>;
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

  // Cashier
  openCashierShift(cashierId: string, cashierName: string, openingCash: string, pharmacyId: string): Promise<any>;
  getActiveShift(cashierId: string, pharmacyId: string): Promise<any>;
  closeCashierShift(shiftId: string, closingCash: string): Promise<any>;
  getPendingSalesInvoices(pharmacyId: string, search?: string): Promise<any[]>;
  getPendingReturnInvoices(pharmacyId: string, search?: string): Promise<any[]>;
  getSalesInvoiceDetails(invoiceId: string): Promise<any>;
  collectInvoices(shiftId: string, invoiceIds: string[], collectedBy: string): Promise<any>;
  refundInvoices(shiftId: string, invoiceIds: string[], refundedBy: string): Promise<any>;
  getShiftTotals(shiftId: string): Promise<any>;
  getNextCashierReceiptNumber(): Promise<number>;
  getNextCashierRefundReceiptNumber(): Promise<number>;
  getPendingInvoiceCountForPharmacy(pharmacyId: string): Promise<number>;

  // Patients
  getPatients(): Promise<Patient[]>;
  searchPatients(search: string): Promise<Patient[]>;
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
}

export class DatabaseStorage implements IStorage {
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
    const [existing] = await db.select().from(journalEntries).where(eq(journalEntries.id, id));
    if (!existing || existing.status !== 'draft') {
      return undefined;
    }

    const [updated] = await db.update(journalEntries)
      .set({ status: 'posted', postedBy: userId || null, postedAt: new Date() })
      .where(eq(journalEntries.id, id))
      .returning();

    return updated;
  }

  async reverseJournalEntry(id: string, userId?: string | null): Promise<JournalEntry | undefined> {
    const entry = await this.getJournalEntry(id);
    if (!entry || entry.status !== 'posted') {
      return undefined;
    }

    // Mark original as reversed
    await db.update(journalEntries)
      .set({ status: 'reversed', reversedBy: userId || null, reversedAt: new Date() })
      .where(eq(journalEntries.id, id));

    // Create reversal entry
    const entryNumber = await this.getNextEntryNumber();
    const [reversalEntry] = await db.insert(journalEntries).values({
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

    // Create reversed lines (swap debit and credit)
    for (const line of entry.lines) {
      await db.insert(journalLines).values({
        journalEntryId: reversalEntry.id,
        lineNumber: line.lineNumber,
        accountId: line.accountId,
        costCenterId: line.costCenterId,
        description: line.description,
        debit: line.credit,
        credit: line.debit,
      });
    }

    // Update original with reversal reference
    const [updated] = await db.update(journalEntries)
      .set({ reversalEntryId: reversalEntry.id })
      .where(eq(journalEntries.id, id))
      .returning();

    return updated;
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

    const totalAssets = assets.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    const totalLiabilities = liabilities.reduce((sum, l) => sum + parseFloat(l.balance), 0);
    const totalEquity = equity.reduce((sum, e) => sum + parseFloat(e.balance), 0);

    return {
      assets: assets.filter(a => parseFloat(a.balance) !== 0),
      liabilities: liabilities.filter(l => parseFloat(l.balance) !== 0),
      equity: equity.filter(e => parseFloat(e.balance) !== 0),
      totalAssets: totalAssets.toFixed(2),
      totalLiabilities: totalLiabilities.toFixed(2),
      totalEquity: totalEquity.toFixed(2),
      totalLiabilitiesAndEquity: (totalLiabilities + totalEquity).toFixed(2),
      asOfDate,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
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

  // Store Transfers
  async getTransfers(): Promise<StoreTransferWithDetails[]> {
    const transfers = await db.select().from(storeTransfers)
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
    const transfer = await this.getTransfer(transferId);
    if (!transfer) throw new Error("التحويل غير موجود");
    if (transfer.status !== "draft") throw new Error("لا يمكن ترحيل تحويل غير مسودة");
    if (transfer.sourceWarehouseId === transfer.destinationWarehouseId) throw new Error("مخزن المصدر والوجهة يجب أن يكونا مختلفين");

    const lines = await db.select().from(transferLines).where(eq(transferLines.transferId, transferId));
    if (lines.length === 0) throw new Error("لا توجد سطور في التحويل");

    return await db.transaction(async (tx) => {
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

      const [updated] = await tx.update(storeTransfers)
        .set({ status: "executed" as const, executedAt: new Date() })
        .where(eq(storeTransfers.id, transferId))
        .returning();

      return updated;
    });
  }

  async deleteTransfer(id: string): Promise<boolean> {
    const [t] = await db.select().from(storeTransfers).where(eq(storeTransfers.id, id));
    if (!t) return false;
    if (t.status !== "draft") throw new Error("لا يمكن حذف تحويل مُرحّل");
    await db.delete(storeTransfers).where(eq(storeTransfers.id, id));
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
  }): Promise<{items: any[]; total: number}> {
    const { mode, query, warehouseId, page, pageSize, includeZeroStock, drugsOnly, excludeServices } = params;
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
  }): Promise<{data: StoreTransferWithDetails[]; total: number}> {
    const { fromDate, toDate, sourceWarehouseId, destWarehouseId, status, search, page, pageSize } = params;
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
    }
    if (search && search.trim()) {
      const searchTerm = search.trim();
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
  async getReceivings(params: { supplierId?: string; warehouseId?: string; status?: string; statusFilter?: string; fromDate?: string; toDate?: string; search?: string; page: number; pageSize: number }): Promise<{ data: ReceivingHeaderWithDetails[]; total: number }> {
    const { supplierId, warehouseId, status, statusFilter, fromDate, toDate, search, page = 1, pageSize = 50 } = params;
    const offset = (page - 1) * pageSize;
    const conditions: any[] = [];
    if (supplierId) conditions.push(eq(receivingHeaders.supplierId, supplierId));
    if (warehouseId) conditions.push(eq(receivingHeaders.warehouseId, warehouseId));
    if (status) conditions.push(eq(receivingHeaders.status, status as any));
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
      conditions.push(or(
        ilike(receivingHeaders.supplierInvoiceNo, `%${search}%`),
        sql`${receivingHeaders.receivingNumber}::text ILIKE ${`%${search}%`}`,
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
        totalCost: totalCost.toFixed(2),
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
            purchasePrice: line.purchasePrice,
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
            purchasePrice: line.purchasePrice,
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
          unitCost: line.purchasePrice,
          referenceType: 'receiving',
          referenceId: header.id,
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
  }

  async deleteReceiving(id: string): Promise<boolean> {
    const [header] = await db.select().from(receivingHeaders).where(eq(receivingHeaders.id, id));
    if (!header) return false;
    if (header.status === 'posted' || header.status === 'posted_qty_only') throw new Error('لا يمكن حذف مستند مُرحّل');
    await db.delete(receivingHeaders).where(eq(receivingHeaders.id, id));
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

  async getPurchaseInvoices(filters: { supplierId?: string; status?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }): Promise<{data: any[]; total: number}> {
    const conditions: any[] = [];
    if (filters.supplierId) conditions.push(eq(purchaseInvoiceHeaders.supplierId, filters.supplierId));
    if (filters.status && filters.status !== "all") conditions.push(eq(purchaseInvoiceHeaders.status, filters.status as any));
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
    return await db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");
      if (invoice.status !== "draft") throw new Error("الفاتورة معتمدة مسبقاً");

      await tx.update(purchaseInvoiceHeaders).set({
        status: "approved_costed",
        approvedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(purchaseInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
      return updated;
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
        totalCost: totalCost.toFixed(2),
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
            purchasePrice: line.purchasePrice,
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
            purchasePrice: line.purchasePrice,
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
          unitCost: line.purchasePrice,
          referenceType: 'receiving_correction',
          referenceId: correctionId,
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

  async deletePurchaseInvoice(id: string): Promise<boolean> {
    const [invoice] = await db.select().from(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
    if (!invoice) return false;
    if (invoice.status !== "draft") throw new Error("لا يمكن حذف فاتورة معتمدة ومُسعّرة");
    await db.delete(purchaseInvoiceHeaders).where(eq(purchaseInvoiceHeaders.id, id));
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

  async getSalesInvoices(filters: { status?: string; dateFrom?: string; dateTo?: string; customerType?: string; search?: string; page?: number; pageSize?: number }): Promise<{data: any[]; total: number}> {
    const conditions: any[] = [];
    if (filters.status && filters.status !== "all") conditions.push(eq(salesInvoiceHeaders.status, filters.status as any));
    if (filters.dateFrom) conditions.push(sql`${salesInvoiceHeaders.invoiceDate} >= ${filters.dateFrom}`);
    if (filters.dateTo) conditions.push(sql`${salesInvoiceHeaders.invoiceDate} <= ${filters.dateTo}`);
    if (filters.customerType && filters.customerType !== "all") conditions.push(eq(salesInvoiceHeaders.customerType, filters.customerType as any));
    if (filters.search) {
      conditions.push(or(
        ilike(salesInvoiceHeaders.customerName, `%${filters.search}%`),
        sql`${salesInvoiceHeaders.invoiceNumber}::text LIKE ${`%${filters.search}%`}`
      ));
    }

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(salesInvoiceHeaders).where(whereClause);

    const headers = await db.select().from(salesInvoiceHeaders)
      .where(whereClause)
      .orderBy(desc(salesInvoiceHeaders.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const data = [];
    for (const h of headers) {
      const [wh] = await db.select().from(warehouses).where(eq(warehouses.id, h.warehouseId));
      data.push({ ...h, warehouse: wh });
    }

    return { data, total: Number(countResult.count) };
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
          if (line.unitLevel === "medium") {
            const majorToMedium = parseFloat(item.majorToMedium || "1") || 1;
            salePrice = masterPrice / majorToMedium;
          } else if (line.unitLevel === "minor") {
            const majorToMinor = parseFloat(item.majorToMinor || "1") || 1;
            salePrice = masterPrice / majorToMinor;
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
        subtotal: String(subtotal.toFixed(2)),
        discountType,
        discountPercent: String(discountPercent),
        discountValue: String(actualDiscount.toFixed(2)),
        netTotal: String(netTotal.toFixed(2)),
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
          lineTotal: String(lineTotal.toFixed(2)),
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
          if (line.unitLevel === "medium") {
            const majorToMedium = parseFloat(item.majorToMedium || "1") || 1;
            salePrice = masterPrice / majorToMedium;
          } else if (line.unitLevel === "minor") {
            const majorToMinor = parseFloat(item.majorToMinor || "1") || 1;
            salePrice = masterPrice / majorToMinor;
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
          lineTotal: String(lineTotal.toFixed(2)),
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
        subtotal: String(subtotal.toFixed(2)),
        discountType,
        discountPercent: String(discountPercent),
        discountValue: String(actualDiscount.toFixed(2)),
        netTotal: String(netTotal.toFixed(2)),
        notes: header.notes !== undefined ? header.notes : invoice.notes,
        updatedAt: new Date(),
      }).where(eq(salesInvoiceHeaders.id, id));

      const [updated] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      return updated;
    });
  }

  async finalizeSalesInvoice(id: string): Promise<SalesInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [invoice] = await tx.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
      if (!invoice) throw new Error("الفاتورة غير موجودة");
      if (invoice.status !== "draft") throw new Error("الفاتورة ليست مسودة");

      const lines = await tx.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, id));
      if (lines.length === 0) throw new Error("لا يمكن اعتماد فاتورة بدون أصناف");

      for (const line of lines) {
        const qtyNeeded = parseFloat(line.qtyInMinor);
        const [item] = await tx.select().from(items).where(eq(items.id, line.itemId));
        if (!item) throw new Error(`الصنف غير موجود: ${line.itemId}`);

        if (item.hasExpiry && !line.expiryMonth) {
          throw new Error(`الصنف "${item.nameAr}" يتطلب تاريخ صلاحية`);
        }

        const lotConditions: any[] = [
          eq(inventoryLots.itemId, line.itemId),
          eq(inventoryLots.warehouseId, invoice.warehouseId),
          eq(inventoryLots.isActive, true),
          sql`${inventoryLots.qtyInMinor}::numeric > 0`,
        ];
        
        if (line.expiryMonth && line.expiryYear) {
          lotConditions.push(eq(inventoryLots.expiryMonth, line.expiryMonth));
          lotConditions.push(eq(inventoryLots.expiryYear, line.expiryYear));
        }

        const lots = await tx.select().from(inventoryLots)
          .where(and(...lotConditions))
          .orderBy(asc(inventoryLots.expiryYear), asc(inventoryLots.expiryMonth));

        let remaining = qtyNeeded;
        for (const lot of lots) {
          if (remaining <= 0) break;
          const available = parseFloat(lot.qtyInMinor);
          const deduct = Math.min(available, remaining);

          await tx.update(inventoryLots).set({
            qtyInMinor: String(available - deduct),
            updatedAt: new Date(),
          }).where(eq(inventoryLots.id, lot.id));

          await tx.insert(inventoryLotMovements).values({
            lotId: lot.id,
            warehouseId: invoice.warehouseId,
            txType: "out",
            qtyChangeInMinor: String(-deduct),
            unitCost: line.salePrice,
            referenceType: "sales_invoice",
            referenceId: invoice.id,
          });

          remaining -= deduct;
        }

        if (remaining > 0) {
          throw new Error(`رصيد غير كاف للصنف "${item.nameAr}" - المطلوب: ${qtyNeeded}, النقص: ${remaining.toFixed(2)}`);
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
  }

  async deleteSalesInvoice(id: string): Promise<boolean> {
    const [invoice] = await db.select().from(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
    if (!invoice) throw new Error("الفاتورة غير موجودة");
    if (invoice.status !== "draft") throw new Error("لا يمكن حذف فاتورة نهائية");
    await db.delete(salesInvoiceHeaders).where(eq(salesInvoiceHeaders.id, id));
    return true;
  }

  // Patient Invoices
  async getNextPatientInvoiceNumber(): Promise<number> {
    const result = await db.select({ max: sql<string>`COALESCE(MAX(CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0)` }).from(patientInvoiceHeaders);
    return (parseInt(result[0]?.max || "0") || 0) + 1;
  }

  async getPatientInvoices(filters: { status?: string; dateFrom?: string; dateTo?: string; patientName?: string; doctorName?: string; page?: number; pageSize?: number }): Promise<{data: any[]; total: number}> {
    const conditions: any[] = [];
    if (filters.status) conditions.push(eq(patientInvoiceHeaders.status, filters.status as any));
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
      const [created] = await tx.insert(patientInvoiceHeaders).values(header).returning();

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

      const totalPaid = payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || "0"), 0);
      await tx.update(patientInvoiceHeaders).set({ paidAmount: String(totalPaid) }).where(eq(patientInvoiceHeaders.id, created.id));

      const [result] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, created.id));
      return result;
    });
  }

  async updatePatientInvoice(id: string, header: any, lines: any[], payments: any[]): Promise<PatientInvoiceHeader> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, id));
      if (!existing) throw new Error("فاتورة المريض غير موجودة");
      if (existing.status !== "draft") throw new Error("لا يمكن تعديل فاتورة نهائية");

      await tx.update(patientInvoiceHeaders).set({ ...header, updatedAt: new Date() }).where(eq(patientInvoiceHeaders.id, id));

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

      const totalPaid = payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || "0"), 0);
      await tx.update(patientInvoiceHeaders).set({ paidAmount: String(totalPaid) }).where(eq(patientInvoiceHeaders.id, id));

      const [result] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, id));
      return result;
    });
  }

  async finalizePatientInvoice(id: string): Promise<PatientInvoiceHeader> {
    const [existing] = await db.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, id));
    if (!existing) throw new Error("فاتورة المريض غير موجودة");
    if (existing.status !== "draft") throw new Error("الفاتورة ليست مسودة");

    const [updated] = await db.update(patientInvoiceHeaders).set({
      status: "finalized",
      finalizedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(patientInvoiceHeaders.id, id)).returning();
    return updated;
  }

  async deletePatientInvoice(id: string): Promise<boolean> {
    const [invoice] = await db.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, id));
    if (!invoice) throw new Error("فاتورة المريض غير موجودة");
    if (invoice.status !== "draft") throw new Error("لا يمكن حذف فاتورة نهائية");
    await db.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, id));
    return true;
  }

  async distributePatientInvoice(sourceId: string, patients: { name: string; phone?: string }[]): Promise<PatientInvoiceHeader[]> {
    return await db.transaction(async (tx) => {
      const [source] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, sourceId));
      if (!source) throw new Error("فاتورة المصدر غير موجودة");
      if (source.status !== "draft") throw new Error("لا يمكن توزيع فاتورة نهائية");

      const sourceLines = await tx.select().from(patientInvoiceLines).where(eq(patientInvoiceLines.headerId, sourceId)).orderBy(asc(patientInvoiceLines.sortOrder));
      if (sourceLines.length === 0) throw new Error("الفاتورة لا تحتوي على بنود");

      const numPatients = patients.length;

      const itemIds = [...new Set(sourceLines.filter(l => l.itemId).map(l => l.itemId!))];
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
            if (Math.abs(totalQty - intQty) < 0.0001 && intQty > 0) {
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
          });
        }

        if (newLines.length > 0) {
          await tx.insert(patientInvoiceLines).values(newLines);
          const totalAmount = newLines.reduce((s: number, l: any) => s + parseFloat(l.quantity) * parseFloat(l.unitPrice), 0);
          const totalDiscount = newLines.reduce((s: number, l: any) => s + parseFloat(l.discountAmount), 0);
          const netAmount = totalAmount - totalDiscount;
          await tx.update(patientInvoiceHeaders).set({
            totalAmount: String(+totalAmount.toFixed(2)),
            discountAmount: String(+totalDiscount.toFixed(2)),
            netAmount: String(+netAmount.toFixed(2)),
          }).where(eq(patientInvoiceHeaders.id, newHeader.id));

          const [finalHeader] = await tx.select().from(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
          createdInvoices.push(finalHeader);
        } else {
          await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, newHeader.id));
        }
      }

      await tx.delete(patientInvoiceHeaders).where(eq(patientInvoiceHeaders.id, sourceId));

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

      const itemIds = [...new Set(sourceLines.filter((l: any) => l.itemId).map((l: any) => l.itemId))];
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
            if (Math.abs(totalQty - intQty) < 0.0001 && intQty > 0) {
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
          });
        }

        if (newLines.length > 0) {
          await tx.insert(patientInvoiceLines).values(newLines);
          const totalAmount = newLines.reduce((s: number, l: any) => s + parseFloat(l.quantity) * parseFloat(l.unitPrice), 0);
          const totalDiscount = newLines.reduce((s: number, l: any) => s + parseFloat(l.discountAmount), 0);
          const netAmount = totalAmount - totalDiscount;
          await tx.update(patientInvoiceHeaders).set({
            totalAmount: String(+totalAmount.toFixed(2)),
            discountAmount: String(+totalDiscount.toFixed(2)),
            netAmount: String(+netAmount.toFixed(2)),
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

  async openCashierShift(cashierId: string, cashierName: string, openingCash: string, pharmacyId: string): Promise<CashierShift> {
    const [existingOpen] = await db.select().from(cashierShifts)
      .where(and(eq(cashierShifts.cashierId, cashierId), eq(cashierShifts.pharmacyId, pharmacyId), eq(cashierShifts.status, "open")));
    if (existingOpen) throw new Error("يوجد وردية مفتوحة بالفعل لهذا الكاشير في هذه الصيدلية");

    const [shift] = await db.insert(cashierShifts).values({
      cashierId,
      cashierName,
      pharmacyId,
      openingCash,
      status: "open",
    }).returning();

    await db.insert(cashierAuditLog).values({
      shiftId: shift.id,
      action: "open_shift",
      entityType: "shift",
      entityId: shift.id,
      details: `فتح وردية - رصيد افتتاحي: ${openingCash} - صيدلية: ${pharmacyId}`,
      performedBy: cashierName,
    });

    return shift;
  }

  async getActiveShift(cashierId: string, pharmacyId: string): Promise<CashierShift | null> {
    const [shift] = await db.select().from(cashierShifts)
      .where(and(eq(cashierShifts.cashierId, cashierId), eq(cashierShifts.pharmacyId, pharmacyId), eq(cashierShifts.status, "open")));
    return shift || null;
  }

  async getPendingInvoiceCountForPharmacy(pharmacyId: string): Promise<number> {
    const [result] = await db.select({
      count: sql<number>`COUNT(*)`,
    }).from(salesInvoiceHeaders)
      .where(and(
        eq(salesInvoiceHeaders.pharmacyId, pharmacyId),
        eq(salesInvoiceHeaders.status, "finalized"),
      ));
    return result?.count || 0;
  }

  async closeCashierShift(shiftId: string, closingCash: string): Promise<CashierShift> {
    const [shift] = await db.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
    if (!shift) throw new Error("الوردية غير موجودة");
    if (shift.status !== "open") throw new Error("الوردية مغلقة بالفعل");

    if (shift.pharmacyId) {
      const pendingCount = await this.getPendingInvoiceCountForPharmacy(shift.pharmacyId);
      if (pendingCount > 0) {
        throw new Error(`لا يمكن إغلاق الوردية - يوجد ${pendingCount} فاتورة معلقة لم يتم تحصيلها`);
      }
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

  async getPendingSalesInvoices(pharmacyId: string, search?: string): Promise<any[]> {
    const conditions = [
      eq(salesInvoiceHeaders.status, "finalized"),
      eq(salesInvoiceHeaders.isReturn, false),
      eq(salesInvoiceHeaders.pharmacyId, pharmacyId),
    ];

    let query = db.select({
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
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .where(and(...conditions))
    .orderBy(asc(salesInvoiceHeaders.createdAt));

    const results = await query;

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

  async getPendingReturnInvoices(pharmacyId: string, search?: string): Promise<any[]> {
    const conditions = [
      eq(salesInvoiceHeaders.status, "finalized"),
      eq(salesInvoiceHeaders.isReturn, true),
      eq(salesInvoiceHeaders.pharmacyId, pharmacyId),
    ];

    let query = db.select({
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
    })
    .from(salesInvoiceHeaders)
    .leftJoin(warehouses, eq(salesInvoiceHeaders.warehouseId, warehouses.id))
    .where(and(...conditions))
    .orderBy(asc(salesInvoiceHeaders.createdAt));

    const results = await query;

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

  async collectInvoices(shiftId: string, invoiceIds: string[], collectedBy: string): Promise<any> {
    return await db.transaction(async (tx) => {
      const [shift] = await tx.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
      if (!shift || shift.status !== "open") throw new Error("الوردية غير مفتوحة");

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

      return { receipts, totalCollected: totalCollected.toFixed(2), count: receipts.length };
    });
  }

  async refundInvoices(shiftId: string, invoiceIds: string[], refundedBy: string): Promise<any> {
    return await db.transaction(async (tx) => {
      const [shift] = await tx.select().from(cashierShifts).where(eq(cashierShifts.id, shiftId));
      if (!shift || shift.status !== "open") throw new Error("الوردية غير مفتوحة");

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

      return { receipts, totalRefunded: totalRefunded.toFixed(2), count: receipts.length };
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

  async getPatient(id: string): Promise<Patient | undefined> {
    const [p] = await db.select().from(patients).where(eq(patients.id, id));
    return p;
  }

  async createPatient(data: InsertPatient): Promise<Patient> {
    const [p] = await db.insert(patients).values(data).returning();
    return p;
  }

  async updatePatient(id: string, data: Partial<InsertPatient>): Promise<Patient> {
    const [p] = await db.update(patients).set(data).where(eq(patients.id, id)).returning();
    return p;
  }

  async deletePatient(id: string): Promise<boolean> {
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
}

export const storage = new DatabaseStorage();
