# Database ERD modules (PostgreSQL-oriented)

This folder contains **one [DBML](https://dbdocs.io/docs/dbml-reference)** file per **proposed PostgreSQL schema** name. The diagrams mirror how tables are grouped in `shared/schema/*.ts`.

## Current vs proposed naming

| PostgreSQL schema (diagram / file name) | Purpose | Drizzle / code module | Today in the database |
|------------------------------------------|---------|------------------------|------------------------|
| `iam` | Identity, permissions, sessions | `shared/schema/users.ts` + `session` | `public.*` |
| `fin` | General ledger, journals, audit | `shared/schema/finance.ts` | `public.*` |
| `inv` | Items, lots, warehouses, transfers | `shared/schema/inventory.ts` | `public.*` |
| `pur` | Suppliers, receiving, AP | `shared/schema/purchasing.ts` | `public.*` |
| `bill` | Services, price lists, sales & patient invoices | `shared/schema/invoicing.ts` | `public.*` |
| `hosp` | Patients, visits, beds, cashier, treasuries | `shared/schema/hospital.ts` | `public.*` |
| `sys` | Settings, chat, tasks, announcements | `shared/schema/system.ts` + `announcements` | `public.*` |
| `ref` | Payer / company master | `shared/schema/companies.ts` | `public.*` |
| `contract` | Contracts, coverage, claims | `shared/schema/contracts.ts` | `public.*` |
| `clinic` | Outpatient, intake, favorites | `shared/schema/clinic.ts`, `intake.ts` | `public.*` |
| `ops` | Shortage notebook, oversell resolution | `shared/schema/shortage.ts`, `oversell.ts` | `public.*` |
| `rpt` | Reporting / snapshot tables | SQL views or tables (not in Drizzle barrel) | `public.rpt_*` |

The **physical** database today uses **`public`** for almost everything. The **file names** (`iam.dbml`, `fin.dbml`, …) are the **target PostgreSQL schema names** if you later split `public` with `CREATE SCHEMA iam` etc.

## How to view / edit (ERD tools)

1. Open [dbdiagram.io](https://dbdiagram.io).
2. **Import** → paste the contents of a `.dbml` file, or create a diagram and paste.
3. The **Project** block at the top sets the diagram title to the PostgreSQL schema name (e.g. `iam`, `fin`).

### Arabic labels

Inside each file, every **table** has a `Note: '…'` block in **Arabic** (purpose of the table). Every **column** uses `[note: '…']` in **Arabic** (meaning of the field). Hover in dbdiagram.io to read notes on the diagram.

Cross-module foreign keys are shown as **`ext_*` stub tables** (grey in dbdiagram). They stand for real tables still in `public` with the same logical name.

## Files

| File | PostgreSQL schema name |
|------|-------------------------|
| `iam.dbml` | `iam` |
| `fin.dbml` | `fin` |
| `inv.dbml` | `inv` |
| `pur.dbml` | `pur` |
| `bill.dbml` | `bill` |
| `hosp.dbml` | `hosp` |
| `sys.dbml` | `sys` |
| `ref.dbml` | `ref` |
| `contract.dbml` | `contract` |
| `clinic.dbml` | `clinic` |
| `ops.dbml` | `ops` |
| `rpt.dbml` | `rpt` |
| `postgres_schema_names.sql` | Declares `CREATE SCHEMA iam, fin, …` (optional future split from `public`) |

Source of truth for columns and constraints: `shared/schema/*.ts` and migrations / `database_export.sql`.
