import { type Express } from "express";
import { storage } from "../storage";
import { requireAuth, checkPermission } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";
import { insertCompanySchema } from "@shared/schema";

export function registerContractsCompaniesRoutes(app: Express) {
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
}
