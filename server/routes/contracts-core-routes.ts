import { type Express } from "express";
import { storage } from "../storage";
import { requireAuth, checkPermission } from "./_shared";
import { checkAnyPermission } from "./_auth";
import { PERMISSIONS } from "@shared/permissions";
import { insertContractSchema } from "@shared/schema";
import { z } from "zod";
import { evaluateContractForService } from "../lib/contract-rule-evaluator";

export function registerContractsCoreRoutes(app: Express) {
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
}
