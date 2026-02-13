#!/usr/bin/env tsx
/**
 * Feature Scaffold Generator
 *
 * Usage: npx tsx scripts/scaffold-feature.ts <feature-name>
 * Example: npx tsx scripts/scaffold-feature.ts purchase-order
 *
 * Generates:
 *   - Route handler skeleton in server/routes/ (or prints to console)
 *   - Storage method skeleton
 *   - Frontend page skeleton
 *   - Test file skeleton with fiscal + conflict tests
 */

import * as fs from "fs";
import * as path from "path";

const featureName = process.argv[2];
if (!featureName) {
  console.error("Usage: npx tsx scripts/scaffold-feature.ts <feature-name>");
  console.error("Example: npx tsx scripts/scaffold-feature.ts purchase-order");
  process.exit(1);
}

const camelCase = featureName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const PascalCase = camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
const snakeCase = featureName.replace(/-/g, "_");

const outputDir = path.resolve(`scaffolds/${featureName}`);
fs.mkdirSync(outputDir, { recursive: true });

// 1. Route skeleton
const routeSkeleton = `// Route handlers for ${featureName}
// Add these handlers inside registerRoutes() in server/routes.ts

import { asyncHandler, validateBody, requireParam, getQueryFlag, auditLog, assertOpenFiscalPeriod } from "./route-helpers";
import { apiError, ErrorMessages } from "./errors";
import { storage } from "./storage";

// --- Paste inside registerRoutes() ---

// List ${featureName}
app.get("/api/${featureName}s", asyncHandler(async (req, res) => {
  const includeCancelled = getQueryFlag(req, "includeCancelled");
  const items = await storage.get${PascalCase}s(includeCancelled);
  res.json(items);
}));

// Get single ${featureName}
app.get("/api/${featureName}s/:id", asyncHandler(async (req, res) => {
  const id = requireParam(req, "id");
  const item = await storage.get${PascalCase}(id);
  if (!item) return apiError(res, 404, ErrorMessages.NOT_FOUND);
  res.json(item);
}));

// Create ${featureName}
app.post("/api/${featureName}s", asyncHandler(async (req, res) => {
  // const data = validateBody(insert${PascalCase}Schema, req);
  // const result = await storage.create${PascalCase}(data);
  // res.status(201).json(result);
  res.status(501).json({ message: "Not implemented" });
}));

// Post/finalize ${featureName}
app.post("/api/${featureName}s/:id/post", asyncHandler(async (req, res) => {
  const id = requireParam(req, "id");
  // const item = await storage.get${PascalCase}(id);
  // if (!item) return apiError(res, 404, ErrorMessages.NOT_FOUND);
  // if (item.status !== "draft") return apiError(res, 409, ErrorMessages.ALREADY_POSTED);
  // await assertOpenFiscalPeriod(item.entryDate);
  // const posted = await storage.post${PascalCase}(id);
  // await auditLog({ tableName: "${snakeCase}s", recordId: id, action: "post", oldValues: { status: "draft" }, newValues: { status: "posted" } });
  // res.json(posted);
  res.status(501).json({ message: "Not implemented" });
}));
`;

// 2. Storage skeleton
const storageSkeleton = `// Storage methods for ${featureName}
// Add these to IStorage interface and DatabaseStorage class in server/storage.ts

import { roundMoney, roundQty } from "./finance-helpers";
import { isLotExpired, validateBatchExpiry, validateUnitConversion } from "./inventory-helpers";

// --- Add to IStorage interface ---
// get${PascalCase}s(includeCancelled?: boolean): Promise<${PascalCase}[]>;
// get${PascalCase}(id: string): Promise<${PascalCase} | undefined>;
// create${PascalCase}(data: Insert${PascalCase}): Promise<${PascalCase}>;
// post${PascalCase}(id: string): Promise<${PascalCase}>;

// --- Add to DatabaseStorage class ---
/*
async get${PascalCase}s(includeCancelled = false): Promise<${PascalCase}[]> {
  let query = db.select().from(${camelCase}s);
  if (!includeCancelled) {
    query = query.where(sql\`\${${camelCase}s.status} != 'cancelled'\`);
  }
  return query.orderBy(desc(${camelCase}s.createdAt));
}

async get${PascalCase}(id: string): Promise<${PascalCase} | undefined> {
  const [result] = await db.select().from(${camelCase}s).where(eq(${camelCase}s.id, id));
  return result;
}

async create${PascalCase}(data: Insert${PascalCase}): Promise<${PascalCase}> {
  return db.transaction(async (tx) => {
    const [result] = await tx.insert(${camelCase}s).values({
      ...data,
      // totalAmount: roundMoney(amount),
    }).returning();
    return result;
  });
}

async post${PascalCase}(id: string): Promise<${PascalCase}> {
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(${camelCase}s)
      .where(eq(${camelCase}s.id, id))
      .for("update");
    if (!item) throw new Error(ErrorMessages.NOT_FOUND);
    if (item.status !== "draft") throw new Error(ErrorMessages.ALREADY_POSTED);
    await this.assertPeriodOpen(item.entryDate);

    const [updated] = await tx.update(${camelCase}s)
      .set({ status: "posted", postedAt: new Date() })
      .where(eq(${camelCase}s.id, id))
      .returning();
    return updated;
  });
}
*/
`;

// 3. Frontend page skeleton
const pageSkeleton = `import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function ${PascalCase}Page() {
  const { data: items, isLoading } = useQuery<any[]>({
    queryKey: ["/api/${featureName}s"],
  });

  const postMutation = useApiMutation({
    method: "POST",
    url: (variables: { id: string }) => \`/api/${featureName}s/\${variables.id}/post\`,
    successMessage: "تم الترحيل بنجاح",
    invalidateKeys: [["/api/${featureName}s"]],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="loading-${featureName}">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4" dir="rtl" data-testid="page-${featureName}">
      <h1 className="text-2xl font-bold" data-testid="title-${featureName}">
        {/* TODO: Arabic title */}
        ${PascalCase}
      </h1>

      {items?.map((item: any) => (
        <Card key={item.id} data-testid={\`card-${featureName}-\${item.id}\`}>
          <CardHeader>
            <CardTitle>{item.description || item.id}</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            {item.status === "draft" && (
              <Button
                onClick={() => postMutation.mutate({ id: item.id })}
                disabled={postMutation.isSubmitting}
                data-testid={\`button-post-\${item.id}\`}
              >
                {postMutation.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "ترحيل"
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
`;

// 4. Test skeleton
const testSkeleton = `import { describe, it, expect } from "vitest";
import { storage } from "../server/storage";
import {
  createClosedFiscalPeriod,
  createOpenFiscalPeriod,
  createTestAccount,
} from "./helpers";

describe("${PascalCase} - CRUD", () => {
  it("should create a ${featureName}", async () => {
    // TODO: Implement create test
    // const result = await storage.create${PascalCase}({ ... });
    // expect(result).toBeDefined();
    // expect(result.status).toBe("draft");
    expect(true).toBe(true);
  });

  it("should list ${featureName}s excluding cancelled", async () => {
    // TODO: Implement list test
    // const items = await storage.get${PascalCase}s(false);
    // expect(items.every(i => i.status !== "cancelled")).toBe(true);
    expect(true).toBe(true);
  });
});

describe("${PascalCase} - Fiscal Period (403)", () => {
  it("should reject posting when fiscal period is closed", async () => {
    const closedPeriod = await createClosedFiscalPeriod({
      startDate: "2024-01-01",
      endDate: "2024-12-31",
    });

    // TODO: Create document with date in closed period range
    // TODO: Try to post → expect error with "الفترة المحاسبية"
    //
    // await expect(
    //   storage.post${PascalCase}(doc.id)
    // ).rejects.toThrow("الفترة المحاسبية");

    expect(closedPeriod.status).toBe("closed");
  });

  it("should allow posting when fiscal period is open", async () => {
    const openPeriod = await createOpenFiscalPeriod({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });

    // TODO: Create document with date in open period range
    // TODO: Post → expect success

    expect(openPeriod.status).toBe("open");
  });
});

describe("${PascalCase} - Immutability (409)", () => {
  it("should reject double-posting", async () => {
    // TODO: Create and post a document
    // TODO: Try posting again → expect error with "مُرحّل بالفعل"
    //
    // await expect(
    //   storage.post${PascalCase}(postedDoc.id)
    // ).rejects.toThrow("مُرحّل بالفعل");

    expect(true).toBe(true);
  });

  it("should reject editing a posted document", async () => {
    // TODO: Try to modify posted document → expect error
    // await expect(
    //   storage.update${PascalCase}(postedDoc.id, { ... })
    // ).rejects.toThrow("غير مسودة");

    expect(true).toBe(true);
  });
});
`;

// Write files
fs.writeFileSync(path.join(outputDir, `${featureName}-routes.ts`), routeSkeleton);
fs.writeFileSync(path.join(outputDir, `${featureName}-storage.ts`), storageSkeleton);
fs.writeFileSync(path.join(outputDir, `${PascalCase}Page.tsx`), pageSkeleton);
fs.writeFileSync(path.join(outputDir, `${featureName}.test.ts`), testSkeleton);

console.log(`
Feature scaffold generated in: scaffolds/${featureName}/

Files created:
  1. ${featureName}-routes.ts    → Paste handlers into server/routes.ts inside registerRoutes()
  2. ${featureName}-storage.ts   → Add methods to IStorage + DatabaseStorage in server/storage.ts
  3. ${PascalCase}Page.tsx       → Copy to client/src/pages/ and register in App.tsx
  4. ${featureName}.test.ts      → Copy to tests/ directory

Next steps:
  1. Define your table in shared/schema.ts
  2. Run: npm run db:push
  3. Fill in the TODO placeholders in each generated file
  4. Run: npm run lint
  5. Run: npx vitest run
  6. Review docs/feature-checklist.md for complete requirements
`);
