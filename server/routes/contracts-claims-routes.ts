import { type Express } from "express";
import { storage } from "../storage";
import { requireAuth, checkPermission } from "./_shared";
import { PERMISSIONS } from "@shared/permissions";
import { z } from "zod";
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

export function registerContractClaimsRoutes(app: Express) {
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

  app.get("/api/contract-claims/:id", requireAuth, checkPermission(PERMISSIONS.CONTRACTS_CLAIMS_VIEW), async (req, res) => {
    try {
      const batch = await storage.getClaimBatch(req.params.id);
      if (!batch) return res.status(404).json({ message: "الدفعة غير موجودة" });
      res.json(batch);
    } catch (err: unknown) {
      res.status(500).json({ message: err instanceof Error ? err.message : "خطأ" });
    }
  });

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

  function handleApprovalError(err: unknown, res: any) {
    if (err instanceof ApprovalServiceError) {
      const code = err.code === "NOT_FOUND" ? 404 : 400;
      return res.status(code).json({ message: err.message });
    }
    const msg = err instanceof Error ? err.message : "خطأ في معالجة الموافقة";
    return res.status(500).json({ message: msg });
  }

  app.get("/api/approvals", requireAuth, checkPermission(PERMISSIONS.APPROVALS_VIEW),
    async (req, res) => {
      try {
        const { status, companyId, contractId, dateFrom, dateTo } = req.query as Record<string, string>;
        const list = await storage.listApprovals({ status, companyId, contractId, dateFrom, dateTo });
        res.json(list);
      } catch (err) { handleApprovalError(err, res); }
    }
  );

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

  function handleSettlementError(err: unknown, res: any) {
    if (err instanceof SettlementServiceError) {
      const code = err.code === "NOT_FOUND" ? 404 : 400;
      return res.status(code).json({ message: err.message });
    }
    const msg = err instanceof Error ? err.message : "خطأ في التسوية";
    return res.status(500).json({ message: msg });
  }

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
        const result = await settleBatch(req.params.id, {
          ...body,
          createdByUserId: req.session.userId ?? null,
        });
        res.status(201).json(result);
      } catch (err) {
        if (err instanceof z.ZodError) {
          return res.status(400).json({ message: err.errors[0]?.message ?? "بيانات غير صالحة" });
        }
        handleSettlementError(err, res);
      }
    }
  );

  app.get("/api/claim-batches/:id/settlements",
    requireAuth, checkPermission(PERMISSIONS.CONTRACTS_CLAIMS_VIEW),
    async (req, res) => {
      try {
        const settlements = await getSettlementsByBatch(req.params.id);
        res.json(settlements);
      } catch (err) { handleSettlementError(err, res); }
    }
  );

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
