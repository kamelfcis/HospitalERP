/*
 * ═══════════════════════════════════════════════════════════════
 *  _sse.ts — Server-Sent Events Infrastructure
 *  بنية البث المباشر (SSE) لكل قنوات النظام
 * ═══════════════════════════════════════════════════════════════
 *
 *  القنوات المتاحة:
 *
 *  ┌─────────────────────┬──────────────────────────────────────┐
 *  │ القناة              │ الوصف                                │
 *  ├─────────────────────┼──────────────────────────────────────┤
 *  │ sseClients          │ الصيدليات — كل صيدلية لها Set        │
 *  │ bedBoardClients     │ لوحة الأسرة — بث عالمي               │
 *  │ chatSseClients      │ المحادثات — كل مستخدم له اتصال واحد  │
 *  │ clinicSseClients    │ العيادات — كل عيادة لها Set           │
 *  │ clinicOrdersClients │ أوامر الكلينك — بث عالمي             │
 *  └─────────────────────┴──────────────────────────────────────┘
 *
 *  لإضافة قناة جديدة:
 *   1. أضف Map أو Set هنا
 *   2. أضف دالة broadcast هنا
 *   3. أضف endpoint في الملف المناسب (مثل hospital.ts أو clinic.ts)
 * ═══════════════════════════════════════════════════════════════
 */

import type { Response } from "express";

// ── الصيدليات ────────────────────────────────────────────────
export const sseClients = new Map<string, Set<Response>>();

export function broadcastToPharmacy(pharmacyId: string, event: string, data: unknown) {
  const clients = sseClients.get(pharmacyId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((res) => {
    try { res.write(payload); } catch { clients.delete(res); }
  });
}

// ── لوحة الأسرة ─────────────────────────────────────────────
export const bedBoardClients = new Set<Response>();

export function broadcastBedBoardUpdate() {
  const payload = `event: bed-board-update\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`;
  bedBoardClients.forEach((res) => {
    try { res.write(payload); } catch { bedBoardClients.delete(res); }
  });
}

// ── المحادثات الداخلية ───────────────────────────────────────
export const chatSseClients = new Map<string, Response>();

export function broadcastChatMessage(receiverId: string, data: unknown) {
  const res = chatSseClients.get(receiverId);
  if (!res) return;
  try {
    res.write(`event: chat-message\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    chatSseClients.delete(receiverId);
  }
}

// ── العيادات ────────────────────────────────────────────────
export const clinicSseClients = new Map<string, Set<Response>>();

export function broadcastToClinic(clinicId: string, event: string, data: unknown) {
  const clients = clinicSseClients.get(clinicId);
  if (!clients) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((res) => {
    try { res.write(payload); } catch { clients.delete(res); }
  });
}

// ── أوامر الكلينك ────────────────────────────────────────────
export const clinicOrdersClients = new Set<Response>();

export function broadcastClinicOrdersUpdate() {
  const payload = `event: orders_changed\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`;
  clinicOrdersClients.forEach((res) => {
    try { res.write(payload); } catch { clinicOrdersClients.delete(res); }
  });
}
