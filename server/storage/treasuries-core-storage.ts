import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import {
  treasuries,
  userTreasuries,
  type Treasury,
  type InsertTreasury,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {
  async getTreasuries(this: DatabaseStorage): Promise<(Treasury & { glAccountCode: string; glAccountName: string })[]> {
    const rows = await db.execute(sql`
      SELECT t.*, a.code AS gl_account_code, a.name AS gl_account_name
      FROM treasuries t
      JOIN accounts a ON a.id = t.gl_account_id
      ORDER BY t.name
    `);
    return (rows.rows as any[]).map(r => ({
      id: r.id, name: r.name, glAccountId: r.gl_account_id,
      isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
      glAccountCode: r.gl_account_code, glAccountName: r.gl_account_name,
    }));
  },

  async getTreasury(this: DatabaseStorage, id: string): Promise<Treasury | undefined> {
    const [row] = await db.select().from(treasuries).where(eq(treasuries.id, id));
    return row;
  },

  async createTreasury(this: DatabaseStorage, data: InsertTreasury): Promise<Treasury> {
    const [row] = await db.insert(treasuries).values(data).returning();
    return row;
  },

  async updateTreasury(this: DatabaseStorage, id: string, data: Partial<InsertTreasury>): Promise<Treasury> {
    const [row] = await db.update(treasuries).set(data).where(eq(treasuries.id, id)).returning();
    if (!row) throw new Error("الخزنة غير موجودة");
    return row;
  },

  async deleteTreasury(this: DatabaseStorage, id: string): Promise<boolean> {
    const res = await db.delete(treasuries).where(eq(treasuries.id, id)).returning();
    return res.length > 0;
  },

  async getUserTreasury(this: DatabaseStorage, userId: string): Promise<(Treasury & { glAccountCode: string; glAccountName: string }) | null> {
    const rows = await db.execute(sql`
      SELECT t.*, a.code AS gl_account_code, a.name AS gl_account_name
      FROM user_treasuries ut
      JOIN treasuries t ON t.id = ut.treasury_id
      JOIN accounts a ON a.id = t.gl_account_id
      WHERE ut.user_id = ${userId}
    `);
    if (rows.rows.length) {
      const r = rows.rows[0] as any;
      return {
        id: r.id, name: r.name, glAccountId: r.gl_account_id,
        isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
        glAccountCode: r.gl_account_code, glAccountName: r.gl_account_name,
      };
    }
    const fallback = await db.execute(sql`
      SELECT t.*, a.code AS gl_account_code, a.name AS gl_account_name
      FROM users u
      JOIN treasuries t ON t.gl_account_id = u.cashier_gl_account_id
      JOIN accounts a ON a.id = t.gl_account_id
      WHERE u.id = ${userId} AND u.cashier_gl_account_id IS NOT NULL
    `);
    if (!fallback.rows.length) return null;
    const r = fallback.rows[0] as any;
    return {
      id: r.id, name: r.name, glAccountId: r.gl_account_id,
      isActive: r.is_active, notes: r.notes, createdAt: r.created_at,
      glAccountCode: r.gl_account_code, glAccountName: r.gl_account_name,
    };
  },

  async getAllUserTreasuries(this: DatabaseStorage): Promise<{ userId: string; treasuryId: string; treasuryName: string; userName: string }[]> {
    const rows = await db.execute(sql`
      SELECT ut.user_id, ut.treasury_id, t.name AS treasury_name, u.full_name AS user_name
      FROM user_treasuries ut
      JOIN treasuries t ON t.id = ut.treasury_id
      JOIN users u ON u.id = ut.user_id
      ORDER BY u.full_name
    `);
    return (rows.rows as any[]).map(r => ({
      userId: r.user_id, treasuryId: r.treasury_id,
      treasuryName: r.treasury_name, userName: r.user_name,
    }));
  },

  async assignUserTreasury(this: DatabaseStorage, userId: string, treasuryId: string): Promise<void> {
    await db.execute(sql`
      INSERT INTO user_treasuries (user_id, treasury_id)
      VALUES (${userId}, ${treasuryId})
      ON CONFLICT (user_id) DO UPDATE SET treasury_id = ${treasuryId}, created_at = NOW()
    `);
  },

  async removeUserTreasury(this: DatabaseStorage, userId: string): Promise<void> {
    await db.delete(userTreasuries).where(eq(userTreasuries.userId, userId));
  },
};

export default methods;
