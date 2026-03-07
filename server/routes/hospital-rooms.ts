/*
 * ═══════════════════════════════════════════════════════════════
 *  hospital-rooms.ts — Floors, Rooms & Beds Management
 *  إدارة الأدوار والغرف والأسرة
 * ═══════════════════════════════════════════════════════════════
 *
 *  المسارات:
 *   GET/POST/PUT/DELETE /api/floors   — أدوار المستشفى
 *   GET/POST/PUT/DELETE /api/rooms    — الغرف
 *   POST/DELETE         /api/beds     — الأسرة
 * ═══════════════════════════════════════════════════════════════
 */

import type { Express } from "express";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { floors, rooms, beds } from "@shared/schema";

export function registerRoomsRoutes(app: Express) {
  // ── Rooms ────────────────────────────────────────────────────
  app.get("/api/rooms", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT r.id, r.name_ar, r.room_number, r.service_id, r.floor_id,
               s.name_ar AS service_name_ar, s.base_price AS service_price,
               f.name_ar AS floor_name_ar
        FROM rooms r
        JOIN floors f ON f.id = r.floor_id
        LEFT JOIN services s ON s.id = r.service_id
        ORDER BY f.sort_order, r.sort_order
      `);
      res.json(result.rows.map((r: any) => {
        const row = r as Record<string, unknown>;
        return {
          id: row.id, nameAr: row.name_ar, roomNumber: row.room_number,
          serviceId: row.service_id || null, floorId: row.floor_id,
          floorNameAr: row.floor_name_ar,
          serviceNameAr: row.service_name_ar || null, servicePrice: row.service_price || null,
        };
      }));
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.patch("/api/rooms/:id", async (req, res) => {
    try {
      const { serviceId } = req.body;
      await db.execute(sql`UPDATE rooms SET service_id = ${serviceId || null} WHERE id = ${req.params.id}`);
      res.json({ ok: true });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/rooms", async (req, res) => {
    try {
      const { floorId, nameAr, roomNumber, serviceId } = req.body;
      if (!floorId || !nameAr) return res.status(400).json({ message: "الدور واسم الغرفة مطلوبان" });
      const result = await db.insert(rooms).values({ floorId, nameAr, roomNumber: roomNumber || null, serviceId: serviceId || null }).returning();
      res.json(result[0]);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.put("/api/rooms/:id", async (req, res) => {
    try {
      const { nameAr, roomNumber, serviceId } = req.body;
      if (!nameAr) return res.status(400).json({ message: "اسم الغرفة مطلوب" });
      await db.execute(sql`
        UPDATE rooms SET name_ar = ${nameAr}, room_number = ${roomNumber || null},
        service_id = ${serviceId || null} WHERE id = ${req.params.id}
      `);
      res.json({ ok: true });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.delete("/api/rooms/:id", async (req, res) => {
    try {
      const occupied = await db.execute(sql`SELECT b.id FROM beds b WHERE b.room_id = ${req.params.id} AND b.status = 'OCCUPIED' LIMIT 1`);
      if (occupied.rows.length > 0) return res.status(400).json({ message: "لا يمكن حذف الغرفة: يوجد أسرّة مشغولة" });
      await db.delete(rooms).where(eq(rooms.id, req.params.id as string));
      res.json({ ok: true });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  // ── Floors ───────────────────────────────────────────────────
  app.get("/api/floors", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT f.id, f.name_ar, f.sort_order,
               COUNT(r.id)::int AS room_count,
               (SELECT COUNT(*)::int FROM beds b JOIN rooms r2 ON r2.id = b.room_id WHERE r2.floor_id = f.id) AS bed_count
        FROM floors f
        LEFT JOIN rooms r ON r.floor_id = f.id
        GROUP BY f.id
        ORDER BY f.sort_order, f.name_ar
      `);
      res.json(result.rows.map((r: any) => {
        const row = r as Record<string, unknown>;
        return { id: row.id, nameAr: row.name_ar, sortOrder: row.sort_order, roomCount: row.room_count, bedCount: row.bed_count };
      }));
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.post("/api/floors", async (req, res) => {
    try {
      const { nameAr, sortOrder } = req.body;
      if (!nameAr) return res.status(400).json({ message: "اسم الدور مطلوب" });
      const result = await db.insert(floors).values({ nameAr, sortOrder: sortOrder ?? 0 }).returning();
      res.json(result[0]);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.put("/api/floors/:id", async (req, res) => {
    try {
      const { nameAr, sortOrder } = req.body;
      if (!nameAr) return res.status(400).json({ message: "اسم الدور مطلوب" });
      const result = await db.update(floors).set({ nameAr, sortOrder: sortOrder ?? 0 }).where(eq(floors.id, req.params.id as string)).returning();
      if (result.length === 0) return res.status(404).json({ message: "الدور غير موجود" });
      res.json(result[0]);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.delete("/api/floors/:id", async (req, res) => {
    try {
      const occupied = await db.execute(sql`
        SELECT b.id FROM beds b JOIN rooms r ON r.id = b.room_id
        WHERE r.floor_id = ${req.params.id} AND b.status = 'OCCUPIED' LIMIT 1
      `);
      if (occupied.rows.length > 0) return res.status(400).json({ message: "لا يمكن حذف الدور: يوجد أسرّة مشغولة" });
      await db.delete(floors).where(eq(floors.id, req.params.id as string));
      res.json({ ok: true });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  // ── Beds ─────────────────────────────────────────────────────
  app.post("/api/beds", async (req, res) => {
    try {
      const { roomId, bedNumber } = req.body;
      if (!roomId || !bedNumber) return res.status(400).json({ message: "الغرفة ورقم السرير مطلوبان" });
      const result = await db.insert(beds).values({ roomId, bedNumber, status: "EMPTY" }).returning();
      res.json(result[0]);
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });

  app.delete("/api/beds/:id", async (req, res) => {
    try {
      const bedRes = await db.execute(sql`SELECT status FROM beds WHERE id = ${req.params.id}`);
      if (bedRes.rows.length === 0) return res.status(404).json({ message: "السرير غير موجود" });
      if ((bedRes.rows[0] as { status: string }).status === "OCCUPIED") return res.status(400).json({ message: "لا يمكن حذف سرير مشغول" });
      await db.delete(beds).where(eq(beds.id, req.params.id as string));
      res.json({ ok: true });
    } catch (e: unknown) { res.status(500).json({ message: e instanceof Error ? e.message : String(e) }); }
  });
}
