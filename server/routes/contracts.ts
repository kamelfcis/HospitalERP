/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Contracts Routes — مسارات العقود والشركات
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
 *  POST   /api/contract-members                  — إضافة منتسب
 *  GET    /api/contract-members?contractId=      — منتسبو عقد
 *  GET    /api/contract-members/:id              — منتسب واحد
 *  PATCH  /api/contract-members/:id              — تحديث منتسب
 *  GET    /api/contract-members/lookup           — بحث ببطاقة المنتسب
 *
 *  RBAC:  contracts.view  (GET)
 *         contracts.manage (POST / PATCH / deactivate)
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
} from "@shared/schema";
import { z } from "zod";

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
  //  CONTRACT MEMBERS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/contract-members/lookup?cardNumber=&date=
   *
   * Lookup a member by card number as-of a given service date.
   * Returns { member, contract, company } or 404.
   *
   * NOTE: This route MUST be registered BEFORE the /:id route so Express
   * does not treat "lookup" as a UUID parameter.
   */
  app.get(
    "/api/contract-members/lookup",
    requireAuth,
    checkPermission(PERMISSIONS.CONTRACTS_VIEW),
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
}
