export interface PatientFileTotals {
  totalAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  remaining: number;
  invoiceCount: number;
  lineCount: number;
}

export interface VisitGroup {
  visitKey: string;
  visitLabel: string;
  visitType: "inpatient" | "outpatient" | "standalone";
  visitDate: string;
  invoiceCount: number;
  departments: string[];
  totalAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  remaining: number;
}

export interface DepartmentGroup {
  departmentId: string | null;
  departmentName: string;
  invoiceCount: number;
  totalAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  remaining: number;
}

export interface ClassificationGroup {
  lineType: string;
  lineTypeLabel: string;
  lineCount: number;
  totalAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  remaining: number;
}

export interface AggregatedInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  departmentId: string | null;
  departmentName: string;
  admissionId: string | null;
  visitGroupId: string | null;
  isConsolidated: boolean;
  doctorName: string | null;
  contractName: string | null;
  totalAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  remaining: number;
}

export interface AggregatedViewData {
  totals: PatientFileTotals;
  byVisit: VisitGroup[];
  byDepartment: DepartmentGroup[];
  byClassification: ClassificationGroup[];
  invoices: AggregatedInvoice[];
}

export interface InvoiceLine {
  id: string;
  header_id: string;
  line_type: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount_percent: string;
  discount_amount: string;
  total_price: string;
  source_type: string | null;
  source_id: string | null;
  business_classification: string | null;
  invoice_number: string;
  invoice_date: string;
  invoice_status: string;
  admission_id: string | null;
  visit_group_id: string | null;
  department_name: string;
  department_id: string | null;
}

export interface InvoiceLinesResponse {
  data: InvoiceLine[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaymentRecord {
  id: string;
  header_id: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  treasury_id: string | null;
  treasury_name: string;
  invoice_number: string;
  invoice_date: string;
  department_name: string;
  created_at: string;
}

export interface FinancialSummary {
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  invoiceCount: number;
  admissionCount: number;
  lastInteraction: string | null;
  breakdown: {
    pharmacy: { invoiceCount: number; totalAmount: number; totalPaid: number; outstanding: number; lastDate: string | null };
    medical:  { invoiceCount: number; totalAmount: number; totalPaid: number; outstanding: number; lastDate: string | null };
  };
}

export type ConsolidatedViewMode = "visit" | "department" | "classification" | "detailed";

export interface ConsolidatedFiltersState {
  viewMode: ConsolidatedViewMode;
  visitKey: string;
  departmentId: string;
  lineType: string;
  showPaid: boolean;
  showOriginals: boolean;
}
