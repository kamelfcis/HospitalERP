/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contracts Management — إدارة العقود والشركات
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Three-panel layout (RTL):
 *    Panel A (right): Companies list
 *    Panel B (center): Contracts for selected company
 *    Panel C (bottom of B): Members for selected contract
 *
 *  Forms are rendered in shadcn Dialog components.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { PERMISSIONS } from "@shared/permissions";
import {
  insertCompanySchema,
  insertContractSchema,
  insertContractMemberSchema,
  companyTypeLabels,
  relationTypeLabels,
} from "@shared/schema";
import type { Company, Contract, ContractMember } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Plus,
  Search,
  ChevronLeft,
  Users,
  FileText,
  Loader2,
  AlertCircle,
  PowerOff,
} from "lucide-react";

// ─── Zod schemas with Arabic validation ───────────────────────────────────

const companyFormSchema = insertCompanySchema.extend({
  code:     z.string().min(1, "الكود مطلوب").max(30, "الكود لا يتجاوز 30 حرفاً"),
  nameAr:   z.string().min(2, "الاسم بالعربية مطلوب"),
  companyType: z.string().min(1, "نوع الشركة مطلوب"),
});

const contractFormSchema = insertContractSchema.extend({
  contractNumber: z.string().min(1, "رقم العقد مطلوب"),
  contractName:   z.string().min(2, "اسم العقد مطلوب"),
  startDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ صحيح مطلوب"),
  endDate:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ صحيح مطلوب"),
});

const memberFormSchema = insertContractMemberSchema.extend({
  memberCardNumber: z.string().min(1, "رقم البطاقة مطلوب"),
  memberNameAr:     z.string().min(2, "الاسم بالعربية مطلوب"),
  startDate:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ صحيح مطلوب"),
  endDate:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ صحيح مطلوب"),
});

type CompanyFormValues  = z.infer<typeof companyFormSchema>;
type ContractFormValues = z.infer<typeof contractFormSchema>;
type MemberFormValues   = z.infer<typeof memberFormSchema>;

// ─── Helper ────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function oneYearLater() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════════════
//  CompanyForm
// ═══════════════════════════════════════════════════════════════════════════

interface CompanyFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Company | null;
}

function CompanyForm({ open, onOpenChange, editing }: CompanyFormProps) {
  const { toast } = useToast();

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      code:          editing?.code          ?? "",
      nameAr:        editing?.nameAr        ?? "",
      nameEn:        editing?.nameEn        ?? "",
      companyType:   editing?.companyType   ?? "contract",
      phone:         editing?.phone         ?? "",
      email:         editing?.email         ?? "",
      address:       editing?.address       ?? "",
      taxId:         editing?.taxId         ?? "",
      notes:         editing?.notes         ?? "",
      defaultPaymentTermsDays: editing?.defaultPaymentTermsDays ?? undefined,
      creditLimit:   editing?.creditLimit   ?? undefined,
      isActive:      editing?.isActive      ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: CompanyFormValues) =>
      editing
        ? apiRequest("PATCH", `/api/companies/${editing.id}`, data)
        : apiRequest("POST", "/api/companies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: editing ? "تم تحديث الشركة" : "تمت إضافة الشركة" });
      onOpenChange(false);
      form.reset();
    },
    onError: async (err: unknown) => {
      const body = err instanceof Response ? await err.json().catch(() => ({})) : {};
      toast({
        variant: "destructive",
        title: "خطأ",
        description: body?.message ?? "حدث خطأ",
      });
    },
  });

  function onSubmit(values: CompanyFormValues) {
    mutation.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>{editing ? "تعديل الشركة" : "إضافة شركة جديدة"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Code */}
              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel>الكود *</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-company-code" placeholder="مثال: INS001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Type */}
              <FormField control={form.control} name="companyType" render={({ field }) => (
                <FormItem>
                  <FormLabel>النوع *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-company-type">
                        <SelectValue placeholder="اختر النوع" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(companyTypeLabels).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* nameAr */}
            <FormField control={form.control} name="nameAr" render={({ field }) => (
              <FormItem>
                <FormLabel>الاسم بالعربية *</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="input-company-name-ar" placeholder="اسم الشركة" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* nameEn */}
            <FormField control={form.control} name="nameEn" render={({ field }) => (
              <FormItem>
                <FormLabel>الاسم بالإنجليزية</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} data-testid="input-company-name-en" placeholder="Company Name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>الهاتف</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-company-phone" />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>البريد الإلكتروني</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-company-email" type="email" />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="taxId" render={({ field }) => (
                <FormItem>
                  <FormLabel>الرقم الضريبي</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-company-tax-id" />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="defaultPaymentTermsDays" render={({ field }) => (
                <FormItem>
                  <FormLabel>أجل السداد (يوم)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      data-testid="input-company-payment-terms"
                      value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>العنوان</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={2} data-testid="input-company-address" />
                </FormControl>
              </FormItem>
            )} />

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>ملاحظات</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={2} data-testid="input-company-notes" />
                </FormControl>
              </FormItem>
            )} />

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-company">
                {mutation.isPending && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
                {editing ? "حفظ التعديلات" : "إضافة الشركة"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ContractForm
// ═══════════════════════════════════════════════════════════════════════════

interface ContractFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  editing: Contract | null;
}

function ContractForm({ open, onOpenChange, companyId, editing }: ContractFormProps) {
  const { toast } = useToast();

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      companyId,
      contractNumber:      editing?.contractNumber      ?? "",
      contractName:        editing?.contractName        ?? "",
      companyCoveragePct:  editing?.companyCoveragePct  ?? "100",
      startDate:           editing?.startDate           ?? today(),
      endDate:             editing?.endDate             ?? oneYearLater(),
      isActive:            editing?.isActive            ?? true,
      notes:               editing?.notes               ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: ContractFormValues) =>
      editing
        ? apiRequest("PATCH", `/api/contracts/${editing.id}`, data)
        : apiRequest("POST", "/api/contracts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", companyId] });
      toast({ title: editing ? "تم تحديث العقد" : "تمت إضافة العقد" });
      onOpenChange(false);
      form.reset();
    },
    onError: async (err: unknown) => {
      const body = err instanceof Response ? await err.json().catch(() => ({})) : {};
      toast({ variant: "destructive", title: "خطأ", description: body?.message ?? "حدث خطأ" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{editing ? "تعديل العقد" : "إضافة عقد جديد"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="contractNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>رقم العقد *</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-contract-number" placeholder="CON-2025-001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="companyCoveragePct" render={({ field }) => (
                <FormItem>
                  <FormLabel>نسبة تغطية الشركة %</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? "100"} type="number" min={0} max={100} step={0.01} data-testid="input-contract-coverage" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="contractName" render={({ field }) => (
              <FormItem>
                <FormLabel>اسم العقد *</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="input-contract-name" placeholder="عقد تأمين طبي 2025" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>تاريخ البداية *</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" data-testid="input-contract-start" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="endDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>تاريخ النهاية *</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" data-testid="input-contract-end" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>ملاحظات</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={2} data-testid="input-contract-notes" />
                </FormControl>
              </FormItem>
            )} />

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-contract">
                {mutation.isPending && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
                {editing ? "حفظ التعديلات" : "إضافة العقد"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MemberForm
// ═══════════════════════════════════════════════════════════════════════════

interface MemberFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contractId: string;
  editing: ContractMember | null;
}

function MemberForm({ open, onOpenChange, contractId, editing }: MemberFormProps) {
  const { toast } = useToast();

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: {
      contractId,
      memberCardNumber: editing?.memberCardNumber ?? "",
      memberNameAr:     editing?.memberNameAr     ?? "",
      memberNameEn:     editing?.memberNameEn     ?? "",
      employeeNumber:   editing?.employeeNumber   ?? "",
      nationalId:       editing?.nationalId       ?? "",
      relationType:     editing?.relationType     ?? "primary",
      memberClass:      editing?.memberClass      ?? "",
      startDate:        editing?.startDate        ?? today(),
      endDate:          editing?.endDate          ?? oneYearLater(),
      isActive:         editing?.isActive         ?? true,
      notes:            editing?.notes            ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: MemberFormValues) =>
      editing
        ? apiRequest("PATCH", `/api/contract-members/${editing.id}`, data)
        : apiRequest("POST", "/api/contract-members", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contract-members", contractId] });
      toast({ title: editing ? "تم تحديث بيانات المنتسب" : "تمت إضافة المنتسب" });
      onOpenChange(false);
      form.reset();
    },
    onError: async (err: unknown) => {
      const body = err instanceof Response ? await err.json().catch(() => ({})) : {};
      toast({ variant: "destructive", title: "خطأ", description: body?.message ?? "حدث خطأ" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>{editing ? "تعديل بيانات المنتسب" : "إضافة منتسب جديد"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="memberCardNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>رقم البطاقة *</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-member-card" placeholder="CARD-001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="relationType" render={({ field }) => (
                <FormItem>
                  <FormLabel>صلة القرابة *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-relation-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(relationTypeLabels).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="memberNameAr" render={({ field }) => (
              <FormItem>
                <FormLabel>الاسم بالعربية *</FormLabel>
                <FormControl>
                  <Input {...field} data-testid="input-member-name-ar" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="memberNameEn" render={({ field }) => (
              <FormItem>
                <FormLabel>الاسم بالإنجليزية</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} data-testid="input-member-name-en" />
                </FormControl>
              </FormItem>
            )} />

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="nationalId" render={({ field }) => (
                <FormItem>
                  <FormLabel>الرقم القومي</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-member-nid" />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="employeeNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>رقم الموظف</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-member-emp" />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>تاريخ البداية *</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" data-testid="input-member-start" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="endDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>تاريخ النهاية *</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" data-testid="input-member-end" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="memberClass" render={({ field }) => (
                <FormItem>
                  <FormLabel>الفئة</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} data-testid="input-member-class" placeholder="مثال: VIP" />
                  </FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="annualLimit" render={({ field }) => (
                <FormItem>
                  <FormLabel>الحد السنوي (جنيه)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      data-testid="input-member-limit"
                      value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value || undefined)}
                    />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>ملاحظات</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} rows={2} data-testid="input-member-notes" />
                </FormControl>
              </FormItem>
            )} />

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-save-member">
                {mutation.isPending && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
                {editing ? "حفظ التعديلات" : "إضافة المنتسب"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Main Page
// ═══════════════════════════════════════════════════════════════════════════

export default function ContractsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.CONTRACTS_MANAGE);

  // ── State ────────────────────────────────────────────────────────────────
  const [search, setSearch]                 = useState("");
  const [typeFilter, setTypeFilter]         = useState<string>("all");
  const [activeFilter, setActiveFilter]     = useState<string>("active");

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

  const [companyFormOpen, setCompanyFormOpen]   = useState(false);
  const [editingCompany, setEditingCompany]     = useState<Company | null>(null);

  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [editingContract, setEditingContract]   = useState<Contract | null>(null);

  const [memberFormOpen, setMemberFormOpen]     = useState(false);
  const [editingMember, setEditingMember]       = useState<ContractMember | null>(null);

  const { toast } = useToast();

  // ── Queries ──────────────────────────────────────────────────────────────
  const isActive = activeFilter === "active" ? true : activeFilter === "inactive" ? false : undefined;

  const { data: companies = [], isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies", search, typeFilter, isActive],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search)                params.set("search",      search);
      if (typeFilter !== "all")  params.set("companyType", typeFilter);
      if (isActive !== undefined) params.set("isActive",   String(isActive));
      return apiRequest("GET", `/api/companies?${params}`).then(r => r.json());
    },
  });

  const { data: contracts = [], isLoading: contractsLoading } = useQuery<Contract[]>({
    queryKey: ["/api/contracts", selectedCompany?.id],
    queryFn: () =>
      apiRequest("GET", `/api/contracts?companyId=${selectedCompany!.id}`).then(r => r.json()),
    enabled: !!selectedCompany,
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<ContractMember[]>({
    queryKey: ["/api/contract-members", selectedContract?.id],
    queryFn: () =>
      apiRequest("GET", `/api/contract-members?contractId=${selectedContract!.id}`).then(r => r.json()),
    enabled: !!selectedContract,
  });

  // ── Deactivate company ───────────────────────────────────────────────────
  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/companies/${id}/deactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "تم إلغاء تفعيل الشركة" });
      if (selectedCompany) setSelectedCompany(null);
    },
    onError: async (err: unknown) => {
      const body = err instanceof Response ? await err.json().catch(() => ({})) : {};
      toast({ variant: "destructive", title: "خطأ", description: body?.message ?? "حدث خطأ" });
    },
  });

  // ── Handlers ────────────────────────────────────────────────────────────
  function openAddCompany() {
    setEditingCompany(null);
    setCompanyFormOpen(true);
  }
  function openEditCompany(c: Company) {
    setEditingCompany(c);
    setCompanyFormOpen(true);
  }
  function openAddContract() {
    setEditingContract(null);
    setContractFormOpen(true);
  }
  function openEditContract(c: Contract) {
    setEditingContract(c);
    setContractFormOpen(true);
  }
  function openAddMember() {
    setEditingMember(null);
    setMemberFormOpen(true);
  }
  function openEditMember(m: ContractMember) {
    setEditingMember(m);
    setMemberFormOpen(true);
  }

  function selectCompany(c: Company) {
    setSelectedCompany(c);
    setSelectedContract(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="flex h-full gap-0 overflow-hidden">
      {/* ══════════════════════════════════════════════════════════════════ */}
      {/*  Panel A — Companies List                                         */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col w-72 shrink-0 border-l bg-muted/30">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b bg-background">
          <div className="flex items-center gap-1.5 font-semibold text-sm">
            <Building2 className="h-4 w-4 text-primary" />
            الشركات
          </div>
          {canManage && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openAddCompany} data-testid="button-add-company">
              <Plus className="h-3 w-3" /> إضافة
            </Button>
          )}
        </div>

        {/* Search + filter */}
        <div className="p-2 space-y-1.5 border-b">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث..."
              className="h-7 text-xs pr-8"
              data-testid="input-company-search"
            />
          </div>
          <div className="flex gap-1">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {Object.entries(companyTypeLabels).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="inactive">موقوف</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Companies list */}
        <div className="flex-1 overflow-y-auto">
          {companiesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-xs gap-2">
              <AlertCircle className="h-6 w-6" />
              لا توجد شركات
            </div>
          ) : (
            companies.map(company => (
              <button
                key={company.id}
                onClick={() => selectCompany(company)}
                data-testid={`row-company-${company.id}`}
                className={[
                  "w-full text-right px-3 py-2.5 border-b transition-colors hover:bg-muted/60 block",
                  selectedCompany?.id === company.id
                    ? "bg-primary/10 border-r-2 border-r-primary"
                    : "",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate">{company.nameAr}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 px-1"
                    >
                      {companyTypeLabels[company.companyType] ?? company.companyType}
                    </Badge>
                    {!company.isActive && (
                      <Badge variant="destructive" className="text-[10px] h-4 px-1">موقوف</Badge>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{company.code}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/*  Panel B — Company detail + Contracts                             */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {!selectedCompany ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-2">
          <Building2 className="h-12 w-12 opacity-20" />
          <p className="text-sm">اختر شركة من القائمة لعرض عقودها</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Company header bar */}
          <div className="flex items-center justify-between p-3 border-b bg-background shrink-0">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { setSelectedCompany(null); setSelectedContract(null); }}
                data-testid="button-back-companies"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div>
                <div className="font-semibold text-sm">{selectedCompany.nameAr}</div>
                <div className="text-[10px] text-muted-foreground">{selectedCompany.code} — {companyTypeLabels[selectedCompany.companyType]}</div>
              </div>
              {!selectedCompany.isActive && (
                <Badge variant="destructive" className="text-xs">موقوف</Badge>
              )}
            </div>

            {canManage && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEditCompany(selectedCompany)} data-testid="button-edit-company">
                  تعديل
                </Button>
                {selectedCompany.isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                    onClick={() => deactivateMutation.mutate(selectedCompany.id)}
                    disabled={deactivateMutation.isPending}
                    data-testid="button-deactivate-company"
                  >
                    <PowerOff className="h-3 w-3" />إلغاء تفعيل
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Contracts panel */}
          <div className={`flex flex-col ${selectedContract ? "h-1/2" : "flex-1"} border-b overflow-hidden`}>
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b shrink-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <FileText className="h-3.5 w-3.5 text-primary" />
                العقود ({contracts.length})
              </div>
              {canManage && selectedCompany.isActive && (
                <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={openAddContract} data-testid="button-add-contract">
                  <Plus className="h-3 w-3" /> عقد جديد
                </Button>
              )}
            </div>

            <div className="overflow-auto flex-1">
              {contractsLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : contracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-xs gap-2">
                  <FileText className="h-6 w-6 opacity-40" />
                  لا توجد عقود لهذه الشركة
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-8 text-right">#</TableHead>
                      <TableHead className="text-right">رقم العقد</TableHead>
                      <TableHead className="text-right">اسم العقد</TableHead>
                      <TableHead className="text-right">الفترة</TableHead>
                      <TableHead className="text-right">تغطية %</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      {canManage && <TableHead className="text-right">إجراءات</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map((c, i) => (
                      <TableRow
                        key={c.id}
                        data-testid={`row-contract-${c.id}`}
                        className={[
                          "text-xs cursor-pointer",
                          selectedContract?.id === c.id ? "bg-primary/10" : "",
                        ].join(" ")}
                        onClick={() => setSelectedContract(c)}
                      >
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-mono font-medium">{c.contractNumber}</TableCell>
                        <TableCell>{c.contractName}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {c.startDate} → {c.endDate}
                        </TableCell>
                        <TableCell>{c.companyCoveragePct}%</TableCell>
                        <TableCell>
                          <Badge variant={c.isActive ? "outline" : "destructive"} className="text-[10px]">
                            {c.isActive ? "نشط" : "موقوف"}
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[11px] px-2"
                              onClick={e => { e.stopPropagation(); openEditContract(c); }}
                              data-testid={`button-edit-contract-${c.id}`}
                            >
                              تعديل
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          {/* ── Members Panel (visible only when a contract is selected) ── */}
          {selectedContract && (
            <div className="flex flex-col h-1/2 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b shrink-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  منتسبو العقد: {selectedContract.contractName} ({members.length})
                </div>
                {canManage && (
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={openAddMember} data-testid="button-add-member">
                    <Plus className="h-3 w-3" /> منتسب جديد
                  </Button>
                )}
              </div>

              <div className="overflow-auto flex-1">
                {membersLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : members.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-xs gap-2">
                    <Users className="h-6 w-6 opacity-40" />
                    لا يوجد منتسبون لهذا العقد
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="text-right">رقم البطاقة</TableHead>
                        <TableHead className="text-right">الاسم</TableHead>
                        <TableHead className="text-right">الصلة</TableHead>
                        <TableHead className="text-right">الفئة</TableHead>
                        <TableHead className="text-right">الفترة</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                        {canManage && <TableHead className="text-right">إجراءات</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map(m => (
                        <TableRow key={m.id} data-testid={`row-member-${m.id}`} className="text-xs">
                          <TableCell className="font-mono font-medium">{m.memberCardNumber}</TableCell>
                          <TableCell>{m.memberNameAr}</TableCell>
                          <TableCell>{relationTypeLabels[m.relationType] ?? m.relationType}</TableCell>
                          <TableCell>{m.memberClass ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap text-[10px]">
                            {m.startDate} → {m.endDate}
                          </TableCell>
                          <TableCell>
                            <Badge variant={m.isActive ? "outline" : "destructive"} className="text-[10px]">
                              {m.isActive ? "نشط" : "موقوف"}
                            </Badge>
                          </TableCell>
                          {canManage && (
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[11px] px-2"
                                onClick={() => openEditMember(m)}
                                data-testid={`button-edit-member-${m.id}`}
                              >
                                تعديل
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <CompanyForm
        open={companyFormOpen}
        onOpenChange={v => { setCompanyFormOpen(v); if (!v) setEditingCompany(null); }}
        editing={editingCompany}
      />

      {selectedCompany && (
        <ContractForm
          open={contractFormOpen}
          onOpenChange={v => { setContractFormOpen(v); if (!v) setEditingContract(null); }}
          companyId={selectedCompany.id}
          editing={editingContract}
        />
      )}

      {selectedContract && (
        <MemberForm
          open={memberFormOpen}
          onOpenChange={v => { setMemberFormOpen(v); if (!v) setEditingMember(null); }}
          contractId={selectedContract.id}
          editing={editingMember}
        />
      )}
    </div>
  );
}
