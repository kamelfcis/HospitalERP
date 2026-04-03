/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contracts Routes — مسارات العقود والشركات وقواعد التغطية
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  POST   /api/companies                         — إنشاء شركة
 *  GET    /api/companies                         — قائمة الشركات
 *  GET    /api/companies/:id                     — شركة واحدة
 *  PATCH  /api/companies/:id                     — تحديث شركة
 *  POST   /api/companies/:id/deactivate          — إلغاء تفعيل شركة
 *
 *  POST   /api/contracts                         — إنشاء عقد
 *  GET    /api/contracts?companyId=              — عقود شركة
 *  GET    /api/contracts/:id                     — عقد واحد
 *  PATCH  /api/contracts/:id                     — تحديث عقد
 *
 *  GET    /api/contracts/:id/rules               — قواعد التغطية لعقد
 *  POST   /api/contracts/:id/rules               — إضافة قاعدة
 *  PATCH  /api/contracts/rules/:ruleId           — تحديث قاعدة
 *  DELETE /api/contracts/rules/:ruleId           — حذف قاعدة
 *
 *  POST   /api/contracts/evaluate                — تقييم بند فاتورة
 *
 *  POST   /api/contract-members                  — إضافة منتسب
 *  GET    /api/contract-members?contractId=      — منتسبو عقد
 *  GET    /api/contract-members/:id              — منتسب واحد
 *  PATCH  /api/contract-members/:id             — تحديث منتسب
 *  GET    /api/contract-members/lookup           — بحث ببطاقة المنتسب
 *
 *  RBAC:  contracts.view  (GET)
 *         contracts.manage (POST / PATCH / DELETE / deactivate)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { type Express } from "express";
import { storage } from "../storage";
import { requireAuth, checkPermission } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";
import {
  insertCompanySchema,
  insertContractSchema,
  insertContractMemberSchema,
  insertContractCoverageRuleSchema,
} from "@shared/schema";
import { z } from "zod";
import { evaluateContractForService } from "../lib/contract-rule-evaluator";
import type { RespondLineInput } from "../storage/contracts-claims-storage";
import {
  createApprovalRequest,
  approveLine,
  rejectLine,
  cancelApproval,
  ApprovalServiceError,
} from "../lib/contract-approval-service";
import {
  settleBatch,
  getSettlementsByBatch,
  getBatchReconciliation,
  SettlementServiceError,
} from "../lib/contract-claim-settlement-service";

export function registerContractRoutes(app: Express) {
  // ──────────────────────────────────────────────────────────────────────────
  //  COMPANIES
  // ──────────────────────────────────────────────────────────────────────────

  /** GET /api/companies — list all companies (with optional filters) */
  app.get(
    "/api/companies",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_VIEW),
    async (req, res) => {
      try {
        const { search, companyType, isActive } = req.query as Record<string, string>;
        const companies = await storage.getCompanies({
          search,
          companyType,
          isActive: isActive === undefined ? undefined : isActive === "true",
        });
        res.json(companies);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ في جلب الشركات";
        res.status(500).json({ message: msg });
      }
    }
  );

  /** GET /api/companies/:id — single company */
  app.get(
    "/api/companies/:id",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_VIEW),
    async (req, res) => {
      try {
        const company = await storage.getCompanyById(req.params.id);
        if (!company) return res.status(404).json({ message: "الشركة غير موجودة" });
        res.json(company);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        res.status(500).json({ message: msg });
      }
    }
  );

  /** POST /api/companies — create company */
  app.post(
    "/api/companies",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_MANAGE),
    async (req, res) => {
      try {
        const parsed = insertCompanySchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
        }
        const company = await storage.createCompany(parsed.data);
        res.status(201).json(company);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ في إنشاء الشركة";
        const code = msg.includes("مستخدم") ? 409 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  /** PATCH /api/companies/:id — update company */
  app.patch(
    "/api/companies/:id",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_MANAGE),
    async (req, res) => {
      try {
        const partial = insertCompanySchema.partial().safeParse(req.body);
        if (!partial.success) {
          return res.status(400).json({ message: partial.error.errors[0]?.message ?? "بيانات غير صحيحة" });
        }
        const company = await storage.updateCompany(req.params.id, partial.data);
        res.json(company);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        const code = msg.includes("غير موجودة") ? 404 : msg.includes("مستخدم") ? 409 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  /** POST /api/companies/:id/deactivate — soft-deactivate company */
  app.post(
    "/api/companies/:id/deactivate",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_MANAGE),
    async (req, res) => {
      try {
        const company = await storage.deactivateCompany(req.params.id);
        res.json(company);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        const code = msg.includes("غير موجودة") ? 404 : msg.includes("نشطة") ? 409 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  app.delete(
    "/api/companies/:id",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_MANAGE),
    async (req, res) => {
      try {
        const company = await storage.deactivateCompany(req.params.id);
        res.json(company);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        const code = msg.includes("غير موجودة") ? 404 : msg.includes("نشطة") ? 409 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  //  CONTRACTS
  // ──────────────────────────────────────────────────────────────────────────

  /** GET /api/contracts?companyId= — contracts by company */
  app.get(
    "/api/contracts",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_VIEW),
    async (req, res) => {
      try {
        const { companyId } = req.query as Record<string, string>;
        if (!companyId) return res.status(400).json({ message: "companyId مطلوب" });
        const list = await storage.getContractsByCompany(companyId);
        res.json(list);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        res.status(500).json({ message: msg });
      }
    }
  );

  // ─── Routes that MUST be registered before /:id to avoid param collision ──

  /**
   * GET /api/contracts/active — جميع العقود النشطة مع اسم الشركة
   * يُستخدم في dropdown الفاتورة لاختيار عقد بدون بطاقة منتسب
   * الصلاحية: SALES_CREATE — الصيدلاني يحتاج هذا لإنشاء فواتير تعاقد
   */
  app.get(
    "/api/contracts/active",
    requireAuth,
    checkPermission(PERMISSIONS.SALES_CREATE),
    async (_req, res) => {
      try {
        const list = await storage.getAllActiveContracts();
        res.json(list);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        res.status(500).json({ message: msg });
      }
    }
  );

  /**
   * GET /api/contracts/rules/:ruleId — single rule (for internal use)
   * MUST be before /api/contracts/:id
   */
  app.get(
    "/api/contracts/rules/:ruleId",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_VIEW),
    async (req, res) => {
      try {
        const rule = await storage.getCoverageRuleById(req.params.ruleId);
        if (!rule) return res.status(404).json({ message: "القاعدة غير موجودة" });
        res.json(rule);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        res.status(500).json({ message: msg });
      }
    }
  );

  /** PATCH /api/contracts/rules/:ruleId — update a coverage rule */
  app.patch(
    "/api/contracts/rules/:ruleId",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_MANAGE),
    async (req, res) => {
      try {
        const partial = insertContractCoverageRuleSchema.partial().safeParse(req.body);
        if (!partial.success) {
          return res.status(400).json({ message: partial.error.errors[0]?.message ?? "بيانات غير صحيحة" });
        }
        const rule = await storage.updateCoverageRule(req.params.ruleId, partial.data);
        res.json(rule);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        const code = msg.includes("غير موجودة") ? 404 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  /** DELETE /api/contracts/rules/:ruleId — delete a coverage rule */
  app.delete(
    "/api/contracts/rules/:ruleId",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_MANAGE),
    async (req, res) => {
      try {
        await storage.deleteCoverageRule(req.params.ruleId);
        res.status(204).end();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        const code = msg.includes("غير موجودة") ? 404 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  /**
   * POST /api/contracts/evaluate
   *
   * تقييم بند فاتورة مريض في سياق عقد معين.
   * يُعيد EvaluationResult كاملاً.
   *
   * Body:
   *   { contractId, serviceId?, departmentId?, serviceCategory?, listPrice, evaluationDate? }
   */
  app.post(
    "/api/contracts/evaluate",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_VIEW),
    async (req, res) => {
      try {
        const schema = z.object({
          contractId:      z.string().min(1, "contractId مطلوب"),
          serviceId:       z.string().nullish(),
          departmentId:    z.string().nullish(),
          serviceCategory: z.string().nullish(),
          itemId:          z.string().nullish(),
          itemCategory:    z.string().nullish(),
          listPrice:       z.string().min(1, "listPrice مطلوب"),
          evaluationDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
        }

        const contract = await storage.getContractById(parsed.data.contractId);
        if (!contract) return res.status(404).json({ message: "العقد غير موجود" });

        const rules = await storage.getCoverageRules(parsed.data.contractId);

        const result = evaluateContractForService({
          contract: {
            id:                contract.id,
            companyCoveragePct: contract.companyCoveragePct,
            isActive:          contract.isActive,
            startDate:         contract.startDate,
            endDate:           contract.endDate,
          },
          rules,
          serviceId:       parsed.data.serviceId       ?? null,
          departmentId:    parsed.data.departmentId    ?? null,
          serviceCategory: parsed.data.serviceCategory ?? null,
          itemId:          parsed.data.itemId          ?? null,
          itemCategory:    parsed.data.itemCategory    ?? null,
          listPrice:       parsed.data.listPrice,
          evaluationDate:  parsed.data.evaluationDate  ?? undefined,
        });

        res.json(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ في التقييم";
        res.status(500).json({ message: msg });
      }
    }
  );

  /** GET /api/contracts/:id — single contract */
  app.get(
    "/api/contracts/:id",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_VIEW),
    async (req, res) => {
      try {
        const contract = await storage.getContractById(req.params.id);
        if (!contract) return res.status(404).json({ message: "العقد غير موجود" });
        res.json(contract);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        res.status(500).json({ message: msg });
      }
    }
  );

  /** POST /api/contracts — create contract */
  app.post(
    "/api/contracts",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_MANAGE),
    async (req, res) => {
      try {
        const parsed = insertContractSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
        }
        const contract = await storage.createContract(parsed.data);
        res.status(201).json(contract);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ في إنشاء العقد";
        const code = msg.includes("غير موجودة") || msg.includes("غير موجود") ? 404 : msg.includes("قبل") ? 400 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  /** PATCH /api/contracts/:id — update contract */
  app.patch(
    "/api/contracts/:id",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_MANAGE),
    async (req, res) => {
      try {
        const partial = insertContractSchema.partial().safeParse(req.body);
        if (!partial.success) {
          return res.status(400).json({ message: partial.error.errors[0]?.message ?? "بيانات غير صحيحة" });
        }
        const contract = await storage.updateContract(req.params.id, partial.data);
        res.json(contract);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        const code = msg.includes("غير موجود") ? 404 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  //  COVERAGE RULES
  // ──────────────────────────────────────────────────────────────────────────

  /** GET /api/contracts/:id/rules — coverage rules for a contract */
  app.get(
    "/api/contracts/:id/rules",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_VIEW),
    async (req, res) => {
      try {
        const rules = await storage.getCoverageRules(req.params.id);
        res.json(rules);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        res.status(500).json({ message: msg });
      }
    }
  );

  /** POST /api/contracts/:id/rules — add a coverage rule */
  app.post(
    "/api/contracts/:id/rules",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_MANAGE),
    async (req, res) => {
      try {
        const parsed = insertContractCoverageRuleSchema.safeParse({
          ...req.body,
          contractId: req.params.id,
        });
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
        }
        const rule = await storage.createCoverageRule(parsed.data);
        res.status(201).json(rule);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ في إضافة القاعدة";
        const code = msg.includes("غير موجود") ? 404 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  //  CONTRACT MEMBERS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/contract-members/lookup?cardNumber=&date=
   *
   * NOTE: This route MUST be registered BEFORE the /:id route so Express
   * does not treat "lookup" as a UUID parameter.
   */
  app.get(
    "/api/contract-members/lookup",
    requireAuth,
    checkPermission(PERMISSIONS.SALES_CREATE),
    async (req, res) => {
      try {
        const schema = z.object({
          cardNumber: z.string().min(1, "رقم البطاقة مطلوب"),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ يجب أن يكون بصيغة YYYY-MM-DD"),
        });
        const parsed = schema.safeParse(req.query);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
        }
        const result = await storage.lookupMemberByCard(
          parsed.data.cardNumber,
          parsed.data.date
        );
        if (!result) return res.status(404).json({ message: "لم يُعثر على بطاقة منتسب نشطة بهذا الرقم للتاريخ المحدد" });
        res.json(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ في البحث";
        res.status(500).json({ message: msg });
      }
    }
  );

  /** GET /api/contract-members?contractId= — members by contract */
  app.get(
    "/api/contract-members",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_VIEW),
    async (req, res) => {
      try {
        const { contractId } = req.query as Record<string, string>;
        if (!contractId) return res.status(400).json({ message: "contractId مطلوب" });
        const members = await storage.getMembersByContract(contractId);
        res.json(members);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        res.status(500).json({ message: msg });
      }
    }
  );

  /** GET /api/contract-members/:id — single member */
  app.get(
    "/api/contract-members/:id",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_VIEW),
    async (req, res) => {
      try {
        const member = await storage.getMemberById(req.params.id);
        if (!member) return res.status(404).json({ message: "المنتسب غير موجود" });
        res.json(member);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        res.status(500).json({ message: msg });
      }
    }
  );

  /** POST /api/contract-members — add member */
  app.post(
    "/api/contract-members",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_MANAGE),
    async (req, res) => {
      try {
        const parsed = insertContractMemberSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
        }
        const member = await storage.createContractMember(parsed.data);
        res.status(201).json(member);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ في إضافة المنتسب";
        const code = msg.includes("غير موجود") ? 404 : msg.includes("مستخدم") ? 409 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  /** PATCH /api/contract-members/:id — update member */
  app.patch(
    "/api/contract-members/:id",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_MANAGE),
    async (req, res) => {
      try {
        const partial = insertContractMemberSchema.partial().safeParse(req.body);
        if (!partial.success) {
          return res.status(400).json({ message: partial.error.errors[0]?.message ?? "بيانات غير صحيحة" });
        }
        const member = await storage.updateContractMember(req.params.id, partial.data);
        res.json(member);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        const code = msg.includes("غير موجود") ? 404 : msg.includes("مستخدم") ? 409 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  // ──────────────────────────────────────────────────────────────────────────
  //  CLAIM BATCHES — دفعات المطالبات
  // ──────────────────────────────────────────────────────────────────────────

  /** GET /api/contract-claims — قائمة دفعات المطالبات */
  app.get("/api/contract-claims", requireAuth, checkPermission(PERMISSIONS.CONTRACTS_CLAIMS_VIEW), async (req, res) => {
    try {
      const filters = {
        companyId:  req.query.companyId  as string | undefined,
        contractId: req.query.contractId as string | undefined,
        status:     req.query.status     as string | undefined,
        dateFrom:   req.query.dateFrom   as string | undefined,
        dateTo:     req.query.dateTo     as string | undefined,
      };
      const batches = await storage.getClaimBatches(filters);
      res.json(batches);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : "خطأ" });
    }
  });

  /** GET /api/contract-claims/:id — دفعة واحدة */
  app.get("/api/contract-claims/:id", requireAuth, checkPermission(PERMISSIONS.CONTRACTS_CLAIMS_VIEW), async (req, res) => {
    try {
      const batch = await storage.getClaimBatch(req.params.id);
      if (!batch) return res.status(404).json({ message: "الدفعة غير موجودة" });
      res.json(batch);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : "خطأ" });
    }
  });

  /** PATCH /api/contract-claims/:id/submit — إرسال الدفعة للشركة */
  app.patch(
    "/api/contract-claims/:id/submit",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_CLAIMS_MANAGE),
    async (req, res) => {
      try {
        const submittedBy = (req as any).user?.username ?? "system";
        const batch = await storage.submitClaimBatch(req.params.id, submittedBy);
        res.json(batch);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        const code = msg.includes("غير موجودة") ? 404 : msg.includes("مسودة") || msg.includes("سطور") ? 400 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  /** POST /api/contract-claims/:id/respond — رد الشركة (قبول / رفض بنود) */
  app.post(
    "/api/contract-claims/:id/respond",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_CLAIMS_MANAGE),
    async (req, res) => {
      try {
        const schema = z.object({
          responses: z.array(z.object({
            lineId:          z.string(),
            status:          z.enum(["approved", "rejected"]),
            approvedAmount:  z.string().optional(),
            rejectionReason: z.string().optional(),
          })).min(1),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
        const batch = await storage.respondToClaimBatch(req.params.id, parsed.data.responses as RespondLineInput[]);
        res.json(batch);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        const code = msg.includes("غير موجودة") ? 404 : msg.includes("مُرسَلة") ? 400 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  /** POST /api/contract-claims/:id/settle — تسوية مالية */
  app.post(
    "/api/contract-claims/:id/settle",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_CLAIMS_SETTLE),
    async (req, res) => {
      try {
        const schema = z.object({
          settlementDate:     z.string().min(1),
          companyReferenceNo: z.string().optional(),
          notes:              z.string().optional(),
          bankAccountId:      z.string().optional(),
          companyArAccountId: z.string().optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
        const batch = await storage.settleClaimBatch(req.params.id, parsed.data);
        res.json(batch);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        const code = msg.includes("غير موجودة") ? 404 : msg.includes("يجب") ? 400 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  /** PATCH /api/contract-claims/:id/cancel — إلغاء دفعة */
  app.patch(
    "/api/contract-claims/:id/cancel",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_CLAIMS_MANAGE),
    async (req, res) => {
      try {
        const batch = await storage.cancelClaimBatch(req.params.id);
        res.json(batch);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ";
        const code = msg.includes("غير موجودة") ? 404 : msg.includes("مُسوَّاة") ? 400 : 500;
        res.status(code).json({ message: msg });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  APPROVAL WORKFLOW — Phase 4
  //  POST   /api/approvals/request          — طلب موافقة جديد
  //  POST   /api/approvals/:id/approve      — قبول
  //  POST   /api/approvals/:id/reject       — رفض
  //  POST   /api/approvals/:id/cancel       — إلغاء
  //  GET    /api/approvals                  — قائمة الطلبات (مع فلتر الحالة)
  // ═══════════════════════════════════════════════════════════════════════════

  function handleApprovalError(err: unknown, res: any) {
    if (err instanceof ApprovalServiceError) {
      const code = err.code === "NOT_FOUND" ? 404 : 400;
      return res.status(code).json({ message: err.message });
    }
    const msg = err instanceof Error ? err.message : "خطأ في معالجة الموافقة";
    return res.status(500).json({ message: msg });
  }

  /** GET /api/approvals — قائمة طلبات الموافقة */
  app.get("/api/approvals", requireAuth, checkPermission(PERMISSIONS.APPROVALS_VIEW),
    async (req, res) => {
      try {
        const { status, companyId, contractId, dateFrom, dateTo } = req.query as Record<string, string>;
        const list = await storage.listApprovals({ status, companyId, contractId, dateFrom, dateTo });
        res.json(list);
      } catch (err) { handleApprovalError(err, res); }
    }
  );

  /** POST /api/approvals/request — إنشاء طلب موافقة */
  app.post("/api/approvals/request", requireAuth, checkPermission(PERMISSIONS.APPROVALS_MANAGE),
    async (req, res) => {
      try {
        const schema = z.object({
          patientInvoiceLineId: z.string().min(1),
          contractId:           z.string().min(1),
          contractMemberId:     z.string().nullable().optional(),
          serviceId:            z.string().nullable().optional(),
          requestedAmount:      z.string().min(1),
          serviceDescription:   z.string().optional(),
          notes:                z.string().optional(),
        });
        const body = schema.parse(req.body);
        const result = await createApprovalRequest({
          ...body,
          requestedBy: req.session.userId as string,
        });
        res.status(201).json(result);
      } catch (err) { handleApprovalError(err, res); }
    }
  );

  /** POST /api/approvals/:id/approve — قبول طلب الموافقة */
  app.post("/api/approvals/:id/approve", requireAuth, checkPermission(PERMISSIONS.APPROVALS_MANAGE),
    async (req, res) => {
      try {
        const schema = z.object({
          approvedAmount: z.string().optional(),
          notes:          z.string().optional(),
        });
        const body = schema.parse(req.body);
        const result = await approveLine({
          approvalId:     req.params.id,
          userId:         req.session.userId as string,
          approvedAmount: body.approvedAmount,
          notes:          body.notes,
        });
        res.json(result);
      } catch (err) { handleApprovalError(err, res); }
    }
  );

  /** POST /api/approvals/:id/reject — رفض طلب الموافقة */
  app.post("/api/approvals/:id/reject", requireAuth, checkPermission(PERMISSIONS.APPROVALS_MANAGE),
    async (req, res) => {
      try {
        const schema = z.object({
          rejectionReason: z.string().min(1, "سبب الرفض مطلوب"),
          notes:           z.string().optional(),
        });
        const body = schema.parse(req.body);
        const result = await rejectLine({
          approvalId:      req.params.id,
          userId:          req.session.userId as string,
          rejectionReason: body.rejectionReason,
          notes:           body.notes,
        });
        res.json(result);
      } catch (err) { handleApprovalError(err, res); }
    }
  );

  /** POST /api/approvals/:id/cancel — إلغاء طلب الموافقة */
  app.post("/api/approvals/:id/cancel", requireAuth, checkPermission(PERMISSIONS.APPROVALS_MANAGE),
    async (req, res) => {
      try {
        const { notes } = req.body;
        const result = await cancelApproval({
          approvalId: req.params.id,
          userId:     req.session.userId as string,
          notes,
        });
        res.json(result);
      } catch (err) { handleApprovalError(err, res); }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  //  PHASE 5 — SETTLEMENT ROUTES
  //  POST /api/claim-batches/:id/settle
  //  GET  /api/claim-batches/:id/settlements
  //  GET  /api/claim-batches/:id/reconciliation
  // ═══════════════════════════════════════════════════════════════════════════

  function handleSettlementError(err: unknown, res: any) {
    if (err instanceof SettlementServiceError) {
      const code = err.code === "NOT_FOUND" ? 404 : 400;
      return res.status(code).json({ message: err.message });
    }
    const msg = err instanceof Error ? err.message : "خطأ في التسوية";
    return res.status(500).json({ message: msg });
  }

  /** POST /api/claim-batches/:id/settle — تسوية دفعة */
  app.post("/api/claim-batches/:id/settle",
    requireAuth, checkPermission(PERMISSIONS.CONTRACTS_CLAIMS_SETTLE),
    async (req, res) => {
      try {
        const schema = z.object({
          settlementDate:      z.string().min(1, "تاريخ التسوية مطلوب"),
          settledAmount:       z.number().positive("مبلغ التسوية يجب أن يكون موجباً"),
          bankAccountId:       z.string().nullable().optional(),
          companyArAccountId:  z.string().nullable().optional(),
          referenceNumber:     z.string().optional(),
          notes:               z.string().optional(),
          lines:               z.array(z.object({
            claimLineId:      z.string().min(1),
            settledAmount:    z.number().nonnegative(),
            writeOffAmount:   z.number().nonnegative().optional(),
            writeOffType:     z.enum(["rejection", "contract_discount", "price_difference", "rounding"]).optional(),
            adjustmentReason: z.string().optional(),
          })).min(1, "يجب تحديد سطر واحد على الأقل"),
        });
        const body = schema.parse(req.body);
        const result = await settleBatch(req.params.id, body);
        res.status(201).json(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: err.errors[0]?.message ?? "بيانات غير صالحة" });
        }
        handleSettlementError(err, res);
      }
    }
  );

  /** GET /api/claim-batches/:id/settlements — سجل التسويات */
  app.get("/api/claim-batches/:id/settlements",
    requireAuth, checkPermission(PERMISSIONS.CONTRACTS_CLAIMS_VIEW),
    async (req, res) => {
      try {
        const settlements = await getSettlementsByBatch(req.params.id);
        res.json(settlements);
      } catch (err) { handleSettlementError(err, res); }
    }
  );

  /** GET /api/claim-batches/:id/reconciliation — تقرير المطابقة */
  app.get("/api/claim-batches/:id/reconciliation",
    requireAuth, checkPermission(PERMISSIONS.CONTRACTS_CLAIMS_VIEW),
    async (req, res) => {
      try {
        const recon = await getBatchReconciliation(req.params.id);
        res.json(recon);
      } catch (err) { handleSettlementError(err, res); }
    }
  );
}
