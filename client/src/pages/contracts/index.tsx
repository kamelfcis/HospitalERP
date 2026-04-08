/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contracts Management — إدارة العقود والشركات
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Three-panel layout (RTL):
 *    Panel A (right):  Companies list
 *    Panel B (center): Contracts for selected company
 *    Panel C (bottom of B): Members / Coverage Rules for selected contract
 *
 *  All Dialog forms and Coverage Rules UI live in ./components/
 *  Coverage Rules data logic lives in ./hooks/useCoverageRules
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { PERMISSIONS } from "@shared/permissions";
import { companyTypeLabels, relationTypeLabels } from "@shared/schema";
import type { Company, Contract, ContractMember, ContractCoverageRule } from "@shared/schema";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Building2, Plus, Search, ChevronLeft, Users, FileText,
  Loader2, AlertCircle, PowerOff, Shield,
} from "lucide-react";

import { CompanyForm }      from "./components/CompanyForm";
import { ContractForm }     from "./components/ContractForm";
import { MemberForm }       from "./components/MemberForm";
import { CoverageRuleForm } from "./components/CoverageRuleForm";
import { CoverageRulesTab } from "./components/CoverageRulesTab";
import { useCoverageRules } from "./hooks/useCoverageRules";

// ═══════════════════════════════════════════════════════════════════════════
//  Main Page
// ═══════════════════════════════════════════════════════════════════════════

export default function ContractsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.CONTRACTS_MANAGE);

  // ── Selection state ───────────────────────────────────────────────────
  const [search, setSearch]             = useState("");
  const [typeFilter, setTypeFilter]     = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("active");

  const [selectedCompany,  setSelectedCompany]  = useState<Company  | null>(null);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

  // ── Dialog state ──────────────────────────────────────────────────────
  const [companyFormOpen,  setCompanyFormOpen]  = useState(false);
  const [editingCompany,   setEditingCompany]   = useState<Company  | null>(null);

  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [editingContract,  setEditingContract]  = useState<Contract | null>(null);

  const [memberFormOpen,   setMemberFormOpen]   = useState(false);
  const [editingMember,    setEditingMember]    = useState<ContractMember | null>(null);

  const [contractDetailsTab, setContractDetailsTab] = useState<"members" | "rules">("members");
  const [ruleFormOpen,  setRuleFormOpen]  = useState(false);
  const [editingRule,   setEditingRule]   = useState<ContractCoverageRule | null>(null);

  const { toast } = useToast();

  // ── Coverage rules logic (query + eval + delete) ──────────────────────
  const coverageRules = useCoverageRules(selectedContract);

  // ── Queries ───────────────────────────────────────────────────────────
  const isActive = activeFilter === "active" ? true : activeFilter === "inactive" ? false : undefined;

  const { data: companies = [], isLoading: companiesLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies", search, typeFilter, isActive],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search)                p.set("search",      search);
      if (typeFilter !== "all")  p.set("companyType", typeFilter);
      if (isActive !== undefined) p.set("isActive",   String(isActive));
      return apiRequest("GET", `/api/companies?${p}`).then(r => r.json());
    },
  });

  const { data: contracts = [], isLoading: contractsLoading } = useQuery<Contract[]>({
    queryKey: ["/api/contracts", selectedCompany?.id],
    queryFn: () =>
      apiRequest("GET", `/api/contracts?companyId=${selectedCompany!.id}`).then(r => r.json()),
    enabled: !!selectedCompany,
  });

  const { data: priceLists = [] } = useQuery<any[]>({
    queryKey: ["/api/price-lists"],
  });
  const priceListMap = Object.fromEntries(priceLists.map((pl: any) => [pl.id, pl.name]));

  const { data: members = [], isLoading: membersLoading } = useQuery<ContractMember[]>({
    queryKey: ["/api/contract-members", selectedContract?.id],
    queryFn: () =>
      apiRequest("GET", `/api/contract-members?contractId=${selectedContract!.id}`).then(r => r.json()),
    enabled: !!selectedContract,
  });

  // ── Deactivate company ────────────────────────────────────────────────
  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/companies/${id}/deactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "تم إلغاء تفعيل الشركة" });
      setSelectedCompany(null);
    },
    onError: async (err: unknown) => {
      const body = err instanceof Response ? await err.json().catch(() => ({})) : {};
      toast({ variant: "destructive", title: "خطأ", description: body?.message ?? "حدث خطأ" });
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────
  function selectCompany(c: Company) { setSelectedCompany(c); setSelectedContract(null); }

  function openAddCompany()          { setEditingCompany(null);   setCompanyFormOpen(true);  }
  function openEditCompany(c: Company) { setEditingCompany(c);   setCompanyFormOpen(true);  }
  function openAddContract()          { setEditingContract(null); setContractFormOpen(true); }
  function openEditContract(c: Contract) { setEditingContract(c); setContractFormOpen(true); }
  function openAddMember()            { setEditingMember(null);   setMemberFormOpen(true);   }
  function openEditMember(m: ContractMember) { setEditingMember(m); setMemberFormOpen(true); }
  function openAddRule()              { setEditingRule(null);     setRuleFormOpen(true);     }
  function openEditRule(r: ContractCoverageRule) { setEditingRule(r); setRuleFormOpen(true); }

  // ═════════════════════════════════════════════════════════════════════
  //  Render
  // ═════════════════════════════════════════════════════════════════════
  return (
    <div dir="rtl" className="flex h-full gap-0 overflow-hidden">

      {/* ── Panel A — Companies ─────────────────────────────────────── */}
      <div className="flex flex-col w-72 shrink-0 border-l bg-muted/30">
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

        {/* Filters */}
        <div className="p-2 space-y-1.5 border-b">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث..." className="h-7 text-xs pr-8"
              data-testid="input-company-search"
            />
          </div>
          <div className="flex gap-1">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="النوع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {Object.entries(companyTypeLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="inactive">موقوف</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {companiesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : companies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-xs gap-2">
              <AlertCircle className="h-6 w-6" />لا توجد شركات
            </div>
          ) : companies.map(company => (
            <button
              key={company.id}
              onClick={() => selectCompany(company)}
              data-testid={`row-company-${company.id}`}
              className={[
                "w-full text-right px-3 py-2.5 border-b transition-colors hover:bg-muted/60 block",
                selectedCompany?.id === company.id ? "bg-primary/10 border-r-2 border-r-primary" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium truncate">{company.nameAr}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                    {companyTypeLabels[company.companyType] ?? company.companyType}
                  </Badge>
                  {!company.isActive && <Badge variant="destructive" className="text-[10px] h-4 px-1">موقوف</Badge>}
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{company.code}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Panel B — Company detail + Contracts ────────────────────── */}
      {!selectedCompany ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-2">
          <Building2 className="h-12 w-12 opacity-20" />
          <p className="text-sm">اختر شركة من القائمة لعرض عقودها</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Company header */}
          <div className="flex items-center justify-between p-3 border-b bg-background shrink-0">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-7 w-7"
                onClick={() => { setSelectedCompany(null); setSelectedContract(null); }}
                data-testid="button-back-companies">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div>
                <div className="font-semibold text-sm">{selectedCompany.nameAr}</div>
                <div className="text-[10px] text-muted-foreground">
                  {selectedCompany.code} — {companyTypeLabels[selectedCompany.companyType]}
                </div>
              </div>
              {!selectedCompany.isActive && <Badge variant="destructive" className="text-xs">موقوف</Badge>}
            </div>
            {canManage && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => openEditCompany(selectedCompany)} data-testid="button-edit-company">
                  تعديل
                </Button>
                {selectedCompany.isActive && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                    onClick={() => deactivateMutation.mutate(selectedCompany.id)}
                    disabled={deactivateMutation.isPending} data-testid="button-deactivate-company">
                    <PowerOff className="h-3 w-3" />إلغاء تفعيل
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Contracts table */}
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
                <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : contracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-xs gap-2">
                  <FileText className="h-6 w-6 opacity-40" />لا توجد عقود لهذه الشركة
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
                      <TableHead className="text-right">قائمة الأسعار</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      {canManage && <TableHead className="text-right">إجراءات</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map((c, i) => (
                      <TableRow key={c.id} data-testid={`row-contract-${c.id}`}
                        className={["text-xs cursor-pointer", selectedContract?.id === c.id ? "bg-primary/10" : ""].join(" ")}
                        onClick={() => setSelectedContract(c)}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-mono font-medium">{c.contractNumber}</TableCell>
                        <TableCell>{c.contractName}</TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{c.startDate} → {c.endDate}</TableCell>
                        <TableCell>{c.companyCoveragePct}%</TableCell>
                        <TableCell className="text-muted-foreground text-[11px]">
                          {(c as any).basePriceListId
                            ? priceListMap[(c as any).basePriceListId] ?? "—"
                            : <span className="text-muted-foreground/50">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.isActive ? "outline" : "destructive"} className="text-[10px]">
                            {c.isActive ? "نشط" : "موقوف"}
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2"
                              onClick={e => { e.stopPropagation(); openEditContract(c); }}
                              data-testid={`button-edit-contract-${c.id}`}>
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

          {/* ── Bottom Tabs: Members / Coverage Rules ─────────────── */}
          {selectedContract && (
            <Tabs
              value={contractDetailsTab}
              onValueChange={v => setContractDetailsTab(v as "members" | "rules")}
              className="flex flex-col h-1/2 overflow-hidden border-t"
            >
              <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b shrink-0">
                <TabsList className="h-7">
                  <TabsTrigger value="members" className="text-xs h-6 px-2.5 gap-1" data-testid="tab-members">
                    <Users className="h-3 w-3" />منتسبون ({members.length})
                  </TabsTrigger>
                  <TabsTrigger value="rules" className="text-xs h-6 px-2.5 gap-1" data-testid="tab-coverage-rules">
                    <Shield className="h-3 w-3" />قواعد التغطية ({coverageRules.rules.length})
                  </TabsTrigger>
                </TabsList>
                {canManage && contractDetailsTab === "members" && (
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={openAddMember} data-testid="button-add-member">
                    <Plus className="h-3 w-3" /> منتسب جديد
                  </Button>
                )}
                {canManage && contractDetailsTab === "rules" && (
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={openAddRule} data-testid="button-add-rule">
                    <Plus className="h-3 w-3" /> قاعدة جديدة
                  </Button>
                )}
              </div>

              {/* Members tab */}
              <TabsContent value="members" className="overflow-auto flex-1 m-0 p-0 data-[state=inactive]:hidden">
                {membersLoading ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : members.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-muted-foreground text-xs gap-2">
                    <Users className="h-6 w-6 opacity-40" />لا يوجد منتسبون لهذا العقد
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
                              <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2"
                                onClick={() => openEditMember(m)} data-testid={`button-edit-member-${m.id}`}>
                                تعديل
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              {/* Coverage Rules tab — delegated to component */}
              <CoverageRulesTab
                rules={coverageRules.rules}
                rulesLoading={coverageRules.rulesLoading}
                canManage={canManage}
                onEdit={openEditRule}
                deleteRuleMutation={coverageRules.deleteRuleMutation}
                evalInput={coverageRules.evalInput}
                setEvalInput={coverageRules.setEvalInput}
                evalResult={coverageRules.evalResult}
                evalLoading={coverageRules.evalLoading}
                onRunEvaluate={coverageRules.runEvaluate}
              />
            </Tabs>
          )}
        </div>
      )}

      {/* ── Dialogs ───────────────────────────────────────────────── */}
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

      {selectedContract && (
        <CoverageRuleForm
          open={ruleFormOpen}
          onOpenChange={v => { setRuleFormOpen(v); if (!v) setEditingRule(null); }}
          contractId={selectedContract.id}
          editing={editingRule}
        />
      )}
    </div>
  );
}
