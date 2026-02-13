import type { Request, Response, NextFunction, RequestHandler } from "express";
import { apiError, ErrorMessages } from "./errors";
import { storage } from "./storage";
import type { ZodSchema } from "zod";

export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>;

export function asyncHandler(fn: AsyncRouteHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((err: any) => {
      if (res.headersSent) return next(err);

      const message =
        err?.message || ErrorMessages.NOT_FOUND;

      if (message.includes("الفترة المحاسبية") || message.includes("مقفولة")) {
        return apiError(res, 403, message, "PERIOD_CLOSED");
      }
      if (
        message.includes("مُرحّل بالفعل") ||
        message.includes("محصّلة بالفعل") ||
        message.includes("مصروف بالفعل") ||
        message.includes("غير مسودة")
      ) {
        return apiError(res, 409, message, "CONFLICT");
      }
      if (message.includes("غير موجود") || message.includes("not found")) {
        return apiError(res, 404, message, "NOT_FOUND");
      }
      if (
        message.includes("غير كافية") ||
        message.includes("غير صحيح") ||
        message.includes("مطلوب") ||
        message.includes("غير محدد") ||
        message.includes("منتهية الصلاحية")
      ) {
        return apiError(res, 400, message, "VALIDATION");
      }

      console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
      return apiError(res, 500, "حدث خطأ داخلي في الخادم", "INTERNAL");
    });
  };
}

export async function assertOpenFiscalPeriod(dateStr: string): Promise<void> {
  await storage.assertPeriodOpen(dateStr);
}

export async function auditLog(params: {
  tableName: string;
  recordId: string;
  action: string;
  oldValues?: any;
  newValues?: any;
  userId?: string;
}): Promise<void> {
  await storage.createAuditLog({
    tableName: params.tableName,
    recordId: params.recordId,
    action: params.action,
    oldValues: params.oldValues ? JSON.stringify(params.oldValues) : null,
    newValues: params.newValues ? JSON.stringify(params.newValues) : null,
  });
}

export function validateBody<T>(schema: ZodSchema<T>, req: Request): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const firstError = result.error.errors[0];
    const message = firstError?.message || "بيانات غير صالحة";
    throw new Error(message);
  }
  return result.data;
}

export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) {
    throw new Error(`المعامل "${name}" مطلوب`);
  }
  return value;
}

export function getQueryFlag(req: Request, name: string, defaultValue = false): boolean {
  const val = req.query[name];
  if (val === undefined) return defaultValue;
  return val === "true" || val === "1";
}
