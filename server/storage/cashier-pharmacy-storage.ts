import { db } from "../db";
import { eq, sql, asc } from "drizzle-orm";
import {
  pharmacies,
  accounts,
  drawerPasswords,
  type Pharmacy,
  type InsertPharmacy,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

  async getPharmacies(this: DatabaseStorage): Promise<Pharmacy[]> {
    return db.select().from(pharmacies).orderBy(asc(pharmacies.code));
  },

  async getPharmacy(this: DatabaseStorage, id: string): Promise<Pharmacy | undefined> {
    const [pharmacy] = await db.select().from(pharmacies).where(eq(pharmacies.id, id));
    return pharmacy;
  },

  async createPharmacy(this: DatabaseStorage, data: InsertPharmacy): Promise<Pharmacy> {
    const [pharmacy] = await db.insert(pharmacies).values(data).returning();
    return pharmacy;
  },

  async updatePharmacy(this: DatabaseStorage, id: string, data: Partial<InsertPharmacy>): Promise<Pharmacy> {
    const [pharmacy] = await db.update(pharmacies).set(data).where(eq(pharmacies.id, id)).returning();
    return pharmacy;
  },

  async setDrawerPassword(this: DatabaseStorage, glAccountId: string, passwordHash: string): Promise<void> {
    const [existing] = await db.select().from(drawerPasswords).where(eq(drawerPasswords.glAccountId, glAccountId));
    if (existing) {
      await db.update(drawerPasswords).set({ passwordHash, updatedAt: new Date() }).where(eq(drawerPasswords.glAccountId, glAccountId));
    } else {
      await db.insert(drawerPasswords).values({ glAccountId, passwordHash });
    }
  },

  async getDrawerPassword(this: DatabaseStorage, glAccountId: string): Promise<string | null> {
    const [row] = await db.select().from(drawerPasswords).where(eq(drawerPasswords.glAccountId, glAccountId));
    return row?.passwordHash || null;
  },

  async removeDrawerPassword(this: DatabaseStorage, glAccountId: string): Promise<boolean> {
    const result = await db.delete(drawerPasswords).where(eq(drawerPasswords.glAccountId, glAccountId));
    return (result.rowCount || 0) > 0;
  },

  async getDrawersWithPasswordStatus(this: DatabaseStorage): Promise<{ glAccountId: string; hasPassword: boolean; code: string; name: string }[]> {
    const cashAccounts = await db.select().from(accounts).where(
      sql`${accounts.code} LIKE '1211%' OR ${accounts.code} LIKE '1212%'`
    ).orderBy(asc(accounts.code));

    const passwords = await db.select({ glAccountId: drawerPasswords.glAccountId }).from(drawerPasswords);
    const passwordSet = new Set(passwords.map(p => p.glAccountId));

    return cashAccounts.map(a => ({
      glAccountId: a.id,
      hasPassword: passwordSet.has(a.id),
      code: a.code,
      name: a.name,
    }));
  },
};

export default methods;
