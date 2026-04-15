-- ═══════════════════════════════════════════════════════════════════════════
-- PostgreSQL schema identifiers matching docs/erd/*.dbml project names.
-- Today your application uses schema "public" for these tables.
-- Run only after a full migration plan (search_path, grants, FK targets).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS fin;
CREATE SCHEMA IF NOT EXISTS inv;
CREATE SCHEMA IF NOT EXISTS pur;
CREATE SCHEMA IF NOT EXISTS bill;
CREATE SCHEMA IF NOT EXISTS hosp;
CREATE SCHEMA IF NOT EXISTS sys;
CREATE SCHEMA IF NOT EXISTS ref;
CREATE SCHEMA IF NOT EXISTS contract;
CREATE SCHEMA IF NOT EXISTS clinic;
CREATE SCHEMA IF NOT EXISTS ops;
CREATE SCHEMA IF NOT EXISTS rpt;

COMMENT ON SCHEMA iam      IS 'Identity, users, permissions, session store';
COMMENT ON SCHEMA fin      IS 'GL, journals, fiscal periods, audit';
COMMENT ON SCHEMA inv      IS 'Items, warehouses, lots, transfers, stock movements';
COMMENT ON SCHEMA pur      IS 'Suppliers, receiving, purchase invoices, AP payments';
COMMENT ON SCHEMA bill     IS 'Services, price lists, sales & patient invoices';
COMMENT ON SCHEMA hosp     IS 'Patients, visits, admissions, beds, cashier, treasury';
COMMENT ON SCHEMA sys      IS 'System settings, tasks, chat, announcements';
COMMENT ON SCHEMA ref      IS 'Insurance / payer companies';
COMMENT ON SCHEMA contract IS 'Contracts, coverage, claims, settlements';
COMMENT ON SCHEMA clinic   IS 'Outpatient clinics, appointments, intake';
COMMENT ON SCHEMA ops      IS 'Shortage notebook, oversell resolution';
COMMENT ON SCHEMA rpt      IS 'Reporting snapshot tables';
