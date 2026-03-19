import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Exclude tables managed outside Drizzle (reporting cache, session store, legacy)
  tablesFilter: [
    "!session",
    "!announcements",
    "!rpt_patient_service_usage",
    "!rpt_patient_revenue",
    "!rpt_account_balances_by_period",
    "!rpt_daily_revenue",
    "!rpt_inventory_snapshot",
    "!rpt_item_movements_summary",
    "!rpt_department_activity",
    "!rpt_refresh_log",
    "!rpt_patient_visit_summary",
  ],
});
