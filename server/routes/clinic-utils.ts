import type { Response } from "express";

export function snakeToCamel(obj: unknown): any {
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  const result: Record<string, unknown> = {};
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = record[key];
  }
  return result;
}

export function sseClinicEndpoint(res: Response, clinicId: string) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  return res;
}
