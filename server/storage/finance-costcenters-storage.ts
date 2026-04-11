import { db } from "../db";
import { eq } from "drizzle-orm";
import { costCenters } from "@shared/schema";
import type {
  CostCenter,
  InsertCostCenter,
} from "@shared/schema";
import type { DatabaseStorage } from "./index";

const methods = {

  async getCostCenters(this: DatabaseStorage): Promise<CostCenter[]> {
    return db.select().from(costCenters).orderBy(costCenters.code);
  },

  async getCostCenter(this: DatabaseStorage, id: string): Promise<CostCenter | undefined> {
    const [costCenter] = await db.select().from(costCenters).where(eq(costCenters.id, id));
    return costCenter;
  },

  async createCostCenter(this: DatabaseStorage, costCenter: InsertCostCenter): Promise<CostCenter> {
    const [newCostCenter] = await db.insert(costCenters).values(costCenter).returning();
    return newCostCenter;
  },

  async updateCostCenter(this: DatabaseStorage, id: string, costCenter: Partial<InsertCostCenter>): Promise<CostCenter | undefined> {
    const [updated] = await db.update(costCenters).set(costCenter).where(eq(costCenters.id, id)).returning();
    return updated;
  },

  async deleteCostCenter(this: DatabaseStorage, id: string): Promise<boolean> {
    await db.delete(costCenters).where(eq(costCenters.id, id));
    return true;
  },

};

export default methods;
