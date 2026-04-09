import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  encounters,
  patientVisits,
  type InsertEncounter,
  type Encounter,
} from "@shared/schema";

export async function createEncounter(params: {
  visitId: string;
  admissionId?: string | null;
  parentEncounterId?: string | null;
  departmentId?: string | null;
  encounterType: "surgery" | "icu" | "ward" | "nursery" | "clinic" | "lab" | "radiology";
  doctorId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
}): Promise<Encounter> {
  const visitRes = await db.select().from(patientVisits).where(eq(patientVisits.id, params.visitId)).limit(1);
  if (!visitRes.length) throw new Error("الزيارة غير موجودة");

  const [enc] = await db.insert(encounters).values({
    visitId: params.visitId,
    admissionId: params.admissionId ?? null,
    parentEncounterId: params.parentEncounterId ?? null,
    departmentId: params.departmentId ?? null,
    encounterType: params.encounterType,
    status: "active",
    doctorId: params.doctorId ?? null,
    startedAt: new Date(),
    metadata: params.metadata ?? null,
    createdBy: params.createdBy ?? null,
  } as any).returning();

  console.log(`[ENCOUNTER] created ${enc.id} type=${params.encounterType} visit=${params.visitId}`);
  return enc;
}

export async function completeEncounter(encounterId: string): Promise<Encounter> {
  const [existing] = await db.select().from(encounters).where(eq(encounters.id, encounterId)).limit(1);
  if (!existing) throw new Error("المقابلة غير موجودة");
  if (existing.status !== "active") throw new Error("المقابلة ليست نشطة — لا يمكن إتمامها");

  const [updated] = await db.update(encounters).set({
    status: "completed",
    endedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(encounters.id, encounterId)).returning();

  console.log(`[ENCOUNTER] completed ${encounterId}`);
  return updated;
}

export async function cancelEncounter(encounterId: string): Promise<Encounter> {
  const [existing] = await db.select().from(encounters).where(eq(encounters.id, encounterId)).limit(1);
  if (!existing) throw new Error("المقابلة غير موجودة");
  if (existing.status !== "active") throw new Error("المقابلة ليست نشطة — لا يمكن إلغاؤها");

  const [updated] = await db.update(encounters).set({
    status: "cancelled",
    endedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(encounters.id, encounterId)).returning();

  console.log(`[ENCOUNTER] cancelled ${encounterId}`);
  return updated;
}

export async function getEncountersByVisit(visitId: string): Promise<Encounter[]> {
  return db.select().from(encounters)
    .where(eq(encounters.visitId, visitId))
    .orderBy(encounters.startedAt);
}

export async function getEncounter(encounterId: string): Promise<Encounter | null> {
  const [enc] = await db.select().from(encounters).where(eq(encounters.id, encounterId)).limit(1);
  return enc ?? null;
}
