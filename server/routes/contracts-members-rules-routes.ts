import { type Express } from "express";
import { storage } from "../storage";
import { requireAuth, checkPermission } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";
import {
  insertContractMemberSchema,
  insertContractCoverageRuleSchema,
} from "@shared/schema";
import { z } from "zod";

export function registerContractsMembersRulesRoutes(app: Express) {
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
