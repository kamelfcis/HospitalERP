import { type Express } from "express";
import { storage } from "../storage";
import { requireAuth, checkPermission } from "./_shared";
import { checkAnyPermission } from "./_auth";
import { PERMISSIONS } from "@shared/permissions";
import {
  insertCompanySchema,
  insertContractSchema,
  insertContractMemberSchema,
  insertContractCoverageRuleSchema,
} from "@shared/schema";
import { z } from "zod";
import { evaluateContractForService } from "../lib/contract-rule-evaluator";

export function registerContractCrudRoutes(app: Express) {
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

  app.get(
    "/api/contracts/active",
    requireAuth,
    checkAnyPermission(PERMISSIONS.SALES_CREATE, PERMISSIONS.PATIENT_INVOICES_VIEW, PERMISSIONS.PATIENT_INVOICES_CREATE),
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
}
