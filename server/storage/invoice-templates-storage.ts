import { eq, and, ilike, desc, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  invoiceTemplates,
  invoiceTemplateLines,
  services,
  items,
  type InvoiceTemplate,
  type InvoiceTemplateLine,
  type InvoiceTemplateWithLines,
  type InsertInvoiceTemplate,
} from "@shared/schema";

export interface TemplateListParams {
  search?: string;
  category?: string;
  activeOnly?: boolean;
}

export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  category?: string | null;
  createdBy?: string | null;
  lines: Array<{
    lineType: string;
    serviceId?: string | null;
    itemId?: string | null;
    descriptionSnapshot: string;
    defaultQty?: string | number | null;
    unitLevel?: string | null;
    notes?: string | null;
    doctorName?: string | null;
    nurseName?: string | null;
    businessClassification?: string | null;
    sortOrder?: number;
  }>;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string | null;
  category?: string | null;
  isActive?: boolean;
  lines?: CreateTemplateInput["lines"];
}

// Line enriched with service/item details for bulk apply (no N+1)
export interface TemplateLineForApply extends InvoiceTemplateLine {
  service?: {
    id: string;
    nameAr: string | null;
    nameEn: string | null;
    code: string;
    basePrice: string;
    requiresDoctor: boolean;
    requiresNurse: boolean;
    serviceType: string;
    businessClassification: string | null;
  } | null;
  item?: {
    id: string;
    nameAr: string | null;
    itemCode: string | null;
    hasExpiry: boolean | null;
    salePriceCurrent: string | null;
    purchasePriceLast: string | null;
    businessClassification: string | null;
    majorUnitName: string | null;
    mediumUnitName: string | null;
    minorUnitName: string | null;
  } | null;
}

export interface TemplateForApply extends InvoiceTemplate {
  lines: TemplateLineForApply[];
}

const invoiceTemplatesMethods = {

  async listTemplates(params?: TemplateListParams): Promise<InvoiceTemplate[]> {
    const conditions = [];
    if (params?.activeOnly !== false) conditions.push(eq(invoiceTemplates.isActive, true));
    if (params?.category)   conditions.push(eq(invoiceTemplates.category, params.category));
    if (params?.search)     conditions.push(ilike(invoiceTemplates.name, `%${params.search}%`));

    return db
      .select()
      .from(invoiceTemplates)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(invoiceTemplates.updatedAt));
  },

  async getTemplateById(id: string): Promise<InvoiceTemplateWithLines | null> {
    const [tmpl] = await db
      .select()
      .from(invoiceTemplates)
      .where(eq(invoiceTemplates.id, id));
    if (!tmpl) return null;

    const lines = await db
      .select()
      .from(invoiceTemplateLines)
      .where(eq(invoiceTemplateLines.templateId, id))
      .orderBy(invoiceTemplateLines.sortOrder);

    return { ...tmpl, lines };
  },

  // Returns lines enriched with service/item details (bulk fetch — no N+1)
  async getTemplateForApply(id: string): Promise<TemplateForApply | null> {
    const [tmpl] = await db
      .select()
      .from(invoiceTemplates)
      .where(and(eq(invoiceTemplates.id, id), eq(invoiceTemplates.isActive, true)));
    if (!tmpl) return null;

    const lines = await db
      .select()
      .from(invoiceTemplateLines)
      .where(eq(invoiceTemplateLines.templateId, id))
      .orderBy(invoiceTemplateLines.sortOrder);

    const serviceIds = Array.from(new Set(lines.filter(l => l.serviceId).map(l => l.serviceId!)));
    const itemIds    = Array.from(new Set(lines.filter(l => l.itemId).map(l => l.itemId!)));

    const svcMap: Record<string, TemplateLineForApply["service"]> = {};
    const itemMap: Record<string, TemplateLineForApply["item"]>   = {};

    if (serviceIds.length > 0) {
      const svcs = await db
        .select({
          id: services.id,
          nameAr: services.nameAr,
          nameEn: services.nameEn,
          code: services.code,
          basePrice: services.basePrice,
          requiresDoctor: services.requiresDoctor,
          requiresNurse: services.requiresNurse,
          serviceType: services.serviceType,
          businessClassification: services.businessClassification,
        })
        .from(services)
        .where(inArray(services.id, serviceIds));
      for (const s of svcs) svcMap[s.id] = s;
    }

    if (itemIds.length > 0) {
      const itms = await db
        .select({
          id: items.id,
          nameAr: items.nameAr,
          itemCode: items.itemCode,
          hasExpiry: items.hasExpiry,
          salePriceCurrent: items.salePriceCurrent,
          purchasePriceLast: items.purchasePriceLast,
          businessClassification: items.businessClassification,
          majorUnitName: items.majorUnitName,
          mediumUnitName: items.mediumUnitName,
          minorUnitName: items.minorUnitName,
        })
        .from(items)
        .where(inArray(items.id, itemIds));
      for (const it of itms) itemMap[it.id] = it;
    }

    const enrichedLines: TemplateLineForApply[] = lines.map(l => ({
      ...l,
      service: l.serviceId ? (svcMap[l.serviceId] ?? null) : null,
      item:    l.itemId    ? (itemMap[l.itemId]    ?? null) : null,
    }));

    return { ...tmpl, lines: enrichedLines };
  },

  async createTemplate(input: CreateTemplateInput, userId?: string): Promise<InvoiceTemplateWithLines> {
    return db.transaction(async (tx) => {
      const [tmpl] = await tx
        .insert(invoiceTemplates)
        .values({
          name:        input.name,
          description: input.description ?? null,
          category:    input.category ?? null,
          createdBy:   userId ?? null,
          isActive:    true,
        })
        .returning();

      if (input.lines.length > 0) {
        await tx.insert(invoiceTemplateLines).values(
          input.lines.map((l, i) => ({
            templateId:            tmpl.id,
            sortOrder:             l.sortOrder ?? i,
            lineType:              l.lineType,
            serviceId:             l.serviceId ?? null,
            itemId:                l.itemId ?? null,
            descriptionSnapshot:   l.descriptionSnapshot,
            defaultQty:            String(l.defaultQty ?? 1),
            unitLevel:             l.unitLevel ?? "minor",
            notes:                 l.notes ?? null,
            doctorName:            l.doctorName ?? null,
            nurseName:             l.nurseName ?? null,
            businessClassification: l.businessClassification ?? null,
          }))
        );
      }

      const lines = await tx
        .select()
        .from(invoiceTemplateLines)
        .where(eq(invoiceTemplateLines.templateId, tmpl.id))
        .orderBy(invoiceTemplateLines.sortOrder);

      return { ...tmpl, lines };
    });
  },

  async updateTemplate(id: string, input: UpdateTemplateInput): Promise<InvoiceTemplateWithLines | null> {
    return db.transaction(async (tx) => {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined)        updateData.name        = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.category !== undefined)    updateData.category    = input.category;
      if (input.isActive !== undefined)    updateData.isActive    = input.isActive;

      const [updated] = await tx
        .update(invoiceTemplates)
        .set(updateData)
        .where(eq(invoiceTemplates.id, id))
        .returning();
      if (!updated) return null;

      if (input.lines !== undefined) {
        await tx.delete(invoiceTemplateLines).where(eq(invoiceTemplateLines.templateId, id));
        if (input.lines.length > 0) {
          await tx.insert(invoiceTemplateLines).values(
            input.lines.map((l, i) => ({
              templateId:            id,
              sortOrder:             l.sortOrder ?? i,
              lineType:              l.lineType,
              serviceId:             l.serviceId ?? null,
              itemId:                l.itemId ?? null,
              descriptionSnapshot:   l.descriptionSnapshot,
              defaultQty:            String(l.defaultQty ?? 1),
              unitLevel:             l.unitLevel ?? "minor",
              notes:                 l.notes ?? null,
              doctorName:            l.doctorName ?? null,
              nurseName:             l.nurseName ?? null,
              businessClassification: l.businessClassification ?? null,
            }))
          );
        }
      }

      const lines = await tx
        .select()
        .from(invoiceTemplateLines)
        .where(eq(invoiceTemplateLines.templateId, id))
        .orderBy(invoiceTemplateLines.sortOrder);

      return { ...updated, lines };
    });
  },

  async deactivateTemplate(id: string): Promise<InvoiceTemplate | null> {
    const [updated] = await db
      .update(invoiceTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(invoiceTemplates.id, id))
      .returning();
    return updated ?? null;
  },

  async getTemplateCategories(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ category: invoiceTemplates.category })
      .from(invoiceTemplates)
      .where(eq(invoiceTemplates.isActive, true));
    return rows.map(r => r.category).filter(Boolean) as string[];
  },
};

export default invoiceTemplatesMethods;
