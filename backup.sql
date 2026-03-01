--
-- PostgreSQL database dump
--

\restrict bK7z2YWJ0NiMYJuxJtHx1NZYVrJeGtTeXCvZhwxmPsMrLB60hp4BjBpZRgUFfNM

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: account_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.account_type AS ENUM (
    'asset',
    'liability',
    'equity',
    'revenue',
    'expense'
);


ALTER TYPE public.account_type OWNER TO postgres;

--
-- Name: admission_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.admission_status AS ENUM (
    'active',
    'discharged',
    'cancelled'
);


ALTER TYPE public.admission_status OWNER TO postgres;

--
-- Name: cashier_shift_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.cashier_shift_status AS ENUM (
    'open',
    'closed'
);


ALTER TYPE public.cashier_shift_status OWNER TO postgres;

--
-- Name: customer_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.customer_type AS ENUM (
    'cash',
    'credit',
    'contract'
);


ALTER TYPE public.customer_type OWNER TO postgres;

--
-- Name: item_category; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.item_category AS ENUM (
    'drug',
    'supply',
    'service'
);


ALTER TYPE public.item_category OWNER TO postgres;

--
-- Name: journal_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.journal_status AS ENUM (
    'draft',
    'posted',
    'reversed'
);


ALTER TYPE public.journal_status OWNER TO postgres;

--
-- Name: lot_tx_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.lot_tx_type AS ENUM (
    'in',
    'out',
    'adj'
);


ALTER TYPE public.lot_tx_type OWNER TO postgres;

--
-- Name: mapping_line_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.mapping_line_type AS ENUM (
    'revenue_services',
    'revenue_drugs',
    'revenue_consumables',
    'revenue_equipment',
    'cogs',
    'inventory',
    'cash',
    'receivables',
    'payables',
    'returns',
    'revenue_general',
    'expense_general',
    'cogs_drugs',
    'cogs_supplies',
    'payables_drugs',
    'payables_consumables',
    'discount_allowed',
    'discount_earned',
    'vat_input',
    'vat_output'
);


ALTER TYPE public.mapping_line_type OWNER TO postgres;

--
-- Name: patient_invoice_line_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.patient_invoice_line_type AS ENUM (
    'service',
    'drug',
    'consumable',
    'equipment'
);


ALTER TYPE public.patient_invoice_line_type OWNER TO postgres;

--
-- Name: patient_invoice_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.patient_invoice_status AS ENUM (
    'draft',
    'finalized',
    'cancelled'
);


ALTER TYPE public.patient_invoice_status OWNER TO postgres;

--
-- Name: patient_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.patient_type AS ENUM (
    'cash',
    'contract'
);


ALTER TYPE public.patient_type OWNER TO postgres;

--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.payment_method AS ENUM (
    'cash',
    'card',
    'bank_transfer',
    'insurance'
);


ALTER TYPE public.payment_method OWNER TO postgres;

--
-- Name: purchase_invoice_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.purchase_invoice_status AS ENUM (
    'draft',
    'approved_costed',
    'cancelled'
);


ALTER TYPE public.purchase_invoice_status OWNER TO postgres;

--
-- Name: receiving_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.receiving_status AS ENUM (
    'draft',
    'posted',
    'posted_qty_only',
    'cancelled'
);


ALTER TYPE public.receiving_status OWNER TO postgres;

--
-- Name: sales_invoice_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.sales_invoice_status AS ENUM (
    'draft',
    'finalized',
    'cancelled',
    'collected'
);


ALTER TYPE public.sales_invoice_status OWNER TO postgres;

--
-- Name: transaction_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.transaction_type AS ENUM (
    'sales_invoice',
    'patient_invoice',
    'receiving',
    'purchase_invoice'
);


ALTER TYPE public.transaction_type OWNER TO postgres;

--
-- Name: transfer_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.transfer_status AS ENUM (
    'draft',
    'executed',
    'cancelled'
);


ALTER TYPE public.transfer_status OWNER TO postgres;

--
-- Name: unit_level; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.unit_level AS ENUM (
    'major',
    'medium',
    'minor'
);


ALTER TYPE public.unit_level OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'owner',
    'admin',
    'accounts_manager',
    'purchase_manager',
    'data_entry',
    'pharmacist',
    'pharmacy_assistant',
    'warehouse_assistant',
    'cashier',
    'department_admin',
    'reception'
);


ALTER TYPE public.user_role OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_mappings (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    transaction_type text NOT NULL,
    line_type text NOT NULL,
    debit_account_id character varying,
    credit_account_id character varying,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    warehouse_id character varying
);


ALTER TABLE public.account_mappings OWNER TO postgres;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accounts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code character varying(20) NOT NULL,
    name text NOT NULL,
    account_type public.account_type NOT NULL,
    parent_id character varying,
    level integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    requires_cost_center boolean DEFAULT false NOT NULL,
    description text,
    opening_balance numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.accounts OWNER TO postgres;

--
-- Name: admissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admissions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    admission_number character varying(30) NOT NULL,
    patient_id character varying,
    patient_name text NOT NULL,
    patient_phone text,
    admission_date date NOT NULL,
    discharge_date date,
    status public.admission_status DEFAULT 'active'::public.admission_status NOT NULL,
    doctor_name text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.admissions OWNER TO postgres;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id character varying NOT NULL,
    action text NOT NULL,
    old_values text,
    new_values text,
    user_id character varying,
    ip_address text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_log OWNER TO postgres;

--
-- Name: cashier_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cashier_audit_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    shift_id character varying,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id character varying,
    details text,
    performed_by text NOT NULL,
    performed_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.cashier_audit_log OWNER TO postgres;

--
-- Name: cashier_receipts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cashier_receipts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    receipt_number integer NOT NULL,
    shift_id character varying NOT NULL,
    invoice_id character varying NOT NULL,
    amount numeric(18,2) NOT NULL,
    collected_by text NOT NULL,
    collected_at timestamp without time zone DEFAULT now() NOT NULL,
    payment_date character varying(10),
    printed_at timestamp without time zone,
    print_count integer DEFAULT 0 NOT NULL,
    last_printed_by text,
    reprint_reason text
);


ALTER TABLE public.cashier_receipts OWNER TO postgres;

--
-- Name: cashier_refund_receipts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cashier_refund_receipts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    receipt_number integer NOT NULL,
    shift_id character varying NOT NULL,
    invoice_id character varying NOT NULL,
    amount numeric(18,2) NOT NULL,
    refunded_by text NOT NULL,
    refunded_at timestamp without time zone DEFAULT now() NOT NULL,
    payment_date character varying(10),
    printed_at timestamp without time zone,
    print_count integer DEFAULT 0 NOT NULL,
    last_printed_by text,
    reprint_reason text
);


ALTER TABLE public.cashier_refund_receipts OWNER TO postgres;

--
-- Name: cashier_shifts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cashier_shifts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    cashier_id character varying NOT NULL,
    cashier_name text NOT NULL,
    status public.cashier_shift_status DEFAULT 'open'::public.cashier_shift_status NOT NULL,
    opening_cash numeric(18,2) DEFAULT 0 NOT NULL,
    closing_cash numeric(18,2) DEFAULT 0 NOT NULL,
    expected_cash numeric(18,2) DEFAULT 0 NOT NULL,
    variance numeric(18,2) DEFAULT 0 NOT NULL,
    opened_at timestamp without time zone DEFAULT now() NOT NULL,
    closed_at timestamp without time zone,
    pharmacy_id character varying,
    gl_account_id character varying
);


ALTER TABLE public.cashier_shifts OWNER TO postgres;

--
-- Name: cost_centers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cost_centers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code character varying(20) NOT NULL,
    name text NOT NULL,
    description text,
    parent_id character varying,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    type text
);


ALTER TABLE public.cost_centers OWNER TO postgres;

--
-- Name: departments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.departments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code character varying(20) NOT NULL,
    name_ar text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.departments OWNER TO postgres;

--
-- Name: doctors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.doctors (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    specialty text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.doctors OWNER TO postgres;

--
-- Name: drawer_passwords; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.drawer_passwords (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    gl_account_id character varying NOT NULL,
    password_hash text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.drawer_passwords OWNER TO postgres;

--
-- Name: fiscal_periods; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fiscal_periods (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_closed boolean DEFAULT false NOT NULL,
    closed_at timestamp without time zone,
    closed_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.fiscal_periods OWNER TO postgres;

--
-- Name: inventory_lot_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_lot_movements (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    lot_id character varying NOT NULL,
    tx_date timestamp without time zone DEFAULT now() NOT NULL,
    tx_type public.lot_tx_type NOT NULL,
    qty_change_in_minor numeric(18,4) NOT NULL,
    unit_cost numeric(18,4),
    reference_type text,
    reference_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    warehouse_id character varying
);


ALTER TABLE public.inventory_lot_movements OWNER TO postgres;

--
-- Name: inventory_lots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_lots (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    item_id character varying NOT NULL,
    expiry_date date,
    received_date date NOT NULL,
    purchase_price numeric(18,4) NOT NULL,
    qty_in_minor numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    warehouse_id character varying,
    expiry_month integer,
    expiry_year integer,
    sale_price numeric(18,2) DEFAULT 0 NOT NULL
);


ALTER TABLE public.inventory_lots OWNER TO postgres;

--
-- Name: item_barcodes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.item_barcodes (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    item_id character varying NOT NULL,
    barcode_value character varying(50) NOT NULL,
    barcode_type character varying(20),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.item_barcodes OWNER TO postgres;

--
-- Name: item_department_prices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.item_department_prices (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    item_id character varying NOT NULL,
    department_id character varying NOT NULL,
    sale_price numeric(18,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.item_department_prices OWNER TO postgres;

--
-- Name: item_form_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.item_form_types (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name_ar text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.item_form_types OWNER TO postgres;

--
-- Name: item_uoms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.item_uoms (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code character varying(20) NOT NULL,
    name_ar text NOT NULL,
    name_en text,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.item_uoms OWNER TO postgres;

--
-- Name: items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.items (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    item_code character varying(50) NOT NULL,
    name_ar text NOT NULL,
    name_en text,
    category public.item_category NOT NULL,
    is_toxic boolean DEFAULT false NOT NULL,
    form_type_id character varying,
    purchase_price_last numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    sale_price_current numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    major_unit_name text,
    medium_unit_name text,
    minor_unit_name text,
    major_to_medium numeric(10,4),
    major_to_minor numeric(10,4),
    medium_to_minor numeric(10,4),
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    has_expiry boolean DEFAULT false NOT NULL
);


ALTER TABLE public.items OWNER TO postgres;

--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.journal_entries (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    entry_number integer NOT NULL,
    entry_date date NOT NULL,
    description text NOT NULL,
    status public.journal_status DEFAULT 'draft'::public.journal_status NOT NULL,
    period_id character varying,
    total_debit numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    total_credit numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    reference text,
    created_by character varying,
    posted_by character varying,
    posted_at timestamp without time zone,
    reversed_by character varying,
    reversed_at timestamp without time zone,
    reversal_entry_id character varying,
    template_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    source_type text,
    source_document_id character varying
);


ALTER TABLE public.journal_entries OWNER TO postgres;

--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.journal_lines (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    journal_entry_id character varying NOT NULL,
    line_number integer NOT NULL,
    account_id character varying NOT NULL,
    cost_center_id character varying,
    description text,
    debit numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    credit numeric(18,2) DEFAULT '0'::numeric NOT NULL
);


ALTER TABLE public.journal_lines OWNER TO postgres;

--
-- Name: journal_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.journal_templates (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.journal_templates OWNER TO postgres;

--
-- Name: patient_invoice_headers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patient_invoice_headers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    invoice_number character varying(30) NOT NULL,
    invoice_date date NOT NULL,
    patient_name text NOT NULL,
    patient_phone text,
    patient_type public.patient_type DEFAULT 'cash'::public.patient_type NOT NULL,
    department_id character varying,
    doctor_name text,
    contract_name text,
    notes text,
    status public.patient_invoice_status DEFAULT 'draft'::public.patient_invoice_status NOT NULL,
    total_amount numeric(18,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(18,2) DEFAULT 0 NOT NULL,
    net_amount numeric(18,2) DEFAULT 0 NOT NULL,
    paid_amount numeric(18,2) DEFAULT 0 NOT NULL,
    finalized_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    warehouse_id character varying,
    admission_id character varying,
    is_consolidated boolean DEFAULT false NOT NULL,
    source_invoice_ids text
);


ALTER TABLE public.patient_invoice_headers OWNER TO postgres;

--
-- Name: patient_invoice_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patient_invoice_lines (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    header_id character varying NOT NULL,
    line_type public.patient_invoice_line_type NOT NULL,
    service_id character varying,
    item_id character varying,
    description text NOT NULL,
    quantity numeric(10,4) DEFAULT 1 NOT NULL,
    unit_price numeric(18,2) DEFAULT 0 NOT NULL,
    discount_percent numeric(5,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(18,2) DEFAULT 0 NOT NULL,
    total_price numeric(18,2) DEFAULT 0 NOT NULL,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    doctor_name text,
    nurse_name text,
    lot_id character varying,
    expiry_month integer,
    expiry_year integer,
    price_source text,
    unit_level text DEFAULT 'minor'::text NOT NULL
);


ALTER TABLE public.patient_invoice_lines OWNER TO postgres;

--
-- Name: patient_invoice_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patient_invoice_payments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    header_id character varying NOT NULL,
    payment_date date NOT NULL,
    amount numeric(18,2) NOT NULL,
    payment_method public.payment_method DEFAULT 'cash'::public.payment_method NOT NULL,
    reference_number text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.patient_invoice_payments OWNER TO postgres;

--
-- Name: patients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patients (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    phone character varying(11),
    national_id character varying(14),
    age integer,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.patients OWNER TO postgres;

--
-- Name: pharmacies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pharmacies (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code character varying(20) NOT NULL,
    name_ar text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pharmacies OWNER TO postgres;

--
-- Name: price_adjustments_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.price_adjustments_log (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    price_list_id character varying NOT NULL,
    action_type text NOT NULL,
    direction text NOT NULL,
    value numeric(18,4) NOT NULL,
    filter_department_id character varying,
    filter_category text,
    affected_count integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.price_adjustments_log OWNER TO postgres;

--
-- Name: price_list_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.price_list_items (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    price_list_id character varying NOT NULL,
    service_id character varying NOT NULL,
    price numeric(18,2) NOT NULL,
    min_discount_pct numeric(5,2),
    max_discount_pct numeric(5,2),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.price_list_items OWNER TO postgres;

--
-- Name: price_lists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.price_lists (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code character varying(30) NOT NULL,
    name text NOT NULL,
    currency text DEFAULT 'EGP'::text NOT NULL,
    valid_from date,
    valid_to date,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    department_id character varying
);


ALTER TABLE public.price_lists OWNER TO postgres;

--
-- Name: purchase_invoice_headers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchase_invoice_headers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    invoice_number integer NOT NULL,
    supplier_id character varying NOT NULL,
    supplier_invoice_no text NOT NULL,
    warehouse_id character varying NOT NULL,
    receiving_id character varying,
    invoice_date date NOT NULL,
    status public.purchase_invoice_status DEFAULT 'draft'::public.purchase_invoice_status NOT NULL,
    discount_type text DEFAULT 'percent'::text,
    discount_value numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    total_before_vat numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    total_vat numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    total_after_vat numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    total_line_discounts numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    net_payable numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    notes text,
    approved_at timestamp without time zone,
    approved_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.purchase_invoice_headers OWNER TO postgres;

--
-- Name: purchase_invoice_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchase_invoice_lines (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    invoice_id character varying NOT NULL,
    receiving_line_id character varying,
    item_id character varying NOT NULL,
    unit_level public.unit_level DEFAULT 'major'::public.unit_level NOT NULL,
    qty numeric(18,4) NOT NULL,
    bonus_qty numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    selling_price numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    purchase_price numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    line_discount_pct numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    line_discount_value numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    vat_rate numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    value_before_vat numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    vat_amount numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    value_after_vat numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    batch_number text,
    expiry_month integer,
    expiry_year integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.purchase_invoice_lines OWNER TO postgres;

--
-- Name: purchase_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.purchase_transactions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    item_id character varying NOT NULL,
    tx_date date NOT NULL,
    supplier_name text,
    qty numeric(18,4) NOT NULL,
    unit_level public.unit_level DEFAULT 'minor'::public.unit_level NOT NULL,
    purchase_price numeric(18,2) NOT NULL,
    sale_price_snapshot numeric(18,2),
    total numeric(18,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.purchase_transactions OWNER TO postgres;

--
-- Name: receiving_headers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.receiving_headers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    receiving_number integer NOT NULL,
    supplier_id character varying NOT NULL,
    supplier_invoice_no text NOT NULL,
    warehouse_id character varying NOT NULL,
    receive_date date NOT NULL,
    notes text,
    status public.receiving_status DEFAULT 'draft'::public.receiving_status NOT NULL,
    total_qty numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    total_cost numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    posted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    converted_to_invoice_id character varying,
    converted_at timestamp without time zone,
    correction_of_id character varying,
    corrected_by_id character varying,
    correction_status text
);


ALTER TABLE public.receiving_headers OWNER TO postgres;

--
-- Name: receiving_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.receiving_lines (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    receiving_id character varying NOT NULL,
    item_id character varying NOT NULL,
    unit_level public.unit_level DEFAULT 'major'::public.unit_level NOT NULL,
    qty_entered numeric(18,4) NOT NULL,
    qty_in_minor numeric(18,4) NOT NULL,
    purchase_price numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    line_total numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    batch_number text,
    expiry_date date,
    sale_price_hint numeric(18,2),
    notes text,
    is_rejected boolean DEFAULT false NOT NULL,
    rejection_reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expiry_month integer,
    expiry_year integer,
    sale_price numeric(18,2),
    bonus_qty numeric(18,4) DEFAULT '0'::numeric NOT NULL,
    bonus_qty_in_minor numeric(18,4) DEFAULT '0'::numeric NOT NULL
);


ALTER TABLE public.receiving_lines OWNER TO postgres;

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.role_permissions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    role text NOT NULL,
    permission text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.role_permissions OWNER TO postgres;

--
-- Name: sales_invoice_headers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sales_invoice_headers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    invoice_number integer NOT NULL,
    invoice_date date NOT NULL,
    warehouse_id character varying NOT NULL,
    customer_type public.customer_type DEFAULT 'cash'::public.customer_type NOT NULL,
    customer_name text,
    contract_company text,
    status public.sales_invoice_status DEFAULT 'draft'::public.sales_invoice_status NOT NULL,
    subtotal numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    discount_type text DEFAULT 'percent'::text,
    discount_percent numeric(8,4) DEFAULT '0'::numeric NOT NULL,
    discount_value numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    net_total numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    notes text,
    created_by character varying,
    finalized_at timestamp without time zone,
    finalized_by character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    is_return boolean DEFAULT false NOT NULL,
    original_invoice_id character varying,
    pharmacy_id character varying
);


ALTER TABLE public.sales_invoice_headers OWNER TO postgres;

--
-- Name: sales_invoice_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sales_invoice_lines (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    invoice_id character varying NOT NULL,
    line_no integer NOT NULL,
    item_id character varying NOT NULL,
    unit_level public.unit_level DEFAULT 'major'::public.unit_level NOT NULL,
    qty numeric(18,4) NOT NULL,
    qty_in_minor numeric(18,4) NOT NULL,
    sale_price numeric(18,2) NOT NULL,
    line_total numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    expiry_month integer,
    expiry_year integer,
    lot_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sales_invoice_lines OWNER TO postgres;

--
-- Name: sales_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sales_transactions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    item_id character varying NOT NULL,
    tx_date date NOT NULL,
    qty numeric(18,4) NOT NULL,
    unit_level public.unit_level DEFAULT 'minor'::public.unit_level NOT NULL,
    sale_price numeric(18,2) NOT NULL,
    total numeric(18,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sales_transactions OWNER TO postgres;

--
-- Name: service_consumables; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.service_consumables (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    service_id character varying NOT NULL,
    item_id character varying NOT NULL,
    quantity numeric(10,4) DEFAULT 1 NOT NULL,
    unit_level text DEFAULT 'minor'::text NOT NULL,
    notes text
);


ALTER TABLE public.service_consumables OWNER TO postgres;

--
-- Name: service_prices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.service_prices (
    id character varying DEFAULT (gen_random_uuid())::text NOT NULL,
    price_list_id character varying NOT NULL,
    service_id character varying NOT NULL,
    price numeric(12,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.service_prices OWNER TO postgres;

--
-- Name: services; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.services (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code character varying(30) NOT NULL,
    name_ar text NOT NULL,
    name_en text,
    department_id character varying NOT NULL,
    category text,
    service_type text DEFAULT 'SERVICE'::text NOT NULL,
    default_warehouse_id character varying,
    revenue_account_id character varying NOT NULL,
    cost_center_id character varying NOT NULL,
    base_price numeric(18,2) DEFAULT '0'::numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    requires_doctor boolean DEFAULT false NOT NULL,
    requires_nurse boolean DEFAULT false NOT NULL
);


ALTER TABLE public.services OWNER TO postgres;

--
-- Name: session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


ALTER TABLE public.session OWNER TO postgres;

--
-- Name: store_transfers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.store_transfers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    transfer_number integer NOT NULL,
    transfer_date date NOT NULL,
    source_warehouse_id character varying NOT NULL,
    destination_warehouse_id character varying NOT NULL,
    status public.transfer_status DEFAULT 'draft'::public.transfer_status NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    executed_at timestamp without time zone
);


ALTER TABLE public.store_transfers OWNER TO postgres;

--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.suppliers (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    code character varying(20) NOT NULL,
    name_ar text NOT NULL,
    name_en text,
    phone text,
    tax_id character varying(30),
    address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    supplier_type text DEFAULT 'drugs'::text NOT NULL
);


ALTER TABLE public.suppliers OWNER TO postgres;

--
-- Name: template_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.template_lines (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    template_id character varying NOT NULL,
    line_number integer NOT NULL,
    account_id character varying,
    cost_center_id character varying,
    description text,
    debit_percent numeric(15,2),
    credit_percent numeric(15,2)
);


ALTER TABLE public.template_lines OWNER TO postgres;

--
-- Name: transfer_line_allocations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transfer_line_allocations (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    line_id character varying NOT NULL,
    source_lot_id character varying NOT NULL,
    expiry_date date,
    qty_out_in_minor numeric(18,4) NOT NULL,
    purchase_price numeric(18,4) NOT NULL,
    destination_lot_id character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expiry_month integer,
    expiry_year integer
);


ALTER TABLE public.transfer_line_allocations OWNER TO postgres;

--
-- Name: transfer_lines; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transfer_lines (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    transfer_id character varying NOT NULL,
    item_id character varying NOT NULL,
    unit_level public.unit_level DEFAULT 'major'::public.unit_level NOT NULL,
    qty_entered numeric(18,4) NOT NULL,
    qty_in_minor numeric(18,4) NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    selected_expiry_date date,
    available_at_save_minor numeric(18,4),
    selected_expiry_month integer,
    selected_expiry_year integer
);


ALTER TABLE public.transfer_lines OWNER TO postgres;

--
-- Name: user_departments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_departments (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    department_id character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_departments OWNER TO postgres;

--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_permissions (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    permission text NOT NULL,
    granted boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_permissions OWNER TO postgres;

--
-- Name: user_warehouses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_warehouses (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    warehouse_id character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_warehouses OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    full_name text NOT NULL,
    role text DEFAULT 'admin'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    department_id character varying,
    pharmacy_id character varying
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.warehouses (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    warehouse_code character varying(20) NOT NULL,
    name_ar text NOT NULL,
    department_id character varying,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    pharmacy_id character varying,
    gl_account_id character varying
);


ALTER TABLE public.warehouses OWNER TO postgres;

--
-- Data for Name: account_mappings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account_mappings (id, transaction_type, line_type, debit_account_id, credit_account_id, description, is_active, created_at, updated_at, warehouse_id) FROM stdin;
f85f284d-0e9f-404b-b1f9-0c434ffd4df9	purchase_invoice	inventory	f7c0a7c3-1098-4ee4-be58-acc2669b2dea	\N	\N	t	2026-02-11 16:33:40.59314	2026-02-11 16:33:40.59314	\N
f23f1f3b-3814-45aa-a3c1-a872be18db5c	purchase_invoice	vat_input	2d69f724-9af6-4fb0-9481-9df637598ad0	\N	\N	t	2026-02-11 16:33:40.855031	2026-02-11 16:33:40.855031	\N
09430fdb-1943-45b6-a038-cea87f6843a3	purchase_invoice	discount_earned	\N	0cc21d89-8451-4a94-95f9-0656f6e6cae3	\N	t	2026-02-11 16:33:41.030642	2026-02-11 16:33:41.030642	\N
374f7311-9f46-40f0-9bd1-394ee98a78d9	purchase_invoice	payables_drugs	\N	8d1fafe8-5908-423a-a2d4-72a25f9a2cd5	\N	t	2026-02-11 16:33:41.03649	2026-02-11 16:33:41.03649	\N
3f48b703-b855-4f80-a19c-0a9fc1b58659	purchase_invoice	payables_consumables	\N	ef8002a9-6391-44c6-8f70-ef630089dfc5	\N	t	2026-02-11 16:33:41.041602	2026-02-11 16:33:41.041602	\N
536fd156-d058-4ff4-94d1-b24f6303264b	sales_invoice	cogs_supplies	3cb9e657-68fa-4591-a493-0769c7d046ba	\N	\N	t	2026-02-11 20:25:03.337945	2026-02-11 20:38:55.133	b045a6c1-dc79-4480-8907-a8fb6975a92f
ee459b3a-55a8-43d5-b30d-b3083127ed17	sales_invoice	inventory	\N	73cb31ed-055e-481d-8a6f-0362152359b7	\N	t	2026-02-11 20:40:04.315449	2026-02-11 20:40:04.315449	c2e71ee4-9535-435a-95c9-88fcc7fa56bf
c21ee664-ddca-4d69-9166-0da53487b63a	sales_invoice	receivables	a6b25d06-cd2e-4f09-aa9a-86b5f0cdb97a	\N	\N	t	2026-02-11 20:05:54.208203	2026-02-11 20:39:22.221	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
8c112dfa-38cf-4605-ba4f-45876fe3d78b	sales_invoice	revenue_drugs	\N	54acd876-5421-404b-9e25-e7b1007213af	\N	t	2026-02-11 20:37:42.188644	2026-02-11 20:37:42.188644	45c6f23f-0eea-4d36-b10a-e7df6f894522
c577c79f-7f61-41be-9810-2511832a8c79	sales_invoice	inventory	\N	f7c0a7c3-1098-4ee4-be58-acc2669b2dea	\N	t	2026-02-11 20:39:22.228192	2026-02-11 20:39:22.228192	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
3114c3e8-108f-4e8d-8523-7920e06a43cb	sales_invoice	revenue_general	\N	b43cd069-28f4-44c6-9c43-21fa46aa441a	\N	t	2026-02-11 18:51:04.881276	2026-02-11 20:39:22.231	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
3ec6004e-7192-42d3-a6ad-64fd6db0d277	sales_invoice	cogs_drugs	f1d698f0-0510-4e9d-87d7-ef437e4614c6	\N	\N	t	2026-02-11 18:56:53.686507	2026-02-11 20:40:04.274	c2e71ee4-9535-435a-95c9-88fcc7fa56bf
be0c54dd-d0e2-4ba7-9a98-1a64f8557f4a	sales_invoice	discount_allowed	d99aff0c-7c92-4e7f-a16c-43f4f9ee7d44	\N	\N	t	2026-02-11 18:56:53.724577	2026-02-11 20:40:04.292	c2e71ee4-9535-435a-95c9-88fcc7fa56bf
e2930f8e-d5b7-40b9-957e-0eed8bb1baa7	sales_invoice	discount_allowed	6420c481-afb5-45f3-87f9-10d4664502ec	\N	\N	t	2026-02-11 18:54:17.063389	2026-02-11 20:38:55.15	b045a6c1-dc79-4480-8907-a8fb6975a92f
244910cf-d86c-4c89-8d5c-67b32b50b6cb	sales_invoice	revenue_drugs	\N	f7c0a7c3-1098-4ee4-be58-acc2669b2dea	\N	t	2026-02-11 20:38:07.743885	2026-02-11 20:38:07.743885	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
5e73b235-addc-4853-a04a-4f27cc0858be	sales_invoice	receivables	a6b25d06-cd2e-4f09-aa9a-86b5f0cdb97a	\N	\N	t	2026-02-11 20:06:04.852352	2026-02-11 20:38:55.156	b045a6c1-dc79-4480-8907-a8fb6975a92f
bdff7446-eb6b-4a5f-972e-f91749991209	sales_invoice	revenue_drugs	\N	2310af58-497d-428c-9c3b-9793d3f94b3c	\N	t	2026-02-11 18:54:17.070484	2026-02-11 20:38:55.16	b045a6c1-dc79-4480-8907-a8fb6975a92f
e33d232c-6b6f-4c42-b164-557b15bc6591	sales_invoice	cogs	1033d52a-7940-4e45-b82c-b11b57de6308	\N	\N	t	2026-02-11 18:36:55.977767	2026-02-11 20:39:13.647	45c6f23f-0eea-4d36-b10a-e7df6f894522
57f6605f-a4dd-4373-b2d1-8f040b0f7b70	sales_invoice	discount_allowed	a238b355-e19b-4141-970a-9d380cd27a3b	\N	\N	t	2026-02-11 18:36:56.167958	2026-02-11 20:39:13.651	45c6f23f-0eea-4d36-b10a-e7df6f894522
0cd93afb-429e-47dd-9bab-5a9e037584be	sales_invoice	revenue_general	\N	12ada3e9-df9c-4eb9-99c6-ffe2b999332c	\N	t	2026-02-11 20:25:03.341909	2026-02-11 20:38:55.165	b045a6c1-dc79-4480-8907-a8fb6975a92f
0eab2e6f-ff4b-49ad-83ab-b5999e027000	sales_invoice	cogs	1289d2db-6c48-4625-9d99-233655771966	\N	\N	t	2026-02-11 18:39:43.429477	2026-02-11 20:39:05.91	7980d189-399f-41d3-94b4-c487da69975f
4daf45bf-59d6-4376-a063-48d330fdd345	sales_invoice	discount_allowed	22c3e7d6-6165-4434-8606-b7baa63f2d56	\N	\N	t	2026-02-11 18:39:43.469935	2026-02-11 20:39:05.915	7980d189-399f-41d3-94b4-c487da69975f
6280cd38-8c63-4fd1-9ba8-68a07c104b8b	sales_invoice	receivables	a6b25d06-cd2e-4f09-aa9a-86b5f0cdb97a	\N	\N	t	2026-02-11 20:05:19.569393	2026-02-11 20:39:05.921	7980d189-399f-41d3-94b4-c487da69975f
c36a69bf-4732-4646-b315-77a5c2f3e7f7	sales_invoice	receivables	a6b25d06-cd2e-4f09-aa9a-86b5f0cdb97a	\N	\N	t	2026-02-11 20:05:43.426896	2026-02-11 20:40:04.297	c2e71ee4-9535-435a-95c9-88fcc7fa56bf
3af49733-9dd7-40b2-ab30-90884d83ae6a	sales_invoice	revenue_consumables	91a38951-a2df-48a2-b3ba-0bbfb39ab88d	\N	\N	t	2026-02-11 20:25:51.198851	2026-02-11 20:40:04.302	c2e71ee4-9535-435a-95c9-88fcc7fa56bf
af80caa3-eb0f-4881-8c20-fa8da0461671	sales_invoice	revenue_drugs	\N	818d8d79-1c3e-42c1-99a0-561c94cf23fb	\N	t	2026-02-11 18:56:53.739226	2026-02-11 20:40:04.306	c2e71ee4-9535-435a-95c9-88fcc7fa56bf
c433d6e8-5cfd-405c-bbb0-a0a17825f8bb	sales_invoice	receivables	a6b25d06-cd2e-4f09-aa9a-86b5f0cdb97a	\N	\N	t	2026-02-11 20:04:52.532318	2026-02-11 20:39:13.656	45c6f23f-0eea-4d36-b10a-e7df6f894522
1fd7b7b6-54f5-48cf-9f93-f41b71953092	sales_invoice	inventory	\N	54acd876-5421-404b-9e25-e7b1007213af	\N	t	2026-02-11 20:39:13.660061	2026-02-11 20:39:13.660061	45c6f23f-0eea-4d36-b10a-e7df6f894522
bb3825d0-ad02-427b-aed4-1051c8c65969	sales_invoice	revenue_drugs	\N	cdfbfad6-16a7-494c-a45d-1a242dd2e7fa	\N	t	2026-02-11 20:37:18.705415	2026-02-11 20:37:18.705415	7980d189-399f-41d3-94b4-c487da69975f
f348fd6b-2cb9-4342-90ad-fe7cca21a077	sales_invoice	revenue_general	\N	bc4f574f-ce77-4666-a33b-219a1eb66318	\N	t	2026-02-11 18:36:56.182217	2026-02-11 20:39:13.665	45c6f23f-0eea-4d36-b10a-e7df6f894522
71a29aab-50af-4270-9dba-93026a325faa	sales_invoice	cogs	c863f9c8-1c16-4652-ab09-7dc71167cbf9	\N	\N	t	2026-02-11 18:51:04.86221	2026-02-11 20:39:22.151	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
e65b61a3-5175-4658-a8c7-a2efd80a9068	sales_invoice	discount_allowed	6a1429ac-8ad2-48a8-add0-8f4dc67ac665	\N	\N	t	2026-02-11 18:51:04.876998	2026-02-11 20:39:22.197	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
3efc2f62-3a31-4d55-ba76-576d3bbb8c27	sales_invoice	cogs_drugs	cff7c510-4566-49da-a370-6115eaa69cbb	\N	\N	t	2026-02-11 18:54:17.024107	2026-02-11 20:38:55.117	b045a6c1-dc79-4480-8907-a8fb6975a92f
1da4d763-b0a0-4873-92b1-d520fb70a86f	sales_invoice	inventory	\N	4b297fea-7209-48b2-9bbb-aa2d1ddc0b80	\N	t	2026-02-11 20:38:55.171621	2026-02-11 20:38:55.171621	b045a6c1-dc79-4480-8907-a8fb6975a92f
c756dd48-26b8-49b3-9907-b26a4d858205	sales_invoice	inventory	\N	cdfbfad6-16a7-494c-a45d-1a242dd2e7fa	\N	t	2026-02-11 20:39:05.926662	2026-02-11 20:39:05.926662	7980d189-399f-41d3-94b4-c487da69975f
ea46d518-5def-4dc2-9a03-af4e1dda88f5	sales_invoice	revenue_general	\N	f24885b1-ea3f-4714-bdf0-cb23cdb5bc89	\N	t	2026-02-11 18:39:43.474445	2026-02-11 20:39:05.931	7980d189-399f-41d3-94b4-c487da69975f
1da3d4c7-6526-4f02-b9ca-7d9f62f73824	sales_invoice	revenue_general	\N	39f9ca51-5f59-4714-9063-c558f94cfa54	\N	t	2026-02-11 20:25:51.205784	2026-02-11 20:40:04.31	c2e71ee4-9535-435a-95c9-88fcc7fa56bf
\.


--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accounts (id, code, name, account_type, parent_id, level, is_active, requires_cost_center, description, opening_balance, created_at) FROM stdin;
d95fbb90-f16d-456c-aafa-8cba60a98ade	1	الاصول	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:27.952779
b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	11	الاصول غير المتداولة	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.013618
6a5fbdd4-e880-45ef-b29f-01c2f4556949	111	الاصول الثابتة الملموسة	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.018256
a4e39668-448a-462f-bf02-3782f426b9bc	1111	الاصول الطبية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.021888
bf559ce4-f31b-4de7-abfe-56a77954f62e	11111	اجهزة عمليات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.035376
0cb664b9-43a0-42bf-a570-7ca7d02651c1	11112	اجهزة عناية مركزة	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.048182
8fc5e66a-56b9-436d-8fa7-1231423d5833	11113	اجهزة مختبر (تحاليل)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.052061
49567643-2651-4576-94c1-639c5342de6a	11114	اجهزة اشعة – ايكو	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.055166
23f7c2f5-5bd0-47e9-bcf2-9111d42dd28d	11115	اجهزة اشعة – عادية / سونار	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.058716
dc0577b2-ab2f-4cf7-9f78-ac9e7a4eda86	11116	اجهزة اشعة – مقطعية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.062472
1f3ea672-aa32-488a-bd51-25ac415b6a69	11117	اجهزة اشعة – رنين مغناطيسي	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.06575
4a09fbf5-1326-42fc-b5fd-46b8f055dc35	11118	جهاز تعقيم (1)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.076783
fd512027-621a-4e34-b347-bcb2f41e0c3d	11119	جهاز تعقيم (2)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.087396
d6bc4e7a-025a-45ee-8aeb-5a2fc69cf5e0	111110	جهاز تعقيم (3)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.092018
0ada7982-1ca1-4ba5-b5e6-617db23be9f1	111111	وحدة مراة وتوليد	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.096597
dd2e3799-addf-462c-9a6c-dfdb48f66b32	111112	اقامات (غرف / تجهيزات)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.100256
abe14b47-0d8f-42db-802c-08952d93e4e1	111113	عيادات خارجية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.116491
e63a6248-a77a-4c30-8174-2545e20950bb	111199	Placeholder (اصل طبي جديد)	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.119535
54ade4f7-1e57-47ef-b619-02e70ea28207	1112	مجمع اهلاك الاصول الطبية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.135138
e9167701-07ae-433f-a56a-e6eb408fbb76	11121	مجمع اهلاك اجهزة عمليات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.140272
6c9d60b2-9ddd-4d3f-ae3f-8b3a77279672	11122	مجمع اهلاك اجهزة عناية مركزة	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.143018
c019f51a-316a-4b7f-b65f-a66b77b63dab	11123	مجمع اهلاك اجهزة مختبر (تحاليل)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.146101
75d00e93-f7b8-4ed6-9e61-44d2d83c51a4	11124	مجمع اهلاك اجهزة اشعة – ايكو	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.154938
3463a9f0-85fa-4334-92d7-cabf2b6b46e1	11125	مجمع اهلاك اجهزة اشعة – عادية / سونار	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.166686
6e256d32-9ffd-4fd8-ab90-609404dfa47b	11126	مجمع اهلاك اجهزة اشعة – مقطعية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.170193
f99bf1cd-2fac-4c4e-8b90-8c2d5cb28cee	11127	مجمع اهلاك اجهزة اشعة – رنين مغناطيسي	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.173814
3292ca45-51df-445c-9ac4-dd2a4cb99ce6	11128	مجمع اهلاك جهاز تعقيم (1)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.177641
416a9919-02d5-4daa-969b-45df42590aaf	11129	مجمع اهلاك جهاز تعقيم (2)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.181281
07fb1208-fa12-4546-bf57-d8994048f2a4	111210	مجمع اهلاك جهاز تعقيم (3)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.185467
57e21353-011a-49a0-a554-8e3d1d18a1df	111211	مجمع اهلاك وحدة مراة وتوليد	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.188237
bcf2a345-294b-4d8f-8e10-a7adb86e6811	111212	مجمع اهلاك اقامات (غرف / تجهيزات)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.190399
e63406f7-3ada-411d-a294-3920aba65569	111213	مجمع اهلاك عيادات خارجية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.194361
40eccdc6-3cd5-417b-8644-6f5ac94a656d	111299	Placeholder (مجمع اهلاك اصل طبي جديد)	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.197317
b88501eb-4825-4a2e-aefc-c920a9dc455d	1113	الاصول غير الطبية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.217412
318976df-6071-46b4-a068-6621fd2add76	11130	اراضي	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.222989
ae5237a2-cbcf-4f89-b5f5-ee41701b3411	11131	مصعد قبلي	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.245271
95132279-b156-43e6-b81d-5d76faf23056	11132	مصعد اطباء	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.264146
07e8a319-180f-4463-912f-0f280dc903f4	11133	مصعد عمليات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.266592
794ec8c3-28bd-4eb8-a744-1d338a3569f9	11134	مصعد اوسط	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.269098
faff157a-2386-4005-86be-23efe9328b3f	11135	محطة طاقة شمسية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.284749
93f0165d-2a68-4851-8f7b-c7ebed719b76	11136	مولد ديزل	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.287348
5a5a8a81-2385-41cd-a394-58c12c1960fd	11137	مولد كهرباء (جنريتر)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.303099
02ab0797-01ba-4a95-91ca-6dc92b794e79	11138	اثاث وتجهيزات مكتبية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.306664
eaa38b6d-41b9-476c-b9ae-9ef95d40cfe7	11139	الاصول التكنولوجية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.310053
85ad4e41-66fc-4a78-83c2-0ad8cc0465cb	111391	اجهزة كمبيوتر	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.313626
9df63a63-29bc-4b28-b9e0-239068fc3d2a	111392	سيرفرات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.316077
d1d992c0-3d68-4c8b-a2bd-c6da28ce3c68	111393	طابعات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.318285
c8278ed0-e254-44e7-8512-94e46f797ef3	111394	سكنرات (Scanners)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.3242
15bba8c4-f3a5-4814-83a6-2091d8920b10	1114	مجمع اهلاك الاصول غير الطبية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.327219
e52eb620-486e-4d7f-9605-85b66e8fc252	11141	مجمع اهلاك مصعد قبلي	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.33019
c396682f-4deb-4ca6-a2f2-9248dd99b7e4	11142	مجمع اهلاك مصعد اطباء	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.345657
d890c79a-2c86-44e4-8693-81d83e9ef1d2	11143	مجمع اهلاك مصعد عمليات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.354658
e876d3e2-b44b-43aa-bb40-a3f4a465350d	11144	مجمع اهلاك مصعد اوسط	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.35982
f0c2037f-5cb1-435c-b764-2efb2cb7e40a	11145	مجمع اهلاك محطة طاقة شمسية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.364561
555d543a-dfc0-4db6-a271-d0f34f897da4	11146	مجمع اهلاك مولد ديزل	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.367812
189f4319-3764-4ef3-b130-7d1e6437db41	11147	مجمع اهلاك مولد كهرباء (جنريتر)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.386469
b05fa0e7-69df-4d48-83b5-41200d55637a	11148	مجمع اهلاك اثاث وتجهيزات مكتبية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.389891
195faf14-6dd8-418b-b127-8520c1658950	11149	مجمع اهلاك الاصول التكنولوجية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.393976
9c153213-de44-4bc3-94ba-972a84a8b679	111491	مجمع اهلاك اجهزة كمبيوتر	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.398475
131ac28a-88ca-44c1-860e-470ec9d7ce0f	111492	مجمع اهلاك سيرفرات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.409459
578117b6-6931-4750-b6a2-9db55ca210ec	111493	مجمع اهلاك طابعات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.43674
a3177eb4-f84d-4cd5-8bb5-01908da19985	111494	مجمع اهلاك سكنرات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.440931
1c779007-fff3-4b57-a227-e4495217d24a	1115	اصول الصيدلية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.444024
5f31deb4-061e-4416-b58e-c208e2a46190	11151	صيدلية – اثاث	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.446972
6050bd43-8e3f-42c1-b63e-039339753d97	11152	صيدلية – تجهيزات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.449761
83c562ee-c493-4d9e-8b54-65554ad3e991	11153	صيدلية – اجهزة	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.45249
8801bdb4-f423-403f-b106-2b21add161e8	11159	Placeholder (اصول الصيدلية)	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.455304
9690a3b0-de88-46ab-ab53-743ca6c00513	1116	مجمع اهلاك الصيدلية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.460723
e7702aef-d5c4-43b6-b3fc-ca27b8b92d15	11161	مجمع اهلاك صيدلية – اثاث	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.463677
faa8866d-8653-481a-bd6c-5aa269df3ab7	11162	مجمع اهلاك صيدلية – تجهيزات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.475959
40bddef7-b874-42af-9e1f-b045ff4ad0e4	11163	مجمع اهلاك صيدلية – اجهزة	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.484716
cae695ec-8bdc-4d8c-8109-b24df4720017	11169	Placeholder (مجمع اهلاك الصيدلية)	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.488622
80ac6f86-3ac9-472e-90d8-1037c939361e	112	تحت التنفيذ	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.491883
2427ea57-2058-44b2-ad3e-07d994a59138	1121	مشروعات تحت التنفيذ	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.494675
772911fd-e1f9-4b9f-950c-de0af7981e10	11211	مشروعات طبية تحت التنفيذ	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.49788
88f0d6b0-08f0-40bd-ba78-12af325a2b0c	11212	مشروعات غير طبية تحت التنفيذ	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.501193
9e2700a6-0623-4671-bcf5-4681c6c92075	11213	مشروعات تكنولوجية (انظمة / IT) تحت التنفيذ	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.503782
a3d10dd7-4160-4dd3-bad5-46c8aa59b65b	11219	المدينون الداخليون	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.506629
e332f234-eff2-4c59-ad5d-7cc5915979be	113	ضرائب مؤجلة (اصول)	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.509496
d9961de4-bdf0-403f-b965-4379a589981a	1131	اصل ضريبة مؤجلة	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.512841
41d64019-08a9-494e-9b3e-7a0f2d2f9ade	114	فائض اعادة تقييم اصول	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.51563
016a0a67-d097-452b-884e-36968963337f	115	اصول غير ملموسة	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.518877
95c5dedf-bc68-46bb-a08d-64ac3b9021cb	1151	تراخيص البرامج والانظمة	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.521355
b355afc4-fc36-4c60-b7bb-f373e6b6e3c1	116	مجمع اطفاء الاصول غير الملموسة	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.524936
fd3c5274-abd2-4052-b285-5f6e6ab275d3	1161	مجمع اطفاء تراخيص البرامج والانظمة	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.527787
eeb5ab48-2ad3-426e-992e-9ff7ec12b8d9	119	حسابات مستقبلية (Placeholder)	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.530348
c5735817-e967-4eaa-9c62-cf3ac5af4273	1191	Placeholder للاصول الطبية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.535674
6fe7709a-0725-4ffd-954d-bc016b1eb813	1192	Placeholder للاصول غير الطبية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.539104
18608fbf-b16f-4eda-a05e-6eec3a86a995	1193	Placeholder للمشروعات تحت التنفيذ	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.542153
cb06395b-db69-49bb-ad4f-66fa5a1c722d	12	الاصول المتداولة	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.545106
ba18a965-6373-4a31-8103-7f4af680ac21	121	النقدية وما في حكمها	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.548809
f95b5c7b-6a81-43f7-a88b-9ab0a723e625	1211	النقدية بالمستشفى	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.55936
38d88520-0dae-4b6f-8642-7e338ed5d5b2	12111	خزنة رئيسية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.56321
34a3e990-fa53-4626-8d61-c9e5c8f0885f	12112	خزنة العمليات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.568673
d315271b-53cf-4b31-bce2-fbec5dc7bbf5	12113	خزنة الاقامات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.577558
22efce5f-217f-4008-abb8-163ba3e10ae7	12114	خزنة العناية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.580917
a1a998a3-bc18-4180-b0b3-59ea15bc37c0	12115	عهدة مصروفات العمليات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.5845
d8e3bd9f-2d3f-43aa-9bc5-c9b7877ef453	12116	خزنة المعمل	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.587784
2e5dc537-c4d5-4f0b-970a-99c8b2eec927	1212	النقدية بالصيدليات	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.591234
759d6696-d436-47a7-ba28-528bbd6a6f7c	12121	كاشير عنتر	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.594388
db71b5c2-eb8a-4435-be93-763dff953d16	12122	كاشير مدين	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.59738
fda12a7f-f12e-499a-bda9-d0a0cdfc1d44	12123	كاشير حمدي	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.600682
71014890-44c6-4f70-8919-c2ed6758340b	12124	كاشير الطوخي	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.602833
68bde845-1bdb-4cd3-a120-d965b1098bac	12125	كاشير عمرو	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.605948
97328338-bccb-4e01-8f56-4b2045adb7ce	12126	كاشير حسين	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.609186
b4c52bdf-a102-42c0-a3be-3ead6cd1b500	12127	عهدة امين الخزنة	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.612456
fe9ec01d-f18e-49d4-92e3-6031c7f2e15d	12128	اوراق نقدية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.625089
07e0a556-cea0-41a1-9779-a83c9f0c281a	1213	الارصدة البنكية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.630822
948602cd-2384-4385-9d4b-a73138bdd503	12131	بنك مصر	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.639098
11066178-3793-40c2-a5dd-4617a9290704	12132	بنك التعمير والاسكان	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.641832
adde8494-9503-4164-a80e-fa5351390794	12139	حسابات بنكية اخرى (Placeholder)	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.647206
c9a56204-110a-489b-88f7-60ffe7bd4d3b	1214	محافظ الكترونية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.650634
e20dfaed-7b04-4d01-8210-5ce082a2c4c8	12141	محفظة انستا (Instapay)	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.653512
ef38ad34-f135-49c5-aac1-b0be844b68e9	12142	محفظة Vodafone Cash	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.665602
b61f48fa-c0a3-4acd-9aad-61509263b62c	12143	فوري	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.670142
99116de7-5240-4d59-862c-1bfe2aae9ae3	122	الذمم المدينة (المدينون)	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.675203
da8c08d0-68f5-4c33-a455-6b7840c49376	1221	ذمم مرضى افراد	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.678473
fc16f143-aff3-49f0-82d3-d36af3d4cd68	12211	ذمم مرضى افراد – خدمات مستشفى	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.680913
e1db6bf2-0b4b-434d-9e00-d6d7e5427005	12212	ذمم مرضى افراد – صيدلية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.68319
7fc42f1e-2a27-480c-a697-ec295addf234	1222	ذمم شركات وتعاقدات	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.687507
ac7cb9fd-eb29-4e74-a8a0-3466fdb67bbc	12221	ذمم شركات خاصة (نقدي / آجل)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.691427
8e36f843-d308-4b15-9f74-5334004f3778	12222	ذمم جهات حكومية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.693673
291a93a5-6ab9-4583-9ddf-2b59ed480e02	1223	ذمم  تامين طبي	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.695719
328671d6-3dfe-4240-b7de-b751589d6bc7	12231	ذمم شركات تامين طبي	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.698411
ce7811d3-b5db-4e24-af74-96e28853a9ee	12232	ذمم مرضى تامين (مشاركة / Copay)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.700468
a6b25d06-cd2e-4f09-aa9a-86b5f0cdb97a	1224	ذمم مدينة اخرى	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.705101
7d9a00b8-f486-4c2b-aeac-bae5c7887d93	12241	سلف للعاملين	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.708249
c2b41566-6f91-4c20-89b6-365e22f2d65e	12242	ذمم مدينة (حضانة)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.712257
e115b3d6-6710-4430-82e1-a872961c5dc0	12243	ذمم مدينة (د/ حسني)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.714853
5f797c57-a02c-4413-a6eb-2274b9f7b659	1225	مخصص خسائر ائتمانية متوقعة	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.718105
f06bc508-69f5-4760-870c-d311d2d39c92	12251	مخصص خسائر ذمم مرضى افراد	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.721052
31293f95-320e-4acb-939f-d7140a7c1c1a	12252	مخصص خسائر تعاقدات شركات	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.723959
3366476f-e77d-4675-ae93-f90f2a84d2dc	12253	مخصص خسائر تعاقدات تامين	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.727045
9d8deb0e-fc7f-4755-92b9-56346123519c	1226	ذمم مدينة – اطباء (حسابات جارية)	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.729634
bafb7110-9d43-4ff4-8604-2358798428f8	12261	ذمم مدينة – اطباء عمليات	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.732611
42dfb7ee-198a-49b7-a5a7-9faf3a13eb2e	123	المخزون	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.742827
f8a4130a-3eb9-4f78-b504-18166ededa5b	1231	مخازن الصيدلية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.745948
f7c0a7c3-1098-4ee4-be58-acc2669b2dea	12311	مخزن رئيسي ادوية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.748554
54acd876-5421-404b-9e25-e7b1007213af	12312	مخزن صيدلية خارجية (د/ حسني)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.750862
cdfbfad6-16a7-494c-a45d-1a242dd2e7fa	12313	مخزن صيدلية داخلية (الثامن)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.753937
f83dc29c-543b-4139-8c57-54aac56f87cb	12314	مخزن التالف	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.756534
ddabb869-324e-48ac-9ab8-6a943a54dd94	12315	مخزن الاكسبير (منتهي الصلاحية)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.758817
ff0a4d17-9b64-4b23-beb4-19c81efc4d73	12316	مخزن خاص د/ حسني	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.762005
6b82d6b8-573a-4d4c-90fe-55a73982c708	12317	مخزن خاص حضانة	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.774753
98bcd72a-4667-4d9f-8a39-00e46d691339	12318	مخزن رئيسي مستلزمات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.778867
faf6b044-dff2-4ab5-850b-a7a0aa1b5997	1232	مخزن العمليات (ادوية + مستلزمات)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.781534
4b297fea-7209-48b2-9bbb-aa2d1ddc0b80	12321	مخزن العمليات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.787358
7ed0fe8a-0978-47d0-9e8b-69f59481bb15	1233	مخزن العناية (ادوية + مستلزمات)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.792667
73cb31ed-055e-481d-8a6f-0362152359b7	12331	مخزن العناية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.795462
57bc4c87-7a46-4a55-8cd4-d88f7e6d2b81	12333	مخزن العناية – مستهلكات عامة	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.798373
11f9410a-d59d-46d9-89ab-cabacf19582b	1234	مخزن الاقامات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.802381
2c87c5cd-7069-4a7f-b0d9-61a343a47467	12341	مخزن اقامة – مستلزمات	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.805747
f1e44fbb-cbee-4521-a835-9e4cff327e14	12342	مخزن اقامة – مستهلكات عامة	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.808143
845621eb-2d04-48a2-bb26-ed0aaea4284a	1235	مخزن المختبر	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.810651
d8677e9a-0e50-4019-99eb-c7a0e9e9423e	1236	مخازن التعقيم	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.812636
f109597a-af95-4074-b999-af724dbef896	12361	مخزن تعقيم (خام)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.815149
19bbd06a-e3dd-400f-92c3-b3b113674c3b	12362	مخزن انتاج تحت التشغيل (تعقيم)	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.817388
7c1efbc6-6888-48e7-a85d-45087d4c2e8d	1237	مخزن رئيسي عام / اخرى	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.824791
144912af-53c4-45dd-88ee-dcb2bee0e74b	12371	تحويلات مخازن جارية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.827682
f39326cf-f0c4-415d-952b-a942ae32f471	1238	مخزن الغازات الطبية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.831415
9fe5718c-3ed4-4d6c-90f7-d54bcc79f475	1239	مخصص هبوط اسعار المخزون	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.834469
299661f8-0f9f-4c4d-a19f-303ab6fe08be	124	ارصدة مدينة اخرى	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.837952
deb7d16b-769a-4b6c-afe6-2d70d2d1e495	1241	عهد تحت التسوية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.845555
95170806-0518-49f0-bb29-7d590c2206d8	1242	مصاريف مدفوعة مقدمًا	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.855221
a5cc3376-02d1-4899-9d0b-54bd87448a7a	1243	ايجارات مدفوعة مقدمًا	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.857884
3ee9ac8b-6a1c-408e-8a50-9a3cba4a0259	1244	تامينات مستردة	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.860222
6877e7a8-523e-41ed-997e-4c06d5fd1280	1245	ارصدة مدينة اخرى متنوعة	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.86248
977090d7-0c78-4f33-a224-329757e4196c	12451	مستحقات مشاركة جهاز الرنين	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.865477
487eb631-352d-43ab-b0e6-e10f4956c2e8	12452	مستحقات جهاز الاشعة العادية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.885181
39e4aa45-41ae-4ebc-b6d6-dc35342fc684	12453	مستحقات جهاز وحدة المراة	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.895193
ffd46ac5-a989-4770-bc5b-ee2338114e07	12454	مستحقات جهاز الاشعة المقطعية	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.89864
58febb0d-2a9f-4403-8038-33bcf20bee35	12455	مستحقات جهاز الاشعة السونار	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.903793
ed2ca148-c258-4417-98d0-e93022ed148d	12456	مستحقات جهاز الاشعة الايكو	asset	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.906448
d3c7f57d-9665-48d1-b91f-aa9c035a50ab	125	شيكات واردة	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.909116
4099b744-1322-470c-bd7e-e31ec5e6a892	126	ضريبة قيمة مضافة	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.912031
2d69f724-9af6-4fb0-9481-9df637598ad0	1261	ضريبة قيمة مضافة – مدخلات (مشتريات)	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.914566
40b9df68-b03d-4c2b-b22e-0c8b26227678	127	ضرائب مقدمة	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.924857
b15d5f69-b403-4766-a08b-91506f53a996	1271	ضريبة دخل مدفوعة مقدمًا	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.943306
ce19d296-ed6b-4dd0-a158-933e6ef77c39	1272	ضرائب خصم واضافة تحت التسوية	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.946526
ca56290e-2750-42cf-8ff3-f6c2998f15f8	129	حسابات مستقبلية (Placeholder)	asset	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.950989
45a6a4d8-9926-4702-801c-28a2d9af9ea6	2	الخصوم (الالتزامات)	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.964227
334b518a-1d22-43fe-9fb3-551c06de3d25	21	الخصوم المتداولة	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.966838
662d9419-d3cb-4996-926b-8945e63128f1	211	موردون	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.969235
41162c08-ff56-4a7a-ad85-577840ad905a	2111	موردون صيدلية (تشمل عمليات + عناية)	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.971814
8d1fafe8-5908-423a-a2d4-72a25f9a2cd5	21111	موردين ادوية صيدلية	liability	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.975604
ef8002a9-6391-44c6-8f70-ef630089dfc5	21112	موردين مستلزمات صيدلية	liability	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.978507
741b5316-a9d2-4e35-8d0b-a9cba4d07577	21113	موردين توريدات للعمليات (مدمجة مع الصيدلية)	liability	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.982088
44fa34f7-2c90-4cd1-be7a-d684c4ae6803	21114	موردين توريدات للعناية (مدمجة مع الصيدلية)	liability	\N	1	t	t	\N	0.00	2026-02-05 16:35:28.986481
9a9c6337-4c9f-450c-a10b-109a93719584	21115	مرتجع مشتريات – تحت التسوية	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:28.988993
9b2fcb94-fee3-44a5-a4f7-54d4ff02bc6b	2112	موردون مختبر	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.022169
9abe2aea-e4dd-46b4-9a1e-699192f22e0b	21121	موردين اجهزة مختبر	liability	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.026757
285648e4-1a1f-479d-8da5-3f2ee9631c60	21122	موردين مستلزمات مختبر	liability	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.030279
30ed962d-b056-4812-bff0-6f3f905342b8	2113	موردون اصول ثابتة	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.03298
6661c97f-aa96-4cbe-a429-b40f34002b4e	21131	موردين معدات طبية	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.035352
bd466a94-ed22-4bca-8451-3fac704a95f0	21132	موردين معدات غير طبية	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.038068
3f8f3425-cc51-45e4-b392-9184f0dd84b2	21133	مستحقات الملاك مقابل بيع اصل عقاري	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.054565
9ecd0478-dfb4-4103-88cc-71f2e3192ed9	211331	مستحقات مالك 1 (د/ محمد نجيب)	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.058051
91cc6628-3db1-40ab-83a8-79fcce5a1833	211332	مستحقات مالك 2 (الحج فتحي)	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.060992
3b3be2ee-3dc5-44f4-a3a1-f890cb355b4e	211333	مستحقات مالك 3 (د/ حسن)	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.063832
3e9e8e5f-ac5e-440f-9ac3-452a5d758c6f	2114	موردون خدمات	liability	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.066778
1e1a7ced-080d-41c2-bb16-09c6ef88302f	2115	موردون خامات	liability	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.069809
52987bdb-7402-4d95-8dde-6edea5e2ec2a	2116	دفعات مقدمة من مرضى	liability	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.07208
af2e475d-9845-40ee-bc0b-c34bbd41561f	21161	دفعات زائدة من مرضى	liability	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.083237
60e240fd-fbee-4395-98e8-2d7e5657ade0	21162	دفعات مقدمة – تحت التسوية	liability	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.085858
86f07307-9199-44e1-85e6-8d9053d94d31	2117	ضريبة قيمة مضافة – مخرجات (مبيعات)	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.087862
162fa4b5-dab6-4a32-838b-e843fff70027	2118	دمغة طبية	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.090854
0c024402-6940-4bb8-a40f-fd22d69a8408	2119	حسابات مستقبلية (Placeholder)	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.093217
cfabcb24-7cbc-4313-bc25-2143524e408d	212	مصروفات وتكاليف مستحقة	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.095573
4b273357-05af-417a-9200-b538dc8b07c1	21211	كهرباء مستحقة	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.098283
b2025bd3-3e4a-42a1-9cce-560c77ff3440	21212	مرتبات واجور مستحقة	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.101071
7be11a8f-749b-476b-ba91-3a4ef08ae8b2	21213	تامينات اجتماعية مستحقة	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.10478
fd0121b6-f24e-40d8-886a-3df6198a5ae6	21214	ضرائب اخرى مستحقة	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.109271
b34e75b4-659b-4db6-925b-13fade494fb7	21215	مصاريف صيانة مستحقة	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.125106
76283476-3964-48dc-a2bd-5d3f77c6a417	21216	مكافات وبونص مستحقة	liability	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.128075
d7ee5811-c8e5-4dd1-a524-e2a386f099e3	3	حقوق الملكية	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.130696
2068b880-db16-4550-99bd-18af47223d25	31	حقوق الملكية الفرعية	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.135856
9468ed2a-fa30-4bc9-ac00-9f92de9bbf6c	311	راس المال	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.140882
74a12180-5e4b-4d6e-b454-00e158fb03fc	312	ارباح وخسائر مرحلة	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.142887
2dfc7a2b-b55a-4ba9-bccd-728217376458	3121	ارباح مرحلة قابلة للتوزيع	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.14654
db373186-a21a-4465-84a9-6ca9fd844ed5	3122	ارباح مرحلة محتجزة	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.14925
77c30bd5-2e27-4fef-9e5e-fd3c1e40bf30	313	احتياطي نظامي	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.165579
bc028a41-d2fe-4ca5-994c-8f19a8ddf1cb	314	توزيعات ارباح	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.177024
51c413c7-4e00-4e7a-9038-8a97d36c4707	3141	توزيعات ارباح اجمالية معلنة	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.179702
e67cd226-3772-4e72-b7bd-e9fb0cdd4669	3142	توزيعات ارباح حسب الشركاء	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.184891
f8066c77-16e9-4930-8275-a59252f1d108	31421	توزيعات ارباح شريك 1	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.188093
4d4290b0-a7ab-4e6d-9893-84ac633d3f33	31422	توزيعات ارباح شريك 2	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.190393
69397eb0-978b-4bf1-9ad4-563b9a74809b	31423	توزيعات ارباح شريك 3	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.192577
4d58b3b4-0f65-4e67-be27-e8d6b24f8502	31424	توزيعات ارباح اقلية	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.195278
1a5862ed-0b15-4b47-83ce-14e7bb1ad5ed	315	مسحوبات الشركاء	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.197736
51017df2-01bb-4095-bcf8-cbf49bd2f3b9	3151	مسحوبات شريك 1	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.200288
affa01ad-4a2f-4b0b-907a-62ce6abe245d	3152	مسحوبات شريك 2	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.202594
b624e136-8695-4846-9176-e79686816905	3153	مسحوبات شريك 3	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.205808
c21d8091-9e0e-443c-9851-a72454e90072	316	احتياطي طوارئ	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.207945
cad15791-931e-42eb-a598-b26928cc0905	317	فائض اعادة تقييم الاصول	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.211318
a69f1b3b-c8b1-416c-aeab-16fb4348e7b7	318	احتياطيات اخرى	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.213799
c07e1292-d315-466c-b286-f62a656517b0	3181	احتياطي توسعات مستقبلية	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.227685
2923ad34-db78-404e-9f63-43be5cb544da	3182	احتياطي ابحاث وتطوير	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.233162
2c8ee685-6c4b-4529-9632-9c1f9819b180	3189	Placeholder (احتياطي جديد)	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.239496
dc6cde6a-7af8-4f26-a5d8-b240cc88a138	319	حسابات ختامية وتسويات	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.242357
3a65955a-366d-496b-9d07-3b4a24da7fb5	3191	ملخص الدخل	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.257744
24e0b6cd-d99c-462e-ae55-0a65d856b414	3192	تسويات فروق عملة / اندماجات	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.262115
8b6c208d-bfc0-4fff-9b7d-c284492e7de2	320	حسابات مستقبلية (Placeholder)	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.267016
621929ef-18d2-4862-ab0c-bd674fe5d07a	321	حقوق اقلية	equity	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.26996
83d72877-cba9-48b8-be7c-1096beba3a57	4	الايرادات	revenue	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.274271
ac84c4ba-ceab-49b1-a62d-6f80077293b2	41	ايرادات المبيعات والخدمات	revenue	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.278565
a8f1a7f1-6e67-4f0c-a2f6-d790ac9c3ab1	411	ايراد مركز العمليات	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.281869
2310af58-497d-428c-9c3b-9793d3f94b3c	4111	ايراد ادوية العمليات	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.284532
12ada3e9-df9c-4eb9-99c6-ffe2b999332c	4112	ايراد مستلزمات العمليات	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.301712
ba7d71f5-fd22-498b-ad0c-5a186709cc19	4113	ايراد خدمات ادارية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.30472
2f2f6589-f1c0-465e-96b2-773f0823e19f	4114	ايراد استخدام اجهزة العمليات	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.316846
565a0173-0ac5-4ba7-be35-a3c45f94d6c6	4115	ايراد غازات طبية للعمليات	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.324427
c120f2d0-8e4a-4ad7-9cf2-d40ab95ae9ad	4117	ايراد خدمات تمريضية العمليات	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.328138
597ed060-8687-430c-b68e-e7a1a619eb36	4118	ايراد فتح عمليات	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.330624
f5ace5cd-af27-49cc-89b9-ac886a4cb893	412	ايراد مركز العناية المركزة	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.333182
818d8d79-1c3e-42c1-99a0-561c94cf23fb	4121	ايراد ادوية العناية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.335495
39f9ca51-5f59-4714-9063-c558f94cfa54	4122	ايراد مستلزمات العناية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.338367
9b36ffae-4d4e-489a-a2d5-6d4fbd831342	4123	ايراد خدمات طبية ايكو بالعناية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.340632
24f09666-2187-4020-b156-25e50b648286	4124	ايراد استخدام اجهزة العناية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.343031
37e5a65d-f416-4c02-a3f8-d143c2f8f1bf	4125	ايراد غازات طبية بالعناية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.345923
1131d1d9-1a9f-46a3-890a-4626831a947d	4126	ايراد اقامة العناية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.348553
59d9bc21-3300-409d-98ed-da286f307eca	4127	ايراد خدمات طبية اشعة (طيبة) بالعناية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.365167
14f2845f-ba75-428f-af15-cdfd50db790e	4128	ايراد خدمات العناية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.368308
fb9b4aca-dd70-4b59-a532-84da3273d40c	4129	ايرادات مستقبلية (Placeholder)	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.371405
d226fc9b-fed3-40e4-8b8e-77690972de1e	413	ايراد مركز صيدلية خارجي	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.3746
bc4f574f-ce77-4666-a33b-219a1eb66318	4131	ايراد ادوية ومستلزمات صيدلية خارجي	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.377106
f355e818-573f-439c-b317-d2a04c799cd6	414	ايراد مركز صيدلية داخلي	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.379982
f24885b1-ea3f-4714-bdf0-cb23cdb5bc89	4141	ايراد ادوية ومستلزمات صيدلية داخلي	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.387674
8c755c4d-22af-49c0-a45f-45d1ce53aa9d	415	ايراد العيادات الخارجية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.394344
234dc458-5369-4991-b487-baeb38f09aec	4151	ايراد قسم العظام	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.398969
d85a77d7-72a2-457b-8804-ee702a001236	4152	ايراد قسم انف واذن	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.40168
0a242ac1-ebee-4800-8fc4-7f2f0832ed29	4153	ايراد قسم التجميل	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.405427
c3a71715-e687-4e7a-b0e7-ccd7d075c24e	4154	ايراد قسم الباطنة	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.408855
b5329798-0e12-4092-b42a-404583890bc1	4155	ايراد قسم المخ والاعصاب	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.41159
8e2f78b6-8c65-47ce-9600-3c76bea30d9f	4156	ايراد قسم الاورام	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.414741
3c75a6a2-9758-4c94-b66c-235cf9dd82f6	4161	ايراد مركز البوفيه	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.423165
c2a624c9-a3b0-47af-b3a6-e31c8287b94c	4162	ايراد مركز المطبخ والمطعم	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.426082
62e281c0-dc8e-423b-aeda-1073ba3d177c	4163	ايرادات جزاءات وعقوبات	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.429285
db3c2633-eb20-4a03-9261-3acd3941a733	4165	ايراد ايجارات العيادات الخارجية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.437775
5b522629-6800-4bac-a09f-6fa78a0259d9	41651	ايجار عيادة مخ واعصاب	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.443107
4daeb8d8-a330-4775-be8d-4700f830d310	41652	ايجار عيادة انف واذن	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.447127
63830b7d-ada0-41fd-90f4-78cd167deb27	41653	ايجار عيادة تجميل	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.454246
a933d468-e9f4-41ee-ad39-f2149957dd7a	41654	ايجار عيادة باطنة	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.457685
77172467-1388-4e2f-a270-4146331d4ffd	41655	ايجار عيادة صدرية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.461299
9429f0a8-d1bd-47de-abb4-9d76d9454072	4167	فروق دمغات	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.46471
38b888a4-7e19-4582-b2b4-5bf11790bec7	4168	ايرادات فروق خصم منبع	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.4843
b04f385a-9ed9-449c-9872-bc882d3f3728	4169	ايراد مشاركة تشغيل اجهزة الاشعة	revenue	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.487068
ef7099b6-570e-414a-9c9a-6be08e4b32d5	41691	ايراد مشاركة تشغيل جهاز رنين MRI	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.494497
abc129b5-ea1f-4cd6-8dd4-f525d8d9c2c5	41692	ايراد مشاركة تشغيل جهاز مقطعية CT	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.500001
2add593c-4af9-46bd-880a-eaaed4e56a69	41693	ايراد مشاركة تشغيل جهاز اشعة عادية X-Ray	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.504952
c7bd9f05-f2b4-4226-a06c-fafbdf91472f	41694	ايراد مشاركة تشغيل وحدة المراة (سونار)	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.508554
0000dd5a-5387-4f82-a802-1de6dff724b1	41695	ايراد مشاركة تشغيل جهاز ايكو Echo	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.511749
96006dd3-48b6-4ec8-914e-b2d5277597d1	4171	ايرادات خدمات تمريضية بسيطة	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.534738
7d1e14df-4bd7-4271-bf9f-6c8b886d2818	418	ايراد المختبر	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.546271
eecfa30e-c234-4a80-987f-a9b567a25ec8	4181	ايراد خدمات المختبر العامة	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.551825
161b8046-2a33-40b5-851b-540f1278d852	4182	ايراد تحاليل مختبر	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.556369
c7cacd15-4710-4507-9a39-847b9ec31321	419	ايراد الاقامات	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.559136
9702e908-7e23-497a-b75a-224baaa863d8	4191	ايراد اقامة جناح مميز	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.575285
789f301e-d85c-4fb9-a090-2ec3ec12d477	4192	ايراد اقامة درجة اولى	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.586729
c2712536-675e-44e6-b64b-021eadcbfc73	4193	ايراد اقامة درجة ثانية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.589907
d8c59829-b764-4deb-ac82-ac37a985576c	4194	ايراد اقامة عنبر	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.593129
021cd8fc-b1a3-4b15-aace-14923906453b	4195	ايراد اقامة افاقة	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.598533
05cb2e92-bea1-456d-95e9-3f8cb48d0c5a	4196	رسوم تذاكر دخول (مرتبطة بالاقامة)	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.602489
00afc037-8172-49c8-a208-35ed6c6bb7f9	420	ايراد التعقيم	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.606201
8460157c-d293-4dce-a707-81f60fe7c88f	4201	ايراد تعقيم لطرف خارجي	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.615399
bfb571fd-c7bd-4f00-ba63-3ec9cb576655	421	مخفضات الايراد (Contra-Revenue)	revenue	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.618656
6a1429ac-8ad2-48a8-add0-8f4dc67ac665	4211	خصم مسموح به (عام)	revenue	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.622994
657756c4-5720-41ae-86d6-abc418362483	4212	خصومات تعاقدية مع شركات التامين	revenue	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.628153
75e96eac-69a1-45fc-9fb1-748737424130	4213	رفض مطالبات التامين (Denials)	revenue	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.631964
6420c481-afb5-45f3-87f9-10d4664502ec	4214	خصم مسموح به العمليات	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.635214
d99aff0c-7c92-4e7f-a16c-43f4f9ee7d44	4215	خصم مسموح به داخلي – العناية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.648203
227e5b71-a701-4767-8e88-0dfc7eef052b	4216	خصم مسموح به داخلي – الحضانة / الاقامات	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.655753
1692aa96-214b-495f-8db3-1dfe175525de	4217	خصم مسموح به المختبر	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.659172
a238b355-e19b-4141-970a-9d380cd27a3b	4218	خصم مسموح به صيدلية خارجية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.662182
22c3e7d6-6165-4434-8606-b7baa63f2d56	4219	خصم مسموح به صيدلية داخلية	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.665988
5d30145a-ffff-4da1-b114-007164f9c01d	422	ايرادات خصومات مشتريات مكتسبة	revenue	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.671505
0cc21d89-8451-4a94-95f9-0656f6e6cae3	4221	خصم مكتسب على الفاتورة	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.675191
a83b74ae-f61a-4692-baf0-37f03a12ad13	4222	خصم نقدي اضافي على المطالبة	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.678291
e8d285c4-7fe2-4663-be0c-30d174a638bd	4223	خصم على اجمالي المطالبة	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.681472
5145ddd1-78dd-478e-b853-d3ba33175d20	4224	خصم تعجيل دفع على المطالبة	revenue	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.684026
b6b21fdc-a7ea-41e2-adc6-fc9758bb84ac	424	الايراد الداخلي	revenue	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.690342
90e1829b-179d-4d94-b4b0-fb3724b2721d	4241	ايراد داخلي مجمع	revenue	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.695341
1b0aadd1-fae3-4a9b-ac45-51b46f259e2d	429	ايرادات مستقبلية (Placeholder عام)	revenue	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.699059
37291b44-77b8-4586-bd54-e3fba522e4ac	5	المصروفات	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.702296
16384bd1-7ca1-4a94-9639-73ef0e96de1e	51	تكاليف مباشرة	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.706487
db1ca5af-9460-4e12-bcad-06f078632d2f	511	تكلفة صيدلية داخلي (الثامن)	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.710409
1289d2db-6c48-4625-9d99-233655771966	5111	تكلفة ادوية ومستلزمات مباعة صيدلية داخلي	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.72555
b5a14345-8a0c-4fce-9840-d3473f20b52a	5113	تكلفة مستهلكات مباعة صيدلية داخلي	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.728669
8f03f43c-0551-4b3f-8388-760f736af695	512	تكلفة صيدلية خارجية (د/ حسني)	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.732199
1033d52a-7940-4e45-b82c-b11b57de6308	5121	تكلفة ادوية ومستلزمات مباعة صيدلية خارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.736097
e0585346-dedb-4f2a-918b-da227f040e31	5123	تكلفة مستهلكات مباعة صيدلية خارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.738975
201b438b-7596-4c76-b0ff-875ccf92ef46	513	تكلفة العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.744743
cff7c510-4566-49da-a370-6115eaa69cbb	5131	تكلفة ادوية عمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.748208
3cb9e657-68fa-4591-a493-0769c7d046ba	5132	تكلفة مستلزمات عمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.751005
41fdede5-34cb-47fe-a863-3d58ca983583	5133	تكلفة مستهلكات عمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.753821
c364f16e-eb56-4f0c-90d4-95d2eece71cb	5135	تكلفة صيانة / تشغيل اجهزة العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.756471
8748fda2-8691-4c77-90e6-74b8cd367d48	514	تكلفة العناية المركزة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.771043
f1d698f0-0510-4e9d-87d7-ef437e4614c6	5141	تكلفة ادوية عناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.77613
91a38951-a2df-48a2-b3ba-0bbfb39ab88d	5142	تكلفة مستلزمات عناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.780118
fd30744b-520e-4f20-9a65-1f3b9034b173	5143	تكلفة مستهلكات عناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.782983
07a51d00-1e4c-4fa9-aa5d-5db93d11b5aa	5144	تكلفة زيارات استشاريين العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.786389
4f682d7a-f2d2-4b47-9f1f-36a3c584428f	5215	مكافآت وبدلات	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.020747
65f90c3a-f0a3-4326-a814-b50c18652a5a	5145	تكلفة خدمات اشعة ايكو مقدمة للعناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.789527
dd9f2f4d-da7e-4a73-a795-1dcb644f6fb9	5146	تكلفة خدمات اشعة (طيبة) مقدمة للعناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.791834
7c4f0e48-af71-4763-ab66-2b891b2af9ba	515	تكلفة المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.795043
c661829a-c365-46cf-93eb-aa42f0404b3e	5151	تكلفة مستلزمات المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.798466
119c938b-cead-4486-abeb-5b7de50c3670	5152	تكلفة انتقالات عينات وخدمات معامل خارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.802273
ecfd5bd5-2944-48a1-93ca-30e7dc51094b	516	تسويات وجرد المخزون	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.805335
4d6f1b56-3388-44ae-b404-37bd7fafeacb	5161	عجز جرد	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.807695
82b5d73e-b63b-489b-a306-955db7859314	51611	عجز جرد مخزن رئيسي	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.811168
94078038-b38a-4fd9-9b6c-2cf3213a0ec2	51612	عجز جرد مخزن صيدلية خارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.820409
de9911e4-761d-453e-b08c-0e05087af66d	51613	عجز جرد مخزن صيدلية داخلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.826585
64d018ba-b94c-48a5-9540-25350c6ae1b6	51614	عجز جرد مخزن عمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.838696
0aa2dcef-dcdc-4679-8c34-320bbd18a4c2	51615	عجز جرد مخزن العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.849412
8116f273-827d-438e-9d3a-0cfe8ea98a10	51616	عجز جرد مخزن التعقيم	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.857316
c6074926-ff5e-465f-aa24-5ab04d94446b	5162	زيادة جرد	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.861866
2d4d8c5d-4f9f-472e-9fb4-2ec7ce7f93fe	51621	زيادة جرد مخزن رئيسي	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.865351
db9ac222-5879-459f-88d2-00ce17b33ad1	51622	زيادة جرد مخزن صيدلية خارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.870909
0d777252-a912-4048-95a8-de3a4d1a506e	51623	زيادة جرد مخزن صيدلية داخلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.873837
2db9d61c-5acd-410f-bd3c-6f93ed75dbff	51624	زيادة جرد مخزن عمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.876212
8ed4a301-ffb5-43dd-baca-b2468265339c	51625	زيادة جرد مخزن العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.880209
f2863ef3-0de0-4d70-97f1-cc5a3ae70130	51626	زيادة جرد مخزن التعقيم	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.883181
c73231d1-6758-4f64-a2d5-0ec0bb0202bc	517	تكلفة خدمات تمريضية بسيطة	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.886636
12e7eb91-b6ed-4b1c-9841-20b061392d4b	5171	تكلفة مستلزمات خدمات تمريضية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.898344
645b21dd-aefe-446e-9f32-61ab80a27ee1	519	مصروف داخلي	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.904747
fa41d78f-3bbb-449a-8020-59d9ecfffccc	5191	مصروف داخلي مجمع	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.907638
590f5e2f-b7d1-4c39-840f-43b30dbc00d1	5199	تكاليف مباشرة مستقبلية (Placeholder)	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.921936
eb9c4364-71ed-4acc-bb0c-b80b7f461a54	52	مصروفات غير مباشرة	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.925118
f6e6b020-18ee-4179-b31e-fcceb74a885f	521	اجور ومرتبات ومكافآت	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.927857
7bcdf354-3bd4-4949-a57b-ca8b3f322b24	5211	اجور الاطباء (لكل قسم)	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.930218
f4387a5e-4bab-4d8a-afb3-cfc9c18cc49f	52111	اجور اطباء العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.944458
8b93ee00-cdb5-480a-93c7-f39d7a2ed2f2	52112	اجور اطباء العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.94771
87a54742-2904-4f96-9ccf-d14dd7695284	52113	اجور اطباء المعمل	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.950127
57ce653f-2201-4f78-8335-8c71d338e659	52114	اجور اطباء العيادات الخارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.952303
bec406cf-b4ce-4fa3-a69e-e8decba9dcdb	5212	اجور التمريض (لكل قسم)	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.955051
378fa08b-1013-4031-94ac-9b59bb53c82f	52121	اجور تمريض العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.957098
8edd59e8-442c-4540-bd7c-5397ec389c66	52122	اجور تمريض العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.95966
cf1cf90a-880b-49ad-838e-cff34f4cf3c5	52123	اجور تمريض العيادات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.961763
57cc920a-13e7-4cc8-b6ae-4289ef99efdb	52124	اجور تمريض التعقيم	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.965438
75c9b2a0-608b-4edb-85fd-481c9e3dcc8b	52125	اجور تمريض الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.967566
79c821c4-6ec1-42c4-9f90-8a52d7324b19	52126	اجور تمريض المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.970014
387160e7-165c-4001-b78c-4055aff24490	5213	اجور الاداريين والمديرين الفنيين	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:29.972313
71d267c2-e099-4438-85dd-50b327cb1864	52131	اجور اداريين العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.975878
f323593d-242b-4cb9-ab81-82633eb14405	52132	اجور اداريين العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.978287
95ccb8fd-0545-464f-ab00-1f8241183814	52133	اجور اداريين المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.98038
2f44d552-5da7-443e-a195-544af12179c8	52134	اجور مدير فني المستشفى	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.98225
3b163db0-27ea-4759-b6ae-2c35861f15ea	52135	اجور مدير فني العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.984874
adb1e536-2f37-4cd8-a063-236eadf85e3b	52136	اجور مدير فني المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.98767
557cf58b-7779-4632-8110-133c3cd3bfd1	52137	اجور مدير مسئول المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.995459
54c27f98-6c2e-4056-981a-ffd0678e6782	52138	اجور مسئولين C-ARM العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:29.998341
74116a04-190b-4ebe-9356-9d130d6aaab8	52139	اجور مسئولين التخدير العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.001808
f6628e44-931a-4a86-8eee-ac33596e6e61	52140	اجور اداريين الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.004729
e33ad8e8-cfcc-49f7-a198-8543ad474d6a	5214	اجور العمال	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.007858
9013c1e1-0f50-4de5-a3fa-9ebe131672e4	52141	اجور عمال العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.010652
6b485237-6c1a-44a9-8ed9-c43dda69d4cc	52142	اجور عمال العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.013986
fdc88c90-c920-4259-b32c-3288780b4455	52143	اجور عمال الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.016311
9e97f9c4-5dc1-4656-838d-829417266f2b	52144	اجور عمال المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.018582
eff5ceb6-ee95-413a-939d-5360ec0fd841	52151	مكافآت وبونص التمريض	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.024758
639045a7-3883-4aad-b4b1-cab4d0cc16ba	521511	مكافآت وبونص تمريض العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.027338
ac0b6621-8b39-48d6-a803-c880829bda19	521512	مكافآت وبونص تمريض الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.02946
89573e3c-d761-4ddc-b58d-44dbf9745826	521513	مكافآت وبونص تمريض العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.033854
e40c232c-2ab4-40d5-b6fc-b5d25dd73b57	52152	مكافآت الاداريين	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.036971
5fe883cc-e033-4642-b19e-9a750519abc4	521521	مكافآت وبونص اداريين المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.03969
77b03d81-764f-4ae1-87cd-27d4980b97be	521522	مكافآت وبونص اداريين العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.04241
d6d9d75a-9059-4e8e-98fe-8eb4543aec33	521523	مكافآت وبونص اداريين العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.044814
4e16ae01-a846-4b54-9737-55ef57c76cb8	521524	مكافآت وبونص اداريين الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.054917
01c9af96-a931-4607-8831-343ce5a22388	52153	مكافآت العمال	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.057926
e32079dd-88d5-4e67-b8f2-4547687489b9	521531	مكافآت وبونص عمال العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.060247
46434b95-b9cf-48c2-8a08-a9471b9b8f7c	521532	مكافآت وبونص عمال العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.063044
c901ed04-8632-4d35-b12e-a2ea13898277	521533	مكافآت وبونص عمال العيادات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.065865
c7f1a877-14b6-4e65-94a5-c5519cf03805	52154	عمولات الاطباء	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.06786
2fd6eb3a-ca9c-4344-9481-a40a563190ec	521541	عمولات اطباء المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.071051
a5cc6a04-96bd-4791-bfae-0a5f6bf5c3a5	521542	عمولات اطباء العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.073606
c63fe60c-aa8d-4606-8525-01d954be8092	5216	اجور ومكافآت الصيدليات	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.07649
45390866-643c-4201-83ae-121a3839cdaa	52161	اجر مدير صيدلية خارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.078894
038d7d39-699f-4076-8585-99a59323c5fa	52162	اجر مدير صيدلية داخلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.081234
7ff40be4-b12f-4a2f-9159-068353cdbb94	52163	اجر صاحب صيدلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.084872
9d02a6bf-767b-4efb-b54b-ec2cc6df0e4b	52164	اجور صيادلة داخلي	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.088174
0941109c-91eb-424e-98f0-d571a590eedc	52165	اجور صيادلة خارجي	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.090607
f0ef5a3b-e9ca-4c10-9d53-f507028e96f6	52166	اجور مساعدين صيدلية داخلي	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.092594
c5d3712a-f022-47b1-8f73-90ff891e26a9	52167	اجور مساعدين صيدلية خارجي	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.094506
74076af3-f906-46c6-9967-0eb21d6aa79f	52168	اجر كاشير صيدلية داخلي	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.097317
164a76db-3cd4-4d63-8201-4db002ab75d0	52169	اجر كاشير صيدلية خارجي	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.100107
5514122a-af7b-4a83-9d66-b4cd2556a945	5219	بونص ومكافآت	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.106628
f93eded5-6b79-46ec-8e37-d265aaa5c0d4	52191	بونص صيدلية خارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.109181
f313b1ce-a87c-4c28-bea5-8737cddf2088	52192	بونص صيدلية داخلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.111702
e80ace32-b99d-4cce-ac2b-9c0eab9ce9c8	522	مصروفات المرافق	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.11408
034827ee-666f-4ed3-96d5-7eab3e9bdaaf	5221	كهرباء (حسب كل قسم)	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.116032
019b480f-645e-444c-9520-07914327f6ec	52211	كهرباء العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.118253
ab1bc68f-0da6-4b6a-b84b-d3ea032f8cc7	52212	كهرباء العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.124568
c946ddcd-0890-4586-aa9c-4493975525e6	52213	كهرباء الحضانة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.127595
92e117a7-7b00-4273-b52f-4f074952f842	52214	كهرباء الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.131809
1b35a9ed-d988-4de9-96f1-4627dd5d7f9b	52215	كهرباء المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.13476
2761fc4c-f691-418f-a370-ca5095480d44	52216	كهرباء الايكو	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.137973
9fb65acf-f570-4720-af3e-df4a05646158	52217	كهرباء العيادات الخارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.140666
312739b7-a183-4233-9449-fa9584937ffa	52218	كهرباء الصيدلية الخارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.143663
f20fa9f9-f548-4352-b048-043d543752eb	52219	كهرباء الصيدلية الداخلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.171314
6f422e67-96f8-4c6f-900c-e4fbccafb485	5222	مياه (حسب كل قسم)	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.194097
1de2fc46-148d-4f68-a444-cdad1f586fd4	52221	مياه الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.204668
d22a1f8d-8841-4770-9e9c-e99117d231f4	52222	مياه العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.218273
3e80419e-89c9-4a28-b083-23c6194793df	52223	مياه الصيدلية الخارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.222826
564baefa-639f-404f-b185-e7db8a1bf86b	52224	مياه العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.227187
886c86e2-6676-4df3-92fa-42cfb14779cd	52225	مياه المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.229732
74b83f4f-5fda-4761-9603-358f2b6b8c42	52226	مياه العيادات الخارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.238405
79782f9d-cbb8-46bd-8208-d51d25c08513	52227	مياه الصيدلية الداخلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.240696
a8bf8394-804e-4955-bf3f-63ccd8abd521	5223	محروقات (حسب كل قسم)	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.245382
fc1fbcb2-bf90-4631-af3f-b42c0bbdec21	52231	محروقات العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.24807
d04a7481-d261-4ace-861e-2351157fcba8	52232	محروقات العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.277103
9f34c1dd-6881-4bed-bd91-eae63448f7b2	52233	محروقات الحضانة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.283214
3c161a87-1e52-45f5-bfca-1e1e8d0d6628	52234	محروقات الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.286553
8b093180-57d3-44ed-a264-bcc953c4b62b	52235	محروقات العيادات الخارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.29102
febf10c9-f1fc-488f-a3bc-1d89c50a4055	5224	سولار وزيت	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.294855
7cfd71ba-80bb-427a-b645-255f1e340852	52241	سولار وزيت العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.297378
543a1c94-5197-4528-9330-bb5f8d3df25f	52242	سولار وزيت الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.304786
505a3030-6bd9-44e2-b5bf-5dd3877dbb62	52243	سولار وزيت المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.308147
499cad56-99ca-4d6c-9b98-c795ead0987f	52244	سولار وزيت العيادات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.311565
ee646805-4f13-4064-a38b-80a315141fd5	52245	سولار وزيت الصيدلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.315019
282fe330-314b-48f7-b627-8cb40f1edbaa	5225	رفع زبالة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.318448
93c43e5a-8979-4697-b47d-abe2007ccf4d	52251	رفع زبالة العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.322487
fb799d9f-c40e-45ab-9118-929f4482e965	52252	رفع زبالة الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.326057
4cd97979-b1f0-43f6-9e04-11fab762be3d	52253	رفع زبالة المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.329372
d2d5cb8a-b5f0-48f9-9582-ca25f943b42b	52254	رفع زبالة العيادات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.339773
75769205-52af-4a26-b3e8-00686a11770a	52255	رفع زبالة العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.344087
5060beef-0c05-42c4-b48b-ba05610294f7	5226	مسئولية قانونية للمصعد	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.349256
56c23afb-5865-4138-a943-5d1e9cec2ac8	5227	مكافآت الامن لتشغيل الاكسجين	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.352895
c74df010-6e63-4dca-b243-a083df855191	5228	مكافآت الطعوم	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.357389
64fc821e-acce-4f44-b3b9-79d6ab3e5031	5229	مكافآت تنظيف الالواح الشمسية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.365167
4a08275c-4467-4b10-a184-fba2dae06ccf	523	مصروفات صيانة واصلاح	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.36812
094b515d-b581-475d-b382-944ca026541d	5231	اصلاح وصيانة عامة	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.371241
ac415fda-aebc-49a1-ac15-1c165d7ef018	52311	عمليات اصلاح وصيانة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.374498
c5606991-ce84-49c6-b4cf-28045fa6251c	52312	اقامات اصلاح وصيانة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.377072
eb8052e7-779d-45f4-ba67-e075cbfbcbe5	52313	صيدلية خارجية اصلاح وصيانة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.387865
da914378-ca79-4f6c-b98d-ec62557cd1bb	52314	صيدلية داخلية اصلاح وصيانة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.39426
8b8f4780-112f-4010-8079-365a3014db77	52315	عناية اصلاح وصيانة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.397014
4b6ac274-838d-4369-b256-6c57e288290c	52316	C-ARM اصلاح وصيانة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.415695
a2eec909-a9d2-4a53-8511-99fc463d156a	52317	اجهزة مختبر اصلاح وصيانة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.418608
7f612d66-9f1d-48cd-8ec7-ed4192bd3730	52318	اجهزة التعقيم اصلاح وصيانة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.421423
5b9b1e86-da76-4742-a099-8254b03705cb	5232	سباكة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.4277
731929ec-ac0c-45a5-a6d7-7b4c40e424cc	52321	سباكة عامة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.436467
6f855953-edc5-4ecb-bcd1-c7d5948b4af6	52322	سباكة العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.439474
6b790313-d2c9-4cbd-8d82-31acd9eccb36	52323	سباكة الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.455401
ecc3cac7-4d5a-4704-956b-da188c6ae294	5234	صيانة مصعد	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.459757
b48db585-e9f5-4455-9f7d-e7fff76489d4	52341	صيانة مصعد قبلي	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.463579
6e3e02bd-975b-4931-b1cc-21cbe18d0f69	52342	صيانة مصعد الاطباء	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.466964
4dd03181-96e2-4473-8187-776dea405f46	52343	صيانة مصعد العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.469618
a94061c3-17d6-4fe1-a7e4-9a35d6f2c97c	52344	صيانة مصعد الاوسط	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.473392
3ccf6efa-3658-48f5-9b05-21d913686695	5235	صيانة ديزل	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.475753
0b659062-85c0-4e48-b49a-c0ed006ef9ec	5236	مطبوعات (حسب كل قسم)	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.479077
bccd2095-1725-4424-ab70-065431c38dbb	52361	مطبوعات الصيدلية الخارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.482741
9887eb03-599a-46f0-84f9-6d128b5027a7	52362	مطبوعات العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.488888
d54b3848-a9e2-439a-a8d2-b58a8c148642	52363	مطبوعات الصيدلية الداخلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.492437
e75f0db8-f460-46ba-8973-7ffb19be2037	52364	مطبوعات المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.495552
c7682845-4a3d-4dfd-9c8b-256941266c94	52365	مطبوعات العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.499526
1f8361cb-5d5d-43c9-8ca9-9cc180ecd673	52366	مطبوعات الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.50347
18f867f0-32ac-45b0-910c-2096b0d13860	52367	شنط تعبئة صيدلية داخلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.506758
9f8dec41-4660-4a9d-ab64-7ff5e06b92f5	52368	شنط تعبئة صيدلية خارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.509933
54e08784-0edb-48b0-925e-9c27dc2df026	5239	صيانة واصلاح مستقبلية (Placeholder)	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.51319
f4f52e9c-f750-42bf-b0ae-3ddbfc597225	524	مصروفات ادارية وعمومية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.516215
46569cbc-26f0-4ef6-b320-9473aeb2592e	5241	مصاريف شحن واخرى	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.51904
89b6f633-5296-4d41-80b5-94047afb3608	52410	وجبات وتشغيل	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.528497
b9f713ff-065a-4108-a003-ff5fd1704fee	524101	وجبات عادية للعاملين	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.53125
d329fe7c-7441-44e8-af5b-c26e610121b1	524102	وجبات رمضان – الصيدلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.5356
2d430bc6-6503-4d64-8ea7-b5920bae0743	524103	وجبات رمضان – العمليات والاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.544882
0b736537-f4f4-40a3-b2da-322e9d5ce346	524104	وجبات رمضان – العناية المركزة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.550686
8117b672-5b38-4fff-882c-905511eceb5c	524105	وجبات رمضان – المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.554525
f7ffc0af-6b04-44e0-a752-18295b90a0ac	52411	اشتراكات برامج وانظمة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.558045
43a8ef51-b141-4c22-881f-9b743b90fbab	524111	اشتراك برنامج ERP / HIS	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.561063
d6860837-ac8c-4d06-a306-8b2a8f498ccb	52412	انتقالات وماموريات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.564581
5220f98c-80d1-4f37-8037-9024671cdbf4	524122	انتقالات ادارية وتشغيلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.568077
96253f69-7bad-47a7-8b42-6d4277a19a3f	5242	مصروفات نظافة (مقسّمة)	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.571646
5baa17b9-e363-4a85-9485-c40eded8cad7	52421	مواد نظافة الصيدلية الخارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.57827
5c12249e-cd86-4ec6-adf6-17ba69489fb1	52422	مواد نظافة الصيدلية الداخلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.581601
b2297b08-76e9-419e-ae06-3877a1bed5ad	52423	مواد نظافة العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.585599
529d1c63-f994-4d41-aae4-64f3fd593f59	52424	مواد نظافة الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.588647
842df643-0395-4d52-9d51-920918a314fb	52425	مواد نظافة العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.591233
e1bb2f0c-754c-4fe9-8257-1b78356a89a3	52426	مواد نظافة التعقيم	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.596522
c2cec855-05f4-42f8-8048-98fe35b1e635	52427	شنط احمر/اسود عمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.599736
3fcf285b-7305-4e4f-8752-f9fbdbb78f59	52428	شنط احمر/اسود اقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.60253
d137e5f0-31be-4590-9716-14e8d3673b19	52429	شنط احمر/اسود عناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.605441
990e4fcd-30fa-4b28-a917-c18434d6eb89	5243	مصاريف صندوق طوارئ المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.608295
23885699-683e-4f8f-be47-ce7b08aee523	5244	مصروفات اخرى	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.611137
a16e36ca-3f1b-4305-94ac-c5bb7346bdb7	52441	تبرعات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.613908
9854c5fa-e2b6-42f1-8ea1-00d146fa4279	52442	ادوات كتابية صيدلية خارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.615889
777d1546-b6ce-4839-996b-fa4c57c0547f	52443	ادوات كتابية الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.619059
4d43aa9a-58b7-4086-ac4c-f7a9c5784421	52444	ورق باركود للكاشير	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.621119
52c3d5e4-6904-496d-81a2-2d1503901b35	52445	ادوات كتابية العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.624103
7094a900-dc90-4d6a-bf8c-d7b808088f2e	52446	علاقات عامة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.634852
d6b9ea78-4c7c-4f13-b6e1-2fdbf305620f	52447	ضيافة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.637598
3af4d03d-d0ec-422a-ab62-5bbfc262aa7a	52448	ورق تصوير صيدلية خارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.640174
bf8adf30-03ad-4e95-9b85-dc137339a5ab	52449	ورق تصوير صيدلية داخلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.642855
e0ed5f85-b749-49f7-b32b-d33fd59c0b70	5245	مصروفات بنكية وعمولات تحويل	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.64536
bf36803c-3777-4092-aa4f-c0cd4b73d5c6	52451	عمولات صيدلية خارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.64842
e5ca9ed0-a16b-4fd8-b814-a5eea23e949f	52452	عمولات صيدلية داخلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.650906
1076e514-d0d6-4c88-bae8-9862b21041fb	52453	عمولات عمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.654056
50c26517-6021-4b7e-b514-4c0a5b11aaf0	52454	عمولات المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.657589
3a042d06-fd8d-4c3a-ad61-bc2901d640a0	5246	مصروفات اتصالات ونظم	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.660792
443ffaa8-38a6-4d9c-9a16-699a4d0ca407	52461	اشتراك انترنت شهري	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.663882
60b6e6cc-54fc-4e72-868e-1c200d8ba739	52462	فواتير محمول	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.666806
e5f7224c-e49d-4617-abc9-ee07ae083982	5247	دعاية وتسويق	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.670185
30fd36a3-7e42-462d-8e3b-69ca3177fc1b	52471	دعاية واعلان	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.674827
e7a326b8-253d-42a4-b0fd-e212a6edd2d6	5248	اتعاب مهنيين واستشارية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.684806
d0e55671-522e-48dd-bb78-b461a29f500b	52481	اتعاب محاسب قانوني	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.688405
a983d18b-c2c6-4b9c-840b-336de926e09b	52482	اتعاب محاماة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.691658
8be154c6-b818-46af-a10b-3707ddd273fd	52483	اتعاب استشارات ادارية / IT	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.704629
abad6815-3c69-445e-b390-29c062a72e48	5249	رسوم حكومية ودمغات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.708124
69b49679-3480-4171-bfef-897f4abe672c	52491	رسوم حكومية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.716277
56283d9a-d01a-4c29-9db2-99e459f81a93	52492	دمغات ونماذج رسمية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.72009
4b83dd80-078d-4919-b2ee-458460d4532a	525	مصروفات الاهلاك	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.724047
253a7ab0-96d6-404d-8546-b06f4d698d6a	5251	اهلاك الصيدليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.727034
4e28f9d4-6e2f-4fd9-9799-2ba98ad3037e	5252	اهلاك العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.729618
6c21971f-b06a-4509-82af-94bcaf516c69	5253	اهلاك بنك الدم	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.732279
92249226-c40e-48b4-b39e-e4a59980039c	5254	اهلاك المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.73821
68f991d3-7283-45bf-bb50-37d830015845	5255	اهلاك العناية المركزة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.740946
4d7cc5dc-b765-41cd-b1f4-c00bf770e606	5256	اهلاك الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.744688
961ab148-bd1e-4437-a21c-9ad2be0130fe	5257	اهلاك الايكو	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.747259
e1717071-b1f3-45bc-a860-c69ae924cdde	5258	مصروف اطفاء اصول غير ملموسة	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.750784
4a7a8c92-f7b0-4ef0-95e9-3d2a61697b7f	5259	اهلاك مستقبلي (Placeholder)	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.753749
f7ac41e7-a0e5-4622-aa16-e15ab1724ae2	526	خسائر ائتمانية متوقعة	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.756763
5a05c28b-eb35-426e-a9e1-77b6d77f7395	527	تكاليف تشغيل – غازات وكيماويات	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.760055
a3ce4d59-65da-4514-abf9-5275cb939d86	5271	مستهلكات تعقيم	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.76381
43942234-610e-492f-b77c-732bfe1997e4	5272	كيماويات / محاليل	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.766996
9e5c7f67-d755-408a-9665-dc54eb78329a	5273	ادوات تنظيف وحدة التعقيم	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.771301
bc1ecd81-3d57-4aec-a6da-036194c12ea4	5274	غازات طبية – العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.77557
542e7d6a-1799-4eb5-ab9d-8e06100a0668	5275	غازات طبية – العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.779641
39b38c52-72a3-4013-a30b-74cb18d2e504	5276	غازات طبية – الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.782189
5a6481d8-ab71-4ad4-a7ec-99d51ed51061	5279	تكاليف تشغيل طبية اخرى	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.784786
deb86dcc-1b37-445f-9c8a-4fa701e286a3	528	مخصص قضايا	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.796483
bcb61ba9-1725-4434-86ad-c8c111e7f7ee	5281	مصروف تكوين مخصص قضايا	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.799249
0811c0f2-de78-4e48-855a-2aa5f40b1063	529	مصروفات اخرى	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.801944
cb1aca91-c4bd-45b6-86d2-108fbfdc4f22	5291	مصروف ضريبة دخل	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.806353
ed8a262b-28ee-4b14-92f0-477295816191	5292	فروق جرد نقدية صيدلية خارجية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.810529
c7eb64cf-45a4-4dc1-87ff-f03b1c8d66a0	52920	فروق جرد نقدية (مدين)	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.813533
b1336108-a8a5-47f2-86aa-1bb1d05c180a	52921	فروق جرد نقدية (عنتر)	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.817315
63b67173-297b-4e0b-a514-353394373e6f	52922	فروق جرد نقدية (حمدي)	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.820275
90d63c58-32a5-4604-b2a6-aa77277fd22d	52923	فروق جرد نقدية (الطوخي)	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.822368
9aa783b7-a2f9-444d-a6ed-0f65503a091a	5293	فروق جرد نقدية صيدلية داخلية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.827034
e44a0084-7d4e-47b8-816b-015e26e2d99e	52931	فروق جرد نقدية (عمرو – الثامن)	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.835167
d18caafa-a956-4b34-a59b-19d371bd3bfd	52932	فروق جرد نقدية (حسين – الثامن)	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.847528
b760f6ba-0eda-4875-b451-ade17befc2b4	5294	فروق جرد نقدية العمليات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.85495
baddc976-d97b-4b06-82d5-15ac198b3649	52941	فروق جرد نقدية (سيف)	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.858262
87b24648-04e6-4910-9fcd-74e1b558fdf7	52942	فروق جرد نقدية استقبال الاقامات	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.867024
b84a92f6-dba8-4d9b-b02a-aea97cb71edb	5295	فروق جرد نقدية العناية	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.870017
16fa981d-076d-4855-a14f-2a9d75c461b8	5296	فروق جرد نقدية المختبر	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.875428
73d810ea-ed42-426b-8ec4-40c2be618a74	5297	فروق جرد نقدية اخرى	expense	\N	1	t	t	\N	0.00	2026-02-05 16:35:30.879815
390f33f6-b586-4925-a16a-2ee2afc149c7	5299	مصروفات متنوعة مستقبلية (Placeholder)	expense	\N	1	t	f	\N	0.00	2026-02-05 16:35:30.891059
4a3eb4be-b7e1-4d93-8d03-3eb00bc3a1c4	416	ايرادات متنوعة	revenue	\N	1	t	t		0.00	2026-02-05 16:35:29.419602
f41ca735-bec6-4479-8c35-e6c2f780e57b	417	ايراد خدمات تمريضية	revenue	\N	1	t	t		0.00	2026-02-05 16:35:29.514746
7e6de836-86f2-4bd2-ad72-bddc02752d7a	518	تكلفة ادوية ومستلزمات  رئيسى	expense	\N	1	t	f		0.00	2026-02-11 18:44:33.139022
c863f9c8-1c16-4652-ab09-7dc71167cbf9	5181	تكلفة ادوية ومستلزمات مباعة مخزن رئيسى	expense	7e6de836-86f2-4bd2-ad72-bddc02752d7a	2	t	t		0.00	2026-02-11 18:45:10.574872
01fb1c83-ca5a-4805-9ca0-2f356c708ae8	423	ايرادات ادوية ومستلزمات مخزن	revenue	\N	1	t	f		0.00	2026-02-05 16:35:29.687205
b43cd069-28f4-44c6-9c43-21fa46aa441a	4231	ايراد ادوية ومستلزمات مخزن رئيسى	revenue	01fb1c83-ca5a-4805-9ca0-2f356c708ae8	2	t	t		0.00	2026-02-11 18:48:46.930999
\.


--
-- Data for Name: admissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admissions (id, admission_number, patient_id, patient_name, patient_phone, admission_date, discharge_date, status, doctor_name, notes, created_at, updated_at) FROM stdin;
005c33f9-8225-44ac-bf1a-a9936aedd40b	ADM-TEST-001	\N	Test Patient 12345	\N	2026-02-11	\N	active	\N	\N	2026-02-11 10:32:08.980147	2026-02-11 10:32:08.980147
667b65f1-83fd-4fab-8d6a-58bb528304e8	1	b286e1da-d09d-4e15-ba13-a7631387f81a	شريف عبدالرحمن عبدالظاهر محمود	01000717816	2026-02-11	\N	active	\N	\N	2026-02-11 10:35:38.686949	2026-02-11 10:35:38.686949
691b6ee8-f8e7-434e-943a-b39f22c90828	901	3b2822cd-f658-4635-a13f-667e2d39b67a	عزه احمدمحمد عبدالحميد	01000717816	2026-02-11	\N	active	\N	\N	2026-02-11 10:58:30.951855	2026-02-11 10:58:30.951855
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_log (id, table_name, record_id, action, old_values, new_values, user_id, ip_address, created_at) FROM stdin;
f1de3e80-29eb-4fd2-97d6-482e49c11049	journal_entries	df0122b8-d7a5-4712-95e7-63d0e94a68be	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 08:57:33.048124
876fea53-e8d1-48c0-a940-7e444ccd9370	journal_entries	e30d6116-8943-441d-9422-5d527cdf3572	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 08:57:33.200284
618864a5-ea32-41cd-9406-3f9f644a6ec0	journal_entries	6acf776d-f034-419b-bcf5-e29f88fa48c6	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 08:57:33.477813
8e63ab8e-0189-4554-8b6d-4d37bf36a738	journal_entries	260d12fa-d8b9-4df8-a6ee-de62a04878da	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 08:57:56.443036
d62b5967-c5be-40b2-8806-5aea4afcf77c	journal_entries	a8186747-2999-4822-9dcc-962f106c7a9f	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 08:57:56.500903
77cdb832-c2bf-4a9c-a2c2-073b53dae312	journal_entries	666a3cc7-5482-45c5-875e-52d4b673ecc1	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 08:57:56.705159
29de25f6-04b3-4d90-8fdb-e996707dcd7c	journal_entries	b92b6ffa-3e6a-4cdc-bcd5-45cd261a7744	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 08:58:43.188174
64bea95c-0331-4f87-849c-b5231c3d9a09	journal_entries	839179e7-a488-4113-8eac-96574d1cc6b3	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 08:58:43.247318
03b100a5-f809-4dc1-a823-6bcfa5f426a1	journal_entries	2708375e-ef4b-47dc-bb5f-5c4e53ed671e	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 08:58:43.562342
ea935367-8f7f-4c9d-a818-24f114225a41	journal_entries	3fee8a12-2738-46c3-9534-4c9591f98859	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:00:21.345604
131ba871-b7a2-431f-bc76-147ae0550c78	journal_entries	828d5cd6-07cd-4475-a35e-1146886060bb	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:00:21.392967
95917b31-136d-4c23-96bd-1fa594ff3aa9	journal_entries	2da0eec0-b235-4f75-9c03-3934924052b6	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:00:21.667069
137c4ecf-1c92-4c48-97e4-7fd5b2f6a9f0	journal_entries	8ada3863-356c-455f-9190-443e8feae651	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:14:04.17823
15584417-0c6f-409d-a3d3-176ed835704b	journal_entries	194a7214-1705-4a00-933e-3968e29f7627	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:14:04.291096
d6256fa0-60ef-4485-a8ff-137bb788d941	journal_entries	b1491c08-8745-4ed0-a3d8-60d5ef69c483	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:14:04.347191
60f99b2b-6caa-4d22-93a0-55939d7cfaba	journal_entries	ec7a9c7d-e892-496b-97ae-6d900d94123c	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:16:23.064183
bfacd4c8-b2b6-4fce-9944-c300e747fca6	patient_invoice_headers	b30cb240-8fec-46f3-b251-e5014a552c07	finalize	{"status":"draft"}	{"status":"finalized"}	\N	\N	2026-02-13 09:16:23.188216
efada8f7-9cf7-4cb8-b96c-52a4a746d041	journal_entries	92d7b5ce-7e9e-49c5-8d02-441c6e55912c	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:16:23.259296
68ab466b-c568-4761-bf4f-1a579e7c8178	journal_entries	09ed0166-d09b-471a-933d-b7a7ef88c5de	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:16:23.314961
8fb8a2fa-7244-4a29-a1ea-c572c4ae2ae6	journal_entries	f9cd565f-53a2-4ab9-b9f7-36ec2258157c	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:23:43.072292
1ab6643c-17b4-4d14-8624-febc2345eb1b	patient_invoice_headers	8e6f4efa-ddcc-49f6-968a-8eaa618697dc	finalize	{"status":"draft"}	{"status":"finalized"}	\N	\N	2026-02-13 09:23:43.26249
5815a7aa-d05e-423e-abbc-f7778a06ecbc	journal_entries	1f94fac8-5d5d-4328-a1d0-8d5c1be58f35	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:23:43.307041
4a90b10d-ccb8-4a40-b20b-6dc1705bb4ca	journal_entries	b84a351a-12ea-4b7b-ac2c-25a778b5b7ac	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:23:43.351157
2a641a1b-6d8b-4b6e-aff7-2769e6130996	journal_entries	3ca98b10-438a-46ca-a01a-61ab9db67dda	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:29:36.493768
bd4f680c-c332-4547-8bc2-127ab6c6667e	patient_invoice_headers	f3af4b79-3595-444c-8f40-04c3b4c479d3	finalize	{"status":"draft"}	{"status":"finalized"}	\N	\N	2026-02-13 09:29:36.575774
99ffb81c-2ba4-4b1f-9920-f2a632b530e3	journal_entries	d755da1b-e542-46c7-9478-6d2fa7b1062b	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:29:36.642727
05517ee7-1b7b-4aa9-86a4-fe11abfbf110	journal_entries	73b21c20-20ab-4765-a569-8945371e74cd	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:29:36.694084
62862cc5-8b1f-459c-9c77-2cfef4cf033f	journal_entries	519c109d-ae4a-446f-ac6b-302ea1c253b8	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:30:37.536181
9178e972-9c17-4780-b5bf-42112dc6a0fe	patient_invoice_headers	1426fa0e-122a-477f-afc9-d31549c27947	finalize	{"status":"draft"}	{"status":"finalized"}	\N	\N	2026-02-13 09:30:37.610095
a5874998-e3d4-42fe-9fca-02cf0abc7d76	journal_entries	c30b6021-03f6-464e-99c1-7521e0b8222e	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:30:37.637905
b85d0fe0-62d4-430b-a8db-363140d8f0f0	journal_entries	c25bcbf2-3b75-4f1f-b40e-8d23b5f49bbe	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:30:37.66756
12d5855c-1e24-4d50-b69f-8a63c1e3a25e	journal_entries	cc1dcb15-5d82-43e6-abf1-4b32ebaade0f	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:34:56.086038
fd44e727-8a95-4159-9254-f3f216289983	patient_invoice_headers	738b9d5d-4c3c-471f-b2e8-af2f39d83d07	finalize	{"status":"draft"}	{"status":"finalized"}	\N	\N	2026-02-13 09:34:56.150472
0c766d15-8a4a-472e-8cc9-a9ef15f90093	journal_entries	26a188a0-ca8b-4e43-aab4-fe6416c36f69	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:34:56.184911
b4575fa3-f529-42bb-94e4-12d5efb5dde1	journal_entries	78c7e2b9-ba58-4f97-a721-cb5bb997d777	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:34:56.222008
2031da2b-3129-4304-89d2-553a09f68d49	journal_entries	a7d99f72-15dd-45c5-96ba-69f8179976a7	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:39:10.567454
54c5e3f8-55b9-41fb-abdc-8defb768a063	patient_invoice_headers	4b1bd591-ce99-4c07-a9c3-68bb1fc612cd	finalize	{"status":"draft"}	{"status":"finalized"}	\N	\N	2026-02-13 09:39:10.6609
9f42206b-7fcf-4d16-b474-afa808355f23	journal_entries	0de15c08-7ba0-4e20-bea2-7f1688ebe037	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:39:10.709207
d140ddef-d1f5-432a-928a-46812796c157	journal_entries	a8476815-14b5-445a-8e9b-1aab54e29446	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:39:10.759144
4f5947a2-16d7-48d2-a962-0f7a0248f88c	journal_entries	c1df4c5b-99a5-4247-8603-bf89f006546c	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:59:07.898267
71cf1de2-32f6-46bc-ab06-a9032bb1589f	patient_invoice_headers	19548744-b24a-41db-8b71-1e03882f4916	finalize	{"status":"draft"}	{"status":"finalized"}	\N	\N	2026-02-13 09:59:08.003226
c4735639-5f4b-49d5-a7d1-ebca4aaa372b	journal_entries	9e412fc2-fac9-4630-94bd-96c0c39c3b1a	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:59:08.076671
8a638e45-bb1b-473e-b54b-329860db5c2b	journal_entries	08721fd4-d978-4a90-a17e-98f0e338e259	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 09:59:08.130121
b83f3154-5a64-4e7c-a3d7-6ed4122137ff	journal_entries	25ee3209-8ebd-41f8-92b2-a3dda0ebf41b	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 10:00:56.566854
92cbc928-62ec-4fee-a50a-2c0dc955326c	patient_invoice_headers	dea6f5a6-7e05-470e-b545-8312357dec11	finalize	{"status":"draft"}	{"status":"finalized"}	\N	\N	2026-02-13 10:00:56.773737
76be8913-1911-452c-85da-300561d4e16a	journal_entries	942ba66b-c627-45d7-aea3-00b341363382	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 10:00:56.832194
431024af-ea03-43b8-b136-002c4c3eaa80	journal_entries	b1bf550e-1dcf-4fd7-930d-d9dd90b130b1	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 10:00:56.919788
4168e85f-0557-467f-869d-57dec2abcce6	sales_invoice_headers	bce196dc-5062-4860-82c9-828e2e88566b	finalize	{"status":"draft"}	{"status":"finalized"}	\N	\N	2026-02-13 10:01:00.573539
0f0b9541-f384-417c-a530-bfc61b5eb4e0	sales_invoice_headers	7df17c10-a6b5-4d6d-885c-51aba7224613	finalize	{"status":"draft"}	{"status":"finalized"}	\N	\N	2026-02-13 10:01:00.747875
d4ef1a1d-b655-46bc-a767-95e5df42d5e2	journal_entries	1e109384-48d3-4e99-91d3-b502f7fa6283	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 10:01:05.591635
db028ec6-da2f-4548-bb75-d5414b75bd72	patient_invoice_headers	ccbf2e6d-1df3-40f9-9adb-8b3f00efa5af	finalize	{"status":"draft"}	{"status":"finalized"}	\N	\N	2026-02-13 10:01:05.719535
ee2d9a24-7870-4429-872f-18cb0180ceed	journal_entries	46273853-efec-4052-a948-213a814c4ce5	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 10:01:05.772743
17d55d25-120a-4c72-97bb-eecfe8fc64ac	journal_entries	1b397980-2a3f-48dd-a125-064ab5a5bfef	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 10:01:05.811157
e89ece23-6b4e-4d2e-b9fa-98dd9b772026	journal_entries	cb5a1a13-bf33-45cc-9e35-ae53b2f7ad7e	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 10:03:31.174842
00374831-bb81-45f2-952c-edfa0f09dbcd	patient_invoice_headers	f8b011db-7cc1-4970-87a5-1be3c3c735a5	finalize	{"status":"draft"}	{"status":"finalized"}	\N	\N	2026-02-13 10:03:31.24265
1b699484-553e-4b7b-ba71-6c0541541bbf	journal_entries	4fd5baf5-12d1-4dc4-b044-097ae5dc2ed4	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 10:03:31.283612
db6be9c1-3519-4825-8706-fad4cfbbf19a	journal_entries	777e129d-8961-4e97-89b9-12c086de3628	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 10:03:31.322814
6703f054-d2c6-45fa-96c6-8b49946029c4	journal_entries	f5170380-9bb3-48a0-bc20-ac2ad9dac758	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 10:17:59.630508
eff3213e-f969-453a-97b8-b0bb1396095c	patient_invoice_headers	e3f061f7-61b7-4dde-993e-aee7f79c0d64	finalize	{"status":"draft"}	{"status":"finalized"}	\N	\N	2026-02-13 10:17:59.70719
8b0df58c-28b2-4259-bb4d-af05a986a348	journal_entries	c110bf65-272f-4143-8032-5e3c9f4513b3	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 10:17:59.746175
7bf4fb39-7a0d-463c-b70c-5bb2f1d75a3f	journal_entries	7556b8e3-275b-41f9-80f8-fe4ef515f516	post	{"status":"draft"}	{"status":"posted"}	\N	\N	2026-02-13 10:17:59.781603
\.


--
-- Data for Name: cashier_audit_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cashier_audit_log (id, shift_id, action, entity_type, entity_id, details, performed_by, performed_at) FROM stdin;
b5c48b39-67e4-4c01-998b-375791279932	fc465dee-38af-4f94-a9be-7648a556f095	open_shift	shift	fc465dee-38af-4f94-a9be-7648a556f095	فتح وردية - رصيد افتتاحي: 1000	محمد	2026-02-10 17:59:21.786841
20ce23bb-1e9f-41fb-b11d-7e00fff1a973	fc465dee-38af-4f94-a9be-7648a556f095	collect	sales_invoice	e0307467-3207-49d8-b24f-2acecfd195e7	تحصيل فاتورة رقم 2 - المبلغ: 500.00	محمد	2026-02-10 17:59:57.308883
96b91818-46ef-473a-85bb-6c8274955cb8	fc465dee-38af-4f94-a9be-7648a556f095	close_shift	shift	fc465dee-38af-4f94-a9be-7648a556f095	إغلاق وردية - النقدية الفعلية: 1500 | المتوقعة: 1500.00 | الفرق: 0.00	محمد	2026-02-10 18:00:28.796852
a064a170-b9c8-4ad6-b83f-ed71483759e4	9b220883-94f5-4dcb-b719-fab235525b9b	open_shift	shift	9b220883-94f5-4dcb-b719-fab235525b9b	فتح وردية - رصيد افتتاحي: 500	أحمد	2026-02-10 18:03:43.051049
a740147b-faf3-4e19-8c5d-40214940e43b	9b220883-94f5-4dcb-b719-fab235525b9b	close_shift	shift	9b220883-94f5-4dcb-b719-fab235525b9b	إغلاق وردية - النقدية الفعلية: 500 | المتوقعة: 500.00 | الفرق: 0.00	أحمد	2026-02-10 18:03:56.769495
861f27c4-73cd-4bea-ab1c-56bfc236ace6	c2a924de-f996-41a5-8292-8187d1e754d4	open_shift	shift	c2a924de-f996-41a5-8292-8187d1e754d4	فتح وردية - رصيد افتتاحي: 0	احمد	2026-02-10 18:07:25.158518
9ba92db5-bd0f-4c76-bf7c-db3743b29fcc	c2a924de-f996-41a5-8292-8187d1e754d4	close_shift	shift	c2a924de-f996-41a5-8292-8187d1e754d4	إغلاق وردية - النقدية الفعلية: 0 | المتوقعة: 0.00 | الفرق: 0.00	احمد	2026-02-10 18:13:59.836956
4a730b73-afd3-40b5-b03d-72fe1d6cebd1	c2194857-872e-455f-a9e9-f1002381f992	open_shift	shift	c2194857-872e-455f-a9e9-f1002381f992	فتح وردية - رصيد افتتاحي: 0	احمد	2026-02-10 18:14:41.18232
2118daac-efb5-440c-ba74-1eb8814aace7	c2194857-872e-455f-a9e9-f1002381f992	close_shift	shift	c2194857-872e-455f-a9e9-f1002381f992	إغلاق وردية - النقدية الفعلية: 0 | المتوقعة: 0.00 | الفرق: 0.00	احمد	2026-02-10 18:20:25.966696
16309ca3-f3dc-47b1-8454-cbcee4de6554	08b81804-4550-4221-948c-2ad8cb30eb04	open_shift	shift	08b81804-4550-4221-948c-2ad8cb30eb04	فتح وردية - رصيد افتتاحي: 0	كاشير	2026-02-10 18:20:42.754244
a82e5e5d-c319-403e-8c04-8c1f49717ffd	20a48599-d236-4eac-8d82-4c297f4d663c	open_shift	shift	20a48599-d236-4eac-8d82-4c297f4d663c	فتح وردية - رصيد افتتاحي: 0 - صيدلية: undefined	احمد	2026-02-10 18:33:07.865117
acb07698-4d20-4320-b1fb-d4a77991d006	b213cdee-9a7e-45a3-9138-7f6c718de4c9	open_shift	shift	b213cdee-9a7e-45a3-9138-7f6c718de4c9	فتح وردية - رصيد افتتاحي: 0 - صيدلية: undefined	احمد	2026-02-10 18:33:14.875581
7e6dc092-10c7-40f0-8f5f-6c51c066f1f5	49a02648-5299-4cc5-9d83-3a8db46cf8a7	open_shift	shift	49a02648-5299-4cc5-9d83-3a8db46cf8a7	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	احمد	2026-02-10 18:36:24.089315
a51fe662-c9c4-4385-8325-67e80f9c9237	6ec558e5-7353-4abc-9f40-ce52a1582c64	open_shift	shift	6ec558e5-7353-4abc-9f40-ce52a1582c64	فتح وردية - رصيد افتتاحي: 500 - صيدلية: pharmacy-2	كاشير_اختبار	2026-02-10 18:48:22.820076
91e4c6bb-760f-48a7-b2e1-af0444e16255	62e5e82f-0d93-45db-910c-4c40665cb6e7	open_shift	shift	62e5e82f-0d93-45db-910c-4c40665cb6e7	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	احمد	2026-02-10 19:06:57.14495
5b3e1c68-8331-49fb-bd51-11cdb0540123	62e5e82f-0d93-45db-910c-4c40665cb6e7	collect	sales_invoice	e8fbdfb4-6d7f-4448-8381-1f9d458ee296	تحصيل فاتورة رقم 4 - المبلغ: 1000.00	احمد	2026-02-10 19:56:50.602795
c625ccae-6be9-4ec9-944a-6297e9c4c530	62e5e82f-0d93-45db-910c-4c40665cb6e7	collect	sales_invoice	71434586-d182-41dd-9346-888afa45be64	تحصيل فاتورة رقم 3 - المبلغ: 5500.00	احمد	2026-02-11 20:46:56.951556
c7cefa58-24b1-49b6-8426-fca366fe93f8	62e5e82f-0d93-45db-910c-4c40665cb6e7	close_shift	shift	62e5e82f-0d93-45db-910c-4c40665cb6e7	إغلاق وردية - النقدية الفعلية: 6500 | المتوقعة: 6500.00 | الفرق: 0.00	احمد	2026-02-11 20:47:03.188229
89dae815-7c18-427a-8de8-4cd9cb302091	6ec558e5-7353-4abc-9f40-ce52a1582c64	collect	sales_invoice	a6e725f0-4870-4766-a415-0a3040622941	تحصيل فاتورة رقم 10 - المبلغ: 5000.00	كاشير_اختبار	2026-02-11 21:06:15.441077
8f285ef1-ef20-4056-8156-2ff380b4b81e	409c17a1-36f0-4960-9cca-69c6c40fbd7e	open_shift	shift	409c17a1-36f0-4960-9cca-69c6c40fbd7e	فتح وردية - رصيد افتتاحي: 100 - صيدلية: pharmacy-1	كاشير تست	2026-02-11 21:25:23.917593
3856ecbb-de62-4a18-8658-26415d2a21d9	409c17a1-36f0-4960-9cca-69c6c40fbd7e	close_shift	shift	409c17a1-36f0-4960-9cca-69c6c40fbd7e	إغلاق وردية - النقدية الفعلية: 0 | المتوقعة: 100.00 | الفرق: -100.00	كاشير تست	2026-02-11 21:30:08.443439
bed54b44-b103-40a4-9a2c-35af5fa7b9df	242728db-e015-4581-92cb-d22e9de06f71	open_shift	shift	242728db-e015-4581-92cb-d22e9de06f71	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	عنتر	2026-02-11 21:31:25.331076
b841ca67-6674-4c6a-86c8-fea6bef1fc95	242728db-e015-4581-92cb-d22e9de06f71	close_shift	shift	242728db-e015-4581-92cb-d22e9de06f71	إغلاق وردية - النقدية الفعلية: 0 | المتوقعة: 0.00 | الفرق: 0.00	عنتر	2026-02-12 09:50:22.92459
c735a9b0-36f7-43a7-a567-33e976d824bd	a8a7f2c7-f9d8-4256-9e08-651c3ff651d4	open_shift	shift	a8a7f2c7-f9d8-4256-9e08-651c3ff651d4	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع	2026-02-13 09:29:35.903221
eb864d41-c75a-48aa-a736-68fc7f11a744	c6527744-e358-4e64-990f-bfc960a027a6	open_shift	shift	c6527744-e358-4e64-990f-bfc960a027a6	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع 2	2026-02-13 09:29:35.95349
85050b97-d2d3-4fdf-81c0-de37bcf4791b	564caa26-6a9b-409e-ad6a-8d96c5e131ee	open_shift	shift	564caa26-6a9b-409e-ad6a-8d96c5e131ee	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع	2026-02-13 09:30:37.128682
ff3a2635-6d30-42aa-bad7-61cdb63a811a	39754094-bedd-4d12-a066-ec360d570211	open_shift	shift	39754094-bedd-4d12-a066-ec360d570211	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع 2	2026-02-13 09:30:37.161135
d54aa9f5-0e56-4ebe-8a33-b41caeddd7e0	f360a496-3fb7-486f-8f04-9c7e38c63fdf	open_shift	shift	f360a496-3fb7-486f-8f04-9c7e38c63fdf	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع	2026-02-13 09:34:55.58148
cc609d75-0b16-4257-800a-2433352e6fed	8b3f96e4-4ffc-4369-914a-e9311730f996	open_shift	shift	8b3f96e4-4ffc-4369-914a-e9311730f996	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع 2	2026-02-13 09:34:55.618296
95bc970c-40c8-4aee-8066-87b8dc7ecef8	92eacf84-9e06-45cb-86cc-c02f3fd5466b	open_shift	shift	92eacf84-9e06-45cb-86cc-c02f3fd5466b	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع	2026-02-13 09:39:09.951197
552f62ff-0fc5-4adb-976c-da5c791e2cef	d4499be9-aeb0-44e3-bfbc-049eb2a27604	open_shift	shift	d4499be9-aeb0-44e3-bfbc-049eb2a27604	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع 2	2026-02-13 09:39:10.003805
65e62b0d-0269-46e2-b524-50291a8eb1a4	2a8c7772-96b3-47c6-9d52-82778304b2dd	open_shift	shift	2a8c7772-96b3-47c6-9d52-82778304b2dd	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع	2026-02-13 09:59:07.387613
fa8f2be7-884a-473a-a6be-a6662720d3ed	313cd148-c9d1-4b3d-aafe-8f72177ef323	open_shift	shift	313cd148-c9d1-4b3d-aafe-8f72177ef323	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع 2	2026-02-13 09:59:07.430699
4bb3d0b2-c491-4b10-a386-c8715641fc13	0bba0a10-b0b9-42f4-b9dc-860a1022dad7	open_shift	shift	0bba0a10-b0b9-42f4-b9dc-860a1022dad7	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع	2026-02-13 10:00:54.961701
cde9cbcb-56ba-49d4-a456-fefa81287109	60c0da3a-6508-4fbe-aecc-47c0b754c1dd	open_shift	shift	60c0da3a-6508-4fbe-aecc-47c0b754c1dd	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع 2	2026-02-13 10:00:55.114685
a25fdf6e-fa9e-465c-a8a5-c2de127ca87a	09b42198-f809-437e-b078-ddebb366b1c4	open_shift	shift	09b42198-f809-437e-b078-ddebb366b1c4	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع	2026-02-13 10:01:04.48765
354ceec2-3d53-449b-9f43-4fb5c1cc57f2	dae37bd0-680e-42bb-bedc-65f96d95f662	open_shift	shift	dae37bd0-680e-42bb-bedc-65f96d95f662	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع 2	2026-02-13 10:01:04.567688
b35743d8-0d20-48ae-af86-1db975d08fc0	7133085b-99ff-4b08-915b-5efe7b3a106c	open_shift	shift	7133085b-99ff-4b08-915b-5efe7b3a106c	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع	2026-02-13 10:03:30.427994
64c835ca-b546-458d-83a5-e9000047f3e9	f3e657cf-c7f2-454b-8094-8b4a064cf74e	open_shift	shift	f3e657cf-c7f2-454b-8094-8b4a064cf74e	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع 2	2026-02-13 10:03:30.500262
d3a7eabb-729c-4eb1-8e19-7e1e6a319d44	a423f5f1-d728-40a9-9d50-0e177305f038	open_shift	shift	a423f5f1-d728-40a9-9d50-0e177305f038	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع	2026-02-13 10:17:59.053299
6aeb8aba-eeed-4a7b-be01-aef5bddeba67	a8bb044d-11dc-470e-a961-166bef8bf637	open_shift	shift	a8bb044d-11dc-470e-a961-166bef8bf637	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	كاشير اختبار مرتجع 2	2026-02-13 10:17:59.117256
c43e2695-9456-450e-a9bf-f9d136e178c2	40224140-a329-4f11-bf62-bce522ca98d3	open_shift	shift	40224140-a329-4f11-bf62-bce522ca98d3	فتح وردية - رصيد افتتاحي: 0 - صيدلية: pharmacy-1	محمد	2026-02-13 13:29:44.776634
\.


--
-- Data for Name: cashier_receipts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cashier_receipts (id, receipt_number, shift_id, invoice_id, amount, collected_by, collected_at, payment_date, printed_at, print_count, last_printed_by, reprint_reason) FROM stdin;
329595e6-d7e3-4c48-ba35-7cb1c42ac714	1	fc465dee-38af-4f94-a9be-7648a556f095	e0307467-3207-49d8-b24f-2acecfd195e7	500.00	محمد	2026-02-10 17:59:57.308883	\N	\N	0	\N	\N
05881586-fd0c-424c-a53a-c12e3e577e00	2	62e5e82f-0d93-45db-910c-4c40665cb6e7	e8fbdfb4-6d7f-4448-8381-1f9d458ee296	1000.00	احمد	2026-02-10 19:56:50.602795	\N	\N	0	\N	\N
3923d45a-5899-46ee-bd11-f8c1565b4596	3	62e5e82f-0d93-45db-910c-4c40665cb6e7	71434586-d182-41dd-9346-888afa45be64	5500.00	احمد	2026-02-11 20:46:56.951556	\N	\N	0	\N	\N
f1464986-72bd-41c8-9aca-3c3f64e96e2a	4	6ec558e5-7353-4abc-9f40-ce52a1582c64	a6e725f0-4870-4766-a415-0a3040622941	5000.00	كاشير_اختبار	2026-02-11 21:06:15.441077	\N	\N	0	\N	\N
\.


--
-- Data for Name: cashier_refund_receipts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cashier_refund_receipts (id, receipt_number, shift_id, invoice_id, amount, refunded_by, refunded_at, payment_date, printed_at, print_count, last_printed_by, reprint_reason) FROM stdin;
\.


--
-- Data for Name: cashier_shifts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cashier_shifts (id, cashier_id, cashier_name, status, opening_cash, closing_cash, expected_cash, variance, opened_at, closed_at, pharmacy_id, gl_account_id) FROM stdin;
fc465dee-38af-4f94-a9be-7648a556f095	cashier-1	محمد	closed	1000.00	1500.00	1500.00	0.00	2026-02-10 17:59:21.750668	2026-02-10 18:00:28.792	\N	\N
9b220883-94f5-4dcb-b719-fab235525b9b	cashier-1	أحمد	closed	500.00	500.00	500.00	0.00	2026-02-10 18:03:43.012723	2026-02-10 18:03:56.763	\N	\N
c2a924de-f996-41a5-8292-8187d1e754d4	cashier-1	احمد	closed	0.00	0.00	0.00	0.00	2026-02-10 18:07:25.107363	2026-02-10 18:13:59.799	\N	\N
c2194857-872e-455f-a9e9-f1002381f992	cashier-1	احمد	closed	0.00	0.00	0.00	0.00	2026-02-10 18:14:41.146356	2026-02-10 18:20:25.928	\N	\N
08b81804-4550-4221-948c-2ad8cb30eb04	cashier-1	كاشير	closed	0.00	0.00	0.00	0.00	2026-02-10 18:20:42.749849	2026-02-10 18:41:56.914312	\N	\N
20a48599-d236-4eac-8d82-4c297f4d663c	cashier-1	احمد	closed	0.00	0.00	0.00	0.00	2026-02-10 18:33:07.830981	2026-02-10 18:41:56.914312	\N	\N
b213cdee-9a7e-45a3-9138-7f6c718de4c9	cashier-1	احمد	closed	0.00	0.00	0.00	0.00	2026-02-10 18:33:14.871728	2026-02-10 18:41:56.914312	\N	\N
49a02648-5299-4cc5-9d83-3a8db46cf8a7	cashier-1	احمد	closed	0.00	0.00	0.00	0.00	2026-02-10 18:36:24.05349	2026-02-10 18:46:13.079255	pharmacy-1	\N
6ec558e5-7353-4abc-9f40-ce52a1582c64	cashier-1	كاشير_اختبار	open	500.00	0.00	0.00	0.00	2026-02-10 18:48:22.782723	\N	pharmacy-2	\N
62e5e82f-0d93-45db-910c-4c40665cb6e7	cashier-1	احمد	closed	0.00	6500.00	6500.00	0.00	2026-02-10 19:06:57.13967	2026-02-11 20:47:03.182	pharmacy-1	\N
409c17a1-36f0-4960-9cca-69c6c40fbd7e	cashier-1	كاشير تست	closed	100.00	0.00	100.00	-100.00	2026-02-11 21:25:23.888975	2026-02-11 21:30:08.405	pharmacy-1	759d6696-d436-47a7-ba28-528bbd6a6f7c
242728db-e015-4581-92cb-d22e9de06f71	cashier-1	عنتر	closed	0.00	0.00	0.00	0.00	2026-02-11 21:31:25.287659	2026-02-12 09:50:22.884	pharmacy-1	759d6696-d436-47a7-ba28-528bbd6a6f7c
a8a7f2c7-f9d8-4256-9e08-651c3ff651d4	test-cashier-refund-fp-1770974975881	كاشير اختبار مرتجع	open	0.00	0.00	0.00	0.00	2026-02-13 09:29:35.898157	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
c6527744-e358-4e64-990f-bfc960a027a6	test-cashier-refund-fp2-1770974975944	كاشير اختبار مرتجع 2	open	0.00	0.00	0.00	0.00	2026-02-13 09:29:35.949824	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
564caa26-6a9b-409e-ad6a-8d96c5e131ee	test-cashier-refund-fp-1770975037120	كاشير اختبار مرتجع	open	0.00	0.00	0.00	0.00	2026-02-13 09:30:37.125056	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
39754094-bedd-4d12-a066-ec360d570211	test-cashier-refund-fp2-1770975037154	كاشير اختبار مرتجع 2	open	0.00	0.00	0.00	0.00	2026-02-13 09:30:37.157728	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
f360a496-3fb7-486f-8f04-9c7e38c63fdf	test-cashier-refund-fp-1770975295569	كاشير اختبار مرتجع	open	0.00	0.00	0.00	0.00	2026-02-13 09:34:55.578305	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
8b3f96e4-4ffc-4369-914a-e9311730f996	test-cashier-refund-fp2-1770975295608	كاشير اختبار مرتجع 2	open	0.00	0.00	0.00	0.00	2026-02-13 09:34:55.614978	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
92eacf84-9e06-45cb-86cc-c02f3fd5466b	test-cashier-refund-fp-1770975549933	كاشير اختبار مرتجع	open	0.00	0.00	0.00	0.00	2026-02-13 09:39:09.94254	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
d4499be9-aeb0-44e3-bfbc-049eb2a27604	test-cashier-refund-fp2-1770975549993	كاشير اختبار مرتجع 2	open	0.00	0.00	0.00	0.00	2026-02-13 09:39:10.000409	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
2a8c7772-96b3-47c6-9d52-82778304b2dd	test-cashier-refund-fp-1770976747375	كاشير اختبار مرتجع	open	0.00	0.00	0.00	0.00	2026-02-13 09:59:07.383471	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
313cd148-c9d1-4b3d-aafe-8f72177ef323	test-cashier-refund-fp2-1770976747424	كاشير اختبار مرتجع 2	open	0.00	0.00	0.00	0.00	2026-02-13 09:59:07.427146	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
0bba0a10-b0b9-42f4-b9dc-860a1022dad7	test-cashier-refund-fp-1770976854951	كاشير اختبار مرتجع	open	0.00	0.00	0.00	0.00	2026-02-13 10:00:54.957568	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
60c0da3a-6508-4fbe-aecc-47c0b754c1dd	test-cashier-refund-fp2-1770976855045	كاشير اختبار مرتجع 2	open	0.00	0.00	0.00	0.00	2026-02-13 10:00:55.108934	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
09b42198-f809-437e-b078-ddebb366b1c4	test-cashier-refund-fp-1770976864468	كاشير اختبار مرتجع	open	0.00	0.00	0.00	0.00	2026-02-13 10:01:04.484228	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
dae37bd0-680e-42bb-bedc-65f96d95f662	test-cashier-refund-fp2-1770976864561	كاشير اختبار مرتجع 2	open	0.00	0.00	0.00	0.00	2026-02-13 10:01:04.564547	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
7133085b-99ff-4b08-915b-5efe7b3a106c	test-cashier-refund-fp-1770977010417	كاشير اختبار مرتجع	open	0.00	0.00	0.00	0.00	2026-02-13 10:03:30.425377	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
f3e657cf-c7f2-454b-8094-8b4a064cf74e	test-cashier-refund-fp2-1770977010492	كاشير اختبار مرتجع 2	open	0.00	0.00	0.00	0.00	2026-02-13 10:03:30.496439	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
a423f5f1-d728-40a9-9d50-0e177305f038	test-cashier-refund-fp-1770977879035	كاشير اختبار مرتجع	open	0.00	0.00	0.00	0.00	2026-02-13 10:17:59.0469	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
a8bb044d-11dc-470e-a961-166bef8bf637	test-cashier-refund-fp2-1770977879099	كاشير اختبار مرتجع 2	open	0.00	0.00	0.00	0.00	2026-02-13 10:17:59.108445	\N	pharmacy-1	d95fbb90-f16d-456c-aafa-8cba60a98ade
40224140-a329-4f11-bf62-bce522ca98d3	cashier-1	محمد	open	0.00	0.00	0.00	0.00	2026-02-13 13:29:44.76136	\N	pharmacy-1	759d6696-d436-47a7-ba28-528bbd6a6f7c
\.


--
-- Data for Name: cost_centers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cost_centers (id, code, name, description, parent_id, is_active, created_at, type) FROM stdin;
aeb0a66c-eceb-437a-a1d1-5f1ff1fa3f25	CC-3000	التعاقدات العامة	\N	\N	t	2026-02-05 16:44:48.083112	طبي
8378c236-b401-44d9-b102-014908558722	CC-3100	العمليات	\N	\N	t	2026-02-05 16:44:48.120313	طبي
1bfa550b-36ed-4396-ac80-08957c092cfc	CC-3200	العناية المركزة	\N	\N	t	2026-02-05 16:44:48.124123	طبي
e246cbed-623e-46ef-8210-8296841519fe	CC-3400	الإقامات والحضانة	\N	\N	t	2026-02-05 16:44:48.127809	طبي
85124033-83eb-4a15-bc1e-bfe3b1984be9	CC-3500	المختبر	\N	\N	t	2026-02-05 16:44:48.131388	طبي
a9d8c6ca-2cc9-4495-8a4a-3463ed415277	CC-3650	أشعة عادية / سونار	\N	\N	t	2026-02-05 16:44:48.134757	طبي
313b7eb6-75ad-4e19-837f-cd275c6df744	CC-3660	أشعة مقطعية	\N	\N	t	2026-02-05 16:44:48.137774	طبي
9fe8a184-4622-4cc3-90ff-b9d8f5b36eb7	CC-3670	رنين مغناطيسي	\N	\N	t	2026-02-05 16:44:48.141073	طبي
27ef343a-e2de-4e0a-900b-b469305a119e	CC-3700	الإيكو	\N	\N	t	2026-02-05 16:44:48.155396	طبي
657716c3-59f3-44e1-a335-246a433277f0	CC-3800	صيدلية داخلية	\N	\N	t	2026-02-05 16:44:48.158832	طبي
c92fe4e2-e5fa-477e-9173-98a0df8566a7	CC-3900	صيدلية خارجية	\N	\N	t	2026-02-05 16:44:48.161441	طبي
15b044ed-c343-4fc3-86ad-a3a4a44784de	CC-3950	عيادات خارجية	\N	\N	t	2026-02-05 16:44:48.163509	طبي
31f5dffd-bd13-4461-9ef2-4fa77d92650a	CC-3980	بنك الدم	\N	\N	t	2026-02-05 16:44:48.174863	طبي
fe6ab5f1-c6cd-4000-b10b-e9ab8aaa0b90	CC-4100	التعقيم	\N	\N	t	2026-02-05 16:44:48.177099	خدمي
122817b0-5862-41b9-84f1-3a1078704226	CC-4210	بوفيه ومطبخ	\N	\N	t	2026-02-05 16:44:48.188694	خدمي
7e73f746-6cb7-476d-8c8f-f3d1c2b27537	CC-4700	المصاعد	\N	\N	t	2026-02-05 16:44:48.194343	خدمي
9ca87cb0-9e55-4241-9b78-5309feb32123	CC-4710	تنظيف ألواح شمسية	\N	\N	t	2026-02-05 16:44:48.206064	خدمي
1ef11db8-5e0d-4180-9fa0-67f86dcc7a47	CC-4720	ديزل وطاقة	\N	\N	t	2026-02-05 16:44:48.208752	خدمي
58ad16f1-006c-48f5-9370-c75b59365b04	CC-4840	النظافة	\N	\N	t	2026-02-05 16:44:48.211413	خدمي
9ae23090-2739-4a7f-b40a-d9d7d930e51e	CC-4850	رفع الزبالة	\N	\N	t	2026-02-05 16:44:48.214869	خدمي
e93fad15-0491-4228-bd4b-7b74975d5136	CC-5000	خدمات عامة	\N	\N	t	2026-02-05 16:44:48.219424	إداري
ed7c738f-1f9a-4913-a929-26617e85248a	CC-5100	إدارة عامة	\N	\N	t	2026-02-05 16:44:48.224197	إداري
6b61ad47-a7da-4bd4-8986-7fe5394f5f65	CC-5200	الخزينة	\N	\N	t	2026-02-05 16:44:48.226843	إداري
1c4e242d-0dba-4510-89e3-e18ade3cd007	CC-5210	الكاشير	\N	\N	t	2026-02-05 16:44:48.229463	إداري
d41a3603-3335-4e30-b7eb-558f25ce00ee	CC-5300	موارد بشرية	\N	\N	t	2026-02-05 16:44:48.234661	إداري
ce75abdc-9962-4f57-bd73-2784dd279cb3	CC-6000	تكنولوجيا المعلومات	\N	\N	t	2026-02-05 16:44:48.244783	تقني
e4270d0a-a156-42b2-9650-e00edd974631	CC-7000	البنية التحتية	\N	\N	t	2026-02-05 16:44:48.247254	تقني
49b0ab1f-b7ad-44d5-a6f0-bf1883c25510	CC-9000	مخازن رئيسية	\N	\N	t	2026-02-05 16:44:48.249984	إداري
19a456e4-19a1-471f-80e9-666329d48620	CC-32391	مصروف داخلي (1)	\N	\N	t	2026-02-05 16:44:48.252658	خاص
95ffe063-8ccd-4c65-91c0-f1d429670943	CC-32392	مصروف داخلي (2)	\N	\N	t	2026-02-05 16:44:48.255291	خاص
94fd4738-648a-4f34-bef8-2e5f9f701531	CC999	مركز تكلفة معدل		\N	t	2026-02-05 21:58:16.963513	\N
\.


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.departments (id, code, name_ar, is_active, created_at) FROM stdin;
e0770ff7-7fbb-4cb6-bbeb-d38889ce5bbe	ICU	عناية مركزة	t	2026-02-07 19:24:15.05607
45b62b52-f35e-414b-99aa-3d2af7a7266c	PHARM	صيدلية داخلية	t	2026-02-07 19:23:56.290111
97acdefb-5dac-44bf-8661-f1484c6161ad	pharm	صيدلية خارجية	t	2026-02-07 20:07:34.404674
ce561e66-ec39-4fac-89df-950e7595cea5	Surgery	العمليات	t	2026-02-07 20:08:41.412643
4b00fc6a-0b19-4043-a870-62a509196de3	001	مخزن رئيسى	t	2026-02-07 20:10:26.180956
\.


--
-- Data for Name: doctors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.doctors (id, name, specialty, is_active, created_at) FROM stdin;
0c74913e-64f7-4ec2-a7d3-e7d69fc50c70	دكتور اختبار تلقائي	جراحة	f	2026-02-11 08:56:13.034535
101f9f5f-bb4b-4a39-acc9-168fde4c3131	محمد مصطفى حفناوى	نسا	t	2026-02-11 09:03:22.155707
\.


--
-- Data for Name: drawer_passwords; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.drawer_passwords (id, gl_account_id, password_hash, updated_at) FROM stdin;
40092560-a76c-4f2a-8c11-12b18fe73c2a	759d6696-d436-47a7-ba28-528bbd6a6f7c	$2b$10$GroZh2jIfgqvU.1/ZpP30e.VHAwLAZ/oMudLfmKO6htL7qm3ZwKu6	2026-02-11 21:30:49.602441
\.


--
-- Data for Name: fiscal_periods; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.fiscal_periods (id, name, start_date, end_date, is_closed, closed_at, closed_by, created_at) FROM stdin;
8942ba8e-b4e0-4844-8974-5f4f77222c3b	فترة اختبار مغلقة 1770973010579	2020-01-01	2020-12-31	t	2026-02-13 08:56:50.649	\N	2026-02-13 08:56:50.607874
a603c449-5b39-4cd4-8aa3-f18e18e78a3d	فترة اختبار مغلقة 1770973052731	2020-01-01	2020-12-31	t	2026-02-13 08:57:32.811	\N	2026-02-13 08:57:32.754278
e1b4830b-0250-4387-b7b3-37ad3593e2d0	فترة اختبار مغلقة 1770973076238	2020-01-01	2020-12-31	t	2026-02-13 08:57:56.267	\N	2026-02-13 08:57:56.243899
04c729c7-0aec-4b17-bb58-8820d6667bea	فترة اختبار مغلقة 1770973122970	2020-01-01	2020-12-31	t	2026-02-13 08:58:42.989	\N	2026-02-13 08:58:42.981296
fb9c1129-ae4b-427b-b845-9e48d254b738	فترة اختبار مغلقة 1770973221086	2020-01-01	2020-12-31	t	2026-02-13 09:00:21.157	\N	2026-02-13 09:00:21.113273
f51dcddf-e885-4877-a7e9-e880b54659bc	فترة اختبار مغلقة 1770974043083	2020-01-01	2020-12-31	t	2026-02-13 09:14:03.456	\N	2026-02-13 09:14:03.107899
0667d5d6-34d7-4870-aaa9-dd3415c4981a	فترة اختبار مغلقة 1770974182056	2020-01-01	2020-12-31	t	2026-02-13 09:16:22.187	\N	2026-02-13 09:16:22.131878
43825a97-2b8c-4b97-8790-39a9f79c381e	فترة اختبار مغلقة 1770974622223	2020-01-01	2020-12-31	t	2026-02-13 09:23:42.26	\N	2026-02-13 09:23:42.241261
820f028c-96b3-4336-bbd7-ff3d88322799	فترة اختبار مغلقة 1770974975442	2020-01-01	2020-12-31	t	2026-02-13 09:29:35.477	\N	2026-02-13 09:29:35.460551
becbdbd7-cb09-4b72-805f-a5273c0156b4	فترة اختبار مغلقة 1770975036875	2020-01-01	2020-12-31	t	2026-02-13 09:30:36.899	\N	2026-02-13 09:30:36.880312
3f2a4349-b96e-4593-9f85-99c861ab764a	فترة اختبار مغلقة 1770975295262	2020-01-01	2020-12-31	t	2026-02-13 09:34:55.336	\N	2026-02-13 09:34:55.279736
d498e0bf-a0fc-48c3-81a2-48111b2b0b28	فترة اختبار مغلقة 1770975549476	2020-01-01	2020-12-31	t	2026-02-13 09:39:09.637	\N	2026-02-13 09:39:09.495006
d20a45ff-a0a9-477b-82a9-939e5eeb8e9f	فترة اختبار مغلقة 1770976746424	2020-01-01	2020-12-31	t	2026-02-13 09:59:06.633	\N	2026-02-13 09:59:06.485979
2b23ac9e-6cfb-4e82-b8b1-81ac05a49955	فترة اختبار مغلقة 1770976854281	2020-01-01	2020-12-31	t	2026-02-13 10:00:54.334	\N	2026-02-13 10:00:54.293067
acd9616a-58a5-45ac-aeec-249050af6074	فترة اختبار مغلقة 1770976863865	2020-01-01	2020-12-31	t	2026-02-13 10:01:03.912	\N	2026-02-13 10:01:03.88308
bba101eb-fea7-461d-af48-eed42802a9cc	فترة اختبار مغلقة 1770977010069	2020-01-01	2020-12-31	t	2026-02-13 10:03:30.114	\N	2026-02-13 10:03:30.09296
32dff6df-4b73-47a6-957a-d9e8456de3ec	فترة اختبار مغلقة 1770977878528	2020-01-01	2020-12-31	t	2026-02-13 10:17:58.578	\N	2026-02-13 10:17:58.55229
\.


--
-- Data for Name: inventory_lot_movements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory_lot_movements (id, lot_id, tx_date, tx_type, qty_change_in_minor, unit_cost, reference_type, reference_id, created_at, warehouse_id) FROM stdin;
6e65b243-599c-4c27-b0e4-5b53946c8d5e	4e5c3f55-aafb-44db-a4df-336cc9fe3546	2026-02-07 20:36:26.054751	in	50.0000	36.3000	receiving	a8589b4c-4853-41bc-bb07-b8941c460850	2026-02-07 20:36:26.054751	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
47484ec9-6232-40d1-8467-b036fd164aa4	646aac62-9d18-4c9f-9d12-bd91614dad11	2026-02-07 20:36:26.054751	in	10.0000	26.0000	receiving	a8589b4c-4853-41bc-bb07-b8941c460850	2026-02-07 20:36:26.054751	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
248f7556-2a6c-4c4f-a4f7-41ad44548f79	cd107680-9a9c-4abe-bba9-14913a65a4da	2026-02-07 20:36:26.054751	in	10.0000	50.0000	receiving	a8589b4c-4853-41bc-bb07-b8941c460850	2026-02-07 20:36:26.054751	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
7da0f46a-9af9-4df7-9a05-20e01ea88ed1	466374fa-b1d0-4d30-945b-1fa8ff43251e	2026-02-07 20:36:26.054751	in	17.0000	80.0000	receiving	a8589b4c-4853-41bc-bb07-b8941c460850	2026-02-07 20:36:26.054751	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
94eec4e3-c1a9-481c-925d-df1166e3eb93	4e5c3f55-aafb-44db-a4df-336cc9fe3546	2026-02-07 21:03:05.561196	in	50.0000	36.3000	receiving	dbe7e965-cdf0-4b6c-b2a3-e270903906a9	2026-02-07 21:03:05.561196	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
9a13f5df-3a71-4dbb-aec2-da85e597c08d	0a6c46e9-8381-4c9b-83af-4166243e43e5	2026-02-07 21:03:05.561196	in	10.0000	26.0000	receiving	dbe7e965-cdf0-4b6c-b2a3-e270903906a9	2026-02-07 21:03:05.561196	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
ae71bf05-de3c-4886-96f0-8698daa91731	e3646661-5a01-4ba9-96ed-c45aeea3fc09	2026-02-07 21:03:05.561196	in	10.0000	50.0000	receiving	dbe7e965-cdf0-4b6c-b2a3-e270903906a9	2026-02-07 21:03:05.561196	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
0bcbdf0f-2a1b-49e2-a98f-81cf01f585ca	f0dd0e04-bcd9-43ee-a187-472df8176dee	2026-02-07 21:03:05.561196	in	10.0000	80.0000	receiving	dbe7e965-cdf0-4b6c-b2a3-e270903906a9	2026-02-07 21:03:05.561196	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
3c067571-9fba-415e-8303-6b9d5967d3b6	646aac62-9d18-4c9f-9d12-bd91614dad11	2026-02-07 21:34:33.564	out	-10.0000	26.0000	transfer	9f607de8-6a9a-455c-ae5f-0c16a6fb46ae	2026-02-07 21:34:33.560682	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
f75b303a-85f1-461c-970e-67b77364b788	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	2026-02-07 21:34:33.567	in	10.0000	26.0000	transfer	9f607de8-6a9a-455c-ae5f-0c16a6fb46ae	2026-02-07 21:34:33.560682	b045a6c1-dc79-4480-8907-a8fb6975a92f
65b60fd1-3634-4089-ada1-f29207bc1805	0a6c46e9-8381-4c9b-83af-4166243e43e5	2026-02-07 21:34:33.581	out	-5.0000	26.0000	transfer	9f607de8-6a9a-455c-ae5f-0c16a6fb46ae	2026-02-07 21:34:33.560682	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
b8fd2e96-8219-4f90-ace1-be750c9954ff	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	2026-02-07 21:34:33.583	in	5.0000	26.0000	transfer	9f607de8-6a9a-455c-ae5f-0c16a6fb46ae	2026-02-07 21:34:33.560682	b045a6c1-dc79-4480-8907-a8fb6975a92f
163db3c5-19c4-4967-8590-3b061225a77e	4e5c3f55-aafb-44db-a4df-336cc9fe3546	2026-02-09 10:39:27.246405	in	1.0000	36.3000	receiving	3b8df687-32bf-43aa-8e86-afb557cdbafe	2026-02-09 10:39:27.246405	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
76a92a0c-2eff-4b26-a186-cffa74b41b8a	1a8428a0-5774-4a0f-93f6-bfcbf0ea22d5	2026-02-09 10:39:27.246405	in	1.0000	26.0000	receiving	3b8df687-32bf-43aa-8e86-afb557cdbafe	2026-02-09 10:39:27.246405	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
248abee1-2ca9-405d-9829-b63a5077099a	ae13ac61-c087-4117-8d06-d2ce179f2769	2026-02-09 10:39:27.246405	in	1.0000	50.0000	receiving	3b8df687-32bf-43aa-8e86-afb557cdbafe	2026-02-09 10:39:27.246405	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
35dfac8d-e588-433c-98c4-f8f4a75b95bf	88c481fe-c56e-4306-985e-2ee4eaff0200	2026-02-09 10:39:27.246405	in	1.0000	80.0000	receiving	3b8df687-32bf-43aa-8e86-afb557cdbafe	2026-02-09 10:39:27.246405	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
0c5a14b3-b452-4641-94b1-a0a4bd98450b	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	2026-02-09 11:49:56.212721	out	-1.0000	500.0000	sales_invoice	e0307467-3207-49d8-b24f-2acecfd195e7	2026-02-09 11:49:56.212721	b045a6c1-dc79-4480-8907-a8fb6975a92f
a60e4e69-7d55-4d0b-b862-c977cf9004c3	466374fa-b1d0-4d30-945b-1fa8ff43251e	2026-02-09 21:54:03.522	out	-17.0000	80.0000	transfer	f4284fb9-0b51-4760-8ec5-a6dd060255a2	2026-02-09 21:54:03.518855	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
73e80854-bb13-44ad-b36e-eb48f0f6aa8b	b73c4baf-e1db-4a06-b4e8-9f4cf67b4436	2026-02-09 21:54:03.534	in	17.0000	80.0000	transfer	f4284fb9-0b51-4760-8ec5-a6dd060255a2	2026-02-09 21:54:03.518855	b045a6c1-dc79-4480-8907-a8fb6975a92f
9f323dc7-b4ff-4e78-bf3e-e7a519efe97e	f0dd0e04-bcd9-43ee-a187-472df8176dee	2026-02-09 21:54:03.539	out	-3.0000	80.0000	transfer	f4284fb9-0b51-4760-8ec5-a6dd060255a2	2026-02-09 21:54:03.518855	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
739b16dd-62ba-4dbd-9b56-e2889868c8ae	b73c4baf-e1db-4a06-b4e8-9f4cf67b4436	2026-02-09 21:54:03.54	in	3.0000	80.0000	transfer	f4284fb9-0b51-4760-8ec5-a6dd060255a2	2026-02-09 21:54:03.518855	b045a6c1-dc79-4480-8907-a8fb6975a92f
41e17b9b-1f1c-4759-969d-d0db2d7e4967	466374fa-b1d0-4d30-945b-1fa8ff43251e	2026-02-09 22:01:06.253	out	-17.0000	80.0000	transfer	577c27bd-f849-4b83-b0cc-f862d7f98d7a	2026-02-09 22:01:06.249256	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
24746403-66ae-4d19-a365-0c48e102ed2f	b73c4baf-e1db-4a06-b4e8-9f4cf67b4436	2026-02-09 22:01:06.256	in	17.0000	80.0000	transfer	577c27bd-f849-4b83-b0cc-f862d7f98d7a	2026-02-09 22:01:06.249256	b045a6c1-dc79-4480-8907-a8fb6975a92f
fee6af48-e0b9-48dc-8b94-19976473d160	f0dd0e04-bcd9-43ee-a187-472df8176dee	2026-02-10 18:08:51.053251	out	-10.0000	500.0000	sales_invoice	71434586-d182-41dd-9346-888afa45be64	2026-02-10 18:08:51.053251	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
64a4bc57-2a2c-44d1-8763-77f84d7312ef	88c481fe-c56e-4306-985e-2ee4eaff0200	2026-02-10 18:08:51.053251	out	-1.0000	500.0000	sales_invoice	71434586-d182-41dd-9346-888afa45be64	2026-02-10 18:08:51.053251	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
dceae886-b5dc-4208-bb5d-d97f0b6ba7f3	0a6c46e9-8381-4c9b-83af-4166243e43e5	2026-02-10 18:32:19.455565	out	-2.0000	500.0000	sales_invoice	e8fbdfb4-6d7f-4448-8381-1f9d458ee296	2026-02-10 18:32:19.455565	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
44ab3bf7-717d-4f2e-89e5-05d356809188	01272a58-e1c7-48db-81dd-511284f227ca	2026-02-11 08:19:08.309733	in	10.0000	36.3000	receiving	99028858-c7b9-4106-8709-153fcef90bd9	2026-02-11 08:19:08.309733	b045a6c1-dc79-4480-8907-a8fb6975a92f
3a4f0bd5-187a-4f3b-bb81-2bf60dc63dfb	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	2026-02-11 08:19:08.309733	in	10.0000	26.0000	receiving	99028858-c7b9-4106-8709-153fcef90bd9	2026-02-11 08:19:08.309733	b045a6c1-dc79-4480-8907-a8fb6975a92f
6d166ec7-065b-4a6d-a115-fe42be05fbad	3c1ae70b-1a7c-4dc9-ac15-49093338e6d9	2026-02-11 08:19:08.309733	in	10.0000	50.0000	receiving	99028858-c7b9-4106-8709-153fcef90bd9	2026-02-11 08:19:08.309733	b045a6c1-dc79-4480-8907-a8fb6975a92f
6426dde3-8a62-4614-b60c-dabc78e62d6d	b73c4baf-e1db-4a06-b4e8-9f4cf67b4436	2026-02-11 08:19:08.309733	in	10.0000	80.0000	receiving	99028858-c7b9-4106-8709-153fcef90bd9	2026-02-11 08:19:08.309733	b045a6c1-dc79-4480-8907-a8fb6975a92f
c5bf768e-1e17-4414-9771-4e70ef04dcff	01272a58-e1c7-48db-81dd-511284f227ca	2026-02-11 20:13:40.781302	out	-1.0000	36.3000	sales_invoice	f6b78c28-4202-42ac-9a8c-e7746ec774e3	2026-02-11 20:13:40.781302	b045a6c1-dc79-4480-8907-a8fb6975a92f
49ef5ac5-27bb-4ba2-9fce-043d7e5c424d	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	2026-02-11 20:13:40.781302	out	-1.0000	26.0000	sales_invoice	f6b78c28-4202-42ac-9a8c-e7746ec774e3	2026-02-11 20:13:40.781302	b045a6c1-dc79-4480-8907-a8fb6975a92f
94a73ab1-6e7d-474c-bfee-0665faef43e9	3c1ae70b-1a7c-4dc9-ac15-49093338e6d9	2026-02-11 20:13:40.781302	out	-1.0000	50.0000	sales_invoice	f6b78c28-4202-42ac-9a8c-e7746ec774e3	2026-02-11 20:13:40.781302	b045a6c1-dc79-4480-8907-a8fb6975a92f
55359762-18aa-4415-bfcc-ae327fe79f6f	b73c4baf-e1db-4a06-b4e8-9f4cf67b4436	2026-02-11 20:13:40.781302	out	-1.0000	80.0000	sales_invoice	f6b78c28-4202-42ac-9a8c-e7746ec774e3	2026-02-11 20:13:40.781302	b045a6c1-dc79-4480-8907-a8fb6975a92f
82e32338-c74b-499d-91bb-a6d5227ea913	3c1ae70b-1a7c-4dc9-ac15-49093338e6d9	2026-02-11 20:41:48.901621	out	-1.0000	50.0000	sales_invoice	a6e725f0-4870-4766-a415-0a3040622941	2026-02-11 20:41:48.901621	b045a6c1-dc79-4480-8907-a8fb6975a92f
13186517-0b7d-4873-a3c5-58144d55a596	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	2026-02-11 20:41:48.901621	out	-2.0000	26.0000	sales_invoice	a6e725f0-4870-4766-a415-0a3040622941	2026-02-11 20:41:48.901621	b045a6c1-dc79-4480-8907-a8fb6975a92f
28326e2b-40f0-4ae2-b4de-a83a927fcfab	b73c4baf-e1db-4a06-b4e8-9f4cf67b4436	2026-02-11 20:41:48.901621	out	-5.0000	80.0000	sales_invoice	a6e725f0-4870-4766-a415-0a3040622941	2026-02-11 20:41:48.901621	b045a6c1-dc79-4480-8907-a8fb6975a92f
74ef85f4-a720-48d3-b02d-6ac3f56c28f1	d96b5973-ed68-4581-ba2b-79f5397eadf7	2026-02-07 20:36:26.054751	in	330.0000	5.0000	receiving	a8589b4c-4853-41bc-bb07-b8941c460850	2026-02-07 20:36:26.054751	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
3155cc47-037a-48cc-b4f1-3a3800367bfc	79acee20-0f2d-44de-bb83-b5a250ad913b	2026-02-07 21:03:05.561196	in	180.0000	5.0000	receiving	dbe7e965-cdf0-4b6c-b2a3-e270903906a9	2026-02-07 21:03:05.561196	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
1d4c48f0-ff27-40da-a97e-a2c371e5f50b	313ec413-7818-4d87-a2b6-c07e901298b2	2026-02-09 10:39:27.246405	in	30.0000	5.0000	receiving	3b8df687-32bf-43aa-8e86-afb557cdbafe	2026-02-09 10:39:27.246405	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0
861388d2-c9f2-494d-be7a-6942fb1e972a	880d9abc-661e-4741-94ed-2389d435b387	2026-02-11 08:19:08.309733	in	300.0000	5.0000	receiving	99028858-c7b9-4106-8709-153fcef90bd9	2026-02-11 08:19:08.309733	b045a6c1-dc79-4480-8907-a8fb6975a92f
aef039d6-1802-4b9f-ad20-32eb08dcd6cd	880d9abc-661e-4741-94ed-2389d435b387	2026-02-11 20:13:40.781302	out	-30.0000	5.0000	sales_invoice	f6b78c28-4202-42ac-9a8c-e7746ec774e3	2026-02-11 20:13:40.781302	b045a6c1-dc79-4480-8907-a8fb6975a92f
a1e2dd4d-5e7a-468f-90ac-dcfb1f080428	880d9abc-661e-4741-94ed-2389d435b387	2026-02-11 20:41:48.901621	out	-60.0000	5.0000	sales_invoice	a6e725f0-4870-4766-a415-0a3040622941	2026-02-11 20:41:48.901621	b045a6c1-dc79-4480-8907-a8fb6975a92f
4fc98aaf-53ad-4013-bed5-c3c2b5c4acaf	e988c0c4-fc83-426f-b189-1031ca966dc0	2026-02-13 10:01:00.552103	out	-1.0000	0.5000	sales_invoice	bce196dc-5062-4860-82c9-828e2e88566b	2026-02-13 10:01:00.552103	8481eec7-6c7f-44c6-99bc-5a39f708f519
55ec734e-044a-418b-ae23-407fd20f0f85	e988c0c4-fc83-426f-b189-1031ca966dc0	2026-02-13 10:01:00.703414	out	-1.0000	0.5000	sales_invoice	7df17c10-a6b5-4d6d-885c-51aba7224613	2026-02-13 10:01:00.703414	8481eec7-6c7f-44c6-99bc-5a39f708f519
\.


--
-- Data for Name: inventory_lots; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory_lots (id, item_id, expiry_date, received_date, purchase_price, qty_in_minor, is_active, created_at, updated_at, warehouse_id, expiry_month, expiry_year, sale_price) FROM stdin;
cf6283f6-65bd-4e0f-a8c7-11307bb7cf06	e5b165e0-b858-4ce1-b37a-283fa198e85b	2026-03-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.416506	2026-02-13 10:00:58.416506	8481eec7-6c7f-44c6-99bc-5a39f708f519	3	2026	0.00
466374fa-b1d0-4d30-945b-1fa8ff43251e	4b75a55e-1cbe-48b9-8243-31708a3577ec	\N	2026-02-07	80.0000	0.0000	t	2026-02-07 20:36:26.054751	2026-02-09 22:01:06.249256	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	12	2029	150.00
56a000c9-ab1f-45a5-acba-2a6e879edf4c	e5b165e0-b858-4ce1-b37a-283fa198e85b	2026-06-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.419653	2026-02-13 10:00:58.419653	8481eec7-6c7f-44c6-99bc-5a39f708f519	6	2026	0.00
f0dd0e04-bcd9-43ee-a187-472df8176dee	4b75a55e-1cbe-48b9-8243-31708a3577ec	\N	2026-02-07	80.0000	0.0000	t	2026-02-07 21:03:05.561196	2026-02-10 18:08:51.058	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	12	2030	200.00
cd107680-9a9c-4abe-bba9-14913a65a4da	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	\N	2026-02-07	50.0000	10.0000	t	2026-02-07 20:36:26.054751	2026-02-07 20:36:26.054751	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	12	2030	100.00
88c481fe-c56e-4306-985e-2ee4eaff0200	4b75a55e-1cbe-48b9-8243-31708a3577ec	\N	2026-02-09	80.0000	0.0000	t	2026-02-09 10:39:27.246405	2026-02-10 18:08:51.07	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	12	2040	500.00
60128457-feee-423c-b824-5ae54a6560dc	e5b165e0-b858-4ce1-b37a-283fa198e85b	2026-12-01	2026-02-13	1.0000	200.0000	t	2026-02-13 10:00:58.422681	2026-02-13 10:00:58.422681	8481eec7-6c7f-44c6-99bc-5a39f708f519	12	2026	0.00
0a6c46e9-8381-4c9b-83af-4166243e43e5	227cc6a5-2eea-430b-913f-143bb33e4d9a	\N	2026-02-07	26.0000	3.0000	t	2026-02-07 21:03:05.561196	2026-02-10 18:32:19.461	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	12	2030	50.00
e3646661-5a01-4ba9-96ed-c45aeea3fc09	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	\N	2026-02-07	50.0000	10.0000	t	2026-02-07 21:03:05.561196	2026-02-07 21:03:05.561196	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	1	2029	100.00
5eeb3531-4e54-4096-994e-cf6e1491e517	227cc6a5-2eea-430b-913f-143bb33e4d9a	2026-12-31	2026-02-10	26.0000	10.0000	t	2026-02-10 20:03:35.009882	2026-02-10 20:03:35.009882	c2e71ee4-9535-435a-95c9-88fcc7fa56bf	\N	\N	500.00
75e1d442-3ac2-426a-b86d-c436f1822dd0	db5ddfea-a442-48fa-a49d-e5b88a461395	2026-03-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.432284	2026-02-13 10:00:58.432284	8481eec7-6c7f-44c6-99bc-5a39f708f519	3	2026	0.00
646aac62-9d18-4c9f-9d12-bd91614dad11	227cc6a5-2eea-430b-913f-143bb33e4d9a	\N	2026-02-07	26.0000	0.0000	t	2026-02-07 20:36:26.054751	2026-02-07 21:34:33.560682	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	12	2029	50.00
90462d58-20b2-4864-9288-21c07d4e808c	db5ddfea-a442-48fa-a49d-e5b88a461395	2026-06-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.435045	2026-02-13 10:00:58.435045	8481eec7-6c7f-44c6-99bc-5a39f708f519	6	2026	0.00
4e5c3f55-aafb-44db-a4df-336cc9fe3546	0396b137-8815-455d-bfc2-6a08d6351004	\N	2026-02-07	36.3000	101.0000	t	2026-02-07 20:36:26.054751	2026-02-09 10:39:27.251	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	\N	\N	500.00
1a8428a0-5774-4a0f-93f6-bfcbf0ea22d5	227cc6a5-2eea-430b-913f-143bb33e4d9a	\N	2026-02-09	26.0000	1.0000	t	2026-02-09 10:39:27.246405	2026-02-09 10:39:27.246405	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	12	2040	500.00
ae13ac61-c087-4117-8d06-d2ce179f2769	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	\N	2026-02-09	50.0000	1.0000	t	2026-02-09 10:39:27.246405	2026-02-09 10:39:27.246405	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	12	2040	500.00
3c1ae70b-1a7c-4dc9-ac15-49093338e6d9	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	\N	2026-02-11	50.0000	8.0000	t	2026-02-11 08:19:08.309733	2026-02-11 20:41:48.907	b045a6c1-dc79-4480-8907-a8fb6975a92f	12	2029	500.00
1edf3007-e6b1-4c3d-8d56-87de62c835d6	db5ddfea-a442-48fa-a49d-e5b88a461395	2026-12-01	2026-02-13	1.0000	200.0000	t	2026-02-13 10:00:58.442215	2026-02-13 10:00:58.442215	8481eec7-6c7f-44c6-99bc-5a39f708f519	12	2026	0.00
45d13fbb-af99-468f-b5e1-95df4ced7d47	d3ea2c56-4a92-451d-83c4-20ac8eb951f6	2026-03-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.453183	2026-02-13 10:00:58.453183	8481eec7-6c7f-44c6-99bc-5a39f708f519	3	2026	0.00
386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	227cc6a5-2eea-430b-913f-143bb33e4d9a	\N	2026-02-07	26.0000	21.0000	t	2026-02-07 21:34:33.560682	2026-02-11 20:41:48.912	b045a6c1-dc79-4480-8907-a8fb6975a92f	12	2029	500.00
b73c4baf-e1db-4a06-b4e8-9f4cf67b4436	4b75a55e-1cbe-48b9-8243-31708a3577ec	\N	2026-02-09	80.0000	21.0000	t	2026-02-09 21:54:03.518855	2026-02-11 20:41:48.916	b045a6c1-dc79-4480-8907-a8fb6975a92f	12	2029	500.00
21d74234-2fd2-4deb-bf34-eb22c31459f7	d3ea2c56-4a92-451d-83c4-20ac8eb951f6	2026-06-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.455963	2026-02-13 10:00:58.455963	8481eec7-6c7f-44c6-99bc-5a39f708f519	6	2026	0.00
d96b5973-ed68-4581-ba2b-79f5397eadf7	31ca9617-f155-4147-9acd-4529df6bc51d	\N	2026-02-07	5.0000	330.0000	t	2026-02-07 20:36:26.054751	2026-02-07 20:36:26.054751	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	12	2029	300.00
79acee20-0f2d-44de-bb83-b5a250ad913b	31ca9617-f155-4147-9acd-4529df6bc51d	\N	2026-02-07	5.0000	180.0000	t	2026-02-07 21:03:05.561196	2026-02-07 21:03:05.561196	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	1	2029	300.00
313ec413-7818-4d87-a2b6-c07e901298b2	31ca9617-f155-4147-9acd-4529df6bc51d	\N	2026-02-09	5.0000	30.0000	t	2026-02-09 10:39:27.246405	2026-02-09 10:39:27.246405	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	12	2040	500.00
880d9abc-661e-4741-94ed-2389d435b387	31ca9617-f155-4147-9acd-4529df6bc51d	\N	2026-02-11	5.0000	210.0000	t	2026-02-11 08:19:08.309733	2026-02-11 20:41:48.919	b045a6c1-dc79-4480-8907-a8fb6975a92f	12	2029	500.00
18e8c429-9cf9-49be-9cc3-9e8c82b5932f	eb85e8b5-1daf-41d9-be5b-ade264c02b4f	2026-03-01	2026-02-13	1.0000	5.0000	t	2026-02-13 10:00:58.376792	2026-02-13 10:00:58.376792	8481eec7-6c7f-44c6-99bc-5a39f708f519	3	2026	0.00
ef946486-2020-424f-becb-6cb276c0832e	eb85e8b5-1daf-41d9-be5b-ade264c02b4f	2026-06-01	2026-02-13	1.0000	5.0000	t	2026-02-13 10:00:58.382166	2026-02-13 10:00:58.382166	8481eec7-6c7f-44c6-99bc-5a39f708f519	6	2026	0.00
f7ab2176-8c4a-45df-bb44-cb4ebbf7dcf6	eb85e8b5-1daf-41d9-be5b-ade264c02b4f	2026-12-01	2026-02-13	1.0000	200.0000	t	2026-02-13 10:00:58.386528	2026-02-13 10:00:58.386528	8481eec7-6c7f-44c6-99bc-5a39f708f519	12	2026	0.00
0f36212d-f251-490c-9c62-98dd65c51ab9	bfcc0e73-b810-4eab-9924-b17a0dbe7ee1	2026-03-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.400312	2026-02-13 10:00:58.400312	8481eec7-6c7f-44c6-99bc-5a39f708f519	3	2026	0.00
01272a58-e1c7-48db-81dd-511284f227ca	0396b137-8815-455d-bfc2-6a08d6351004	\N	2026-02-11	36.3000	9.0000	t	2026-02-11 08:19:08.309733	2026-02-11 20:13:40.787	b045a6c1-dc79-4480-8907-a8fb6975a92f	\N	\N	500.00
443f9eed-1795-423a-b416-4971e4cb3ef6	d3ea2c56-4a92-451d-83c4-20ac8eb951f6	2026-12-01	2026-02-13	1.0000	200.0000	t	2026-02-13 10:00:58.458673	2026-02-13 10:00:58.458673	8481eec7-6c7f-44c6-99bc-5a39f708f519	12	2026	0.00
a15ccf73-84a3-4c9b-b370-63226e455ba8	bfcc0e73-b810-4eab-9924-b17a0dbe7ee1	2026-06-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.403679	2026-02-13 10:00:58.403679	8481eec7-6c7f-44c6-99bc-5a39f708f519	6	2026	0.00
dbb36352-eef5-4d2e-810e-0a45708e4c5a	bfcc0e73-b810-4eab-9924-b17a0dbe7ee1	2026-12-01	2026-02-13	1.0000	200.0000	t	2026-02-13 10:00:58.406353	2026-02-13 10:00:58.406353	8481eec7-6c7f-44c6-99bc-5a39f708f519	12	2026	0.00
d0caae5b-2624-40be-9b1f-b4bf25ba2f87	ef11c023-0141-42aa-b9be-bc21c2bf48e7	2026-03-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.485613	2026-02-13 10:00:58.485613	8481eec7-6c7f-44c6-99bc-5a39f708f519	3	2026	0.00
2496d745-55ed-4b2d-ba4c-92c21a58502f	ef11c023-0141-42aa-b9be-bc21c2bf48e7	2026-06-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.52796	2026-02-13 10:00:58.52796	8481eec7-6c7f-44c6-99bc-5a39f708f519	6	2026	0.00
6851d394-9e33-4a04-9a34-5aaf764512bc	ef11c023-0141-42aa-b9be-bc21c2bf48e7	2026-12-01	2026-02-13	1.0000	200.0000	t	2026-02-13 10:00:58.53136	2026-02-13 10:00:58.53136	8481eec7-6c7f-44c6-99bc-5a39f708f519	12	2026	0.00
33be8d93-4c4a-412a-826c-968ecf7ed430	e58555be-34ad-4ac0-a9de-720abc0cc9cc	2026-03-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.541872	2026-02-13 10:00:58.541872	8481eec7-6c7f-44c6-99bc-5a39f708f519	3	2026	0.00
cfa80341-2bd9-4df3-b9ce-3dabf12c5d3c	e58555be-34ad-4ac0-a9de-720abc0cc9cc	2026-06-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.544916	2026-02-13 10:00:58.544916	8481eec7-6c7f-44c6-99bc-5a39f708f519	6	2026	0.00
25d9a69d-9a62-4efb-b7c4-ac08c9263fd7	e58555be-34ad-4ac0-a9de-720abc0cc9cc	2026-12-01	2026-02-13	1.0000	200.0000	t	2026-02-13 10:00:58.547634	2026-02-13 10:00:58.547634	8481eec7-6c7f-44c6-99bc-5a39f708f519	12	2026	0.00
2e0606fa-3232-4e48-9630-6092e90f17b2	4475c0d4-c090-42ac-91ae-40e49c3162cd	2026-03-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.555997	2026-02-13 10:00:58.555997	8481eec7-6c7f-44c6-99bc-5a39f708f519	3	2026	0.00
8cd7a65f-e65c-427e-88de-f53915728f6c	4475c0d4-c090-42ac-91ae-40e49c3162cd	2026-06-01	2026-02-13	1.0000	50.0000	t	2026-02-13 10:00:58.558585	2026-02-13 10:00:58.558585	8481eec7-6c7f-44c6-99bc-5a39f708f519	6	2026	0.00
361f82c5-0a26-45ad-8f70-6e1082885e74	4475c0d4-c090-42ac-91ae-40e49c3162cd	2026-12-01	2026-02-13	1.0000	200.0000	t	2026-02-13 10:00:58.56136	2026-02-13 10:00:58.56136	8481eec7-6c7f-44c6-99bc-5a39f708f519	12	2026	0.00
5d063284-2384-4721-989b-db066466b5a6	b4cdf6d3-c975-4c87-ac8b-3e3b05f2d53a	\N	2026-02-13	0.5000	500.0000	t	2026-02-13 10:00:58.602156	2026-02-13 10:00:58.602156	8481eec7-6c7f-44c6-99bc-5a39f708f519	\N	\N	0.00
e988c0c4-fc83-426f-b189-1031ca966dc0	0edb5c4c-6323-4929-acb2-567cabc98bba	\N	2026-02-13	0.5000	498.0000	t	2026-02-13 10:00:58.570857	2026-02-13 10:01:00.707	8481eec7-6c7f-44c6-99bc-5a39f708f519	\N	\N	0.00
\.


--
-- Data for Name: item_barcodes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.item_barcodes (id, item_id, barcode_value, barcode_type, is_active, created_at) FROM stdin;
e8034104-b19a-4180-a83e-53c32f1d12ac	227cc6a5-2eea-430b-913f-143bb33e4d9a	6223000013748	EAN-13	t	2026-02-07 19:34:35.162384
598fa429-53b9-4fe6-9478-bda6e86c7bbf	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	6225897563129	EAN-13	t	2026-02-07 19:51:32.213654
05bc128b-234f-4d1d-932b-28e22c46b273	eb85e8b5-1daf-41d9-be5b-ade264c02b4f	6901234560001	EAN13	t	2026-02-13 10:00:58.368728
4967b002-d293-4c8e-ac6c-4534af1d0aa1	bfcc0e73-b810-4eab-9924-b17a0dbe7ee1	6901234560002	EAN13	t	2026-02-13 10:00:58.394424
48afe999-8112-4389-8520-56b2380a6286	e5b165e0-b858-4ce1-b37a-283fa198e85b	6901234560003	EAN13	t	2026-02-13 10:00:58.412922
92d4ef69-da18-410f-95e6-055b2f7df84f	db5ddfea-a442-48fa-a49d-e5b88a461395	6901234560004	EAN13	t	2026-02-13 10:00:58.429131
5ecfe5a3-ef6b-45d7-9fc2-e80d9c756174	d3ea2c56-4a92-451d-83c4-20ac8eb951f6	6901234560005	EAN13	t	2026-02-13 10:00:58.449458
6122f9d6-c738-4f0d-9f34-75487c5773b5	ef11c023-0141-42aa-b9be-bc21c2bf48e7	6901234560006	EAN13	t	2026-02-13 10:00:58.4662
3ff8e579-a836-4092-8aa5-a8ecd9c1446a	e58555be-34ad-4ac0-a9de-720abc0cc9cc	6901234560007	EAN13	t	2026-02-13 10:00:58.538718
c223b792-a83a-4987-97ba-2c9df64a1a69	4475c0d4-c090-42ac-91ae-40e49c3162cd	6901234560008	EAN13	t	2026-02-13 10:00:58.553039
1e1e365b-e873-4d4d-aa95-a0a6e2c5b6e3	0edb5c4c-6323-4929-acb2-567cabc98bba	6901234560009	EAN13	t	2026-02-13 10:00:58.567826
e8cf655a-06b9-40e9-8eb3-e3bfa8b21f4d	b4cdf6d3-c975-4c87-ac8b-3e3b05f2d53a	6901234560010	EAN13	t	2026-02-13 10:00:58.596682
\.


--
-- Data for Name: item_department_prices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.item_department_prices (id, item_id, department_id, sale_price, created_at, updated_at) FROM stdin;
73562c6c-b3bf-43ec-b5f6-ae109c921f67	227cc6a5-2eea-430b-913f-143bb33e4d9a	ce561e66-ec39-4fac-89df-950e7595cea5	1000.00	2026-02-07 21:05:14.776696	2026-02-07 21:05:14.776696
\.


--
-- Data for Name: item_form_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.item_form_types (id, name_ar, sort_order, is_active, created_at) FROM stdin;
a578c8b1-9f33-4eb5-b9aa-c94bb42fdfa1	امبول	0	t	2026-02-07 19:30:26.274952
ad9d5cca-b71c-4eaa-8155-03549201ae79	مستلزمات	0	t	2026-02-07 19:38:03.493135
7beb9265-951e-4bca-9878-0a9b045c44a6	أقراص	0	t	2026-02-07 19:44:51.131974
8d2b9361-dad5-4941-9431-fb60ea5eccda	خدمة	0	t	2026-02-07 19:54:44.350246
6e64eeec-42a1-4a34-acef-8d90de3ba156	أقراص	0	t	2026-02-07 20:26:11.038297
dab71df4-939d-48f6-af47-1ae6bda94754	حقن	0	t	2026-02-07 20:27:41.690901
\.


--
-- Data for Name: item_uoms; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.item_uoms (id, code, name_ar, name_en, description, is_active, created_at) FROM stdin;
9f0d7317-05bd-4f5b-8578-6cf031889536	علبة	علبة	\N	\N	t	2026-02-07 19:30:46.588725
dee8c908-a9b2-4fc9-8a95-3d9ec4e02650	amp	امبول	amp	\N	t	2026-02-07 19:31:47.601582
1b851346-bbbd-4251-b882-6bc3988e2749	سنتى	سنتى	ml	\N	t	2026-02-07 19:33:54.736641
2101fd6d-7a46-49d5-aff7-440622a86b33	BOX	علبة	Box	\N	t	2026-02-07 19:44:58.654203
7b7fa6c9-a14f-4252-b1cc-65f766e75016	STR	شريط	Strip	\N	t	2026-02-07 19:44:58.677379
118975e7-d6f3-470f-be70-da0196e66f9b	TAB	قرص	Tablet	\N	t	2026-02-07 19:44:58.694472
45ab2abd-fec5-4363-8116-918b6dbed27a	وحدة	وحدة	unit	\N	t	2026-02-07 19:49:52.424369
9be88c4c-ceae-4852-b556-4e667fbf02cd	BOX2	علبة2	Box2	\N	t	2026-02-07 20:26:11.083017
1e60bde8-3929-40a7-8cdf-d686e4faf5b4	AMP	أمبول	Ampoule	\N	t	2026-02-07 20:27:48.492152
50e88649-e3ed-410c-bfec-8e82e87c7d20	TST-MLKPWA2V	وحدة تست TST-MLKPWA2V	Test Unit TST-MLKPWA2V	\N	t	2026-02-13 10:00:59.645197
\.


--
-- Data for Name: items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.items (id, item_code, name_ar, name_en, category, is_toxic, form_type_id, purchase_price_last, sale_price_current, major_unit_name, medium_unit_name, minor_unit_name, major_to_medium, major_to_minor, medium_to_minor, description, is_active, created_at, updated_at, has_expiry) FROM stdin;
eb85e8b5-1daf-41d9-be5b-ade264c02b4f	DEMO-DRUG-001	أموكسيسيلين 500مجم	Amoxicillin 500mg	drug	f	\N	0.00	150.00	علبة	شريط	قرص	10.0000	100.0000	10.0000	\N	t	2026-02-13 10:00:58.350189	2026-02-13 10:00:58.350189	t
bfcc0e73-b810-4eab-9924-b17a0dbe7ee1	DEMO-DRUG-002	باراسيتامول 500مجم	Paracetamol 500mg	drug	f	\N	0.00	80.00	علبة	شريط	قرص	10.0000	100.0000	10.0000	\N	t	2026-02-13 10:00:58.391307	2026-02-13 10:00:58.391307	t
e5b165e0-b858-4ce1-b37a-283fa198e85b	DEMO-DRUG-003	أوميبرازول 20مجم	Omeprazole 20mg	drug	f	\N	0.00	200.00	علبة	شريط	قرص	10.0000	100.0000	10.0000	\N	t	2026-02-13 10:00:58.410195	2026-02-13 10:00:58.410195	t
db5ddfea-a442-48fa-a49d-e5b88a461395	DEMO-DRUG-004	ميتفورمين 850مجم	Metformin 850mg	drug	f	\N	0.00	120.00	علبة	شريط	قرص	10.0000	100.0000	10.0000	\N	t	2026-02-13 10:00:58.426405	2026-02-13 10:00:58.426405	t
d3ea2c56-4a92-451d-83c4-20ac8eb951f6	DEMO-DRUG-005	أملوديبين 5مجم	Amlodipine 5mg	drug	f	\N	0.00	180.00	علبة	شريط	قرص	10.0000	100.0000	10.0000	\N	t	2026-02-13 10:00:58.446546	2026-02-13 10:00:58.446546	t
ef11c023-0141-42aa-b9be-bc21c2bf48e7	DEMO-DRUG-006	سيبروفلوكساسين 500مجم	Ciprofloxacin 500mg	drug	f	\N	0.00	250.00	علبة	شريط	قرص	10.0000	100.0000	10.0000	\N	t	2026-02-13 10:00:58.462466	2026-02-13 10:00:58.462466	t
e58555be-34ad-4ac0-a9de-720abc0cc9cc	DEMO-DRUG-007	ديكلوفيناك 50مجم	Diclofenac 50mg	drug	f	\N	0.00	90.00	علبة	شريط	قرص	10.0000	100.0000	10.0000	\N	t	2026-02-13 10:00:58.535207	2026-02-13 10:00:58.535207	t
4475c0d4-c090-42ac-91ae-40e49c3162cd	DEMO-DRUG-008	أزيثروميسين 250مجم	Azithromycin 250mg	drug	f	\N	0.00	300.00	علبة	شريط	قرص	10.0000	100.0000	10.0000	\N	t	2026-02-13 10:00:58.550992	2026-02-13 10:00:58.550992	t
0edb5c4c-6323-4929-acb2-567cabc98bba	DEMO-DRUG-009	شاش طبي	Medical Gauze	supply	f	\N	0.00	50.00	علبة	شريط	قرص	10.0000	100.0000	10.0000	\N	t	2026-02-13 10:00:58.564816	2026-02-13 10:00:58.564816	f
b4cdf6d3-c975-4c87-ac8b-3e3b05f2d53a	DEMO-DRUG-010	قطن طبي	Medical Cotton	supply	f	\N	0.00	40.00	علبة	شريط	قرص	10.0000	100.0000	10.0000	\N	t	2026-02-13 10:00:58.574158	2026-02-13 10:00:58.574158	f
1d528470-5860-459c-ad0e-abed1eddfe09	suger	قياس سكر	قياس سكر	service	f	8d2b9361-dad5-4941-9431-fb60ea5eccda	0.00	20.00	\N	\N	\N	\N	\N	\N		t	2026-02-07 20:05:59.490607	2026-02-07 20:05:59.490607	f
0396b137-8815-455d-bfc2-6a08d6351004	47256	ابرة نصفى مقاسات	SPINAL NEEDLE	supply	f	ad9d5cca-b71c-4eaa-8155-03549201ae79	36.30	500.00	وحدة	\N	\N	\N	\N	\N		t	2026-02-07 19:50:32.730522	2026-02-11 08:19:08.32	f
227cc6a5-2eea-430b-913f-143bb33e4d9a	74350	ادولور 30مجم امبول	ADOLOR 30MG AMP	drug	f	a578c8b1-9f33-4eb5-b9aa-c94bb42fdfa1	26.00	500.00	علبة	امبول	سنتى	1.0000	1.0000	1.0000		t	2026-02-07 19:34:02.87576	2026-02-11 08:19:08.324	t
b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	ITEM001	باراسيتامول	Paracetamol	drug	f	7beb9265-951e-4bca-9878-0a9b045c44a6	50.00	500.00	علبة	شريط	\N	3.0000	\N	\N		t	2026-02-07 19:46:30.679894	2026-02-11 08:19:08.327	t
4b75a55e-1cbe-48b9-8243-31708a3577ec	ITEM002	أموكسيسيلين	Amoxicillin	drug	f	7beb9265-951e-4bca-9878-0a9b045c44a6	80.00	500.00	علبة	شريط	\N	3.0000	\N	\N		t	2026-02-07 19:47:54.671149	2026-02-11 08:19:08.33	t
31ca9617-f155-4147-9acd-4529df6bc51d	ITEM003	إيبوبروفين	Ibuprofen	drug	f	7beb9265-951e-4bca-9878-0a9b045c44a6	150.00	500.00	علبة	شريط	قرص	3.0000	30.0000	10.0000		t	2026-02-07 19:48:26.535016	2026-02-11 08:19:08.334	t
c79f8020-5245-4485-9823-5e2ce772eb2b	T-mlkpwazo	صنف اختبار mlkpwazo	Test Item mlkpwazo	drug	f	a578c8b1-9f33-4eb5-b9aa-c94bb42fdfa1	0.00	0.00	علبة	شريط	قرص	3.0000	30.0000	10.0000	\N	t	2026-02-13 10:01:00.345321	2026-02-13 10:01:00.345321	t
\.


--
-- Data for Name: journal_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.journal_entries (id, entry_number, entry_date, description, status, period_id, total_debit, total_credit, reference, created_by, posted_by, posted_at, reversed_by, reversed_at, reversal_entry_id, template_id, created_at, updated_at, source_type, source_document_id) FROM stdin;
3ba82031-88ae-4561-9c52-8492fc89faf5	41	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:30:36.916271	2026-02-13 09:30:36.916271	\N	\N
519c109d-ae4a-446f-ac6b-302ea1c253b8	42	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 09:30:37.531	\N	\N	\N	\N	2026-02-13 09:30:37.514161	2026-02-13 09:30:37.514161	\N	\N
c30b6021-03f6-464e-99c1-7521e0b8222e	43	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 09:30:37.634	\N	\N	\N	\N	2026-02-13 09:30:37.621078	2026-02-13 09:30:37.621078	\N	\N
c25bcbf2-3b75-4f1f-b40e-8d23b5f49bbe	44	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 09:30:37.664	\N	\N	\N	\N	2026-02-13 09:30:37.652164	2026-02-13 09:30:37.652164	\N	\N
2b93e433-538a-4bd7-af43-937b15b6703d	45	2026-02-13	اختبار التقريب	draft	\N	100.46	100.46	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:30:37.695182	2026-02-13 09:30:37.695182	\N	\N
6b45e3cd-4699-49b8-b810-33a3651252e0	46	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:34:55.374671	2026-02-13 09:34:55.374671	\N	\N
cc1dcb15-5d82-43e6-abf1-4b32ebaade0f	47	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 09:34:56.081	\N	\N	\N	\N	2026-02-13 09:34:56.066071	2026-02-13 09:34:56.066071	\N	\N
325f54f8-8fb8-48b7-a9b1-83f5bec1bfcc	2	2026-02-11	قيد فاتورة مبيعات رقم 10 (تم التحصيل)	posted	\N	5802.00	5802.00	SI-10	\N	\N	2026-02-11 21:44:01.75	\N	\N	\N	\N	2026-02-11 20:59:01.007421	2026-02-11 20:59:01.007421	sales_invoice	a6e725f0-4870-4766-a415-0a3040622941
a81382c0-0e85-4070-b61d-12baeb6b4b76	1	2026-02-11	قيد فاتورة مبيعات رقم 9	posted	\N	2500.00	2500.00	SI-9	\N	\N	2026-02-11 21:44:42.115	\N	\N	\N	\N	2026-02-11 20:30:05.056264	2026-02-11 20:30:05.056264	sales_invoice	f6b78c28-4202-42ac-9a8c-e7746ec774e3
b4331787-4c3d-410a-ad72-f20b9d600422	3	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 08:57:32.851786	2026-02-13 08:57:32.851786	\N	\N
df0122b8-d7a5-4712-95e7-63d0e94a68be	4	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 08:57:33.03	\N	\N	\N	\N	2026-02-13 08:57:33.004461	2026-02-13 08:57:33.004461	\N	\N
2dfc16b7-6ead-4ca4-ad76-40a5f8194a59	25	2026-02-13	اختبار التقريب	draft	\N	100.46	100.46	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:14:04.381712	2026-02-13 09:14:04.381712	\N	\N
e30d6116-8943-441d-9422-5d527cdf3572	5	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 08:57:33.192	\N	\N	\N	\N	2026-02-13 08:57:33.136628	2026-02-13 08:57:33.136628	\N	\N
6acf776d-f034-419b-bcf5-e29f88fa48c6	6	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 08:57:33.471	\N	\N	\N	\N	2026-02-13 08:57:33.447578	2026-02-13 08:57:33.447578	\N	\N
5bf68485-8f9e-4f00-916f-54864efc7f22	7	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 08:57:56.292535	2026-02-13 08:57:56.292535	\N	\N
260d12fa-d8b9-4df8-a6ee-de62a04878da	8	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 08:57:56.438	\N	\N	\N	\N	2026-02-13 08:57:56.417533	2026-02-13 08:57:56.417533	\N	\N
a8186747-2999-4822-9dcc-962f106c7a9f	9	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 08:57:56.493	\N	\N	\N	\N	2026-02-13 08:57:56.476337	2026-02-13 08:57:56.476337	\N	\N
666a3cc7-5482-45c5-875e-52d4b673ecc1	10	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 08:57:56.699	\N	\N	\N	\N	2026-02-13 08:57:56.660855	2026-02-13 08:57:56.660855	\N	\N
0e371d6e-30b6-448d-8f19-200f50eec27d	11	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 08:58:43.025353	2026-02-13 08:58:43.025353	\N	\N
b92b6ffa-3e6a-4cdc-bcd5-45cd261a7744	12	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 08:58:43.174	\N	\N	\N	\N	2026-02-13 08:58:43.156356	2026-02-13 08:58:43.156356	\N	\N
839179e7-a488-4113-8eac-96574d1cc6b3	13	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 08:58:43.242	\N	\N	\N	\N	2026-02-13 08:58:43.223489	2026-02-13 08:58:43.223489	\N	\N
2708375e-ef4b-47dc-bb5f-5c4e53ed671e	14	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 08:58:43.554	\N	\N	\N	\N	2026-02-13 08:58:43.48008	2026-02-13 08:58:43.48008	\N	\N
2a7b8106-57cd-4ca4-b30b-53b5ad27ff4b	15	2026-02-13	test-immutability	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 08:58:58.93426	2026-02-13 08:58:58.93426	\N	\N
05e1525a-e0d0-4fb9-942c-68c6965cb9f9	16	2026-02-13	test-immutability	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 08:59:47.472571	2026-02-13 08:59:47.472571	\N	\N
0e979c33-590e-4ec5-a772-735cded6f806	17	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:00:21.175388	2026-02-13 09:00:21.175388	\N	\N
3fee8a12-2738-46c3-9534-4c9591f98859	18	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 09:00:21.34	\N	\N	\N	\N	2026-02-13 09:00:21.317524	2026-02-13 09:00:21.317524	\N	\N
828d5cd6-07cd-4475-a35e-1146886060bb	19	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 09:00:21.385	\N	\N	\N	\N	2026-02-13 09:00:21.366969	2026-02-13 09:00:21.366969	\N	\N
2da0eec0-b235-4f75-9c03-3934924052b6	20	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 09:00:21.662	\N	\N	\N	\N	2026-02-13 09:00:21.635039	2026-02-13 09:00:21.635039	\N	\N
8dd60a8c-2da6-4edd-90e9-b97deb47a6b5	21	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:14:03.588422	2026-02-13 09:14:03.588422	\N	\N
8ada3863-356c-455f-9190-443e8feae651	22	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 09:14:04.166	\N	\N	\N	\N	2026-02-13 09:14:04.135578	2026-02-13 09:14:04.135578	\N	\N
194a7214-1705-4a00-933e-3968e29f7627	23	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 09:14:04.285	\N	\N	\N	\N	2026-02-13 09:14:04.267212	2026-02-13 09:14:04.267212	\N	\N
b1491c08-8745-4ed0-a3d8-60d5ef69c483	24	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 09:14:04.342	\N	\N	\N	\N	2026-02-13 09:14:04.324784	2026-02-13 09:14:04.324784	\N	\N
4205424c-4f90-45b0-8158-f824b52b3c1a	26	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:16:22.2274	2026-02-13 09:16:22.2274	\N	\N
ec7a9c7d-e892-496b-97ae-6d900d94123c	27	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 09:16:23.054	\N	\N	\N	\N	2026-02-13 09:16:22.991688	2026-02-13 09:16:22.991688	\N	\N
92d7b5ce-7e9e-49c5-8d02-441c6e55912c	28	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 09:16:23.252	\N	\N	\N	\N	2026-02-13 09:16:23.221886	2026-02-13 09:16:23.221886	\N	\N
09ed0166-d09b-471a-933d-b7a7ef88c5de	29	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 09:16:23.31	\N	\N	\N	\N	2026-02-13 09:16:23.283916	2026-02-13 09:16:23.283916	\N	\N
a395b417-d41d-439e-9f20-e097edc2c56e	30	2026-02-13	اختبار التقريب	draft	\N	100.46	100.46	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:16:23.362373	2026-02-13 09:16:23.362373	\N	\N
e419af92-4498-4552-9bde-e7324f6a0a31	31	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:23:42.282034	2026-02-13 09:23:42.282034	\N	\N
f9cd565f-53a2-4ab9-b9f7-36ec2258157c	32	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 09:23:43.064	\N	\N	\N	\N	2026-02-13 09:23:43.015313	2026-02-13 09:23:43.015313	\N	\N
1f94fac8-5d5d-4328-a1d0-8d5c1be58f35	33	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 09:23:43.302	\N	\N	\N	\N	2026-02-13 09:23:43.283171	2026-02-13 09:23:43.283171	\N	\N
b84a351a-12ea-4b7b-ac2c-25a778b5b7ac	34	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 09:23:43.347	\N	\N	\N	\N	2026-02-13 09:23:43.329742	2026-02-13 09:23:43.329742	\N	\N
d6c11f1d-ca5d-41c4-b8d5-8fc3f87b33c8	35	2026-02-13	اختبار التقريب	draft	\N	100.46	100.46	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:23:43.38291	2026-02-13 09:23:43.38291	\N	\N
bf1ab710-fa8f-4cc8-ab88-2df9ed31f547	36	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:29:35.522255	2026-02-13 09:29:35.522255	\N	\N
3ca98b10-438a-46ca-a01a-61ab9db67dda	37	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 09:29:36.488	\N	\N	\N	\N	2026-02-13 09:29:36.445722	2026-02-13 09:29:36.445722	\N	\N
d755da1b-e542-46c7-9478-6d2fa7b1062b	38	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 09:29:36.639	\N	\N	\N	\N	2026-02-13 09:29:36.617371	2026-02-13 09:29:36.617371	\N	\N
73b21c20-20ab-4765-a569-8945371e74cd	39	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 09:29:36.689	\N	\N	\N	\N	2026-02-13 09:29:36.664603	2026-02-13 09:29:36.664603	\N	\N
f400a397-1b70-464b-bbe4-e18c822f75de	40	2026-02-13	اختبار التقريب	draft	\N	100.46	100.46	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:29:36.807521	2026-02-13 09:29:36.807521	\N	\N
26a188a0-ca8b-4e43-aab4-fe6416c36f69	48	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 09:34:56.181	\N	\N	\N	\N	2026-02-13 09:34:56.165711	2026-02-13 09:34:56.165711	\N	\N
78c7e2b9-ba58-4f97-a721-cb5bb997d777	49	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 09:34:56.215	\N	\N	\N	\N	2026-02-13 09:34:56.198364	2026-02-13 09:34:56.198364	\N	\N
ae9399a0-7981-4b3c-ad56-f9dff98ae196	50	2026-02-13	اختبار التقريب	draft	\N	100.46	100.46	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:34:56.253834	2026-02-13 09:34:56.253834	\N	\N
ec516e56-671d-49c0-8ad2-288cde5e0c45	51	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:39:09.672189	2026-02-13 09:39:09.672189	\N	\N
a7d99f72-15dd-45c5-96ba-69f8179976a7	52	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 09:39:10.562	\N	\N	\N	\N	2026-02-13 09:39:10.534574	2026-02-13 09:39:10.534574	\N	\N
0de15c08-7ba0-4e20-bea2-7f1688ebe037	53	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 09:39:10.704	\N	\N	\N	\N	2026-02-13 09:39:10.682772	2026-02-13 09:39:10.682772	\N	\N
a8476815-14b5-445a-8e9b-1aab54e29446	54	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 09:39:10.753	\N	\N	\N	\N	2026-02-13 09:39:10.735932	2026-02-13 09:39:10.735932	\N	\N
eb13e87b-485d-460c-91f2-a53d98224ee9	55	2026-02-13	اختبار التقريب	draft	\N	100.46	100.46	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:39:10.78762	2026-02-13 09:39:10.78762	\N	\N
1aa92fea-4e70-4d5f-bc87-f0fd86394ec7	56	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:59:07.1694	2026-02-13 09:59:07.1694	\N	\N
c1df4c5b-99a5-4247-8603-bf89f006546c	57	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 09:59:07.891	\N	\N	\N	\N	2026-02-13 09:59:07.86452	2026-02-13 09:59:07.86452	\N	\N
9e412fc2-fac9-4630-94bd-96c0c39c3b1a	58	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 09:59:08.064	\N	\N	\N	\N	2026-02-13 09:59:08.034689	2026-02-13 09:59:08.034689	\N	\N
08721fd4-d978-4a90-a17e-98f0e338e259	59	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 09:59:08.124	\N	\N	\N	\N	2026-02-13 09:59:08.102707	2026-02-13 09:59:08.102707	\N	\N
c9edb5b4-653c-4196-ae37-08be92ee6b52	60	2026-02-13	اختبار التقريب	draft	\N	100.46	100.46	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 09:59:08.162988	2026-02-13 09:59:08.162988	\N	\N
48f0e15a-40ee-47fe-a08e-ea1441efc9ef	61	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 10:00:54.483882	2026-02-13 10:00:54.483882	\N	\N
25ee3209-8ebd-41f8-92b2-a3dda0ebf41b	62	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 10:00:56.553	\N	\N	\N	\N	2026-02-13 10:00:56.488147	2026-02-13 10:00:56.488147	\N	\N
942ba66b-c627-45d7-aea3-00b341363382	63	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 10:00:56.823	\N	\N	\N	\N	2026-02-13 10:00:56.795338	2026-02-13 10:00:56.795338	\N	\N
b1bf550e-1dcf-4fd7-930d-d9dd90b130b1	64	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 10:00:56.913	\N	\N	\N	\N	2026-02-13 10:00:56.887481	2026-02-13 10:00:56.887481	\N	\N
b967b210-d0e2-4adb-acd2-ca58a4092391	65	2026-02-13	اختبار التقريب	draft	\N	100.46	100.46	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 10:00:56.998433	2026-02-13 10:00:56.998433	\N	\N
144a3678-cd1d-4ecd-9637-8cf07da0f12a	66	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 10:01:03.938193	2026-02-13 10:01:03.938193	\N	\N
1e109384-48d3-4e99-91d3-b502f7fa6283	67	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 10:01:05.536	\N	\N	\N	\N	2026-02-13 10:01:05.477818	2026-02-13 10:01:05.477818	\N	\N
46273853-efec-4052-a948-213a814c4ce5	68	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 10:01:05.768	\N	\N	\N	\N	2026-02-13 10:01:05.75099	2026-02-13 10:01:05.75099	\N	\N
1b397980-2a3f-48dd-a125-064ab5a5bfef	69	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 10:01:05.807	\N	\N	\N	\N	2026-02-13 10:01:05.789153	2026-02-13 10:01:05.789153	\N	\N
6ae45f05-77e0-49bd-8f4f-1eaae32b7347	70	2026-02-13	اختبار التقريب	draft	\N	100.46	100.46	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 10:01:05.854604	2026-02-13 10:01:05.854604	\N	\N
81cb8740-8f92-44d4-9d6d-882991746e24	71	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 10:03:30.137423	2026-02-13 10:03:30.137423	\N	\N
cb5a1a13-bf33-45cc-9e35-ae53b2f7ad7e	72	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 10:03:31.169	\N	\N	\N	\N	2026-02-13 10:03:31.153548	2026-02-13 10:03:31.153548	\N	\N
4fd5baf5-12d1-4dc4-b044-097ae5dc2ed4	73	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 10:03:31.277	\N	\N	\N	\N	2026-02-13 10:03:31.258822	2026-02-13 10:03:31.258822	\N	\N
777e129d-8961-4e97-89b9-12c086de3628	74	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 10:03:31.319	\N	\N	\N	\N	2026-02-13 10:03:31.302791	2026-02-13 10:03:31.302791	\N	\N
9f248923-ac1b-4966-8195-aa672a51d5fd	75	2026-02-13	اختبار التقريب	draft	\N	100.46	100.46	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 10:03:31.350975	2026-02-13 10:03:31.350975	\N	\N
ce2f006e-5eb7-4a84-a273-f21c770cdf10	76	2020-01-15	اختبار فترة مغلقة	draft	\N	100.00	100.00	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 10:17:58.618427	2026-02-13 10:17:58.618427	\N	\N
f5170380-9bb3-48a0-bc20-ac2ad9dac758	77	2026-02-13	اختبار الترحيل المزدوج	posted	\N	300.00	300.00	\N	\N	\N	2026-02-13 10:17:59.625	\N	\N	\N	\N	2026-02-13 10:17:59.604348	2026-02-13 10:17:59.604348	\N	\N
c110bf65-272f-4143-8032-5e3c9f4513b3	78	2026-02-13	اختبار ثبات القيود	posted	\N	500.00	500.00	\N	\N	\N	2026-02-13 10:17:59.741	\N	\N	\N	\N	2026-02-13 10:17:59.725062	2026-02-13 10:17:59.725062	\N	\N
7556b8e3-275b-41f9-80f8-fe4ef515f516	79	2026-02-13	اختبار حذف مُرحّل	posted	\N	200.00	200.00	\N	\N	\N	2026-02-13 10:17:59.777	\N	\N	\N	\N	2026-02-13 10:17:59.763676	2026-02-13 10:17:59.763676	\N	\N
d3175b8d-d021-4fc9-8e77-930cc936762e	80	2026-02-13	اختبار التقريب	draft	\N	100.46	100.46	\N	\N	\N	\N	\N	\N	\N	\N	2026-02-13 10:17:59.809218	2026-02-13 10:17:59.809218	\N	\N
\.


--
-- Data for Name: journal_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.journal_lines (id, journal_entry_id, line_number, account_id, cost_center_id, description, debit, credit) FROM stdin;
2bdb19e8-c501-4a44-aa57-f73f04e13eae	a81382c0-0e85-4070-b61d-12baeb6b4b76	1	a6b25d06-cd2e-4f09-aa9a-86b5f0cdb97a	\N	مدينون - في انتظار التحصيل	2500.00	0.00
b468bdf6-e74a-4486-a834-ae587256660d	a81382c0-0e85-4070-b61d-12baeb6b4b76	2	2310af58-497d-428c-9c3b-9793d3f94b3c	\N	إيراد مبيعات أدوية	0.00	2000.00
d3929e42-fac9-46a2-8e34-2516087a3cd0	a81382c0-0e85-4070-b61d-12baeb6b4b76	3	12ada3e9-df9c-4eb9-99c6-ffe2b999332c	\N	إيراد مبيعات مستلزمات	0.00	500.00
484ae7ce-329d-43d2-91c4-47ce2027ed6a	325f54f8-8fb8-48b7-a9b1-83f5bec1bfcc	2	cff7c510-4566-49da-a370-6115eaa69cbb	\N	تكلفة أدوية مباعة	802.00	0.00
c24c1572-4869-46e3-9ae0-acd6c98d7401	325f54f8-8fb8-48b7-a9b1-83f5bec1bfcc	3	2310af58-497d-428c-9c3b-9793d3f94b3c	\N	إيراد مبيعات أدوية	0.00	5000.00
3d06997e-68bd-476f-bac6-71e7b67a70fb	325f54f8-8fb8-48b7-a9b1-83f5bec1bfcc	4	4b297fea-7209-48b2-9bbb-aa2d1ddc0b80	\N	مخزون مباع	0.00	802.00
b0440d15-5273-48e4-afe8-52c8b6035e3b	325f54f8-8fb8-48b7-a9b1-83f5bec1bfcc	1	759d6696-d436-47a7-ba28-528bbd6a6f7c	\N	نقدية مبيعات - تم التحصيل	5000.00	0.00
4f0468c8-7c2b-474c-9270-4c57df0b5286	b4331787-4c3d-410a-ad72-f20b9d600422	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
dc839469-d209-4fa6-891e-39579f1a1760	b4331787-4c3d-410a-ad72-f20b9d600422	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
37790096-a287-4d70-8add-177b91c5716e	df0122b8-d7a5-4712-95e7-63d0e94a68be	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
4a25bf2a-503c-43c4-b9cf-cc72d1abdb3c	df0122b8-d7a5-4712-95e7-63d0e94a68be	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
e9fd1e5b-76ff-4b74-9027-5618fe42feb7	e30d6116-8943-441d-9422-5d527cdf3572	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
3013077e-ab8e-47aa-b0d4-a646c55e8327	e30d6116-8943-441d-9422-5d527cdf3572	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
62af2e35-418c-4d73-839c-7daf76662cd6	6acf776d-f034-419b-bcf5-e29f88fa48c6	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
4fd9d3c6-f1be-4d42-9f30-3ce91739bcf2	6acf776d-f034-419b-bcf5-e29f88fa48c6	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
8a4604ce-a47a-4182-b1e6-0b51037ee3e4	5bf68485-8f9e-4f00-916f-54864efc7f22	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
8b2fdbf1-f065-41bd-89e6-2715f2155859	5bf68485-8f9e-4f00-916f-54864efc7f22	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
9e20fb61-880e-4826-84a5-197781ed25d9	260d12fa-d8b9-4df8-a6ee-de62a04878da	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
a83de236-aa44-467d-bcef-6db6c22b31a4	260d12fa-d8b9-4df8-a6ee-de62a04878da	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
104d8a14-b5c0-40ee-a15f-8f15be476e2f	a8186747-2999-4822-9dcc-962f106c7a9f	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
2fb8c23b-40cc-4cf7-9570-fa120e163f1c	a8186747-2999-4822-9dcc-962f106c7a9f	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
554dbd52-bc7a-41d8-8e4d-48c76a35fc92	666a3cc7-5482-45c5-875e-52d4b673ecc1	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
5db931c2-6689-4f46-be82-38dac2b6c70d	666a3cc7-5482-45c5-875e-52d4b673ecc1	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
d9036a61-cf5e-46a6-88fd-9a3b19bcd24f	0e371d6e-30b6-448d-8f19-200f50eec27d	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
afb8813e-5aa2-4df2-b9af-5cf6d4754bb0	0e371d6e-30b6-448d-8f19-200f50eec27d	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
a1f5ed3a-092b-4ed6-9f65-ccaac686026c	b92b6ffa-3e6a-4cdc-bcd5-45cd261a7744	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
6c1d70fc-3ec6-4de5-ad49-a2b61fb723d6	b92b6ffa-3e6a-4cdc-bcd5-45cd261a7744	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
d6bb477e-ac9b-4fd7-9e8b-f9a4da6a4161	839179e7-a488-4113-8eac-96574d1cc6b3	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
656760cd-0273-45e2-a8e4-a156600049c8	839179e7-a488-4113-8eac-96574d1cc6b3	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
cc1815f3-9d6d-48d8-9e63-6df05a91e2f8	2708375e-ef4b-47dc-bb5f-5c4e53ed671e	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
7d80a0de-2101-4979-8d37-1a228c479224	2708375e-ef4b-47dc-bb5f-5c4e53ed671e	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
cd6c7413-4c0d-4218-951c-ccae936d53b8	0e979c33-590e-4ec5-a772-735cded6f806	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
e998a8d7-1822-4cf8-80ed-f95b787a63e3	0e979c33-590e-4ec5-a772-735cded6f806	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
942a5d2a-c17d-4b9a-bcc0-2c33a64b71de	3fee8a12-2738-46c3-9534-4c9591f98859	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
a6e8def5-ab62-4243-b01d-b85d2725771e	3fee8a12-2738-46c3-9534-4c9591f98859	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
96a966e7-73d7-4777-ba64-1ac29f89e7a9	828d5cd6-07cd-4475-a35e-1146886060bb	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
f34cf3c2-9c50-493e-abe1-fc9134102658	828d5cd6-07cd-4475-a35e-1146886060bb	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
39f65cf8-08c4-435a-830a-86e93c95d8c5	2da0eec0-b235-4f75-9c03-3934924052b6	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
473f36f2-7dac-4fc7-a2cf-d045ce936865	2da0eec0-b235-4f75-9c03-3934924052b6	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
a07f3892-2950-48ed-9a11-323d0a5ec141	8dd60a8c-2da6-4edd-90e9-b97deb47a6b5	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
398210b1-fa1b-4ef4-b00d-509374d16d8f	8dd60a8c-2da6-4edd-90e9-b97deb47a6b5	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
7ff08eec-e7b4-4b85-9cd2-1aca8cb116b0	8ada3863-356c-455f-9190-443e8feae651	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
4bf8c69a-d881-4452-939d-89bf7e320acb	8ada3863-356c-455f-9190-443e8feae651	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
75b03e81-6fff-4b99-b500-083c6276e02c	194a7214-1705-4a00-933e-3968e29f7627	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
ee8a1257-61f3-4c24-b8de-1c7d5a922c50	194a7214-1705-4a00-933e-3968e29f7627	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
cc9511b7-1e54-4337-aacc-9f7c2d940615	b1491c08-8745-4ed0-a3d8-60d5ef69c483	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
e638077c-15de-45ff-ab73-0dca9c1d2679	b1491c08-8745-4ed0-a3d8-60d5ef69c483	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
1f3d1269-686e-4784-a833-827c95bc8160	2dfc16b7-6ead-4ca4-ad76-40a5f8194a59	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.46	0.00
02367cec-3764-4d5d-9a4d-86111697e159	2dfc16b7-6ead-4ca4-ad76-40a5f8194a59	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.46
d12f176a-3a77-488f-ac5a-d1a4c9e3eb88	4205424c-4f90-45b0-8158-f824b52b3c1a	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
a801b642-02f6-4a72-987b-f4e4baee3473	4205424c-4f90-45b0-8158-f824b52b3c1a	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
671e885d-bb71-479c-bbd8-cfae95249ac1	ec7a9c7d-e892-496b-97ae-6d900d94123c	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
8afaf751-cce4-4fa1-b379-cd50ee9be98c	ec7a9c7d-e892-496b-97ae-6d900d94123c	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
58f10629-9737-4369-8be3-17355f7e0ea0	92d7b5ce-7e9e-49c5-8d02-441c6e55912c	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
4e158b1d-6431-41ea-b2c1-0e3614f3af82	92d7b5ce-7e9e-49c5-8d02-441c6e55912c	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
34afd295-4ec9-4b90-a42e-0c89b3d6093e	09ed0166-d09b-471a-933d-b7a7ef88c5de	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
44795211-1868-4669-8611-f9de264f750e	09ed0166-d09b-471a-933d-b7a7ef88c5de	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
0d1183d7-22e3-426f-ae21-786843130385	a395b417-d41d-439e-9f20-e097edc2c56e	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.46	0.00
860e656e-5b69-443c-b9c2-9f2e9a40f40e	a395b417-d41d-439e-9f20-e097edc2c56e	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.46
aca44181-7cee-4618-a04c-fd65893c5956	e419af92-4498-4552-9bde-e7324f6a0a31	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
69366389-1111-4373-a874-1f7ab07e5c66	e419af92-4498-4552-9bde-e7324f6a0a31	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
ce920cb3-258a-43df-af11-b84782a46027	f9cd565f-53a2-4ab9-b9f7-36ec2258157c	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
7c3fb3bb-6b39-4b43-b0e8-0931da1d1df8	f9cd565f-53a2-4ab9-b9f7-36ec2258157c	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
fee829e6-bdef-4006-81d2-c4e6393d0b10	1f94fac8-5d5d-4328-a1d0-8d5c1be58f35	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
88e31410-e954-4c2f-88b1-fa7a730130ed	1f94fac8-5d5d-4328-a1d0-8d5c1be58f35	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
9dea71da-98e1-44f3-b767-25d4b786ec94	b84a351a-12ea-4b7b-ac2c-25a778b5b7ac	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
ed152f50-cf00-4792-b94c-e0a5cf771f49	b84a351a-12ea-4b7b-ac2c-25a778b5b7ac	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
6b358078-3e6f-4d8e-838a-fcc664349856	d6c11f1d-ca5d-41c4-b8d5-8fc3f87b33c8	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.46	0.00
11573af7-286b-4efe-9643-016fc8913ab3	d6c11f1d-ca5d-41c4-b8d5-8fc3f87b33c8	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.46
d30bbdbe-1ee0-492b-ad05-ca407b84106c	bf1ab710-fa8f-4cc8-ab88-2df9ed31f547	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
2f3197ba-9ccd-49b3-89d7-3c7806ffdb11	bf1ab710-fa8f-4cc8-ab88-2df9ed31f547	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
45b24cac-3750-476a-9c20-39f30f10bca4	3ca98b10-438a-46ca-a01a-61ab9db67dda	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
45fcea7d-54e9-476b-95ed-f2049d4979d0	3ca98b10-438a-46ca-a01a-61ab9db67dda	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
d5a7fa97-74cf-4dcb-b5a8-250d281edc9d	d755da1b-e542-46c7-9478-6d2fa7b1062b	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
5d45a4db-7892-46d4-9684-5545bdf15776	d755da1b-e542-46c7-9478-6d2fa7b1062b	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
ff02541a-cfba-4a15-a30e-5f1f35ee4cff	73b21c20-20ab-4765-a569-8945371e74cd	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
994072aa-ae63-4886-9389-3d732c73ab10	73b21c20-20ab-4765-a569-8945371e74cd	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
1323c85e-3e57-464e-8029-1afd25cb6afc	f400a397-1b70-464b-bbe4-e18c822f75de	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.46	0.00
a53b3ce5-0587-4afe-8363-02b9c3b91bfe	f400a397-1b70-464b-bbe4-e18c822f75de	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.46
53ade919-6630-4ae4-ada3-f09ed4fc1a33	3ba82031-88ae-4561-9c52-8492fc89faf5	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
62c2a4f3-63b6-4a5c-b66d-39747a36bf79	3ba82031-88ae-4561-9c52-8492fc89faf5	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
08cb6382-d212-4ce3-a455-672f6c52d5f6	519c109d-ae4a-446f-ac6b-302ea1c253b8	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
e2987dcf-8dd5-4092-af8e-a0527919ae5f	519c109d-ae4a-446f-ac6b-302ea1c253b8	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
e12a24bb-01a1-48ed-ab59-29d9fc557b0f	c30b6021-03f6-464e-99c1-7521e0b8222e	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
de4e8d9d-7010-4f57-b270-3eb240280f07	c30b6021-03f6-464e-99c1-7521e0b8222e	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
3d0f3c17-33a8-4e27-a5fb-595230dd6f24	c25bcbf2-3b75-4f1f-b40e-8d23b5f49bbe	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
f72b6fda-f388-4496-aa13-633c5ecc628d	c25bcbf2-3b75-4f1f-b40e-8d23b5f49bbe	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
136b1164-c8e6-4b96-b385-9bcbbf9d6eb0	2b93e433-538a-4bd7-af43-937b15b6703d	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.46	0.00
4f9bb718-584d-4fb8-81b9-df3cce4d5e00	2b93e433-538a-4bd7-af43-937b15b6703d	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.46
b8cb7ae2-10f6-40b7-8b6c-a306d01f69f8	6b45e3cd-4699-49b8-b810-33a3651252e0	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
b714accc-c786-4bfa-afc4-7c6e47ac138e	6b45e3cd-4699-49b8-b810-33a3651252e0	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
4d068f6e-4067-4cee-b829-57872a3b97b0	cc1dcb15-5d82-43e6-abf1-4b32ebaade0f	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
7a21e66a-df17-4b5c-8ae6-f2088791d1d5	cc1dcb15-5d82-43e6-abf1-4b32ebaade0f	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
257b5dc5-d555-4ac6-888c-de06bf7b157d	26a188a0-ca8b-4e43-aab4-fe6416c36f69	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
684d8989-e0a8-4a67-8bb1-821de941d558	26a188a0-ca8b-4e43-aab4-fe6416c36f69	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
9b04fa9f-36d8-43f9-81c1-a5b1c7b7b151	78c7e2b9-ba58-4f97-a721-cb5bb997d777	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
122b9629-215f-41f5-b356-6b2aef018b63	78c7e2b9-ba58-4f97-a721-cb5bb997d777	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
f6eb103f-53f0-43e9-b247-f2079ba7fe60	ae9399a0-7981-4b3c-ad56-f9dff98ae196	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.46	0.00
13f9ff6c-cdb6-479a-94d1-437c565b1948	ae9399a0-7981-4b3c-ad56-f9dff98ae196	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.46
cc3c5867-954c-4ee5-b67b-1276a0857a1c	ec516e56-671d-49c0-8ad2-288cde5e0c45	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
46731e28-90e9-4b88-87e9-2fdcc08054b4	ec516e56-671d-49c0-8ad2-288cde5e0c45	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
2066e243-e210-4051-aee1-2ded4bb95105	a7d99f72-15dd-45c5-96ba-69f8179976a7	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
1bf86d22-3a49-4aad-a776-ba5817bb1115	a7d99f72-15dd-45c5-96ba-69f8179976a7	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
f2d9aea5-9333-47c1-bd84-97c360a3543b	0de15c08-7ba0-4e20-bea2-7f1688ebe037	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
0d92b964-1e2e-41c0-b77e-ad8e8de03042	0de15c08-7ba0-4e20-bea2-7f1688ebe037	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
b7e073cc-88fc-4acb-96ff-3714e1421d5e	a8476815-14b5-445a-8e9b-1aab54e29446	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
fb1e03df-06dd-4f91-b530-debe9d277e55	a8476815-14b5-445a-8e9b-1aab54e29446	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
6384a8ca-accc-48fc-b80b-76a35f83312e	eb13e87b-485d-460c-91f2-a53d98224ee9	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.46	0.00
1caebfb1-eefb-4394-bce1-d3acb148ec6c	eb13e87b-485d-460c-91f2-a53d98224ee9	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.46
d28e8fba-0452-4f98-a9e5-f5c31932be9b	1aa92fea-4e70-4d5f-bc87-f0fd86394ec7	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
66936a49-65cb-4b32-bc5f-bb8f12cbc7c4	1aa92fea-4e70-4d5f-bc87-f0fd86394ec7	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
c75a181b-cfa9-436f-90c0-a1e46121ed8c	c1df4c5b-99a5-4247-8603-bf89f006546c	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
776b3fac-4bae-4641-a97e-1f393d191b3d	c1df4c5b-99a5-4247-8603-bf89f006546c	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
78a07a31-aaab-4dca-8ce7-57857d38d76c	9e412fc2-fac9-4630-94bd-96c0c39c3b1a	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
546bf73b-0cc7-43d4-a1f4-9fda187d7e47	9e412fc2-fac9-4630-94bd-96c0c39c3b1a	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
624aa542-3571-47b7-8ec5-a7a4a5332fb6	08721fd4-d978-4a90-a17e-98f0e338e259	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
7316a247-cdd2-41ac-b5bc-5d6679284f56	08721fd4-d978-4a90-a17e-98f0e338e259	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
43f6e1a4-7de2-46bc-9854-215fe4235349	c9edb5b4-653c-4196-ae37-08be92ee6b52	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.46	0.00
ea62bc16-2a95-4fe1-b0f6-4fec7a875d7c	c9edb5b4-653c-4196-ae37-08be92ee6b52	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.46
588fd287-59d1-44e1-9947-df3de2cdf222	48f0e15a-40ee-47fe-a08e-ea1441efc9ef	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
1f6bbe77-4d1f-4d02-8199-ed212e8deb4d	48f0e15a-40ee-47fe-a08e-ea1441efc9ef	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
2f63ed77-08aa-4596-bc4e-b99d05c33434	25ee3209-8ebd-41f8-92b2-a3dda0ebf41b	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
53831461-5c64-4c32-abc6-a98a3cd4f0ff	25ee3209-8ebd-41f8-92b2-a3dda0ebf41b	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
1a72afeb-70ee-4435-ac90-df7bc2cc1600	942ba66b-c627-45d7-aea3-00b341363382	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
56ccb457-96a9-4b66-8d58-44c785f6ae53	942ba66b-c627-45d7-aea3-00b341363382	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
52215698-27c2-4052-8339-7f332015c7e4	b1bf550e-1dcf-4fd7-930d-d9dd90b130b1	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
ded8cf90-531d-4c77-9d28-e7f1d1ca4cad	b1bf550e-1dcf-4fd7-930d-d9dd90b130b1	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
c4379a53-efe3-454a-b96f-049a6c87c3b4	b967b210-d0e2-4adb-acd2-ca58a4092391	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.46	0.00
35c0a78a-598d-4c6c-b2cc-bf4edf5533a5	b967b210-d0e2-4adb-acd2-ca58a4092391	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.46
bf36b444-3f33-4c9d-8e11-df7321251273	144a3678-cd1d-4ecd-9637-8cf07da0f12a	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
5230b4a2-b212-4ada-bb6c-254e6753368a	144a3678-cd1d-4ecd-9637-8cf07da0f12a	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
1a551e9f-e3a8-4f29-8816-51a1b37082b8	1e109384-48d3-4e99-91d3-b502f7fa6283	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
eb6ca66f-134f-4174-b224-d66e751ae132	1e109384-48d3-4e99-91d3-b502f7fa6283	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
60b14b97-f3ec-4f8d-82fb-5c67038a2e21	46273853-efec-4052-a948-213a814c4ce5	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
1d0a5cbc-9c77-4b87-9776-5d2662d29a3d	46273853-efec-4052-a948-213a814c4ce5	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
eeadb7ea-5142-41bf-9402-5810b90d81f4	1b397980-2a3f-48dd-a125-064ab5a5bfef	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
6e20690b-9e01-4b7d-ab34-392431ff6bc7	1b397980-2a3f-48dd-a125-064ab5a5bfef	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
14c804c8-0f4f-4441-9bd0-5cdb75c40b6f	6ae45f05-77e0-49bd-8f4f-1eaae32b7347	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.46	0.00
41973a19-cb23-4679-8ff7-be28d0163e28	6ae45f05-77e0-49bd-8f4f-1eaae32b7347	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.46
293e1794-882c-4724-959e-61d74e39e2d4	81cb8740-8f92-44d4-9d6d-882991746e24	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
40213bde-1f87-4882-9dee-206903591d57	81cb8740-8f92-44d4-9d6d-882991746e24	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
4f74792f-f8c1-4d11-8a6e-ff9b7b8635c2	cb5a1a13-bf33-45cc-9e35-ae53b2f7ad7e	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
6d613264-6b00-46d2-be21-6b976c073eb7	cb5a1a13-bf33-45cc-9e35-ae53b2f7ad7e	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
af97e435-4e9b-4575-b960-98479743325b	4fd5baf5-12d1-4dc4-b044-097ae5dc2ed4	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
3ec7b51d-47b4-4b52-bfcb-eaa7afe9815b	4fd5baf5-12d1-4dc4-b044-097ae5dc2ed4	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
5ca26bf2-998e-4b2a-8ed3-53705bbc7bc4	777e129d-8961-4e97-89b9-12c086de3628	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
a4e64320-9e4b-4123-b722-cd8da2c42b52	777e129d-8961-4e97-89b9-12c086de3628	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
d5e525f7-5569-4bfa-a2d6-38b2fd1cedc2	9f248923-ac1b-4966-8195-aa672a51d5fd	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.46	0.00
304d786f-deed-4c88-ab59-137f109bc01e	9f248923-ac1b-4966-8195-aa672a51d5fd	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.46
4cb7b3e4-7554-4a8a-aefa-e32702d09f3d	ce2f006e-5eb7-4a84-a273-f21c770cdf10	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.00	0.00
225eee91-031c-4e90-a74f-7b8b2f55f295	ce2f006e-5eb7-4a84-a273-f21c770cdf10	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.00
7bdca0d2-2d73-44fe-9679-0d76920434ad	f5170380-9bb3-48a0-bc20-ac2ad9dac758	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	300.00	0.00
fe0dad39-4869-44df-8ed6-76e998299234	f5170380-9bb3-48a0-bc20-ac2ad9dac758	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	300.00
22a0eec6-31fb-48d1-9431-4ec9f8588fd6	c110bf65-272f-4143-8032-5e3c9f4513b3	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	500.00	0.00
32621b27-380e-4339-aa95-e32e8120eeec	c110bf65-272f-4143-8032-5e3c9f4513b3	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	500.00
2de1fc5b-a856-408f-96e9-b645d5b76e9c	7556b8e3-275b-41f9-80f8-fe4ef515f516	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	200.00	0.00
3817b293-dfc7-42f5-9194-e8d1548cf940	7556b8e3-275b-41f9-80f8-fe4ef515f516	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	200.00
ee7925aa-f21a-47a4-90fb-bf81931ada8b	d3175b8d-d021-4fc9-8e77-930cc936762e	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N	مدين	100.46	0.00
29283a54-970e-47cc-b1b0-87229538f647	d3175b8d-d021-4fc9-8e77-930cc936762e	2	b9c4f77e-1aca-4d02-bbf8-5cad1464b18e	\N	دائن	0.00	100.46
\.


--
-- Data for Name: journal_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.journal_templates (id, name, description, is_active, created_by, created_at) FROM stdin;
b70260fb-8d73-41fc-ac64-df120727313f	قيد رواتب شهرية		t	\N	2026-02-05 17:00:21.484649
33c11e5f-b6ea-4242-aebb-849d113f70a1	نموذج تجريبي	\N	t	\N	2026-02-05 17:08:42.457822
fd1c7cc0-28df-4296-96df-202ecb5ca1ab	نموذج الاختبار		t	\N	2026-02-05 17:16:41.616824
\.


--
-- Data for Name: patient_invoice_headers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.patient_invoice_headers (id, invoice_number, invoice_date, patient_name, patient_phone, patient_type, department_id, doctor_name, contract_name, notes, status, total_amount, discount_amount, net_amount, paid_amount, finalized_at, created_at, updated_at, warehouse_id, admission_id, is_consolidated, source_invoice_ids) FROM stdin;
9533f1b1-52e1-418f-90f7-18f13149f782	1	2026-02-09	أحمد محمد	\N	cash	\N	د. خالد	\N	\N	draft	100.00	0.00	100.00	0.00	\N	2026-02-09 19:52:31.597296	2026-02-09 19:52:31.597296	\N	\N	f	\N
decd00db-9c69-4926-ac43-b6f8e8b7fb9c	TEST-PAT-001	2026-02-09	تست مريض	01098765432	cash	\N	د. أحمد	\N	\N	draft	100.00	10.00	90.00	0.00	\N	2026-02-09 19:59:12.381534	2026-02-09 19:59:12.381534	\N	\N	f	\N
ea48c97a-b2a3-4c12-939e-785b24cb0766	2	2026-02-10	مريض FEFO اختبار	\N	cash	\N	\N	\N	\N	draft	50.00	0.00	50.00	0.00	\N	2026-02-10 20:12:10.58941	2026-02-10 20:12:10.58941	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	\N	f	\N
4ad8972f-a7e6-406e-a25c-7a84ca651b12	13	2026-02-13	مريض اختبار الإلغاء	\N	cash	\N	\N	\N	[ملغي] test cancel	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:23:42.700246	2026-02-13 09:23:42.700246	\N	\N	f	\N
c8489b97-dc6e-4857-a76d-a9d4d497606c	3	2026-02-11	شريف عبدالرحمن عبدالظاهر محمود	01000717816	cash	ce561e66-ec39-4fac-89df-950e7595cea5	\N	\N	\N	draft	9000.00	0.00	9000.00	0.00	\N	2026-02-11 09:05:26.968531	2026-02-11 09:05:26.968531	b045a6c1-dc79-4480-8907-a8fb6975a92f	\N	f	\N
db645030-fc9a-4f88-bdc0-6a09c6992ea1	4	2026-02-11	عزه احمدمحمد عبدالحميد	01000717816	cash	ce561e66-ec39-4fac-89df-950e7595cea5	\N	\N	\N	draft	6500.00	0.00	6500.00	0.00	\N	2026-02-11 09:05:26.968531	2026-02-11 09:05:26.968531	b045a6c1-dc79-4480-8907-a8fb6975a92f	\N	f	\N
f95263f4-18d9-41a4-8982-14f55a9a1047	5	2026-02-11	كراس سمسم سامى سميح	01000717856	cash	ce561e66-ec39-4fac-89df-950e7595cea5	\N	\N	\N	draft	6000.00	0.00	6000.00	0.00	\N	2026-02-11 09:05:26.968531	2026-02-11 09:05:26.968531	b045a6c1-dc79-4480-8907-a8fb6975a92f	\N	f	\N
79a4d125-867a-4a2d-96b6-903fb8cb342e	6	2026-02-11	مريض توزيع أ	01111111111	cash	\N	\N	\N	\N	draft	500.00	0.00	500.00	0.00	\N	2026-02-11 09:10:31.453594	2026-02-11 09:10:31.453594	\N	\N	f	\N
a79e3b57-e850-4116-b8b0-abe30fc4d0d9	7	2026-02-11	مريض توزيع ب	02222222222	cash	\N	\N	\N	\N	draft	0.00	0.00	0.00	0.00	\N	2026-02-11 09:10:31.453594	2026-02-11 09:10:31.453594	\N	\N	f	\N
c9ac47ec-12a9-452d-9b06-8777faf10145	24	2020-01-15	مريض اختبار	\N	cash	\N	\N	\N	\N	draft	0.00	0.00	0.00	0.00	\N	2026-02-13 09:34:55.470648	2026-02-13 09:34:55.470648	\N	\N	f	\N
f62fa99e-8d7d-4816-b2e0-046a40714a55	14	2026-02-13	مريض إلغاء قائمة	\N	cash	\N	\N	\N	[ملغي]	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:23:42.807567	2026-02-13 09:23:42.807567	\N	\N	f	\N
c5795f1c-7cf5-4baf-b797-65bf91a1a847	8	2020-01-15	مريض اختبار	\N	cash	\N	\N	\N	\N	draft	0.00	0.00	0.00	0.00	\N	2026-02-13 09:16:22.352169	2026-02-13 09:16:22.352169	\N	\N	f	\N
ed533d24-b5fa-48a0-bfde-62adc88fc101	9	2026-02-13	مريض اختبار الإلغاء	\N	cash	\N	\N	\N	[ملغي] test cancel	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:16:22.480485	2026-02-13 09:16:22.480485	\N	\N	f	\N
8e6f4efa-ddcc-49f6-968a-8eaa618697dc	15	2026-02-13	مريض مزدوج	\N	cash	\N	\N	\N	\N	finalized	0.00	0.00	0.00	0.00	2026-02-13 09:23:43.256	2026-02-13 09:23:43.161367	2026-02-13 09:23:43.256	\N	\N	f	\N
e9bcfb50-6244-4963-8dde-bdd0f1f5c84f	10	2026-02-13	مريض إلغاء قائمة	\N	cash	\N	\N	\N	[ملغي]	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:16:22.666875	2026-02-13 09:16:22.666875	\N	\N	f	\N
b30cb240-8fec-46f3-b251-e5014a552c07	11	2026-02-13	مريض مزدوج	\N	cash	\N	\N	\N	\N	finalized	0.00	0.00	0.00	0.00	2026-02-13 09:16:23.18	2026-02-13 09:16:23.144786	2026-02-13 09:16:23.18	\N	\N	f	\N
a1f34cfe-e570-4802-9d0e-492a3547d77b	12	2020-01-15	مريض اختبار	\N	cash	\N	\N	\N	\N	draft	0.00	0.00	0.00	0.00	\N	2026-02-13 09:23:42.543165	2026-02-13 09:23:42.543165	\N	\N	f	\N
99b29814-9ede-48a7-a412-0d778a1328c2	16	2020-01-15	مريض اختبار	\N	cash	\N	\N	\N	\N	draft	0.00	0.00	0.00	0.00	\N	2026-02-13 09:29:35.695946	2026-02-13 09:29:35.695946	\N	\N	f	\N
3ceec830-8dd7-4e7a-8377-dfb02cb06184	30	2026-02-13	مريض إلغاء قائمة	\N	cash	\N	\N	\N	[ملغي]	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:39:10.264852	2026-02-13 09:39:10.264852	\N	\N	f	\N
4ad26a5d-7af8-4b40-945c-ae4ed47da74f	17	2026-02-13	مريض اختبار الإلغاء	\N	cash	\N	\N	\N	[ملغي] test cancel	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:29:36.087631	2026-02-13 09:29:36.087631	\N	\N	f	\N
1548f2c3-5e32-4a4a-ad61-c070df4b2f25	25	2026-02-13	مريض اختبار الإلغاء	\N	cash	\N	\N	\N	[ملغي] test cancel	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:34:55.724181	2026-02-13 09:34:55.724181	\N	\N	f	\N
39317f07-e794-45e0-a2b5-aba261f4bc4c	18	2026-02-13	مريض إلغاء قائمة	\N	cash	\N	\N	\N	[ملغي]	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:29:36.194817	2026-02-13 09:29:36.194817	\N	\N	f	\N
f3af4b79-3595-444c-8f40-04c3b4c479d3	19	2026-02-13	مريض مزدوج	\N	cash	\N	\N	\N	\N	finalized	0.00	0.00	0.00	0.00	2026-02-13 09:29:36.568	2026-02-13 09:29:36.545045	2026-02-13 09:29:36.568	\N	\N	f	\N
b5ba5db2-9635-4f43-bfc7-d08249b72f4b	20	2020-01-15	مريض اختبار	\N	cash	\N	\N	\N	\N	draft	0.00	0.00	0.00	0.00	\N	2026-02-13 09:30:37.013297	2026-02-13 09:30:37.013297	\N	\N	f	\N
3d9bae25-245d-4439-8afe-183e4d05d61a	21	2026-02-13	مريض اختبار الإلغاء	\N	cash	\N	\N	\N	[ملغي] test cancel	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:30:37.228744	2026-02-13 09:30:37.228744	\N	\N	f	\N
f19a0ecf-ccea-4470-ba0a-46ec07b159e3	26	2026-02-13	مريض إلغاء قائمة	\N	cash	\N	\N	\N	[ملغي]	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:34:55.816276	2026-02-13 09:34:55.816276	\N	\N	f	\N
859df82a-7ab9-4011-96e8-430c7d884628	22	2026-02-13	مريض إلغاء قائمة	\N	cash	\N	\N	\N	[ملغي]	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:30:37.32194	2026-02-13 09:30:37.32194	\N	\N	f	\N
2894ac63-4c1f-4470-841b-4db685cbaf55	34	2026-02-13	مريض إلغاء قائمة	\N	cash	\N	\N	\N	[ملغي]	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:59:07.624796	2026-02-13 09:59:07.624796	\N	\N	f	\N
1426fa0e-122a-477f-afc9-d31549c27947	23	2026-02-13	مريض مزدوج	\N	cash	\N	\N	\N	\N	finalized	0.00	0.00	0.00	0.00	2026-02-13 09:30:37.601	2026-02-13 09:30:37.584034	2026-02-13 09:30:37.601	\N	\N	f	\N
4b1bd591-ce99-4c07-a9c3-68bb1fc612cd	31	2026-02-13	مريض مزدوج	\N	cash	\N	\N	\N	\N	finalized	0.00	0.00	0.00	0.00	2026-02-13 09:39:10.655	2026-02-13 09:39:10.634655	2026-02-13 09:39:10.655	\N	\N	f	\N
738b9d5d-4c3c-471f-b2e8-af2f39d83d07	27	2026-02-13	مريض مزدوج	\N	cash	\N	\N	\N	\N	finalized	0.00	0.00	0.00	0.00	2026-02-13 09:34:56.145	2026-02-13 09:34:56.131049	2026-02-13 09:34:56.145	\N	\N	f	\N
2aef4510-8ba3-463c-8498-b893ebb56110	28	2020-01-15	مريض اختبار	\N	cash	\N	\N	\N	\N	draft	0.00	0.00	0.00	0.00	\N	2026-02-13 09:39:09.808352	2026-02-13 09:39:09.808352	\N	\N	f	\N
88c118f7-5431-4afc-8bae-8005ae12131c	29	2026-02-13	مريض اختبار الإلغاء	\N	cash	\N	\N	\N	[ملغي] test cancel	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:39:10.13661	2026-02-13 09:39:10.13661	\N	\N	f	\N
e165d4d1-c56a-430e-8f20-17c5fd9e5469	32	2020-01-15	مريض اختبار	\N	cash	\N	\N	\N	\N	draft	0.00	0.00	0.00	0.00	\N	2026-02-13 09:59:07.257422	2026-02-13 09:59:07.257422	\N	\N	f	\N
8c8e42f3-4bcd-44dd-be3c-f813f0168e02	38	2026-02-13	مريض إلغاء قائمة	\N	cash	\N	\N	\N	[ملغي]	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 10:00:56.034383	2026-02-13 10:00:56.034383	\N	\N	f	\N
d2fd5bad-a9a2-42d4-a20c-3bf7eabe8e6b	33	2026-02-13	مريض اختبار الإلغاء	\N	cash	\N	\N	\N	[ملغي] test cancel	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 09:59:07.515933	2026-02-13 09:59:07.515933	\N	\N	f	\N
94663fb7-55ae-4792-8843-d88c3cefdd1b	37	2026-02-13	مريض اختبار الإلغاء	\N	cash	\N	\N	\N	[ملغي] test cancel	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 10:00:55.79132	2026-02-13 10:00:55.79132	\N	\N	f	\N
19548744-b24a-41db-8b71-1e03882f4916	35	2026-02-13	مريض مزدوج	\N	cash	\N	\N	\N	\N	finalized	0.00	0.00	0.00	0.00	2026-02-13 09:59:07.993	2026-02-13 09:59:07.971705	2026-02-13 09:59:07.993	\N	\N	f	\N
170c4136-b282-46bf-a026-25706c84523d	36	2020-01-15	مريض اختبار	\N	cash	\N	\N	\N	\N	draft	0.00	0.00	0.00	0.00	\N	2026-02-13 10:00:54.776561	2026-02-13 10:00:54.776561	\N	\N	f	\N
dea6f5a6-7e05-470e-b545-8312357dec11	39	2026-02-13	مريض مزدوج	\N	cash	\N	\N	\N	\N	finalized	0.00	0.00	0.00	0.00	2026-02-13 10:00:56.756	2026-02-13 10:00:56.715131	2026-02-13 10:00:56.756	\N	\N	f	\N
b3290c8e-558e-40e2-86d1-0e1eee1ecf12	40	2020-01-15	مريض اختبار	\N	cash	\N	\N	\N	\N	draft	0.00	0.00	0.00	0.00	\N	2026-02-13 10:01:04.259261	2026-02-13 10:01:04.259261	\N	\N	f	\N
1d4a0724-0277-4139-9367-df8d0ec23ffc	41	2026-02-13	مريض اختبار الإلغاء	\N	cash	\N	\N	\N	[ملغي] test cancel	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 10:01:04.811712	2026-02-13 10:01:04.811712	\N	\N	f	\N
79b6099a-13b3-4ff7-8ddd-03ee8af01479	42	2026-02-13	مريض إلغاء قائمة	\N	cash	\N	\N	\N	[ملغي]	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 10:01:05.055382	2026-02-13 10:01:05.055382	\N	\N	f	\N
ccbf2e6d-1df3-40f9-9adb-8b3f00efa5af	43	2026-02-13	مريض مزدوج	\N	cash	\N	\N	\N	\N	finalized	0.00	0.00	0.00	0.00	2026-02-13 10:01:05.712	2026-02-13 10:01:05.672551	2026-02-13 10:01:05.712	\N	\N	f	\N
0a06080a-1dbd-409d-82d5-3bda6501ae3b	44	2020-01-15	مريض اختبار	\N	cash	\N	\N	\N	\N	draft	0.00	0.00	0.00	0.00	\N	2026-02-13 10:03:30.247518	2026-02-13 10:03:30.247518	\N	\N	f	\N
71efd126-c02b-4b4d-9c2a-39e7a776e035	45	2026-02-13	مريض اختبار الإلغاء	\N	cash	\N	\N	\N	[ملغي] test cancel	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 10:03:30.712094	2026-02-13 10:03:30.712094	\N	\N	f	\N
3aed6e8f-d37a-46eb-bdbf-0700b4ffba51	46	2026-02-13	مريض إلغاء قائمة	\N	cash	\N	\N	\N	[ملغي]	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 10:03:30.92389	2026-02-13 10:03:30.92389	\N	\N	f	\N
f8b011db-7cc1-4970-87a5-1be3c3c735a5	47	2026-02-13	مريض مزدوج	\N	cash	\N	\N	\N	\N	finalized	0.00	0.00	0.00	0.00	2026-02-13 10:03:31.236	2026-02-13 10:03:31.218147	2026-02-13 10:03:31.236	\N	\N	f	\N
47dac01a-c68d-4a92-a272-d948a20af8c3	48	2020-01-15	مريض اختبار	\N	cash	\N	\N	\N	\N	draft	0.00	0.00	0.00	0.00	\N	2026-02-13 10:17:58.847089	2026-02-13 10:17:58.847089	\N	\N	f	\N
5df0a2d5-802f-4ccd-b67f-7940a965a9ed	49	2026-02-13	مريض اختبار الإلغاء	\N	cash	\N	\N	\N	[ملغي] test cancel	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 10:17:59.23583	2026-02-13 10:17:59.23583	\N	\N	f	\N
39ed480d-5897-4efb-9578-7b70e88d76e5	50	2026-02-13	مريض إلغاء قائمة	\N	cash	\N	\N	\N	[ملغي]	cancelled	0.00	0.00	0.00	0.00	\N	2026-02-13 10:17:59.393229	2026-02-13 10:17:59.393229	\N	\N	f	\N
e3f061f7-61b7-4dde-993e-aee7f79c0d64	51	2026-02-13	مريض مزدوج	\N	cash	\N	\N	\N	\N	finalized	0.00	0.00	0.00	0.00	2026-02-13 10:17:59.701	2026-02-13 10:17:59.678939	2026-02-13 10:17:59.701	\N	\N	f	\N
\.


--
-- Data for Name: patient_invoice_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.patient_invoice_lines (id, header_id, line_type, service_id, item_id, description, quantity, unit_price, discount_percent, discount_amount, total_price, notes, sort_order, created_at, doctor_name, nurse_name, lot_id, expiry_month, expiry_year, price_source, unit_level) FROM stdin;
947a073f-894b-443e-bb4e-61d6125cc764	9533f1b1-52e1-418f-90f7-18f13149f782	service	\N	\N	كشف عيادة	1.0000	100.00	0.00	0.00	100.00	\N	0	2026-02-09 19:52:31.597296	\N	\N	\N	\N	\N	\N	minor
55d8efa3-86ee-4094-81c5-f4d330c80e0b	ea48c97a-b2a3-4c12-939e-785b24cb0766	drug	\N	227cc6a5-2eea-430b-913f-143bb33e4d9a	ادولور 30مجم امبول	1.0000	50.00	0.00	0.00	50.00	\N	0	2026-02-10 20:12:10.58941	\N	\N	0a6c46e9-8381-4c9b-83af-4166243e43e5	12	2030	item	minor
fdf449c1-bf44-486b-ba69-ea4ba84b559d	c8489b97-dc6e-4857-a76d-a9d4d497606c	drug	\N	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	باراسيتامول	1.0000	500.00	0.00	0.00	500.00	\N	0	2026-02-11 09:05:26.968531	\N	\N	3c1ae70b-1a7c-4dc9-ac15-49093338e6d9	12	2029	item	major
898a7508-59f1-4fc3-8414-05b28ab08715	c8489b97-dc6e-4857-a76d-a9d4d497606c	drug	\N	227cc6a5-2eea-430b-913f-143bb33e4d9a	ادولور 30مجم امبول	4.0000	1000.00	0.00	0.00	4000.00	\N	0	2026-02-11 09:05:26.968531	\N	\N	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	12	2029	department	major
4d83f951-a675-4a73-9609-e6b4a97d6091	c8489b97-dc6e-4857-a76d-a9d4d497606c	drug	\N	4b75a55e-1cbe-48b9-8243-31708a3577ec	أموكسيسيلين	1.0000	500.00	0.00	0.00	500.00	\N	0	2026-02-11 09:05:26.968531	\N	\N	b73c4baf-e1db-4a06-b4e8-9f4cf67b4436	12	2029	lot	major
39bb04fa-3745-4d96-9c7c-c8d7ea77a199	c8489b97-dc6e-4857-a76d-a9d4d497606c	drug	\N	31ca9617-f155-4147-9acd-4529df6bc51d	إيبوبروفين	4.0000	500.00	0.00	0.00	2000.00	\N	0	2026-02-11 09:05:26.968531	\N	\N	880d9abc-661e-4741-94ed-2389d435b387	12	2029	lot	major
d6818dc4-e32f-4665-becc-a923891e123f	c8489b97-dc6e-4857-a76d-a9d4d497606c	consumable	\N	0396b137-8815-455d-bfc2-6a08d6351004	ابرة نصفى مقاسات	4.0000	500.00	0.00	0.00	2000.00	\N	0	2026-02-11 09:05:26.968531	\N	\N	\N	\N	\N	item	major
1e3f7f6a-7a8e-4781-af7e-5b226b957dcd	db645030-fc9a-4f88-bdc0-6a09c6992ea1	drug	\N	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	باراسيتامول	1.0000	500.00	0.00	0.00	500.00	\N	0	2026-02-11 09:05:26.968531	\N	\N	3c1ae70b-1a7c-4dc9-ac15-49093338e6d9	12	2029	item	major
e2661f55-1d98-417f-9003-556b4e38c043	db645030-fc9a-4f88-bdc0-6a09c6992ea1	drug	\N	227cc6a5-2eea-430b-913f-143bb33e4d9a	ادولور 30مجم امبول	3.0000	1000.00	0.00	0.00	3000.00	\N	0	2026-02-11 09:05:26.968531	\N	\N	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	12	2029	department	major
81e6503f-f4e2-4982-91b6-e462b578c0f8	db645030-fc9a-4f88-bdc0-6a09c6992ea1	drug	\N	31ca9617-f155-4147-9acd-4529df6bc51d	إيبوبروفين	3.0000	500.00	0.00	0.00	1500.00	\N	0	2026-02-11 09:05:26.968531	\N	\N	880d9abc-661e-4741-94ed-2389d435b387	12	2029	lot	major
8aa44a40-930a-46e3-96bc-c4d68d419982	db645030-fc9a-4f88-bdc0-6a09c6992ea1	consumable	\N	0396b137-8815-455d-bfc2-6a08d6351004	ابرة نصفى مقاسات	3.0000	500.00	0.00	0.00	1500.00	\N	0	2026-02-11 09:05:26.968531	\N	\N	\N	\N	\N	item	major
296335b9-4df7-4f76-895f-52bb6d77022e	f95263f4-18d9-41a4-8982-14f55a9a1047	drug	\N	227cc6a5-2eea-430b-913f-143bb33e4d9a	ادولور 30مجم امبول	3.0000	1000.00	0.00	0.00	3000.00	\N	0	2026-02-11 09:05:26.968531	\N	\N	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	12	2029	department	major
4a8e3c9b-5ef7-4656-92f8-ec9b10c33423	f95263f4-18d9-41a4-8982-14f55a9a1047	drug	\N	31ca9617-f155-4147-9acd-4529df6bc51d	إيبوبروفين	3.0000	500.00	0.00	0.00	1500.00	\N	0	2026-02-11 09:05:26.968531	\N	\N	880d9abc-661e-4741-94ed-2389d435b387	12	2029	lot	major
1b822468-7fb0-4cff-a9e5-c30401f4ee87	f95263f4-18d9-41a4-8982-14f55a9a1047	consumable	\N	0396b137-8815-455d-bfc2-6a08d6351004	ابرة نصفى مقاسات	3.0000	500.00	0.00	0.00	1500.00	\N	0	2026-02-11 09:05:26.968531	\N	\N	\N	\N	\N	item	major
81af5c34-9e09-44b1-96dc-868d4e8b7b28	79a4d125-867a-4a2d-96b6-903fb8cb342e	drug	\N	0396b137-8815-455d-bfc2-6a08d6351004	ابرة نصفى مقاسات	1.0000	500.00	0.00	0.00	500.00	\N	0	2026-02-11 09:10:31.453594	\N	\N	\N	\N	\N	item	major
8dafd63f-b20c-4988-ad48-5c8790fc2658	b30cb240-8fec-46f3-b251-e5014a552c07	service	\N	\N	خدمة	1.0000	100.00	0.00	0.00	100.00	\N	0	2026-02-13 09:16:23.144786	\N	\N	\N	\N	\N	\N	minor
dbe45fce-c1f3-4504-ba53-5d23e8512dca	8e6f4efa-ddcc-49f6-968a-8eaa618697dc	service	\N	\N	خدمة	1.0000	100.00	0.00	0.00	100.00	\N	0	2026-02-13 09:23:43.161367	\N	\N	\N	\N	\N	\N	minor
4df35776-babe-4301-bfca-134afe384a97	f3af4b79-3595-444c-8f40-04c3b4c479d3	service	\N	\N	خدمة	1.0000	100.00	0.00	0.00	100.00	\N	0	2026-02-13 09:29:36.545045	\N	\N	\N	\N	\N	\N	minor
de506b6b-2b08-4f7e-97d3-ee4559271cf7	1426fa0e-122a-477f-afc9-d31549c27947	service	\N	\N	خدمة	1.0000	100.00	0.00	0.00	100.00	\N	0	2026-02-13 09:30:37.584034	\N	\N	\N	\N	\N	\N	minor
5528df61-7741-4733-be07-b1fc4f6ade75	738b9d5d-4c3c-471f-b2e8-af2f39d83d07	service	\N	\N	خدمة	1.0000	100.00	0.00	0.00	100.00	\N	0	2026-02-13 09:34:56.131049	\N	\N	\N	\N	\N	\N	minor
6ca8fa7d-0130-4372-91cc-ed150ac3494b	4b1bd591-ce99-4c07-a9c3-68bb1fc612cd	service	\N	\N	خدمة	1.0000	100.00	0.00	0.00	100.00	\N	0	2026-02-13 09:39:10.634655	\N	\N	\N	\N	\N	\N	minor
9d74a09f-9518-491a-b4d3-8462ff3cb8e0	19548744-b24a-41db-8b71-1e03882f4916	service	\N	\N	خدمة	1.0000	100.00	0.00	0.00	100.00	\N	0	2026-02-13 09:59:07.971705	\N	\N	\N	\N	\N	\N	minor
e8c64caf-707e-42bb-af99-c0aed233038e	dea6f5a6-7e05-470e-b545-8312357dec11	service	\N	\N	خدمة	1.0000	100.00	0.00	0.00	100.00	\N	0	2026-02-13 10:00:56.715131	\N	\N	\N	\N	\N	\N	minor
9be43ece-6657-401e-8d50-1412e12ae4ff	ccbf2e6d-1df3-40f9-9adb-8b3f00efa5af	service	\N	\N	خدمة	1.0000	100.00	0.00	0.00	100.00	\N	0	2026-02-13 10:01:05.672551	\N	\N	\N	\N	\N	\N	minor
d7bb3283-58f8-4410-a0fc-44e7e78e523c	f8b011db-7cc1-4970-87a5-1be3c3c735a5	service	\N	\N	خدمة	1.0000	100.00	0.00	0.00	100.00	\N	0	2026-02-13 10:03:31.218147	\N	\N	\N	\N	\N	\N	minor
b0678284-2e19-427b-bce9-d7f8a5127e6e	e3f061f7-61b7-4dde-993e-aee7f79c0d64	service	\N	\N	خدمة	1.0000	100.00	0.00	0.00	100.00	\N	0	2026-02-13 10:17:59.678939	\N	\N	\N	\N	\N	\N	minor
\.


--
-- Data for Name: patient_invoice_payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.patient_invoice_payments (id, header_id, payment_date, amount, payment_method, reference_number, notes, created_at) FROM stdin;
\.


--
-- Data for Name: patients; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.patients (id, full_name, phone, national_id, age, is_active, created_at) FROM stdin;
579df5ba-54cc-42c2-8d1f-abd3b8eb263b	مريض اختبار تلقائي	01234567890	\N	45	f	2026-02-11 08:56:05.728011
fef7f5fb-24af-41a2-aa97-0e296d5ebc2a	كراس سمسم سامى سميح	01000717856	28302192404551	45	t	2026-02-11 09:01:27.138038
3b2822cd-f658-4635-a13f-667e2d39b67a	عزه احمدمحمد عبدالحميد	01000717816	28302192404551	50	t	2026-02-11 09:02:20.264553
101bf9c8-492c-428a-ab63-2b50087ca5b3	مارينا مسامح اسحق فرج الله	01000717816	28302192404551	60	t	2026-02-11 09:02:41.956963
b286e1da-d09d-4e15-ba13-a7631387f81a	شريف عبدالرحمن عبدالظاهر محمود	01000717816	28302192404551	65	t	2026-02-11 09:03:03.488839
746ccaef-0e8e-4b1b-861c-230a059f9f6f	مريض توزيع أ	01111111111	\N	\N	t	2026-02-11 09:09:06.709222
4b3bfc7b-ca15-49d5-a6d6-4aead0d338cf	مريض توزيع ب	02222222222	\N	\N	t	2026-02-11 09:09:06.755462
\.


--
-- Data for Name: pharmacies; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pharmacies (id, code, name_ar, is_active, created_at) FROM stdin;
pharmacy-1	PH-HOSNY	صيدلية د/حسنى	t	2026-02-10 18:30:49.480305
pharmacy-2	PH-SAHAR	صيدلية د/سحر (الثامن)	t	2026-02-10 18:30:49.480305
\.


--
-- Data for Name: price_adjustments_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.price_adjustments_log (id, price_list_id, action_type, direction, value, filter_department_id, filter_category, affected_count, created_at) FROM stdin;
\.


--
-- Data for Name: price_list_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.price_list_items (id, price_list_id, service_id, price, min_discount_pct, max_discount_pct, created_at, updated_at) FROM stdin;
99011dae-8e73-4d49-9e34-1409f542d2f8	37b59cd4-d9ed-4887-8312-f7c8d57d7745	3c640915-aa91-4c27-8175-903fbff88862	15.00	\N	\N	2026-02-08 20:13:16.805357	2026-02-08 20:13:16.805357
\.


--
-- Data for Name: price_lists; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.price_lists (id, code, name, currency, valid_from, valid_to, is_active, notes, created_at, updated_at, department_id) FROM stdin;
37b59cd4-d9ed-4887-8312-f7c8d57d7745	1	قائمة اسعار رئيسية	EGP	\N	\N	t	افتراضية	2026-02-08 20:10:12.853853	2026-02-08 20:10:12.853853	\N
\.


--
-- Data for Name: purchase_invoice_headers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.purchase_invoice_headers (id, invoice_number, supplier_id, supplier_invoice_no, warehouse_id, receiving_id, invoice_date, status, discount_type, discount_value, total_before_vat, total_vat, total_after_vat, total_line_discounts, net_payable, notes, approved_at, approved_by, created_at, updated_at) FROM stdin;
bc9f1e71-d35b-4cc7-8e35-9be6aa85a816	1	33dcd1d2-62a9-4b77-9a0b-10394b9d0349	123456	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	a8589b4c-4853-41bc-bb07-b8941c460850	2026-02-07	approved_costed	value	1.9000	5275.00	781.90	6056.90	0.00	6055.00		2026-02-07 20:59:07.028	\N	2026-02-07 20:45:41.984903	2026-02-07 20:59:07.028
4c94d96c-f598-47cf-8a0a-295083b36945	2	33dcd1d2-62a9-4b77-9a0b-10394b9d0349	1596321	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	dbe7e965-cdf0-4b6c-b2a3-e270903906a9	2026-02-07	approved_costed	value	0.0000	4125.00	598.50	4723.50	0.00	4723.50		2026-02-08 19:36:16.258	\N	2026-02-08 19:35:54.584523	2026-02-08 19:36:16.258
5ee50735-bce6-4dd6-ab7b-d5077883f7a6	3	33dcd1d2-62a9-4b77-9a0b-10394b9d0349	963215	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	3b8df687-32bf-43aa-8e86-afb557cdbafe	2026-02-09	approved_costed	value	0.0000	342.30	47.92	390.22	0.00	390.22		2026-02-09 10:40:50.796	\N	2026-02-09 10:39:41.766455	2026-02-09 10:40:50.796
693fe34f-12b3-4ef3-a9ef-7e648309e160	4	dfaeb15d-0411-4a23-9986-b67c737cdb02	1000	b045a6c1-dc79-4480-8907-a8fb6975a92f	99028858-c7b9-4106-8709-153fcef90bd9	2026-02-11	approved_costed	value	0.0000	3423.00	479.22	3902.22	0.00	3902.22		2026-02-11 08:19:52.469	\N	2026-02-11 08:19:25.108169	2026-02-11 08:19:52.469
\.


--
-- Data for Name: purchase_invoice_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.purchase_invoice_lines (id, invoice_id, receiving_line_id, item_id, unit_level, qty, bonus_qty, selling_price, purchase_price, line_discount_pct, line_discount_value, vat_rate, value_before_vat, vat_amount, value_after_vat, batch_number, expiry_month, expiry_year, created_at) FROM stdin;
5ee1bc8b-e4ed-4c4e-8e4c-47a8f8ab5670	bc9f1e71-d35b-4cc7-8e35-9be6aa85a816	bbea149e-0d11-44b1-a678-aeaa79ae1dad	0396b137-8815-455d-bfc2-6a08d6351004	major	50.0000	0.0000	100.00	36.3000	0.0000	0.00	14.0000	1815.00	254.10	2069.10	\N	\N	\N	2026-02-07 20:59:06.647061
73ca5d80-3ba0-4c79-9602-6605bf9451ae	bc9f1e71-d35b-4cc7-8e35-9be6aa85a816	9991373d-c4ef-4c48-aa6f-5931ff858204	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	10.0000	0.0000	36.00	26.0000	0.0000	0.00	14.0000	260.00	36.40	296.40	\N	12	2029	2026-02-07 20:59:06.647061
57c175fb-628b-4648-8ae0-708cd1588c7a	bc9f1e71-d35b-4cc7-8e35-9be6aa85a816	5a5bb153-ea5e-4ff8-b0e2-4c6e820b1387	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	major	10.0000	0.0000	100.00	50.0000	0.0000	0.00	14.0000	500.00	70.00	570.00	\N	12	2030	2026-02-07 20:59:06.647061
80fd2896-8c6e-4a7a-9790-75cfc1c7c6ec	bc9f1e71-d35b-4cc7-8e35-9be6aa85a816	b4877314-7e54-49e9-9ddc-714dab311c92	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	15.0000	2.0000	150.00	80.0000	0.0000	0.00	14.0000	1200.00	190.40	1390.40	\N	12	2029	2026-02-07 20:59:06.647061
4a3fc3cd-ef3f-430f-bcbd-dd9da05588ae	bc9f1e71-d35b-4cc7-8e35-9be6aa85a816	87c783ad-4efe-4aff-90fb-a83bad8b42d3	31ca9617-f155-4147-9acd-4529df6bc51d	major	10.0000	1.0000	300.00	150.0000	0.0000	0.00	14.0000	1500.00	231.00	1731.00	\N	12	2029	2026-02-07 20:59:06.647061
8d92ae30-484a-4cd1-a466-4a273c8408e0	4c94d96c-f598-47cf-8a0a-295083b36945	49c3600c-f1e6-4c47-ac66-a45b1a9e3690	0396b137-8815-455d-bfc2-6a08d6351004	major	50.0000	0.0000	100.00	36.3000	0.0000	0.00	14.0000	1815.00	254.10	2069.10	\N	\N	\N	2026-02-08 19:36:15.981624
a4b29164-598c-42cc-8cc4-e1f1d5fd1acf	4c94d96c-f598-47cf-8a0a-295083b36945	19cbb0bf-2127-4a9f-bdd8-ad38837fdff1	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	10.0000	0.0000	50.00	26.0000	0.0000	0.00	14.0000	260.00	36.40	296.40	\N	12	2030	2026-02-08 19:36:15.981624
c8d5b873-56c2-4e46-9dd9-62e30ab3d292	4c94d96c-f598-47cf-8a0a-295083b36945	c6d2c495-ecbb-4702-aa59-86203544985a	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	major	10.0000	0.0000	100.00	50.0000	0.0000	0.00	14.0000	500.00	70.00	570.00	\N	1	2029	2026-02-08 19:36:15.981624
1951ad36-9ec0-47a5-97dd-b05d88286656	4c94d96c-f598-47cf-8a0a-295083b36945	4785b206-8517-4c0d-a24a-351708f4f666	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	10.0000	0.0000	200.00	80.0000	0.0000	0.00	14.0000	800.00	112.00	912.00	\N	12	2030	2026-02-08 19:36:15.981624
4be21249-9826-468f-aeb0-76a97aad2d79	4c94d96c-f598-47cf-8a0a-295083b36945	ffc7c656-309f-4a4a-91a5-a98e7a3380de	31ca9617-f155-4147-9acd-4529df6bc51d	major	5.0000	1.0000	300.00	150.0000	0.0000	0.00	14.0000	750.00	126.00	876.00	\N	1	2029	2026-02-08 19:36:15.981624
18fc6373-9ee9-4572-aaee-2a8820d14d95	5ee50735-bce6-4dd6-ab7b-d5077883f7a6	45e238f7-f72c-4cfe-8181-ecf629e3d3cb	0396b137-8815-455d-bfc2-6a08d6351004	major	1.0000	0.0000	500.00	36.3000	0.0000	0.00	14.0000	36.30	5.08	41.38	\N	\N	\N	2026-02-09 10:40:50.441869
bd77ea2f-b5fe-4916-9374-6b3cb398b2d8	5ee50735-bce6-4dd6-ab7b-d5077883f7a6	ab2d0599-1a6b-49a8-95a0-c15d70c17fd2	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	1.0000	0.0000	500.00	26.0000	0.0000	0.00	14.0000	26.00	3.64	29.64	2	12	2040	2026-02-09 10:40:50.441869
d213dfe1-71d6-4961-8e88-56185ed7fedc	5ee50735-bce6-4dd6-ab7b-d5077883f7a6	f08ef462-7d03-45a8-b1f9-a0132283ff88	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	major	1.0000	0.0000	500.00	50.0000	0.0000	0.00	14.0000	50.00	7.00	57.00	2	12	2040	2026-02-09 10:40:50.441869
fd2c31e2-4239-4735-be07-96bb753f233d	5ee50735-bce6-4dd6-ab7b-d5077883f7a6	03e3e252-4c3a-4c48-b37d-7c0f7cc7dc6a	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	1.0000	0.0000	500.00	80.0000	0.0000	0.00	14.0000	80.00	11.20	91.20	2	12	2040	2026-02-09 10:40:50.441869
d29f9585-ca4b-44d4-88a5-07b351b3a70e	5ee50735-bce6-4dd6-ab7b-d5077883f7a6	f542e8a9-9d77-423c-b01c-379619baaebd	31ca9617-f155-4147-9acd-4529df6bc51d	major	1.0000	0.0000	500.00	150.0000	0.0000	0.00	14.0000	150.00	21.00	171.00	2	12	2040	2026-02-09 10:40:50.441869
dff6c95f-7583-457b-85fc-f95cb3cdaf0d	693fe34f-12b3-4ef3-a9ef-7e648309e160	b3715227-17b5-4505-b84c-7775dedd9079	0396b137-8815-455d-bfc2-6a08d6351004	major	10.0000	0.0000	500.00	36.3000	0.0000	0.00	14.0000	363.00	50.82	413.82	\N	\N	\N	2026-02-11 08:19:52.241984
387a2154-0329-4afb-97a4-83000652f738	693fe34f-12b3-4ef3-a9ef-7e648309e160	ccb28e85-6da8-4d2b-92da-9dca83c5c2e0	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	10.0000	0.0000	500.00	26.0000	0.0000	0.00	14.0000	260.00	36.40	296.40	\N	12	2029	2026-02-11 08:19:52.241984
7eb186e0-3efb-49f3-a011-1341462576f1	693fe34f-12b3-4ef3-a9ef-7e648309e160	16fa46b5-f871-4be6-a0b5-236a00638ca1	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	major	10.0000	0.0000	500.00	50.0000	0.0000	0.00	14.0000	500.00	70.00	570.00	\N	12	2029	2026-02-11 08:19:52.241984
ce1951b2-5969-4719-8223-8e372a63de79	693fe34f-12b3-4ef3-a9ef-7e648309e160	b3d68f07-b5e2-4fc7-ab40-0d2288d1a712	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	10.0000	0.0000	500.00	80.0000	0.0000	0.00	14.0000	800.00	112.00	912.00	\N	12	2029	2026-02-11 08:19:52.241984
e594d315-234e-4cd2-b224-515bfbf23e5e	693fe34f-12b3-4ef3-a9ef-7e648309e160	067783db-8360-4edb-be3f-2dc44c280d35	31ca9617-f155-4147-9acd-4529df6bc51d	major	10.0000	0.0000	500.00	150.0000	0.0000	0.00	14.0000	1500.00	210.00	1710.00	\N	12	2029	2026-02-11 08:19:52.241984
\.


--
-- Data for Name: purchase_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.purchase_transactions (id, item_id, tx_date, supplier_name, qty, unit_level, purchase_price, sale_price_snapshot, total, created_at) FROM stdin;
aad8628f-40a5-48b8-9a10-6e830ed5c1a1	0396b137-8815-455d-bfc2-6a08d6351004	2026-02-07	ابن سينا	50.0000	minor	36.30	100.00	1815.00	2026-02-13 08:09:12.624886
0c1decf2-e9aa-4421-9e23-e950e3d8de5c	0396b137-8815-455d-bfc2-6a08d6351004	2026-02-07	ابن سينا	50.0000	minor	36.30	100.00	1815.00	2026-02-13 08:09:12.624886
7ce674ad-db4a-48f1-af6c-f36df28573a4	227cc6a5-2eea-430b-913f-143bb33e4d9a	2026-02-07	ابن سينا	10.0000	minor	26.00	50.00	260.00	2026-02-13 08:09:12.624886
dee227fa-3170-4ddc-b139-3026e52ec5f3	227cc6a5-2eea-430b-913f-143bb33e4d9a	2026-02-07	ابن سينا	10.0000	minor	26.00	36.00	260.00	2026-02-13 08:09:12.624886
2382ef6a-af55-4887-bb66-0c9c85012c19	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	2026-02-07	ابن سينا	10.0000	minor	50.00	100.00	500.00	2026-02-13 08:09:12.624886
eb4883e9-0394-45c7-a908-bb8769764897	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	2026-02-07	ابن سينا	10.0000	minor	50.00	100.00	500.00	2026-02-13 08:09:12.624886
d7ccabb5-bdca-4a12-8256-3852357985f7	4b75a55e-1cbe-48b9-8243-31708a3577ec	2026-02-07	ابن سينا	15.0000	minor	80.00	200.00	800.00	2026-02-13 08:09:12.624886
a133d588-75f6-43d8-93b0-5154c4f95aa0	4b75a55e-1cbe-48b9-8243-31708a3577ec	2026-02-07	ابن سينا	15.0000	minor	80.00	150.00	1200.00	2026-02-13 08:09:12.624886
22e17958-7234-4b50-ba9c-9ee2ff70082f	31ca9617-f155-4147-9acd-4529df6bc51d	2026-02-07	ابن سينا	10.0000	minor	150.00	300.00	22500.00	2026-02-13 08:09:12.624886
72510dd2-5ee6-4412-81a1-9108c8fd877b	31ca9617-f155-4147-9acd-4529df6bc51d	2026-02-07	ابن سينا	10.0000	minor	150.00	300.00	45000.00	2026-02-13 08:09:12.624886
572b09ed-b71d-437d-8b12-7686a9c2a78c	0396b137-8815-455d-bfc2-6a08d6351004	2026-02-09	ابن سينا	1.0000	minor	36.30	500.00	36.30	2026-02-13 08:09:12.624886
a49a12ef-7695-4072-a6aa-e379641dc6bb	227cc6a5-2eea-430b-913f-143bb33e4d9a	2026-02-09	ابن سينا	1.0000	minor	26.00	500.00	26.00	2026-02-13 08:09:12.624886
35a11aa9-33df-44ba-8cba-df86d7d07d9f	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	2026-02-09	ابن سينا	1.0000	minor	50.00	500.00	50.00	2026-02-13 08:09:12.624886
0aa7e995-d175-4d23-85f1-8b8b522efafd	4b75a55e-1cbe-48b9-8243-31708a3577ec	2026-02-09	ابن سينا	1.0000	minor	80.00	500.00	80.00	2026-02-13 08:09:12.624886
0b8b09b7-5081-446f-951a-91841cdadafb	31ca9617-f155-4147-9acd-4529df6bc51d	2026-02-09	ابن سينا	1.0000	minor	150.00	500.00	4500.00	2026-02-13 08:09:12.624886
83eb708f-2792-4523-8b1a-95b4eba847fb	0396b137-8815-455d-bfc2-6a08d6351004	2026-02-11	مورد سريع تجريبي	10.0000	minor	36.30	500.00	363.00	2026-02-13 08:09:12.624886
91bcc6ed-53ec-487b-aef9-edc8107be740	227cc6a5-2eea-430b-913f-143bb33e4d9a	2026-02-11	مورد سريع تجريبي	10.0000	minor	26.00	500.00	260.00	2026-02-13 08:09:12.624886
f9f9e317-5feb-4ae0-972f-1ff702fe027a	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	2026-02-11	مورد سريع تجريبي	10.0000	minor	50.00	500.00	500.00	2026-02-13 08:09:12.624886
0c18b616-4489-4fe9-9b7b-1afe744da145	4b75a55e-1cbe-48b9-8243-31708a3577ec	2026-02-11	مورد سريع تجريبي	10.0000	minor	80.00	500.00	800.00	2026-02-13 08:09:12.624886
4fef3331-6cc2-4523-8be4-f1ebdfd73ed6	31ca9617-f155-4147-9acd-4529df6bc51d	2026-02-11	مورد سريع تجريبي	10.0000	minor	150.00	500.00	45000.00	2026-02-13 08:09:12.624886
\.


--
-- Data for Name: receiving_headers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.receiving_headers (id, receiving_number, supplier_id, supplier_invoice_no, warehouse_id, receive_date, notes, status, total_qty, total_cost, posted_at, created_at, updated_at, converted_to_invoice_id, converted_at, correction_of_id, corrected_by_id, correction_status) FROM stdin;
a8589b4c-4853-41bc-bb07-b8941c460850	1	33dcd1d2-62a9-4b77-9a0b-10394b9d0349	123456	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	2026-02-07	\N	posted_qty_only	385.0000	0.00	2026-02-07 20:36:26.074	2026-02-07 20:36:25.776004	2026-02-07 20:49:55.724	bc9f1e71-d35b-4cc7-8e35-9be6aa85a816	2026-02-07 20:45:42.016	\N	8894daed-b464-4b51-9300-9071a1c4c873	corrected
dbe7e965-cdf0-4b6c-b2a3-e270903906a9	2	33dcd1d2-62a9-4b77-9a0b-10394b9d0349	1596321	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	2026-02-07	\N	posted_qty_only	230.0000	0.00	2026-02-07 21:03:05.583	2026-02-07 21:03:05.202142	2026-02-08 19:35:54.714	4c94d96c-f598-47cf-8a0a-295083b36945	2026-02-08 19:35:54.714	\N	\N	\N
3b8df687-32bf-43aa-8e86-afb557cdbafe	3	33dcd1d2-62a9-4b77-9a0b-10394b9d0349	963215	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	2026-02-09	\N	posted_qty_only	34.0000	0.00	2026-02-09 10:39:27.281	2026-02-09 10:39:17.33955	2026-02-09 10:39:41.805	5ee50735-bce6-4dd6-ab7b-d5077883f7a6	2026-02-09 10:39:41.805	\N	\N	\N
99028858-c7b9-4106-8709-153fcef90bd9	5	dfaeb15d-0411-4a23-9986-b67c737cdb02	1000	b045a6c1-dc79-4480-8907-a8fb6975a92f	2026-02-11	\N	posted_qty_only	340.0000	0.00	2026-02-11 08:19:08.335	2026-02-11 08:18:17.610951	2026-02-11 08:19:25.13	693fe34f-12b3-4ef3-a9ef-7e648309e160	2026-02-11 08:19:25.13	\N	\N	\N
\.


--
-- Data for Name: receiving_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.receiving_lines (id, receiving_id, item_id, unit_level, qty_entered, qty_in_minor, purchase_price, line_total, batch_number, expiry_date, sale_price_hint, notes, is_rejected, rejection_reason, created_at, expiry_month, expiry_year, sale_price, bonus_qty, bonus_qty_in_minor) FROM stdin;
bbea149e-0d11-44b1-a678-aeaa79ae1dad	a8589b4c-4853-41bc-bb07-b8941c460850	0396b137-8815-455d-bfc2-6a08d6351004	major	50.0000	50.0000	36.3000	0.00	\N	\N	\N	\N	f	\N	2026-02-07 20:36:25.776004	\N	\N	100.00	0.0000	0.0000
9991373d-c4ef-4c48-aa6f-5931ff858204	a8589b4c-4853-41bc-bb07-b8941c460850	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	10.0000	10.0000	26.0000	0.00	\N	\N	\N	\N	f	\N	2026-02-07 20:36:25.776004	12	2029	36.00	0.0000	0.0000
5a5bb153-ea5e-4ff8-b0e2-4c6e820b1387	a8589b4c-4853-41bc-bb07-b8941c460850	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	major	10.0000	10.0000	50.0000	0.00	\N	\N	\N	\N	f	\N	2026-02-07 20:36:25.776004	12	2030	100.00	0.0000	0.0000
b4877314-7e54-49e9-9ddc-714dab311c92	a8589b4c-4853-41bc-bb07-b8941c460850	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	15.0000	15.0000	80.0000	0.00	\N	\N	\N	\N	f	\N	2026-02-07 20:36:25.776004	12	2029	150.00	2.0000	2.0000
87c783ad-4efe-4aff-90fb-a83bad8b42d3	a8589b4c-4853-41bc-bb07-b8941c460850	31ca9617-f155-4147-9acd-4529df6bc51d	major	10.0000	300.0000	150.0000	0.00	\N	\N	\N	\N	f	\N	2026-02-07 20:36:25.776004	12	2029	300.00	1.0000	30.0000
49c3600c-f1e6-4c47-ac66-a45b1a9e3690	dbe7e965-cdf0-4b6c-b2a3-e270903906a9	0396b137-8815-455d-bfc2-6a08d6351004	major	50.0000	50.0000	36.3000	0.00	\N	\N	\N	\N	f	\N	2026-02-07 21:03:05.202142	\N	\N	100.00	0.0000	0.0000
19cbb0bf-2127-4a9f-bdd8-ad38837fdff1	dbe7e965-cdf0-4b6c-b2a3-e270903906a9	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	10.0000	10.0000	26.0000	0.00	\N	\N	\N	\N	f	\N	2026-02-07 21:03:05.202142	12	2030	50.00	0.0000	0.0000
c6d2c495-ecbb-4702-aa59-86203544985a	dbe7e965-cdf0-4b6c-b2a3-e270903906a9	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	major	10.0000	10.0000	50.0000	0.00	\N	\N	\N	\N	f	\N	2026-02-07 21:03:05.202142	1	2029	100.00	0.0000	0.0000
4785b206-8517-4c0d-a24a-351708f4f666	dbe7e965-cdf0-4b6c-b2a3-e270903906a9	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	10.0000	10.0000	80.0000	0.00	\N	\N	\N	\N	f	\N	2026-02-07 21:03:05.202142	12	2030	200.00	0.0000	0.0000
ffc7c656-309f-4a4a-91a5-a98e7a3380de	dbe7e965-cdf0-4b6c-b2a3-e270903906a9	31ca9617-f155-4147-9acd-4529df6bc51d	major	5.0000	150.0000	150.0000	0.00	\N	\N	\N	\N	f	\N	2026-02-07 21:03:05.202142	1	2029	300.00	1.0000	30.0000
45e238f7-f72c-4cfe-8181-ecf629e3d3cb	3b8df687-32bf-43aa-8e86-afb557cdbafe	0396b137-8815-455d-bfc2-6a08d6351004	major	1.0000	1.0000	36.3000	0.00	\N	\N	\N	\N	f	\N	2026-02-09 10:39:26.282174	\N	\N	500.00	0.0000	0.0000
ab2d0599-1a6b-49a8-95a0-c15d70c17fd2	3b8df687-32bf-43aa-8e86-afb557cdbafe	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	1.0000	1.0000	26.0000	0.00	2	\N	\N	\N	f	\N	2026-02-09 10:39:26.282174	12	2040	500.00	0.0000	0.0000
f08ef462-7d03-45a8-b1f9-a0132283ff88	3b8df687-32bf-43aa-8e86-afb557cdbafe	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	major	1.0000	1.0000	50.0000	0.00	2	\N	\N	\N	f	\N	2026-02-09 10:39:26.282174	12	2040	500.00	0.0000	0.0000
03e3e252-4c3a-4c48-b37d-7c0f7cc7dc6a	3b8df687-32bf-43aa-8e86-afb557cdbafe	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	1.0000	1.0000	80.0000	0.00	2	\N	\N	\N	f	\N	2026-02-09 10:39:26.282174	12	2040	500.00	0.0000	0.0000
f542e8a9-9d77-423c-b01c-379619baaebd	3b8df687-32bf-43aa-8e86-afb557cdbafe	31ca9617-f155-4147-9acd-4529df6bc51d	major	1.0000	30.0000	150.0000	0.00	2	\N	\N	\N	f	\N	2026-02-09 10:39:26.282174	12	2040	500.00	0.0000	0.0000
b3715227-17b5-4505-b84c-7775dedd9079	99028858-c7b9-4106-8709-153fcef90bd9	0396b137-8815-455d-bfc2-6a08d6351004	major	10.0000	10.0000	36.3000	0.00	\N	\N	\N	\N	f	\N	2026-02-11 08:19:08.087114	\N	\N	500.00	0.0000	0.0000
ccb28e85-6da8-4d2b-92da-9dca83c5c2e0	99028858-c7b9-4106-8709-153fcef90bd9	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	10.0000	10.0000	26.0000	0.00	\N	\N	\N	\N	f	\N	2026-02-11 08:19:08.087114	12	2029	500.00	0.0000	0.0000
16fa46b5-f871-4be6-a0b5-236a00638ca1	99028858-c7b9-4106-8709-153fcef90bd9	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	major	10.0000	10.0000	50.0000	0.00	\N	\N	\N	\N	f	\N	2026-02-11 08:19:08.087114	12	2029	500.00	0.0000	0.0000
b3d68f07-b5e2-4fc7-ab40-0d2288d1a712	99028858-c7b9-4106-8709-153fcef90bd9	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	10.0000	10.0000	80.0000	0.00	\N	\N	\N	\N	f	\N	2026-02-11 08:19:08.087114	12	2029	500.00	0.0000	0.0000
067783db-8360-4edb-be3f-2dc44c280d35	99028858-c7b9-4106-8709-153fcef90bd9	31ca9617-f155-4147-9acd-4529df6bc51d	major	10.0000	300.0000	150.0000	0.00	\N	\N	\N	\N	f	\N	2026-02-11 08:19:08.087114	12	2029	500.00	0.0000	0.0000
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.role_permissions (id, role, permission, created_at) FROM stdin;
2625cdb5-8720-4353-9b89-36ca23d42bc5	owner	dashboard.view	2026-02-13 12:58:32.914708
59312e52-b57b-4c50-ab6c-44f51d76ef23	owner	accounts.view	2026-02-13 12:58:32.914708
9cd8d926-a99f-4f0d-884b-ccd094048976	owner	cost_centers.view	2026-02-13 12:58:32.914708
741282ec-c5f5-44cb-b1be-b7ec62762f26	owner	journal.view	2026-02-13 12:58:32.914708
36f2dc1b-d01c-4da9-90b1-d73f1887ccf6	owner	fiscal_periods.view	2026-02-13 12:58:32.914708
9042bfef-6f50-4735-8ecc-9cbfd538ba6a	owner	templates.view	2026-02-13 12:58:32.914708
1d35b3c9-012e-4eb3-928a-049e1ebdf86b	owner	items.view	2026-02-13 12:58:32.914708
d13ef54f-2155-4180-9964-fd0f418091ab	owner	receiving.view	2026-02-13 12:58:32.914708
ec164267-2447-4e8b-8010-783928edc06f	owner	purchase_invoices.view	2026-02-13 12:58:32.914708
f2f4c57b-00a0-4690-9040-06c8d830b762	owner	transfers.view	2026-02-13 12:58:32.914708
64567b18-c7a1-4f7f-9bd9-7349fb33c293	owner	sales.view	2026-02-13 12:58:32.914708
fd831be3-9ebe-4d5e-80e8-98d64496bc25	owner	patient_invoices.view	2026-02-13 12:58:32.914708
c3a1772f-4371-4cd2-a6b6-0b85909768a9	owner	cashier.view	2026-02-13 12:58:32.914708
8087eb90-1b22-416b-8372-56fa4743166b	owner	services.view	2026-02-13 12:58:32.914708
35ce085f-4f98-4726-8cd2-3f647bf8afd5	owner	warehouses.view	2026-02-13 12:58:32.914708
5112f2b0-ccee-4783-8ab6-2c5b88135104	owner	departments.view	2026-02-13 12:58:32.914708
d30157b5-15a9-406b-9f02-4406a7b00692	owner	patients.view	2026-02-13 12:58:32.914708
f9a1c608-737a-4243-929e-8ec536b54230	owner	doctors.view	2026-02-13 12:58:32.914708
3c19f0c8-d5f5-44ca-a98c-5883d98fbe87	owner	admissions.view	2026-02-13 12:58:32.914708
0702c965-b29a-494d-bb53-c54bc540ba86	owner	reports.trial_balance	2026-02-13 12:58:32.914708
2110da14-5ec4-404a-914b-e489dafd4d4d	owner	reports.income_statement	2026-02-13 12:58:32.914708
824ec973-4d14-4621-ad53-6d75572e205a	owner	reports.balance_sheet	2026-02-13 12:58:32.914708
9ed5db1b-7ac0-4b5a-9118-16bb69df6dc9	owner	reports.cost_centers	2026-02-13 12:58:32.914708
d7e50cb5-ef2f-474f-a229-cac715d12ad2	owner	reports.account_ledger	2026-02-13 12:58:32.914708
99b5a5dd-e7a3-4af8-b4f0-3c6e275379eb	owner	audit_log.view	2026-02-13 12:58:32.914708
10c26de1-364b-4aa3-94b1-25bb7e2c1d33	owner	users.view	2026-02-13 12:58:32.914708
9fb0cfeb-6254-44a5-b4e1-a4601d2f7023	owner	users.create	2026-02-13 12:58:32.914708
9f5e4736-5971-4da1-abf3-907c48444753	owner	users.edit	2026-02-13 12:58:32.914708
9c76d0bf-3846-4407-9791-34923d13ec8d	owner	users.delete	2026-02-13 12:58:32.914708
0a452114-6a97-4c25-9188-b297ab1d1d44	admin	dashboard.view	2026-02-13 12:58:33.051962
9a24232d-31d4-4942-974a-89f9111e8581	admin	accounts.view	2026-02-13 12:58:33.051962
64b46b27-61cf-482b-ba55-8480566aada4	admin	accounts.create	2026-02-13 12:58:33.051962
7bb736e8-8945-49e8-988b-32edca594718	admin	accounts.edit	2026-02-13 12:58:33.051962
a83e9cda-797c-4abf-9bb0-13b95beea5dd	admin	accounts.delete	2026-02-13 12:58:33.051962
9e646c19-f080-401e-934e-c8024ea0184b	admin	cost_centers.view	2026-02-13 12:58:33.051962
005871b5-c8ec-41a0-b411-d5d3c1b0dbdc	admin	cost_centers.create	2026-02-13 12:58:33.051962
c129fb01-a693-4957-80d9-32b9add698b8	admin	cost_centers.edit	2026-02-13 12:58:33.051962
fa7887de-42b2-4d90-aad9-66c1214bd812	admin	cost_centers.delete	2026-02-13 12:58:33.051962
7da734f3-8a7d-4f1b-b8d0-20c847b291a6	admin	journal.view	2026-02-13 12:58:33.051962
e9b64514-cc39-4ed1-8d6e-4e226619b178	admin	journal.create	2026-02-13 12:58:33.051962
5164b493-6bb8-4a17-a938-67062b7da789	admin	journal.edit	2026-02-13 12:58:33.051962
874515f9-3ce8-4d00-b46d-05ee62e7d3b6	admin	journal.post	2026-02-13 12:58:33.051962
8c2d5bea-6bc1-4458-8eb0-a5530a499778	admin	journal.reverse	2026-02-13 12:58:33.051962
3ba51ff6-0f63-4109-bffd-cccf7160bfe3	admin	fiscal_periods.view	2026-02-13 12:58:33.051962
596af547-4e37-47eb-9d1a-e2cec5c0cbf3	admin	fiscal_periods.manage	2026-02-13 12:58:33.051962
c1f36a75-f27d-4d8c-b9ca-12e344972142	admin	templates.view	2026-02-13 12:58:33.051962
e7aaaa8f-640f-40c1-a4a1-3ef8b4832462	admin	templates.manage	2026-02-13 12:58:33.051962
50028876-9222-42f7-8d61-c91b6a8a1d64	admin	items.view	2026-02-13 12:58:33.051962
f14f2cf1-1710-4042-90b3-e91e2679ebd6	admin	items.create	2026-02-13 12:58:33.051962
dd26a8e8-f9bd-4e4c-9e1e-2ce4116a3ea5	admin	items.edit	2026-02-13 12:58:33.051962
f938d7ab-b261-4929-982a-d74d61337aa2	admin	items.delete	2026-02-13 12:58:33.051962
557410c3-c9da-4628-a9c0-cd9c50220280	admin	receiving.view	2026-02-13 12:58:33.051962
519a923c-6002-4af3-b3f9-43b90ad46cfa	admin	receiving.create	2026-02-13 12:58:33.051962
30a2b40f-fb75-490d-951b-c9a5789c60e4	admin	receiving.edit	2026-02-13 12:58:33.051962
8f5296ef-f505-4910-8bfd-5710851a0858	admin	receiving.post	2026-02-13 12:58:33.051962
e168f1be-7046-409d-bd3b-c06aa63ac6e2	admin	purchase_invoices.view	2026-02-13 12:58:33.051962
77462a1a-fc0b-4346-8fcd-8fdcdd7a870d	admin	purchase_invoices.create	2026-02-13 12:58:33.051962
964eddfe-f663-4f34-9074-cf70445e0035	admin	purchase_invoices.edit	2026-02-13 12:58:33.051962
77a1ff7e-bee2-4c3f-9c1f-cab67e04174d	admin	purchase_invoices.approve	2026-02-13 12:58:33.051962
ae7fc76d-3960-4cac-97e3-e7edd978dd8a	admin	transfers.view	2026-02-13 12:58:33.051962
589b779f-9a3e-4f69-88e4-453ea14a1447	admin	transfers.create	2026-02-13 12:58:33.051962
6b9dd0e6-dd52-48c7-af23-caf8c213137c	admin	transfers.execute	2026-02-13 12:58:33.051962
58af68e4-89d6-4747-914d-422998ca2c4d	admin	sales.view	2026-02-13 12:58:33.051962
c33b08bb-de34-4edd-af63-20efaab94d00	admin	sales.create	2026-02-13 12:58:33.051962
2cc5d699-0559-419b-93a8-f8106965b35f	admin	sales.finalize	2026-02-13 12:58:33.051962
0b085c53-e2cc-4141-88a0-f858b814e3da	admin	patient_invoices.view	2026-02-13 12:58:33.051962
7706b68f-e22d-432a-886d-cab977f0cf07	admin	patient_invoices.create	2026-02-13 12:58:33.051962
b22eeaad-915e-4854-b85e-43455a0c90ab	admin	patient_invoices.edit	2026-02-13 12:58:33.051962
f26b998e-67d6-4911-9330-c3b06a681bde	admin	patient_invoices.finalize	2026-02-13 12:58:33.051962
d4b4ca72-a427-4c11-9764-7a4c091b0558	admin	patient_invoices.payments	2026-02-13 12:58:33.051962
b63c6a58-60d3-4f37-b32b-f6595632e306	admin	cashier.view	2026-02-13 12:58:33.051962
edd386be-1658-474e-b61d-2f570b5a7d8b	admin	cashier.collect	2026-02-13 12:58:33.051962
48efa61c-f922-4b11-8954-887c6b82ba9d	admin	cashier.refund	2026-02-13 12:58:33.051962
c964ff8e-c4e2-4b34-b8e9-b900d8445573	admin	services.view	2026-02-13 12:58:33.051962
bcf232e2-f048-4994-b0dc-3725b84d0449	admin	services.manage	2026-02-13 12:58:33.051962
88e47aad-d16e-4151-88c3-37b7db7357f0	admin	warehouses.view	2026-02-13 12:58:33.051962
5694b92d-d309-47de-83cb-5bda55464fc1	admin	warehouses.manage	2026-02-13 12:58:33.051962
a5b0f8ab-eca9-4523-9900-f04284bd1237	admin	departments.view	2026-02-13 12:58:33.051962
027d465a-52c1-4566-9f70-166bb1c7d79d	admin	departments.manage	2026-02-13 12:58:33.051962
a5c3a453-a566-47c1-a5ca-06f22834cfdf	admin	patients.view	2026-02-13 12:58:33.051962
38e14203-3de5-40e7-8a07-b3e2eb9cbed6	admin	patients.create	2026-02-13 12:58:33.051962
ffc5a4aa-d38a-4495-be58-659b20e858bc	admin	patients.edit	2026-02-13 12:58:33.051962
93909c81-fda9-4f06-86a7-9dca4144d064	admin	doctors.view	2026-02-13 12:58:33.051962
2629fe67-171a-4d74-92e5-a518f868cb88	admin	doctors.create	2026-02-13 12:58:33.051962
e0be789e-425f-4d78-bfcc-94f51bace342	admin	doctors.edit	2026-02-13 12:58:33.051962
f004689e-15ea-45d8-a3e7-d1d501122ae7	admin	admissions.view	2026-02-13 12:58:33.051962
ec591621-4834-44cf-b23a-f69cabc4f185	admin	admissions.create	2026-02-13 12:58:33.051962
f31bfff8-321d-4c23-b3fa-92ea70393e83	admin	admissions.manage	2026-02-13 12:58:33.051962
32400510-855d-409e-996c-106a90e847de	admin	reports.trial_balance	2026-02-13 12:58:33.051962
064f4852-76d9-4a81-a32a-b518ab82a6fb	admin	reports.income_statement	2026-02-13 12:58:33.051962
ef75ceb0-575c-4ebf-bb4d-a6472d68bc03	admin	reports.balance_sheet	2026-02-13 12:58:33.051962
a1675597-3c11-415f-b068-f0e861a16290	admin	reports.cost_centers	2026-02-13 12:58:33.051962
7acba9f4-8cdb-4105-a177-920716c8c3a2	admin	reports.account_ledger	2026-02-13 12:58:33.051962
e727e9d3-8553-4087-85e5-6cd16dd06ca1	admin	settings.account_mappings	2026-02-13 12:58:33.051962
6b3ea753-5ef7-4c24-a85e-7ad2c3443d7e	admin	settings.drawer_passwords	2026-02-13 12:58:33.051962
5dd35b12-3005-4f79-9488-648092aa5f8d	admin	audit_log.view	2026-02-13 12:58:33.051962
ecb34482-c2ce-43fd-8ee3-3142479140a8	admin	users.view	2026-02-13 12:58:33.051962
1f03b1a6-b583-453b-b569-67b5ff0d92ff	admin	users.create	2026-02-13 12:58:33.051962
01db45ae-aee6-420a-837c-d40f85ed5231	admin	users.edit	2026-02-13 12:58:33.051962
02a68446-3f61-4032-ba10-4b4684aaf6d1	admin	users.delete	2026-02-13 12:58:33.051962
3c8d6743-77e8-435b-9864-c67095658857	accounts_manager	dashboard.view	2026-02-13 12:58:33.071935
ac352c33-9971-4bf7-ba9c-b2cc7f9c207c	accounts_manager	accounts.view	2026-02-13 12:58:33.071935
a832039b-9aa7-4085-a32d-68ec2445cca9	accounts_manager	accounts.create	2026-02-13 12:58:33.071935
6f43d685-cc97-4961-a5c5-a595bd3786e8	accounts_manager	accounts.edit	2026-02-13 12:58:33.071935
3bfff02a-efb1-44a7-957f-bdd4fa49d68d	accounts_manager	accounts.delete	2026-02-13 12:58:33.071935
57a0f1f9-1d8a-4598-a896-90a216054779	accounts_manager	cost_centers.view	2026-02-13 12:58:33.071935
3a35b6e0-f2d0-4ad3-ba97-5536aac7c093	accounts_manager	cost_centers.create	2026-02-13 12:58:33.071935
29771c51-391f-43bd-9948-bc4bcaea35c4	accounts_manager	cost_centers.edit	2026-02-13 12:58:33.071935
29d97693-4c15-433e-be19-addb90e82573	accounts_manager	cost_centers.delete	2026-02-13 12:58:33.071935
0cf305b1-9366-4578-8b18-17290ee0471c	accounts_manager	journal.view	2026-02-13 12:58:33.071935
9ca88ed1-248d-41de-85f9-4335bcf374c6	accounts_manager	journal.create	2026-02-13 12:58:33.071935
149250ed-8dd0-45a4-bd0c-39b8b3acd2e5	accounts_manager	journal.edit	2026-02-13 12:58:33.071935
32f9253a-1a25-47ee-8ed3-69ac4ecd4a71	accounts_manager	journal.post	2026-02-13 12:58:33.071935
819b5e04-15e7-4bac-b83a-5dd72e7f678c	accounts_manager	journal.reverse	2026-02-13 12:58:33.071935
0639a342-f682-4cc2-8b96-1ff61c4f15d9	accounts_manager	fiscal_periods.view	2026-02-13 12:58:33.071935
1b8a584b-b614-4551-8dea-bf895aa05530	accounts_manager	fiscal_periods.manage	2026-02-13 12:58:33.071935
7dee3a7d-e363-4c73-87a0-cf9a0d0a80af	accounts_manager	templates.view	2026-02-13 12:58:33.071935
7d26bc7e-2233-4f76-a75d-bc076b95cbb7	accounts_manager	templates.manage	2026-02-13 12:58:33.071935
e1d46480-9c6c-47a1-a04b-1f38051db3bd	accounts_manager	reports.trial_balance	2026-02-13 12:58:33.071935
ad7f3dbf-0823-43d7-ba05-1fab449bb975	accounts_manager	reports.income_statement	2026-02-13 12:58:33.071935
f82d23f2-e32a-4aeb-9f9e-3b914dda3b8d	accounts_manager	reports.balance_sheet	2026-02-13 12:58:33.071935
c87ea3b2-bece-44f1-ae6e-7bb37f6907aa	accounts_manager	reports.cost_centers	2026-02-13 12:58:33.071935
ba04d35a-ccd5-43d4-a9aa-9ca1ea83ce7f	accounts_manager	reports.account_ledger	2026-02-13 12:58:33.071935
4fe0c6ac-3931-4a18-b4a7-c3b755e15fdf	accounts_manager	settings.account_mappings	2026-02-13 12:58:33.071935
12ef216d-2b60-46ee-ac96-eb66a51b0dfe	accounts_manager	audit_log.view	2026-02-13 12:58:33.071935
c0f30cb0-2bb0-4009-b30d-2eed2ed2110b	purchase_manager	dashboard.view	2026-02-13 12:58:33.077418
ba322446-f232-4f77-b80a-71681388e514	purchase_manager	items.view	2026-02-13 12:58:33.077418
840df012-f582-4225-b4a8-faec6eee88f5	purchase_manager	items.create	2026-02-13 12:58:33.077418
62790efb-046b-4dc6-abdf-2ceafed0eeba	purchase_manager	items.edit	2026-02-13 12:58:33.077418
950d3186-b229-4fa6-8f6a-469d8ea04726	purchase_manager	receiving.view	2026-02-13 12:58:33.077418
1f5c3a6a-8ea2-467d-a33c-e07a1544c3d4	purchase_manager	receiving.create	2026-02-13 12:58:33.077418
af945e81-ca9f-41e3-b403-33e88205388e	purchase_manager	receiving.edit	2026-02-13 12:58:33.077418
60ae0683-c843-4f4a-93f6-286f9234096d	purchase_manager	receiving.post	2026-02-13 12:58:33.077418
cdcfc09c-69f0-468f-8c1f-e41821cbde92	purchase_manager	purchase_invoices.view	2026-02-13 12:58:33.077418
02eb0273-4b2e-475f-a205-ed847f76c8ef	purchase_manager	purchase_invoices.create	2026-02-13 12:58:33.077418
df2af629-0cea-466b-900d-6fa9b0cc57bc	purchase_manager	purchase_invoices.edit	2026-02-13 12:58:33.077418
4da5bc4f-5246-4bd5-937d-84298a5e6d35	purchase_manager	purchase_invoices.approve	2026-02-13 12:58:33.077418
9d5baf40-22d6-4fda-9e59-9ff7f2bcc7f5	purchase_manager	warehouses.view	2026-02-13 12:58:33.077418
658bfda5-192e-4363-b8f0-3f1bc6abe9c5	purchase_manager	transfers.view	2026-02-13 12:58:33.077418
697911b0-d9b6-4e8a-b47d-4e0c106aea79	purchase_manager	transfers.create	2026-02-13 12:58:33.077418
173b21cd-bcf5-4b4c-93cb-e4c26f4182f6	purchase_manager	transfers.execute	2026-02-13 12:58:33.077418
0b05dff0-9715-4131-8098-9586744e7646	data_entry	dashboard.view	2026-02-13 12:58:33.084498
5ce6e237-8e88-4106-b857-99b6056a92b7	data_entry	items.view	2026-02-13 12:58:33.084498
c73f688b-9704-48ee-9e73-8ef7b0d48480	data_entry	items.create	2026-02-13 12:58:33.084498
2d3b1452-4013-4fca-a421-ff07c9b233e1	data_entry	items.edit	2026-02-13 12:58:33.084498
c726743b-c3b6-430b-9c2b-e4cce59cd394	data_entry	purchase_invoices.view	2026-02-13 12:58:33.084498
e661ac4b-f913-481d-a5ed-1e8aafc96b2c	data_entry	purchase_invoices.edit	2026-02-13 12:58:33.084498
0dd4c373-e15c-41b7-aa38-5da165e7674a	data_entry	receiving.view	2026-02-13 12:58:33.084498
aa546529-364f-48e8-8e42-662e4bfef255	data_entry	receiving.edit	2026-02-13 12:58:33.084498
234a58d1-6fe8-4286-8f47-d1140a724ab9	pharmacist	dashboard.view	2026-02-13 12:58:33.089711
a799bb0f-8f6d-4d22-a386-18d466a788db	pharmacist	items.view	2026-02-13 12:58:33.089711
a7125ff1-97cf-4fdf-9f2c-3ce99eb4c8df	pharmacist	sales.view	2026-02-13 12:58:33.089711
94e4cf6e-30d1-44ef-92ba-bab7df55403e	pharmacist	sales.create	2026-02-13 12:58:33.089711
09084172-7343-47bc-9c49-ad7c1eaca535	pharmacist	sales.finalize	2026-02-13 12:58:33.089711
e99ab0f5-ca15-4262-a61b-7b33c76b069d	pharmacist	patient_invoices.view	2026-02-13 12:58:33.089711
5e1cf764-87cf-405f-844b-f32b6645977e	pharmacist	patient_invoices.create	2026-02-13 12:58:33.089711
2bcb583e-2795-4461-a120-f4df172eb743	pharmacist	patient_invoices.edit	2026-02-13 12:58:33.089711
f168310f-277d-4641-b0a8-b480cc25deb5	pharmacist	patient_invoices.finalize	2026-02-13 12:58:33.089711
dcd36e09-ce39-4108-ad67-df4a5f98a392	pharmacist	warehouses.view	2026-02-13 12:58:33.089711
957c53d9-d074-45bd-8224-6cb743d1676d	pharmacy_assistant	dashboard.view	2026-02-13 12:58:33.095247
d3da8f57-6ef7-472a-a279-73e4b7c64e8f	pharmacy_assistant	items.view	2026-02-13 12:58:33.095247
5b567442-a86e-46bf-a5f6-24252e749b5b	pharmacy_assistant	transfers.view	2026-02-13 12:58:33.095247
e29a2111-7a9c-49e4-a77e-4ad9c0a79d5c	pharmacy_assistant	transfers.create	2026-02-13 12:58:33.095247
0f2f6713-e524-4548-9561-9cdda954864c	pharmacy_assistant	transfers.execute	2026-02-13 12:58:33.095247
efede847-3d8b-40ec-a02f-b55fb8732630	pharmacy_assistant	warehouses.view	2026-02-13 12:58:33.095247
b737d82f-fc10-4f8e-b664-979c46edba9e	warehouse_assistant	dashboard.view	2026-02-13 12:58:33.099729
f1f56f4c-a3c0-4b37-8c0d-874070ae1b73	warehouse_assistant	items.view	2026-02-13 12:58:33.099729
bbcf11d6-82de-4dbb-9538-684466c2e696	warehouse_assistant	items.create	2026-02-13 12:58:33.099729
5416e918-4727-4dac-a817-d80b13f30318	warehouse_assistant	items.edit	2026-02-13 12:58:33.099729
46a47920-69f0-4ef6-a1d4-a9fa51d217a1	warehouse_assistant	receiving.view	2026-02-13 12:58:33.099729
5d76c418-82fd-4246-a1ae-9b538605c070	warehouse_assistant	receiving.create	2026-02-13 12:58:33.099729
cbb60a9a-8e75-43e6-b395-1e99e51b1d98	warehouse_assistant	receiving.edit	2026-02-13 12:58:33.099729
3f548d45-479d-4f08-bd2b-7238877e8d19	warehouse_assistant	receiving.post	2026-02-13 12:58:33.099729
ac46d7b8-20d0-4da3-a73b-2192fefc9c6b	warehouse_assistant	warehouses.view	2026-02-13 12:58:33.099729
33c21be5-bb94-490e-8921-bc7be590c8f1	warehouse_assistant	transfers.view	2026-02-13 12:58:33.099729
f79f60f7-688a-4170-8d28-a8c52d4a954f	cashier	dashboard.view	2026-02-13 12:58:33.103965
8c77f51d-b417-4970-98b9-8b182aa314bc	cashier	cashier.view	2026-02-13 12:58:33.103965
936d1de0-f102-461e-947b-91f7355bc07c	cashier	cashier.collect	2026-02-13 12:58:33.103965
9471e8b2-5e23-4460-9ec7-7e1ceccb2c32	cashier	cashier.refund	2026-02-13 12:58:33.103965
f70428a1-cf34-413e-8c27-3d6a5836fe71	department_admin	dashboard.view	2026-02-13 12:58:33.109029
0a48fe19-951c-42c9-b015-b4dff00885a3	department_admin	patient_invoices.view	2026-02-13 12:58:33.109029
540e84ec-bf73-47a0-8648-6e044bc0f602	department_admin	patient_invoices.create	2026-02-13 12:58:33.109029
811d7029-403a-4151-af3e-1e6c1abe94dc	department_admin	patient_invoices.edit	2026-02-13 12:58:33.109029
5fa46d92-540a-4d2e-a85e-1605210c0e9d	department_admin	patient_invoices.finalize	2026-02-13 12:58:33.109029
0673ba68-6086-4274-94b8-304625adc191	department_admin	patient_invoices.payments	2026-02-13 12:58:33.109029
6f86a996-2f89-419b-98f2-38ae2582e945	department_admin	admissions.view	2026-02-13 12:58:33.109029
f56df811-5071-45f1-adeb-ce25c0eb2309	department_admin	patients.view	2026-02-13 12:58:33.109029
109e11f3-8194-4139-a2e6-5739be206945	department_admin	services.view	2026-02-13 12:58:33.109029
7e653b38-6065-4a4d-8834-a719e6344827	department_admin	items.view	2026-02-13 12:58:33.109029
1a3c1948-b3bd-4bdb-9da2-62b096629a71	reception	dashboard.view	2026-02-13 12:58:33.114213
4148ac33-8416-45d7-b8af-67c7c60ef530	reception	patients.view	2026-02-13 12:58:33.114213
84ab05b0-f576-4d3a-af24-31b1e0768d67	reception	patients.create	2026-02-13 12:58:33.114213
59395b8b-76c9-4b19-b647-fa0fa90df8f5	reception	patients.edit	2026-02-13 12:58:33.114213
ad31ad98-bd93-41c4-86a5-cdb07e492839	reception	doctors.view	2026-02-13 12:58:33.114213
a9abd9fe-07fb-419e-8e95-8feeee76bc98	reception	doctors.create	2026-02-13 12:58:33.114213
a9e9b419-e413-434b-b059-24ca0b3af76b	reception	doctors.edit	2026-02-13 12:58:33.114213
a8b08264-5acd-445c-92a2-133e1a7e672c	reception	admissions.view	2026-02-13 12:58:33.114213
a844ee10-5d4b-40d5-8ef0-fa6eb9e32d15	reception	admissions.create	2026-02-13 12:58:33.114213
b277da6d-c9fe-4831-86c9-4d538ea8015f	reception	admissions.manage	2026-02-13 12:58:33.114213
\.


--
-- Data for Name: sales_invoice_headers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sales_invoice_headers (id, invoice_number, invoice_date, warehouse_id, customer_type, customer_name, contract_company, status, subtotal, discount_type, discount_percent, discount_value, net_total, notes, created_by, finalized_at, finalized_by, created_at, updated_at, is_return, original_invoice_id, pharmacy_id) FROM stdin;
99bef1c5-f6e1-4f5d-aa50-c0c62d30070d	124	2020-01-15	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:03:30.196059	2026-02-13 10:03:30.196059	f	\N	\N
96be4d0d-eacd-4de9-b876-f0affc9296fc	125	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:03:30.295288	2026-02-13 10:03:30.295288	f	\N	\N
8ff94979-f734-4ebf-a846-d8dcbfb473be	23	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 08:57:56.874173	2026-02-13 08:57:56.874173	f	\N	pharmacy-2
71434586-d182-41dd-9346-888afa45be64	3	2026-02-10	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	cash	\N	\N	collected	5500.00	percent	0.0000	0.00	5500.00	\N	\N	2026-02-10 18:08:51.072	\N	2026-02-10 18:08:50.581697	2026-02-11 20:46:56.961	f	\N	pharmacy-1
241252ee-fa75-4a34-b38d-bdfc8dc86340	24	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 08:58:43.105876	2026-02-13 08:58:43.105876	f	\N	pharmacy-2
e0307467-3207-49d8-b24f-2acecfd195e7	2	2026-02-08	b045a6c1-dc79-4480-8907-a8fb6975a92f	cash	\N	\N	collected	500.00	percent	0.0000	0.00	500.00	\N	\N	2026-02-09 11:49:56.373	\N	2026-02-08 20:05:31.836927	2026-02-10 17:59:57.316	f	\N	pharmacy-1
26570a22-7524-42a8-a717-5bec0901cc10	25	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 08:58:43.264051	2026-02-13 08:58:43.264051	f	\N	pharmacy-2
9e1d6a7a-4294-498e-ad73-455493f3e8ed	6	2026-02-10	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	0.00	percent	0.0000	0.00	0.00	\N	\N	\N	\N	2026-02-10 18:39:11.954665	2026-02-10 18:39:11.954665	f	\N	pharmacy-2
1cc89474-7985-4b94-a646-86191abe9549	5	2026-02-10	7980d189-399f-41d3-94b4-c487da69975f	credit	\N	\N	draft	0.00	percent	0.0000	0.00	0.00	\N	\N	\N	\N	2026-02-10 18:32:35.635707	2026-02-10 18:34:13.633	f	\N	pharmacy-2
a6e725f0-4870-4766-a415-0a3040622941	10	2026-02-11	b045a6c1-dc79-4480-8907-a8fb6975a92f	cash	\N	\N	collected	5000.00	percent	0.0000	0.00	5000.00	\N	\N	2026-02-11 20:41:48.921	\N	2026-02-11 20:40:38.173674	2026-02-11 21:06:15.448	f	\N	pharmacy-2
e8fbdfb4-6d7f-4448-8381-1f9d458ee296	4	2026-02-10	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	cash	\N	\N	collected	1000.00	percent	0.0000	0.00	1000.00	\N	\N	2026-02-10 18:32:19.465	\N	2026-02-10 18:31:53.652852	2026-02-10 19:56:50.611	f	\N	pharmacy-1
2859c59a-b2b7-45c7-9509-b27726cda063	26	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 08:58:43.296821	2026-02-13 08:58:43.296821	f	\N	pharmacy-2
4882e2bf-2404-4e47-ba07-135369f092cc	7	2026-02-10	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	0.00	percent	0.0000	0.00	0.00	\N	\N	\N	\N	2026-02-10 18:39:40.253636	2026-02-10 20:57:05.753	f	\N	pharmacy-2
eec32cca-5bf9-483f-979b-d27bfb89724e	8	2026-02-11	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	0.00	percent	0.0000	0.00	0.00	\N	\N	\N	\N	2026-02-11 18:19:20.435328	2026-02-11 18:19:36.512	f	\N	pharmacy-2
ea19c44c-8e8f-4f0c-a1d0-300e905fcc05	27	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 08:58:43.579426	2026-02-13 08:58:43.579426	f	\N	pharmacy-2
2aa0c782-5f67-4e48-9133-3900af01a218	28	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:00:21.262169	2026-02-13 09:00:21.262169	f	\N	pharmacy-2
c76c9e54-baa6-431a-8358-734bea356a7a	11	2026-02-11	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	0.00	percent	0.0000	0.00	0.00	\N	\N	\N	\N	2026-02-11 20:42:04.758326	2026-02-11 21:40:56.811	f	\N	pharmacy-2
897cd61d-cd1c-4b66-ad56-79f6f4b0f22f	12	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 08:56:50.707625	2026-02-13 08:56:50.707625	f	\N	pharmacy-2
5771f515-330a-4020-a4c5-f697ef32582e	13	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 08:56:50.93099	2026-02-13 08:56:50.93099	f	\N	pharmacy-2
f6b78c28-4202-42ac-9a8c-e7746ec774e3	9	2026-02-11	b045a6c1-dc79-4480-8907-a8fb6975a92f	cash	\N	\N	finalized	2500.00	percent	0.0000	0.00	2500.00	\N	\N	2026-02-11 20:13:40.804	\N	2026-02-11 20:06:39.624291	2026-02-11 20:13:40.804	f	\N	pharmacy-2
c93d4738-3024-46f3-aa07-2f2ed42bb04b	14	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 08:56:50.95925	2026-02-13 08:56:50.95925	f	\N	pharmacy-2
612dde2f-df6e-4db5-90a9-f7d327965f4f	15	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 08:56:51.111084	2026-02-13 08:56:51.111084	f	\N	pharmacy-2
9f1e198b-33c6-4ef0-9737-5f2404e99fd1	16	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 08:57:32.92884	2026-02-13 08:57:32.92884	f	\N	pharmacy-2
ed8c2fc2-40f8-4f11-819d-08dee7c72dc3	17	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 08:57:33.224337	2026-02-13 08:57:33.224337	f	\N	pharmacy-2
64d0954a-04ac-46fb-8849-1ecc8fa73005	18	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 08:57:33.313988	2026-02-13 08:57:33.313988	f	\N	pharmacy-2
77e5ab1a-dc6c-459b-b293-851353db31bb	19	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 08:57:33.493212	2026-02-13 08:57:33.493212	f	\N	pharmacy-2
f42e017f-556e-410e-a8c9-e0f584bb4b5c	20	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 08:57:56.359039	2026-02-13 08:57:56.359039	f	\N	pharmacy-2
0d1591a0-466c-4d6b-b3b9-a168988ebfb2	21	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 08:57:56.510905	2026-02-13 08:57:56.510905	f	\N	pharmacy-2
54c57387-f3c0-44a5-8002-5c49987af78e	22	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 08:57:56.546851	2026-02-13 08:57:56.546851	f	\N	pharmacy-2
d37a3826-fe12-4f91-8950-aafb2453e5f9	29	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:00:21.405829	2026-02-13 09:00:21.405829	f	\N	pharmacy-2
c32a7c84-e908-4a7c-a060-40ed412c824e	30	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:00:21.437085	2026-02-13 09:00:21.437085	f	\N	pharmacy-2
66d87562-89d6-4ba2-b26f-bddcc1610085	31	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:00:21.682816	2026-02-13 09:00:21.682816	f	\N	pharmacy-2
1d43caf6-ee50-4f61-bf45-96aebe577c67	32	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:14:03.651337	2026-02-13 09:14:03.651337	f	\N	pharmacy-2
52c0bb6e-2360-43dd-822b-8a37e97dbdd5	33	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي] test cancel	\N	\N	\N	2026-02-13 09:14:03.698785	2026-02-13 09:14:03.698785	f	\N	pharmacy-2
83f09a7e-08aa-42f9-b022-5f7c630d76fe	34	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:14:03.741542	2026-02-13 09:14:03.741542	f	\N	pharmacy-2
75c01299-4064-4ae5-98f9-ed880fc02138	35	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:14:03.805447	2026-02-13 09:14:03.805447	f	\N	pharmacy-2
22e784b6-62e1-47d5-840c-de0050c23923	36	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:14:04.207654	2026-02-13 09:14:04.207654	f	\N	pharmacy-2
afff231e-40b4-4062-a0db-e83a62374116	37	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	1500.00	percent	0.0000	0.00	1500.00	\N	\N	\N	\N	2026-02-13 09:14:04.398499	2026-02-13 09:14:04.398499	f	\N	pharmacy-2
19689a19-63aa-457b-b921-2afc2647435b	38	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:16:22.31668	2026-02-13 09:16:22.31668	f	\N	pharmacy-2
1416bdff-4bf0-4086-8623-42b9c43717a6	39	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي] test cancel	\N	\N	\N	2026-02-13 09:16:22.386797	2026-02-13 09:16:22.386797	f	\N	pharmacy-2
f916dcf7-b023-48b7-9208-1e0e5bd3a319	40	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:16:22.442943	2026-02-13 09:16:22.442943	f	\N	pharmacy-2
707c896a-5566-41c8-a13c-210ef08c3de2	41	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:16:22.577454	2026-02-13 09:16:22.577454	f	\N	pharmacy-2
f4af17ea-da9a-4496-8f1c-add8210aa325	42	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:16:23.089397	2026-02-13 09:16:23.089397	f	\N	pharmacy-2
7449a3aa-0f21-4770-9d35-baa7574ef26f	43	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	1500.00	percent	0.0000	0.00	1500.00	\N	\N	\N	\N	2026-02-13 09:16:23.380472	2026-02-13 09:16:23.380472	f	\N	pharmacy-2
5288276f-ed0d-4118-ba3c-f77afcbcc29e	44	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:23:42.505238	2026-02-13 09:23:42.505238	f	\N	pharmacy-2
5127872c-fecb-4309-817a-c9a0891c1680	45	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:23:42.569567	2026-02-13 09:23:42.569567	f	\N	pharmacy-2
0a2f55ab-2417-4963-88b0-778c3f30159c	46	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:23:42.602009	2026-02-13 09:23:42.602009	f	\N	pharmacy-2
6871e98f-daa1-4e8f-b9c2-ff27a2cd94be	126	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:03:30.338879	2026-02-13 10:03:30.338879	f	\N	\N
e98fafba-9e4a-4336-930c-a0c383f72d4f	47	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي] test cancel	\N	\N	\N	2026-02-13 09:23:42.632645	2026-02-13 09:23:42.632645	f	\N	pharmacy-2
d17c4396-013c-4207-b300-c6ada1d3c305	48	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:23:42.668779	2026-02-13 09:23:42.668779	f	\N	pharmacy-2
0d244fe4-2695-4b8e-8eaf-d143b33eb496	49	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:23:42.747189	2026-02-13 09:23:42.747189	f	\N	pharmacy-2
2fd1d6c6-649a-4c7e-b1ee-260bb3964cbf	50	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:23:43.090266	2026-02-13 09:23:43.090266	f	\N	pharmacy-2
c9a9f24e-abf6-4d5c-b15c-6cc98886eabe	51	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	1500.00	percent	0.0000	0.00	1500.00	\N	\N	\N	\N	2026-02-13 09:23:43.399871	2026-02-13 09:23:43.399871	f	\N	pharmacy-2
f2f4b48b-4618-4c1f-885e-30680c9dd48a	52	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:29:35.612308	2026-02-13 09:29:35.612308	f	\N	pharmacy-2
6fedeee1-5c10-4f0a-8029-d04f68071f0a	53	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:29:35.760416	2026-02-13 09:29:35.760416	f	\N	pharmacy-2
05c5581a-282f-4a36-ac23-2799bee90445	54	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:29:35.8225	2026-02-13 09:29:35.8225	f	\N	pharmacy-2
fb43a028-e5b8-4bd8-b0b8-71b96bd10777	55	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي] test cancel	\N	\N	\N	2026-02-13 09:29:35.982932	2026-02-13 09:29:35.982932	f	\N	pharmacy-2
ed168873-72e6-45a5-b9cc-40069c35eb67	56	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:29:36.054459	2026-02-13 09:29:36.054459	f	\N	pharmacy-2
54102f46-b43f-4990-be8b-c515c0c46d89	57	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:29:36.126836	2026-02-13 09:29:36.126836	f	\N	pharmacy-2
4cb3e649-64da-47e7-8a57-430656d313e5	58	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:29:36.505285	2026-02-13 09:29:36.505285	f	\N	pharmacy-2
d6624868-9684-45bd-894b-71a5ecbe1366	59	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	1500.00	percent	0.0000	0.00	1500.00	\N	\N	\N	\N	2026-02-13 09:29:36.846619	2026-02-13 09:29:36.846619	f	\N	pharmacy-2
01446bec-6d56-46cb-aecc-844283e589ae	60	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:30:36.981782	2026-02-13 09:30:36.981782	f	\N	pharmacy-2
0a05ff07-3e11-4c97-9b4c-46831cb67e8b	61	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:30:37.042298	2026-02-13 09:30:37.042298	f	\N	pharmacy-2
3da68308-37a2-4490-9075-f430da40535a	62	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:30:37.07568	2026-02-13 09:30:37.07568	f	\N	pharmacy-2
e0861fa1-93d1-43e4-a828-f8c72530b9ae	63	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي] test cancel	\N	\N	\N	2026-02-13 09:30:37.175227	2026-02-13 09:30:37.175227	f	\N	pharmacy-2
3e6d9ba7-0c28-4241-87cf-438f098e225b	64	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:30:37.206965	2026-02-13 09:30:37.206965	f	\N	pharmacy-2
39910280-7c7f-412d-b18d-6dc67cc005ad	65	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:30:37.258636	2026-02-13 09:30:37.258636	f	\N	pharmacy-2
7da02181-1b2e-4ca6-9511-af3adbb1048d	66	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:30:37.550103	2026-02-13 09:30:37.550103	f	\N	pharmacy-2
0175fcc8-1a4a-4996-8ee0-03290ad7bda0	67	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	1500.00	percent	0.0000	0.00	1500.00	\N	\N	\N	\N	2026-02-13 09:30:37.713215	2026-02-13 09:30:37.713215	f	\N	pharmacy-2
28d6b759-da04-460f-ab50-5280bc629059	68	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:34:55.441346	2026-02-13 09:34:55.441346	f	\N	pharmacy-2
2ed8a99a-048e-4d91-b593-d71a1df376e5	69	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:34:55.495542	2026-02-13 09:34:55.495542	f	\N	pharmacy-2
05c54738-3901-469a-a08d-d58bca7c9aa4	70	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:34:55.525531	2026-02-13 09:34:55.525531	f	\N	pharmacy-2
1fd140a5-4ce5-4662-876e-9d6c0ac3dbe0	71	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي] test cancel	\N	\N	\N	2026-02-13 09:34:55.639158	2026-02-13 09:34:55.639158	f	\N	pharmacy-2
3059d687-4e71-43fa-9de4-78ff69615ac5	72	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:34:55.687547	2026-02-13 09:34:55.687547	f	\N	pharmacy-2
5210036f-a0aa-45b0-8fb8-ed4e2d649886	73	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:34:55.755688	2026-02-13 09:34:55.755688	f	\N	pharmacy-2
17296f81-f39b-4f9a-8769-02e4b46acc30	74	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:34:56.102384	2026-02-13 09:34:56.102384	f	\N	pharmacy-2
8d9250f9-ae5b-456c-981d-7b4259c8370a	75	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	1500.00	percent	0.0000	0.00	1500.00	\N	\N	\N	\N	2026-02-13 09:34:56.26942	2026-02-13 09:34:56.26942	f	\N	pharmacy-2
1cdf0dc3-5187-46b4-9756-7b11b76316b0	76	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:39:09.747186	2026-02-13 09:39:09.747186	f	\N	pharmacy-2
dc7d35c3-61fe-48e0-9246-932f9cd92eff	77	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:39:09.840095	2026-02-13 09:39:09.840095	f	\N	pharmacy-2
3709b12a-bca3-4a3b-b121-60a0254b5dba	78	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:39:09.878818	2026-02-13 09:39:09.878818	f	\N	pharmacy-2
f2dcc989-2b85-4253-992f-691c4040aa34	79	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي] test cancel	\N	\N	\N	2026-02-13 09:39:10.032416	2026-02-13 09:39:10.032416	f	\N	pharmacy-2
57fd61a0-04fa-41c8-ab54-9ae064ba5f2a	80	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:39:10.088726	2026-02-13 09:39:10.088726	f	\N	pharmacy-2
de9a5a05-a009-4843-b34c-91cb162e68f3	81	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:39:10.188483	2026-02-13 09:39:10.188483	f	\N	pharmacy-2
58372b19-c2cb-41a6-a9db-f56fe0fd4ddb	82	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:39:10.592319	2026-02-13 09:39:10.592319	f	\N	pharmacy-2
bd420b4c-55de-4fb6-b728-c66d5040862e	83	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	1500.00	percent	0.0000	0.00	1500.00	\N	\N	\N	\N	2026-02-13 09:39:10.806566	2026-02-13 09:39:10.806566	f	\N	pharmacy-2
60de10e5-d2f3-4404-97d4-2c171efb9589	84	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:59:07.223506	2026-02-13 09:59:07.223506	f	\N	pharmacy-2
e07e5862-79a1-4fee-b65c-25788093b812	85	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:59:07.289509	2026-02-13 09:59:07.289509	f	\N	pharmacy-2
d62f416d-500d-4d1c-ba16-f92675c5ec18	86	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:59:07.317819	2026-02-13 09:59:07.317819	f	\N	pharmacy-2
58f1db9c-0a89-4fd4-b524-9a00167d7b4c	87	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي] test cancel	\N	\N	\N	2026-02-13 09:59:07.448828	2026-02-13 09:59:07.448828	f	\N	pharmacy-2
952ed6ff-7bc0-4c7e-8c5c-2ee18e927e6a	88	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:59:07.488624	2026-02-13 09:59:07.488624	f	\N	pharmacy-2
45d64e2c-4158-41e0-ae4c-fc3f7b3ad74f	89	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 09:59:07.548627	2026-02-13 09:59:07.548627	f	\N	pharmacy-2
73178f93-2f99-459b-b656-1252b5f13482	90	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 09:59:07.91667	2026-02-13 09:59:07.91667	f	\N	pharmacy-2
3e9e6f5d-6d63-4912-be93-abc15611495f	91	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	1500.00	percent	0.0000	0.00	1500.00	\N	\N	\N	\N	2026-02-13 09:59:08.184249	2026-02-13 09:59:08.184249	f	\N	pharmacy-2
da4a0965-5b0e-4ed1-b562-abba7c8af40a	92	2020-01-15	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:00:54.740493	2026-02-13 10:00:54.740493	f	\N	pharmacy-2
1cf2a22f-6696-4ba7-8182-3660742aa797	93	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:00:54.81066	2026-02-13 10:00:54.81066	f	\N	pharmacy-2
0c118da7-fed1-4794-8eb5-58dde75563b3	94	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:00:54.868932	2026-02-13 10:00:54.868932	f	\N	pharmacy-2
d418d542-d029-4309-ba94-2b0f5d848b36	95	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي] test cancel	\N	\N	\N	2026-02-13 10:00:55.153853	2026-02-13 10:00:55.153853	f	\N	pharmacy-2
d33cde0a-1105-46f8-ae98-d6e4deec3a64	96	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 10:00:55.253633	2026-02-13 10:00:55.253633	f	\N	pharmacy-2
9e2fe560-023b-43b7-b7f5-d2ba0d6d06e7	97	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 10:00:55.846821	2026-02-13 10:00:55.846821	f	\N	pharmacy-2
b5c32452-160d-4b54-b29c-1f41a787735b	98	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:00:56.623865	2026-02-13 10:00:56.623865	f	\N	pharmacy-2
5d9c02af-a640-4fba-bca1-e2829907f8ac	99	2026-02-13	7980d189-399f-41d3-94b4-c487da69975f	cash	\N	\N	draft	1500.00	percent	0.0000	0.00	1500.00	\N	\N	\N	\N	2026-02-13 10:00:57.026185	2026-02-13 10:00:57.026185	f	\N	pharmacy-2
65708a2c-1573-4b21-8aaf-57110ef119a9	100	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Test FEFO Customer	\N	cancelled	10.50	percent	0.0000	0.00	10.50	[ملغي]	\N	\N	\N	2026-02-13 10:00:58.646356	2026-02-13 10:00:58.646356	f	\N	\N
e9dcce0a-3a1e-4be8-910f-0fc1aa5fa658	101	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Test Non-Expiry	\N	cancelled	5.00	percent	0.0000	0.00	5.00	[ملغي]	\N	\N	\N	2026-02-13 10:00:58.882741	2026-02-13 10:00:58.882741	f	\N	\N
3abf267e-04d0-4dfe-86a0-c7d2892aa147	102	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Test Specified Expiry	\N	cancelled	4.50	percent	0.0000	0.00	4.50	[ملغي]	\N	\N	\N	2026-02-13 10:00:58.954401	2026-02-13 10:00:58.954401	f	\N	\N
3eb1bcf8-946f-415d-bda9-562948043e14	103	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Test Price Override	\N	cancelled	50.00	percent	0.0000	0.00	50.00	[ملغي]	\N	\N	\N	2026-02-13 10:00:59.051658	2026-02-13 10:00:59.051658	f	\N	\N
5e8201c2-9df0-439c-bb36-d05a8d20e190	104	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Test Medium Price	\N	cancelled	5.00	percent	0.0000	0.00	5.00	[ملغي]	\N	\N	\N	2026-02-13 10:00:59.199267	2026-02-13 10:00:59.199267	f	\N	\N
c028505f-ab28-441c-af31-4acbd92ae2e0	105	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Test Minor Price	\N	cancelled	0.50	percent	0.0000	0.00	0.50	[ملغي]	\N	\N	\N	2026-02-13 10:00:59.233134	2026-02-13 10:00:59.233134	f	\N	\N
26181d57-4c7b-495d-8f4f-da9fa0d6d505	106	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Test Discount	\N	cancelled	100.00	percent	10.0000	10.00	90.00	[ملغي]	\N	\N	\N	2026-02-13 10:00:59.266429	2026-02-13 10:00:59.266429	f	\N	\N
cf0a4f37-d8d2-41f1-b095-8752ea499c7d	107	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Test Value Discount	\N	cancelled	100.00	value	0.0000	25.00	75.00	[ملغي]	\N	\N	\N	2026-02-13 10:00:59.376308	2026-02-13 10:00:59.376308	f	\N	\N
26fe188e-c9c3-454c-b999-652346401273	111	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Unit Test Min	\N	cancelled	0.50	percent	0.0000	0.00	0.50	[ملغي]	\N	\N	\N	2026-02-13 10:01:00.209653	2026-02-13 10:01:00.209653	f	\N	\N
7a3babb3-b34f-4262-ab58-ea7b49864d09	108	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Test Update Discount	\N	cancelled	100.00	percent	15.0000	15.00	85.00	[ملغي]	\N	\N	\N	2026-02-13 10:00:59.824487	2026-02-13 10:00:59.877	f	\N	\N
4653235b-2e1e-4379-b3ff-f40a3ebda969	109	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Unit Test	\N	cancelled	50.00	percent	0.0000	0.00	50.00	[ملغي]	\N	\N	\N	2026-02-13 10:01:00.089049	2026-02-13 10:01:00.089049	f	\N	\N
fe07a37e-b589-4d2e-82cf-75e2b2f47f57	110	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Unit Test Med	\N	cancelled	5.00	percent	0.0000	0.00	5.00	[ملغي]	\N	\N	\N	2026-02-13 10:01:00.147579	2026-02-13 10:01:00.147579	f	\N	\N
391a52b2-6e9d-4cdc-a90d-cc10a54825df	112	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Test Stock Fail	\N	cancelled	149998.50	percent	0.0000	0.00	149998.50	[ملغي]	\N	\N	\N	2026-02-13 10:01:00.364817	2026-02-13 10:01:00.364817	f	\N	\N
bce196dc-5062-4860-82c9-828e2e88566b	114	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Test Finalize Lock	\N	finalized	0.50	percent	0.0000	0.00	0.50	\N	\N	2026-02-13 10:01:00.566	\N	2026-02-13 10:01:00.527653	2026-02-13 10:01:00.566	f	\N	\N
c5cd1a87-42a3-4157-b308-6ceb7de79633	113	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Updated Name	\N	cancelled	5.00	percent	0.0000	0.00	5.00	[ملغي]	\N	\N	\N	2026-02-13 10:01:00.42521	2026-02-13 10:01:00.452	f	\N	\N
7df17c10-a6b5-4d6d-885c-51aba7224613	115	2026-02-13	8481eec7-6c7f-44c6-99bc-5a39f708f519	cash	Test Delete Final	\N	finalized	0.50	percent	0.0000	0.00	0.50	\N	\N	2026-02-13 10:01:00.738	\N	2026-02-13 10:01:00.616526	2026-02-13 10:01:00.738	f	\N	\N
45c6ac8e-95d9-4616-bfcd-714b9766dbdd	116	2020-01-15	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:01:04.158389	2026-02-13 10:01:04.158389	f	\N	\N
15fe86a1-1b2b-4c68-bd2e-ec89ac01fbf3	117	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:01:04.332703	2026-02-13 10:01:04.332703	f	\N	\N
08cbef9f-8dcd-4b80-bb8b-188bb297c486	118	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:01:04.375826	2026-02-13 10:01:04.375826	f	\N	\N
e9a7351e-910c-4287-bcde-4e7ae7642b39	119	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي] test cancel	\N	\N	\N	2026-02-13 10:01:04.740362	2026-02-13 10:01:04.740362	f	\N	\N
1af2bd1d-b88d-42b6-a6a8-7ad974eb2c1a	122	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:01:05.616473	2026-02-13 10:01:05.616473	f	\N	\N
cfb13035-07f3-4ef9-b735-e920cb33acb4	120	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 10:01:04.78441	2026-02-13 10:01:04.78441	f	\N	\N
85dbe8bf-a464-44b7-ac18-754b9dbc9aab	121	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 10:01:04.889729	2026-02-13 10:01:04.889729	f	\N	\N
cc85c99f-fdfe-4cb0-b554-80b8189e249d	127	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي] test cancel	\N	\N	\N	2026-02-13 10:03:30.537691	2026-02-13 10:03:30.537691	f	\N	\N
0a9d0cac-431d-40f5-ba24-9a23d58a8368	130	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:03:31.184211	2026-02-13 10:03:31.184211	f	\N	\N
e1a234d5-b19f-4854-b401-2bee3d7aeefe	131	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	1500.00	percent	0.0000	0.00	1500.00	\N	\N	\N	\N	2026-02-13 10:03:31.36579	2026-02-13 10:03:31.36579	f	\N	\N
6173b23c-d728-44c6-94b7-2d8345276d09	136	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 10:17:59.198203	2026-02-13 10:17:59.198203	f	\N	\N
8f5da54d-7e25-4726-82f3-1fa3da0d3126	137	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 10:17:59.281287	2026-02-13 10:17:59.281287	f	\N	\N
7ec5d0b1-176a-4e59-99ce-6f169ab50476	138	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:17:59.640842	2026-02-13 10:17:59.640842	f	\N	\N
1757d22c-c1ff-43b9-8138-2a9f907c350a	139	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	1500.00	percent	0.0000	0.00	1500.00	\N	\N	\N	\N	2026-02-13 10:17:59.825493	2026-02-13 10:17:59.825493	f	\N	\N
3cf71183-61a5-4de4-a45f-9dafb606e414	123	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	1500.00	percent	0.0000	0.00	1500.00	\N	\N	\N	\N	2026-02-13 10:01:05.869854	2026-02-13 10:01:05.869854	f	\N	\N
b009ff34-8da4-4eca-b00b-0e8abc974c4d	128	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 10:03:30.633587	2026-02-13 10:03:30.633587	f	\N	\N
f6bfa335-4960-4878-b889-ac35ba650aae	129	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي]	\N	\N	\N	2026-02-13 10:03:30.781541	2026-02-13 10:03:30.781541	f	\N	\N
be1f3075-c89d-4225-8394-472808823045	132	2020-01-15	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:17:58.792568	2026-02-13 10:17:58.792568	f	\N	\N
1b181741-de7a-49b4-9940-d6cfbb64213b	133	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:17:58.883965	2026-02-13 10:17:58.883965	f	\N	\N
858abc50-7fd1-47ce-b092-cf38ba7d74a0	134	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	draft	500.00	percent	0.0000	0.00	500.00	\N	\N	\N	\N	2026-02-13 10:17:58.922437	2026-02-13 10:17:58.922437	f	\N	\N
faf077bc-a824-4044-a54f-ce792dc3cf38	135	2026-02-13	d2aff5ea-0a7e-4faf-b9c0-23f73439c117	cash	\N	\N	cancelled	500.00	percent	0.0000	0.00	500.00	[ملغي] test cancel	\N	\N	\N	2026-02-13 10:17:59.151495	2026-02-13 10:17:59.151495	f	\N	\N
\.


--
-- Data for Name: sales_invoice_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sales_invoice_lines (id, invoice_id, line_no, item_id, unit_level, qty, qty_in_minor, sale_price, line_total, expiry_month, expiry_year, lot_id, created_at) FROM stdin;
d8375cb9-35b5-4a23-abf5-71a5bcd30114	71434586-d182-41dd-9346-888afa45be64	1	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	10.0000	10.0000	500.00	5000.00	12	2030	f0dd0e04-bcd9-43ee-a187-472df8176dee	2026-02-10 18:08:50.581697
d3f4ec19-b39a-4e43-a25b-962325e5aae7	71434586-d182-41dd-9346-888afa45be64	2	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	1.0000	1.0000	500.00	500.00	12	2040	88c481fe-c56e-4306-985e-2ee4eaff0200	2026-02-10 18:08:50.581697
a7ffebbe-ba5b-4a56-bd3b-bb4e7492f59e	e8fbdfb4-6d7f-4448-8381-1f9d458ee296	1	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	2.0000	2.0000	500.00	1000.00	12	2030	0a6c46e9-8381-4c9b-83af-4166243e43e5	2026-02-10 18:32:19.186083
ff8dde53-043e-40d9-a0e3-acb427270d9c	e0307467-3207-49d8-b24f-2acecfd195e7	1	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	1.0000	1.0000	500.00	500.00	12	2029	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	2026-02-09 11:49:55.265938
744b1520-bfbb-4f3b-a36f-c0087dc7aafe	f6b78c28-4202-42ac-9a8c-e7746ec774e3	1	0396b137-8815-455d-bfc2-6a08d6351004	major	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-11 20:13:40.541789
c893aa3b-8260-4403-bc44-4b914393b5a0	f6b78c28-4202-42ac-9a8c-e7746ec774e3	2	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	1.0000	1.0000	500.00	500.00	12	2029	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	2026-02-11 20:13:40.541789
39311d26-e5d1-41c7-8e4a-6c4c8347fa38	f6b78c28-4202-42ac-9a8c-e7746ec774e3	3	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	major	1.0000	1.0000	500.00	500.00	12	2029	3c1ae70b-1a7c-4dc9-ac15-49093338e6d9	2026-02-11 20:13:40.541789
c838b4a3-a993-44b4-8922-07a3b344be08	f6b78c28-4202-42ac-9a8c-e7746ec774e3	4	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	1.0000	1.0000	500.00	500.00	12	2029	b73c4baf-e1db-4a06-b4e8-9f4cf67b4436	2026-02-11 20:13:40.541789
b98d7b77-2ed7-4801-b3bb-09382df8149f	f6b78c28-4202-42ac-9a8c-e7746ec774e3	5	31ca9617-f155-4147-9acd-4529df6bc51d	major	1.0000	30.0000	500.00	500.00	12	2029	880d9abc-661e-4741-94ed-2389d435b387	2026-02-11 20:13:40.541789
d17d5c2b-52b1-4ff6-94f3-a402fb6305b7	a6e725f0-4870-4766-a415-0a3040622941	1	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	major	1.0000	1.0000	500.00	500.00	12	2029	3c1ae70b-1a7c-4dc9-ac15-49093338e6d9	2026-02-11 20:41:48.649575
c732a4f3-5ca8-45f9-a845-8f2e60299cc7	a6e725f0-4870-4766-a415-0a3040622941	2	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	2.0000	2.0000	500.00	1000.00	12	2029	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	2026-02-11 20:41:48.649575
4a51be43-6887-4f4f-a198-6e0b97c835b4	a6e725f0-4870-4766-a415-0a3040622941	3	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	5.0000	5.0000	500.00	2500.00	12	2029	b73c4baf-e1db-4a06-b4e8-9f4cf67b4436	2026-02-11 20:41:48.649575
2365fb0a-916e-4a28-b255-2a3861fd9e9b	a6e725f0-4870-4766-a415-0a3040622941	4	31ca9617-f155-4147-9acd-4529df6bc51d	major	2.0000	60.0000	500.00	1000.00	12	2029	880d9abc-661e-4741-94ed-2389d435b387	2026-02-11 20:41:48.649575
a7d6b96b-822e-4ac5-b453-5847d724e9f8	897cd61d-cd1c-4b66-ad56-79f6f4b0f22f	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:56:50.707625
7f76f3a8-012c-4b83-abdb-1ec049ec145f	5771f515-330a-4020-a4c5-f697ef32582e	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:56:50.93099
6bad1fca-3c41-49d6-8ecc-8bfe20830d62	c93d4738-3024-46f3-aa07-2f2ed42bb04b	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:56:50.95925
dda203ed-4b51-4819-a6f8-a789625b6fd6	612dde2f-df6e-4db5-90a9-f7d327965f4f	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:56:51.111084
3c8acbbb-1222-4a64-9d6d-17f441938656	9f1e198b-33c6-4ef0-9737-5f2404e99fd1	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:57:32.92884
8c64ad0e-0603-44c7-8db9-eea613c2d16b	ed8c2fc2-40f8-4f11-819d-08dee7c72dc3	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:57:33.224337
8c6f8a69-9b7a-4f49-861c-6e21d16e5104	64d0954a-04ac-46fb-8849-1ecc8fa73005	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:57:33.313988
9f5921dd-dc68-4e01-90ee-f4c3dbb43106	77e5ab1a-dc6c-459b-b293-851353db31bb	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:57:33.493212
416e52bc-7c9a-4cc4-ad1e-00e1cf574b84	f42e017f-556e-410e-a8c9-e0f584bb4b5c	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:57:56.359039
b3614c63-3103-4190-97d4-afbc4f78ed4e	0d1591a0-466c-4d6b-b3b9-a168988ebfb2	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:57:56.510905
04010903-2622-4539-8349-9160e179c692	54c57387-f3c0-44a5-8002-5c49987af78e	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:57:56.546851
3ddb5829-de72-4dbb-a8dd-b16e8f3b2b6c	8ff94979-f734-4ebf-a846-d8dcbfb473be	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:57:56.874173
ce7af8d8-3812-411d-9467-65b45300dd1d	241252ee-fa75-4a34-b38d-bdfc8dc86340	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:58:43.105876
ebc5971a-6562-471f-a0e5-941297ac3dea	26570a22-7524-42a8-a717-5bec0901cc10	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:58:43.264051
234cc240-481f-4f5d-90df-e27f51142ebd	2859c59a-b2b7-45c7-9509-b27726cda063	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:58:43.296821
8e67af40-0585-4a8c-b339-828a829a2729	ea19c44c-8e8f-4f0c-a1d0-300e905fcc05	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 08:58:43.579426
527806fc-7f4d-4c05-a922-c0a120b349c8	2aa0c782-5f67-4e48-9133-3900af01a218	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:00:21.262169
1eec57d9-9485-4ac6-81dd-2c916bbce2d5	d37a3826-fe12-4f91-8950-aafb2453e5f9	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:00:21.405829
41bb7610-a0b1-43fe-8fb2-7a509d131b5c	c32a7c84-e908-4a7c-a060-40ed412c824e	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:00:21.437085
89bea042-6bbe-4643-8bce-e188449b11e2	66d87562-89d6-4ba2-b26f-bddcc1610085	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:00:21.682816
392d95db-c58f-4a92-9bc1-5d8173690daf	1d43caf6-ee50-4f61-bf45-96aebe577c67	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:14:03.651337
53542db6-5285-4a66-b2e6-857956134f12	52c0bb6e-2360-43dd-822b-8a37e97dbdd5	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:14:03.698785
fac4e4a5-4d04-4c20-94c4-e85982b597fe	83f09a7e-08aa-42f9-b022-5f7c630d76fe	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:14:03.741542
feed01b8-77f4-4139-9a2a-f128298afae0	75c01299-4064-4ae5-98f9-ed880fc02138	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:14:03.805447
11ea78e6-8dd4-471b-b993-72a2b6acbc18	22e784b6-62e1-47d5-840c-de0050c23923	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:14:04.207654
5f8e64ad-f128-4b47-a035-d0e3635994af	afff231e-40b4-4062-a0db-e83a62374116	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	3.0000	3.0000	500.00	1500.00	\N	\N	\N	2026-02-13 09:14:04.398499
99a1e46e-7fc7-421a-b266-8dd1f88460d8	19689a19-63aa-457b-b921-2afc2647435b	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:16:22.31668
da15a3b2-0da1-41db-9fcd-525a6b4566f4	1416bdff-4bf0-4086-8623-42b9c43717a6	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:16:22.386797
7cc277d9-0108-4306-8e4d-063d49f0745d	f916dcf7-b023-48b7-9208-1e0e5bd3a319	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:16:22.442943
fbc9eb40-f7fc-4384-af6a-f3734a1449c9	707c896a-5566-41c8-a13c-210ef08c3de2	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:16:22.577454
7e3bc124-7a32-445e-9712-29c7b08d83a5	f4af17ea-da9a-4496-8f1c-add8210aa325	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:16:23.089397
4bdf3493-3b52-41d7-986e-88befad5d026	7449a3aa-0f21-4770-9d35-baa7574ef26f	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	3.0000	3.0000	500.00	1500.00	\N	\N	\N	2026-02-13 09:16:23.380472
57777a38-5b21-4c1d-92d2-77d2584338b4	5288276f-ed0d-4118-ba3c-f77afcbcc29e	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:23:42.505238
95e57886-7a99-4d07-81ad-5027b573f071	5127872c-fecb-4309-817a-c9a0891c1680	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:23:42.569567
95d63117-3b39-41a3-bad7-880434744896	0a2f55ab-2417-4963-88b0-778c3f30159c	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:23:42.602009
2706f46e-5ed0-4cc7-bb96-ec6a355998de	e98fafba-9e4a-4336-930c-a0c383f72d4f	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:23:42.632645
8fb46e2e-bfb0-40ea-8eac-38cbeb28dd3e	d17c4396-013c-4207-b300-c6ada1d3c305	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:23:42.668779
ad6af1de-b8e1-4f66-bd2f-8e4a4342343d	0d244fe4-2695-4b8e-8eaf-d143b33eb496	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:23:42.747189
21ffb056-23ad-4cd8-a8d0-00699d71a065	2fd1d6c6-649a-4c7e-b1ee-260bb3964cbf	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:23:43.090266
f658dceb-f981-49d3-8112-6a69b1497af3	c9a9f24e-abf6-4d5c-b15c-6cc98886eabe	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	3.0000	3.0000	500.00	1500.00	\N	\N	\N	2026-02-13 09:23:43.399871
d67f2878-ac42-4085-a171-5bf6155dfe9e	f2f4b48b-4618-4c1f-885e-30680c9dd48a	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:29:35.612308
4748a422-5b45-4539-9346-8b53ffa34259	6fedeee1-5c10-4f0a-8029-d04f68071f0a	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:29:35.760416
b581200d-54da-423b-969b-75ab9ffa577f	05c5581a-282f-4a36-ac23-2799bee90445	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:29:35.8225
764e2985-dd6f-4c25-a291-7772355a711a	fb43a028-e5b8-4bd8-b0b8-71b96bd10777	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:29:35.982932
13454772-0795-4cde-9be5-d5d0ae3b8111	ed168873-72e6-45a5-b9cc-40069c35eb67	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:29:36.054459
874f3da1-1a2d-4a47-a921-f4a32bb71847	54102f46-b43f-4990-be8b-c515c0c46d89	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:29:36.126836
36963adb-9a9b-437e-9430-4a4f5160d58e	4cb3e649-64da-47e7-8a57-430656d313e5	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:29:36.505285
eb3ac5e7-bcb5-4454-bbba-e7187abbc085	d6624868-9684-45bd-894b-71a5ecbe1366	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	3.0000	3.0000	500.00	1500.00	\N	\N	\N	2026-02-13 09:29:36.846619
5593ba54-92b7-43c9-84da-c7858a9f0c4b	01446bec-6d56-46cb-aecc-844283e589ae	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:30:36.981782
33af1a71-9c2a-4e0d-9cd6-56210c7a8f17	0a05ff07-3e11-4c97-9b4c-46831cb67e8b	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:30:37.042298
bf4de813-2b58-4bea-80ae-2a451c87a9f6	3da68308-37a2-4490-9075-f430da40535a	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:30:37.07568
1d2ca79b-4006-4587-856b-b030c8d5a882	e0861fa1-93d1-43e4-a828-f8c72530b9ae	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:30:37.175227
defbd403-8a90-4967-8332-2e3f6a3610c2	3e6d9ba7-0c28-4241-87cf-438f098e225b	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:30:37.206965
88de249e-1236-47ba-b9c6-74fe13ebe930	39910280-7c7f-412d-b18d-6dc67cc005ad	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:30:37.258636
a42c5d3b-8a93-4d29-b2fa-39af21ef9b71	7da02181-1b2e-4ca6-9511-af3adbb1048d	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:30:37.550103
d5821c47-5910-478a-9404-2492e0c14575	0175fcc8-1a4a-4996-8ee0-03290ad7bda0	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	3.0000	3.0000	500.00	1500.00	\N	\N	\N	2026-02-13 09:30:37.713215
a4e555aa-77a7-4aa6-8e5a-9f12a66ede41	28d6b759-da04-460f-ab50-5280bc629059	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:34:55.441346
f3f796ea-2d68-4991-8fdc-8e11d7262bf2	2ed8a99a-048e-4d91-b593-d71a1df376e5	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:34:55.495542
12050679-fe31-472b-8a0b-a020a22405a6	05c54738-3901-469a-a08d-d58bca7c9aa4	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:34:55.525531
133806c4-c181-4353-b173-f5126d58b908	1fd140a5-4ce5-4662-876e-9d6c0ac3dbe0	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:34:55.639158
49c5bdf6-d65a-466c-b8dc-6c3dc96f1cd4	3059d687-4e71-43fa-9de4-78ff69615ac5	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:34:55.687547
b7af165e-988c-47ba-bcac-928b0b1c5c37	5210036f-a0aa-45b0-8fb8-ed4e2d649886	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:34:55.755688
f87f613c-0327-4f59-a53c-367833e3e7d2	17296f81-f39b-4f9a-8769-02e4b46acc30	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:34:56.102384
0e4a3066-9514-418f-8565-0578bc5c4ab3	8d9250f9-ae5b-456c-981d-7b4259c8370a	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	3.0000	3.0000	500.00	1500.00	\N	\N	\N	2026-02-13 09:34:56.26942
bddeb617-da3e-4dd3-80bb-93483745946f	1cdf0dc3-5187-46b4-9756-7b11b76316b0	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:39:09.747186
7e3c61dc-4891-4902-b5c6-12d7e537b14c	dc7d35c3-61fe-48e0-9246-932f9cd92eff	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:39:09.840095
e097e90e-3b88-4c15-b9c9-08dd92d20c16	3709b12a-bca3-4a3b-b121-60a0254b5dba	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:39:09.878818
72c14a58-08eb-4866-b3cf-7bdda97cf842	f2dcc989-2b85-4253-992f-691c4040aa34	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:39:10.032416
00aa48e7-4ba0-46b6-a87b-a86a9449b1ea	57fd61a0-04fa-41c8-ab54-9ae064ba5f2a	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:39:10.088726
890246d6-4d27-45ee-8fa8-feea85570072	de9a5a05-a009-4843-b34c-91cb162e68f3	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:39:10.188483
542b3f6a-0123-4950-b04f-7813037177a6	58372b19-c2cb-41a6-a9db-f56fe0fd4ddb	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:39:10.592319
6d75e1ea-dd36-4edf-ac2d-db2ce248ba12	bd420b4c-55de-4fb6-b728-c66d5040862e	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	3.0000	3.0000	500.00	1500.00	\N	\N	\N	2026-02-13 09:39:10.806566
d6176888-0914-4f36-85db-788dcbd56b29	60de10e5-d2f3-4404-97d4-2c171efb9589	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:59:07.223506
ff5b1878-7f70-42e5-812d-85b13f00b035	e07e5862-79a1-4fee-b65c-25788093b812	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:59:07.289509
2dd4e5f0-27ef-4041-9f05-a2af3a5f5f95	d62f416d-500d-4d1c-ba16-f92675c5ec18	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:59:07.317819
6da7faba-1d60-4954-a4ba-c2b12002f349	58f1db9c-0a89-4fd4-b524-9a00167d7b4c	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:59:07.448828
b2ffaf74-91c9-4bcd-84b0-72996104116f	952ed6ff-7bc0-4c7e-8c5c-2ee18e927e6a	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:59:07.488624
06ca784e-d1f1-4a83-ba27-d537164a785c	45d64e2c-4158-41e0-ae4c-fc3f7b3ad74f	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:59:07.548627
8d36ac4d-453a-4725-9c90-08baa1ae98e2	73178f93-2f99-459b-b656-1252b5f13482	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 09:59:07.91667
0ad8bc64-0fd4-4383-a5d3-e5ecdcf3161d	3e9e6f5d-6d63-4912-be93-abc15611495f	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	3.0000	3.0000	500.00	1500.00	\N	\N	\N	2026-02-13 09:59:08.184249
eb734f53-fb32-4665-b99b-9482de6b59fd	da4a0965-5b0e-4ed1-b562-abba7c8af40a	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:00:54.740493
cc3f9604-d800-4a37-8371-8202d5359aff	1cf2a22f-6696-4ba7-8182-3660742aa797	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:00:54.81066
5ae09d12-d580-4fa1-8e9e-1da52a8e49b7	0c118da7-fed1-4794-8eb5-58dde75563b3	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:00:54.868932
7c79ec82-652a-4684-80df-0832469a5664	d418d542-d029-4309-ba94-2b0f5d848b36	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:00:55.153853
30a97e98-01b4-450a-b399-437eb2542679	d33cde0a-1105-46f8-ae98-d6e4deec3a64	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:00:55.253633
26a1e338-a18d-4142-b6b9-5a21a2ed2133	9e2fe560-023b-43b7-b7f5-d2ba0d6d06e7	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:00:55.846821
6b57c711-2a1a-41b2-8574-060517246e3f	b5c32452-160d-4b54-b29c-1f41a787735b	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:00:56.623865
e4cdb533-90b2-45bb-a4e6-58d4cfffbb29	5d9c02af-a640-4fba-bca1-e2829907f8ac	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	3.0000	3.0000	500.00	1500.00	\N	\N	\N	2026-02-13 10:00:57.026185
364e84a4-5c85-447a-b3ad-399ec5a8ebec	65708a2c-1573-4b21-8aaf-57110ef119a9	1	eb85e8b5-1daf-41d9-be5b-ade264c02b4f	minor	5.0000	5.0000	1.50	7.50	3	2026	18e8c429-9cf9-49be-9cc3-9e8c82b5932f	2026-02-13 10:00:58.646356
b43d8460-911d-4c0e-9861-070f9fdfab74	65708a2c-1573-4b21-8aaf-57110ef119a9	2	eb85e8b5-1daf-41d9-be5b-ade264c02b4f	minor	2.0000	2.0000	1.50	3.00	6	2026	ef946486-2020-424f-becb-6cb276c0832e	2026-02-13 10:00:58.646356
2a0ebd90-933d-4354-96cc-cbe9cc2ae1bb	e9dcce0a-3a1e-4be8-910f-0fc1aa5fa658	1	0edb5c4c-6323-4929-acb2-567cabc98bba	minor	10.0000	10.0000	0.50	5.00	\N	\N	\N	2026-02-13 10:00:58.882741
399d005f-3f5d-494f-b903-aeaeb527b8ac	3abf267e-04d0-4dfe-86a0-c7d2892aa147	1	eb85e8b5-1daf-41d9-be5b-ade264c02b4f	minor	3.0000	3.0000	1.50	4.50	6	2026	\N	2026-02-13 10:00:58.954401
33b1f612-9d33-4a24-a1b7-f47596658e62	3eb1bcf8-946f-415d-bda9-562948043e14	1	0edb5c4c-6323-4929-acb2-567cabc98bba	major	1.0000	100.0000	50.00	50.00	\N	\N	\N	2026-02-13 10:00:59.051658
dcb04b1d-bbc0-4824-ad6c-16f10b277675	5e8201c2-9df0-439c-bb36-d05a8d20e190	1	0edb5c4c-6323-4929-acb2-567cabc98bba	medium	1.0000	10.0000	5.00	5.00	\N	\N	\N	2026-02-13 10:00:59.199267
370ddf3f-925a-4a53-b835-437a34572371	c028505f-ab28-441c-af31-4acbd92ae2e0	1	0edb5c4c-6323-4929-acb2-567cabc98bba	minor	1.0000	1.0000	0.50	0.50	\N	\N	\N	2026-02-13 10:00:59.233134
182dcc70-0a7d-4992-9ce1-e10832dc6be0	26181d57-4c7b-495d-8f4f-da9fa0d6d505	1	0edb5c4c-6323-4929-acb2-567cabc98bba	major	2.0000	200.0000	50.00	100.00	\N	\N	\N	2026-02-13 10:00:59.266429
0316606d-d2f4-4905-9b9d-e0eae28f3170	cf0a4f37-d8d2-41f1-b095-8752ea499c7d	1	0edb5c4c-6323-4929-acb2-567cabc98bba	major	2.0000	200.0000	50.00	100.00	\N	\N	\N	2026-02-13 10:00:59.376308
5a6f1088-1381-4e44-a27f-44bcf684d242	7a3babb3-b34f-4262-ab58-ea7b49864d09	1	0edb5c4c-6323-4929-acb2-567cabc98bba	major	2.0000	200.0000	50.00	100.00	\N	\N	\N	2026-02-13 10:00:59.869234
a4e47ff5-730d-424c-b82c-4041967fceaf	4653235b-2e1e-4379-b3ff-f40a3ebda969	1	0edb5c4c-6323-4929-acb2-567cabc98bba	major	1.0000	100.0000	50.00	50.00	\N	\N	\N	2026-02-13 10:01:00.089049
588b38d9-8861-40da-b861-4a6b6c8b99e8	fe07a37e-b589-4d2e-82cf-75e2b2f47f57	1	0edb5c4c-6323-4929-acb2-567cabc98bba	medium	1.0000	10.0000	5.00	5.00	\N	\N	\N	2026-02-13 10:01:00.147579
caa1cd77-e267-43d2-a57d-62c4644fa7b8	26fe188e-c9c3-454c-b999-652346401273	1	0edb5c4c-6323-4929-acb2-567cabc98bba	minor	1.0000	1.0000	0.50	0.50	\N	\N	\N	2026-02-13 10:01:00.209653
9fc85a59-0506-4dc1-9aff-ae00065d36d4	391a52b2-6e9d-4cdc-a90d-cc10a54825df	1	eb85e8b5-1daf-41d9-be5b-ade264c02b4f	minor	99999.0000	99999.0000	1.50	149998.50	3	2026	\N	2026-02-13 10:01:00.364817
d3efd348-e45b-44f8-bbf1-cf3be3f58939	c5cd1a87-42a3-4157-b308-6ceb7de79633	1	0edb5c4c-6323-4929-acb2-567cabc98bba	minor	10.0000	10.0000	0.50	5.00	\N	\N	\N	2026-02-13 10:01:00.448277
4564e0a2-a8d9-4b47-88f0-bd6c1390bb40	bce196dc-5062-4860-82c9-828e2e88566b	1	0edb5c4c-6323-4929-acb2-567cabc98bba	minor	1.0000	1.0000	0.50	0.50	\N	\N	\N	2026-02-13 10:01:00.527653
b4f596af-1622-4188-9a82-945c6d565b75	7df17c10-a6b5-4d6d-885c-51aba7224613	1	0edb5c4c-6323-4929-acb2-567cabc98bba	minor	1.0000	1.0000	0.50	0.50	\N	\N	\N	2026-02-13 10:01:00.616526
c044a852-253e-4744-ba92-72450405d42d	45c6ac8e-95d9-4616-bfcd-714b9766dbdd	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:01:04.158389
a49a5936-11bd-486a-b3ab-5bbf36b4312c	15fe86a1-1b2b-4c68-bd2e-ec89ac01fbf3	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:01:04.332703
37609351-f730-473d-ae6e-966ed1f98677	08cbef9f-8dcd-4b80-bb8b-188bb297c486	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:01:04.375826
18562f09-817c-4c60-91b6-89229105c7ff	e9a7351e-910c-4287-bcde-4e7ae7642b39	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:01:04.740362
6c5d739e-7102-4fb4-8929-ccb8a66a8db4	cfb13035-07f3-4ef9-b735-e920cb33acb4	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:01:04.78441
152ab151-5986-457a-9488-111666ede2f7	85dbe8bf-a464-44b7-ac18-754b9dbc9aab	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:01:04.889729
f8f30771-1a13-4a1e-ab48-234efd9f1cc7	1af2bd1d-b88d-42b6-a6a8-7ad974eb2c1a	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:01:05.616473
b6dae2d5-bc3e-4a0c-a8e9-121ce558c9ea	3cf71183-61a5-4de4-a45f-9dafb606e414	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	3.0000	3.0000	500.00	1500.00	\N	\N	\N	2026-02-13 10:01:05.869854
bfa43892-00d5-4cd6-a2e3-67750c242c31	99bef1c5-f6e1-4f5d-aa50-c0c62d30070d	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:03:30.196059
85200ec2-4dfb-4fe9-ba4f-f1e9b3e0be75	96be4d0d-eacd-4de9-b876-f0affc9296fc	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:03:30.295288
765be2dd-8626-433c-bfc5-d0882ed6f1b7	6871e98f-daa1-4e8f-b9c2-ff27a2cd94be	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:03:30.338879
1c423ce9-1fdc-48c5-a52b-801f5f9662fc	cc85c99f-fdfe-4cb0-b554-80b8189e249d	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:03:30.537691
0ae696c4-22a5-4067-a7ad-86a068256191	b009ff34-8da4-4eca-b00b-0e8abc974c4d	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:03:30.633587
43e3ad08-9d34-4b1f-9555-57ce2ea8bba0	f6bfa335-4960-4878-b889-ac35ba650aae	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:03:30.781541
bad5b9d1-f7c2-4363-9170-eb0038c6c772	0a9d0cac-431d-40f5-ba24-9a23d58a8368	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:03:31.184211
9baaa070-1aed-4d55-8292-471a35b443a5	e1a234d5-b19f-4854-b401-2bee3d7aeefe	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	3.0000	3.0000	500.00	1500.00	\N	\N	\N	2026-02-13 10:03:31.36579
566ca206-01a6-4065-b6e2-e7f030d78145	be1f3075-c89d-4225-8394-472808823045	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:17:58.792568
5ae919f2-7966-4a70-8901-f87ca8d233a9	1b181741-de7a-49b4-9940-d6cfbb64213b	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:17:58.883965
94380023-93f4-4b64-951c-5ba06d68831e	858abc50-7fd1-47ce-b092-cf38ba7d74a0	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:17:58.922437
8266b1c3-b103-4840-99b9-87dc8b74d5b3	faf077bc-a824-4044-a54f-ce792dc3cf38	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:17:59.151495
ae1108c2-d43e-4701-805c-e0c033f41ae2	6173b23c-d728-44c6-94b7-2d8345276d09	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:17:59.198203
b1556a81-cdcf-48c5-a5e1-4950e83aee72	8f5da54d-7e25-4726-82f3-1fa3da0d3126	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:17:59.281287
cc290ef3-4bf0-40e9-8653-2bcc1cc979c5	7ec5d0b1-176a-4e59-99ce-6f169ab50476	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	1.0000	1.0000	500.00	500.00	\N	\N	\N	2026-02-13 10:17:59.640842
e39742a5-ef47-45d7-9323-9883576d6169	1757d22c-c1ff-43b9-8138-2a9f907c350a	1	0396b137-8815-455d-bfc2-6a08d6351004	minor	3.0000	3.0000	500.00	1500.00	\N	\N	\N	2026-02-13 10:17:59.825493
\.


--
-- Data for Name: sales_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sales_transactions (id, item_id, tx_date, qty, unit_level, sale_price, total, created_at) FROM stdin;
56d5c66f-9241-486c-9bc4-68eeacb76a32	227cc6a5-2eea-430b-913f-143bb33e4d9a	2026-02-08	1.0000	minor	500.00	500.00	2026-02-09 11:49:56.212721
055cf7cc-a01c-4a7c-abd4-9bcec03d570f	4b75a55e-1cbe-48b9-8243-31708a3577ec	2026-02-10	10.0000	minor	500.00	5000.00	2026-02-10 18:08:51.053251
85eea12b-8a62-4e9f-a92b-6197dc82b3ac	4b75a55e-1cbe-48b9-8243-31708a3577ec	2026-02-10	1.0000	minor	500.00	500.00	2026-02-10 18:08:51.053251
0c81247a-d1d2-4899-b435-25801637fa30	227cc6a5-2eea-430b-913f-143bb33e4d9a	2026-02-10	2.0000	minor	500.00	1000.00	2026-02-10 18:32:19.455565
1dbd760c-4197-4ac0-9297-24dd844defad	0396b137-8815-455d-bfc2-6a08d6351004	2026-02-11	1.0000	minor	500.00	500.00	2026-02-11 20:13:40.781302
ed4fb7a8-2ec3-4a21-9688-65ae23f32bec	227cc6a5-2eea-430b-913f-143bb33e4d9a	2026-02-11	1.0000	minor	500.00	500.00	2026-02-11 20:13:40.781302
16541f10-befa-4e05-a57a-51af97d1be28	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	2026-02-11	1.0000	minor	500.00	500.00	2026-02-11 20:13:40.781302
bcb75720-a3d2-4f7c-b7a4-7a38e5e1e832	4b75a55e-1cbe-48b9-8243-31708a3577ec	2026-02-11	1.0000	minor	500.00	500.00	2026-02-11 20:13:40.781302
1f1f786f-9b26-49ce-97dc-caf947e1b7bc	31ca9617-f155-4147-9acd-4529df6bc51d	2026-02-11	30.0000	minor	500.00	500.00	2026-02-11 20:13:40.781302
e7803540-42c5-4bb2-9482-c8b3adca8bbf	b112d3e8-2ffb-4f44-bd7a-0cc1c3ce9652	2026-02-11	1.0000	minor	500.00	500.00	2026-02-11 20:41:48.901621
43c53d6e-3a76-48e2-a634-5040e54869b3	227cc6a5-2eea-430b-913f-143bb33e4d9a	2026-02-11	2.0000	minor	500.00	1000.00	2026-02-11 20:41:48.901621
8272dd71-6dad-4fa3-a45b-2d831bedfa41	4b75a55e-1cbe-48b9-8243-31708a3577ec	2026-02-11	5.0000	minor	500.00	2500.00	2026-02-11 20:41:48.901621
f32c781e-3ea9-4ccb-aeb3-cd7b15da3b81	31ca9617-f155-4147-9acd-4529df6bc51d	2026-02-11	60.0000	minor	500.00	1000.00	2026-02-11 20:41:48.901621
dddda632-dbfe-42b5-a560-8985830801c0	0edb5c4c-6323-4929-acb2-567cabc98bba	2026-02-13	1.0000	minor	0.50	0.50	2026-02-13 10:01:00.552103
a641f53e-7d8b-404b-9567-083f8f902365	0edb5c4c-6323-4929-acb2-567cabc98bba	2026-02-13	1.0000	minor	0.50	0.50	2026-02-13 10:01:00.703414
\.


--
-- Data for Name: service_consumables; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.service_consumables (id, service_id, item_id, quantity, unit_level, notes) FROM stdin;
\.


--
-- Data for Name: service_prices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.service_prices (id, price_list_id, service_id, price, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: services; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.services (id, code, name_ar, name_en, department_id, category, service_type, default_warehouse_id, revenue_account_id, cost_center_id, base_price, is_active, created_at, updated_at, requires_doctor, requires_nurse) FROM stdin;
3c640915-aa91-4c27-8175-903fbff88862	1	اوكسجين	ox	ce561e66-ec39-4fac-89df-950e7595cea5	غازات	GAS	\N	565a0173-0ac5-4ba7-be35-a3c45f94d6c6	8378c236-b401-44d9-b102-014908558722	15.00	t	2026-02-08 20:11:22.381688	2026-02-10 17:36:21.004	t	f
10f1797d-129e-41bc-bce0-4904bc04fe0e	SVC-ACC-TEST-zIGn	إقامة عناية تجريبي	\N	4b00fc6a-0b19-4043-a870-62a509196de3	\N	ACCOMMODATION	\N	d95fbb90-f16d-456c-aafa-8cba60a98ade	aeb0a66c-eceb-437a-a1d1-5f1ff1fa3f25	500.00	t	2026-02-10 19:31:52.095155	2026-02-10 19:31:52.095155	f	f
641d53cd-d7fc-48c3-a936-1b92ff5da189	SVC-OR-TEST-0yu6	فتح غرفة عمليات تجريبي	\N	4b00fc6a-0b19-4043-a870-62a509196de3	\N	OPERATING_ROOM	\N	d95fbb90-f16d-456c-aafa-8cba60a98ade	aeb0a66c-eceb-437a-a1d1-5f1ff1fa3f25	2000.00	t	2026-02-10 19:32:03.476169	2026-02-10 19:32:03.476169	f	f
112770a6-af57-46d2-b1eb-d046ebccf4cd	SVC-REG-TEST-B9fX	خدمة عادية تجريبي	\N	4b00fc6a-0b19-4043-a870-62a509196de3	\N	SERVICE	\N	d95fbb90-f16d-456c-aafa-8cba60a98ade	aeb0a66c-eceb-437a-a1d1-5f1ff1fa3f25	100.00	t	2026-02-10 19:32:13.808002	2026-02-10 19:32:13.808002	f	f
\.


--
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.session (sid, sess, expire) FROM stdin;
rJ6qYB4fDJM_G5Kq8vRQXmv2MQVR0778	{"cookie":{"originalMaxAge":86400000,"expires":"2026-02-14T12:58:47.450Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":"30a6cd95-f1ae-4f50-983e-e47bb6e5df69","role":"admin"}	2026-02-14 12:58:48
aEki5D4LHLN8omGMltPMTBZAWKc3t7I4	{"cookie":{"originalMaxAge":86400000,"expires":"2026-02-14T12:58:51.901Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":"30a6cd95-f1ae-4f50-983e-e47bb6e5df69","role":"admin"}	2026-02-14 12:58:52
PIjQ--HEBFlZV6cPoHyjRQmmDwR7ZAJ6	{"cookie":{"originalMaxAge":86400000,"expires":"2026-02-14T13:11:31.336Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":"30a6cd95-f1ae-4f50-983e-e47bb6e5df69","role":"admin"}	2026-02-14 13:11:38
v1lp8zPu9GNSd3PzaHuLgD2yT2mMEtUn	{"cookie":{"originalMaxAge":86399999,"expires":"2026-02-14T13:09:06.957Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"userId":"30a6cd95-f1ae-4f50-983e-e47bb6e5df69","role":"admin"}	2026-02-14 14:44:06
\.


--
-- Data for Name: store_transfers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.store_transfers (id, transfer_number, transfer_date, source_warehouse_id, destination_warehouse_id, status, notes, created_at, executed_at) FROM stdin;
2ff7399e-8a64-426a-a45e-0c17290b8130	2	2026-02-09	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	b045a6c1-dc79-4480-8907-a8fb6975a92f	draft	\N	2026-02-09 16:19:57.962631	\N
9f607de8-6a9a-455c-ae5f-0c16a6fb46ae	1	2026-02-07	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	b045a6c1-dc79-4480-8907-a8fb6975a92f	executed	\N	2026-02-07 21:30:52.211504	2026-02-07 21:34:33.584
61e91e14-3294-4e29-858f-70579fb4d238	4	2026-02-09	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	b045a6c1-dc79-4480-8907-a8fb6975a92f	draft	\N	2026-02-09 17:53:41.98882	\N
d0cf7173-51b9-435e-a2c6-a150d086c42a	5	2026-02-09	7980d189-399f-41d3-94b4-c487da69975f	b045a6c1-dc79-4480-8907-a8fb6975a92f	draft	\N	2026-02-09 18:13:15.344443	\N
bc34a947-20b4-421c-8bba-39c850c1bab8	6	2026-02-09	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	c2e71ee4-9535-435a-95c9-88fcc7fa56bf	draft	\N	2026-02-09 18:16:37.754992	\N
a328583f-1103-4747-93c8-3fc8ac6ec79b	7	2026-02-09	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	b045a6c1-dc79-4480-8907-a8fb6975a92f	draft	\N	2026-02-09 18:22:39.699053	\N
59efab96-684e-477f-ab5c-a692561a2cb6	8	2026-02-09	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	b045a6c1-dc79-4480-8907-a8fb6975a92f	draft	\N	2026-02-09 21:51:44.486192	\N
f4284fb9-0b51-4760-8ec5-a6dd060255a2	9	2026-02-09	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	b045a6c1-dc79-4480-8907-a8fb6975a92f	executed	\N	2026-02-09 21:53:33.53038	2026-02-09 21:54:03.541
577c27bd-f849-4b83-b0cc-f862d7f98d7a	10	2026-02-09	9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	b045a6c1-dc79-4480-8907-a8fb6975a92f	executed	\N	2026-02-09 21:58:47.176281	2026-02-09 22:01:06.258
\.


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.suppliers (id, code, name_ar, name_en, phone, tax_id, address, is_active, created_at, supplier_type) FROM stdin;
0c7a204c-c416-40ad-8c39-263c4c259faf	SUP-QUICK	مورد سريع	\N	\N	\N	\N	t	2026-02-07 20:25:31.634786	drugs
dfaeb15d-0411-4a23-9986-b67c737cdb02	SUP-QCK2	مورد سريع تجريبي	\N	01000000002	\N	\N	t	2026-02-07 20:29:44.676154	drugs
33dcd1d2-62a9-4b77-9a0b-10394b9d0349	sup001	ابن سينا	\N	\N	\N	\N	t	2026-02-07 20:32:35.963337	drugs
9d3190b5-ccf9-40be-a4db-32defa84d380	VCOR-1770976857059	مورد تصحيح 1770976857059	\N	\N	\N	\N	t	2026-02-13 10:00:57.271796	drugs
4b80609d-7bcd-4634-96a6-70141227407d	DISC-1770976857868	مورد خصم 1770976857868	\N	\N	\N	\N	t	2026-02-13 10:00:58.016713	drugs
\.


--
-- Data for Name: template_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.template_lines (id, template_id, line_number, account_id, cost_center_id, description, debit_percent, credit_percent) FROM stdin;
4b99eee0-f4f8-4e84-8fa0-0378da29a8f7	fd1c7cc0-28df-4296-96df-202ecb5ca1ab	1	d95fbb90-f16d-456c-aafa-8cba60a98ade	\N		5000.00	0.00
21388570-6e2a-476c-a18f-ac8394f9b032	fd1c7cc0-28df-4296-96df-202ecb5ca1ab	2	45a6a4d8-9926-4702-801c-28a2d9af9ea6	\N		0.00	5000.00
\.


--
-- Data for Name: transfer_line_allocations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transfer_line_allocations (id, line_id, source_lot_id, expiry_date, qty_out_in_minor, purchase_price, destination_lot_id, created_at, expiry_month, expiry_year) FROM stdin;
97402099-4b39-4075-b39d-1ed9e36e2dec	7554853f-9e3d-4d70-b818-0471e417eacd	646aac62-9d18-4c9f-9d12-bd91614dad11	\N	10.0000	26.0000	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	2026-02-07 21:34:33.560682	\N	\N
39439d4d-d821-49a1-8fe4-2621ff5214ee	1965dba9-9fea-4487-a19d-9368451da6f2	0a6c46e9-8381-4c9b-83af-4166243e43e5	\N	5.0000	26.0000	386d6adb-52a9-4f3b-931e-a8e2a60c6e6b	2026-02-07 21:34:33.560682	\N	\N
a9ccae74-7664-475b-b6a0-e705f27aa702	320322f4-dc2c-49fc-b59b-b906d0820633	466374fa-b1d0-4d30-945b-1fa8ff43251e	\N	17.0000	80.0000	b73c4baf-e1db-4a06-b4e8-9f4cf67b4436	2026-02-09 21:54:03.518855	\N	\N
3a6b2f95-683d-4d1a-9b18-08aedaa565b4	56d56563-a1bc-4f5c-ba95-5af84b0cbdd3	f0dd0e04-bcd9-43ee-a187-472df8176dee	\N	3.0000	80.0000	b73c4baf-e1db-4a06-b4e8-9f4cf67b4436	2026-02-09 21:54:03.518855	\N	\N
8c214d72-d674-4a0d-a3d6-0729e3d442e4	35a90408-b932-44bf-a001-0376ad441999	466374fa-b1d0-4d30-945b-1fa8ff43251e	\N	17.0000	80.0000	b73c4baf-e1db-4a06-b4e8-9f4cf67b4436	2026-02-09 22:01:06.249256	\N	\N
\.


--
-- Data for Name: transfer_lines; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transfer_lines (id, transfer_id, item_id, unit_level, qty_entered, qty_in_minor, notes, created_at, selected_expiry_date, available_at_save_minor, selected_expiry_month, selected_expiry_year) FROM stdin;
7554853f-9e3d-4d70-b818-0471e417eacd	9f607de8-6a9a-455c-ae5f-0c16a6fb46ae	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	10.0000	10.0000	\N	2026-02-07 21:30:52.211504	\N	10.0000	\N	\N
1965dba9-9fea-4487-a19d-9368451da6f2	9f607de8-6a9a-455c-ae5f-0c16a6fb46ae	227cc6a5-2eea-430b-913f-143bb33e4d9a	major	5.0000	5.0000	\N	2026-02-07 21:30:52.211504	\N	10.0000	\N	\N
ee36e8da-b21e-4f9e-96fd-c69d20787f18	61e91e14-3294-4e29-858f-70579fb4d238	4b75a55e-1cbe-48b9-8243-31708a3577ec	medium	1.0000	1.0000	\N	2026-02-09 17:54:56.579467	\N	17.0000	12	2029
b3346966-27c1-49b7-a1fc-5da98a8f9062	bc34a947-20b4-421c-8bba-39c850c1bab8	4b75a55e-1cbe-48b9-8243-31708a3577ec	medium	1.0000	1.0000	\N	2026-02-09 18:17:42.659688	\N	17.0000	12	2029
de8f3a17-ed22-4c7e-89c4-007564f924b1	a328583f-1103-4747-93c8-3fc8ac6ec79b	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	1.0000	1.0000	\N	2026-02-09 21:51:25.327459	\N	17.0000	12	2029
d95d5393-7c70-47ca-ab70-f9f58446db65	59efab96-684e-477f-ab5c-a692561a2cb6	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	17.0000	17.0000	\N	2026-02-09 21:53:16.286236	\N	17.0000	12	2029
6975cb73-beea-468c-adaa-a026c677d6fb	59efab96-684e-477f-ab5c-a692561a2cb6	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	3.0000	3.0000	\N	2026-02-09 21:53:16.286236	\N	17.0000	12	2029
320322f4-dc2c-49fc-b59b-b906d0820633	f4284fb9-0b51-4760-8ec5-a6dd060255a2	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	17.0000	17.0000	\N	2026-02-09 21:53:33.53038	\N	17.0000	12	2029
56d56563-a1bc-4f5c-ba95-5af84b0cbdd3	f4284fb9-0b51-4760-8ec5-a6dd060255a2	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	3.0000	3.0000	\N	2026-02-09 21:53:33.53038	\N	17.0000	12	2029
35a90408-b932-44bf-a001-0376ad441999	577c27bd-f849-4b83-b0cc-f862d7f98d7a	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	17.0000	17.0000	\N	2026-02-09 22:00:27.808811	\N	17.0000	12	2029
eb17ac10-2434-4207-8ed7-36f9ef72fac3	2ff7399e-8a64-426a-a45e-0c17290b8130	4b75a55e-1cbe-48b9-8243-31708a3577ec	major	1.0000	1.0000	\N	2026-02-12 12:35:06.670976	2040-12-01	1.0000	12	2040
\.


--
-- Data for Name: user_departments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_departments (id, user_id, department_id, created_at) FROM stdin;
\.


--
-- Data for Name: user_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_permissions (id, user_id, permission, granted, created_at) FROM stdin;
d3002a31-678c-45b3-9dd2-0da9a79c2fad	45d62cf2-94f6-47b8-a151-1543d6e5c950	settings.drawer_passwords	t	2026-02-13 13:19:06.178022
f97f0054-5d3e-4aa9-be5e-dec8efd6645f	45d62cf2-94f6-47b8-a151-1543d6e5c950	users.create	t	2026-02-13 13:19:06.178022
c8dca0c4-482c-4f43-ad83-c7e21bcfe4fc	45d62cf2-94f6-47b8-a151-1543d6e5c950	users.view	t	2026-02-13 13:19:06.178022
0e533b99-927f-44fd-bd00-51e93ce5461f	45d62cf2-94f6-47b8-a151-1543d6e5c950	users.delete	t	2026-02-13 13:19:06.178022
7b6fd87e-d7db-4220-b842-37638c15f520	45d62cf2-94f6-47b8-a151-1543d6e5c950	users.edit	t	2026-02-13 13:19:06.178022
\.


--
-- Data for Name: user_warehouses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_warehouses (id, user_id, warehouse_id, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, password, full_name, role, is_active, created_at, department_id, pharmacy_id) FROM stdin;
30a6cd95-f1ae-4f50-983e-e47bb6e5df69	admin	$2b$10$XH/cr/HcDxZAmPzJ1a4/3.wZb9REw8PziNwRL0Xir/vTVIPD300ji	مدير النظام	admin	t	2026-02-13 12:58:33.052778	\N	\N
7bb03dec-f95c-4494-bb03-909a2bfe9f1b	test_cashier_WNbAZf	$2b$10$vfXjzwJBKLrxMzex1fjj9evb9/QglHcuhYMBOmnxSkvAjSKwVmvDG	كاشير تجريبي	cashier	f	2026-02-13 13:05:36.197568	\N	\N
0977eca3-79cf-41a5-8eda-a254943db6c6	عنتر	$2b$10$EdVX6qCm62ty3pJA51rgx.15TzhqGNbbOLBwePTi4wMhT1dUPAHZi	محمد عنتر	cashier	t	2026-02-13 13:12:36.351126	97acdefb-5dac-44bf-8661-f1484c6161ad	pharmacy-1
1e630984-d01b-4527-9529-c414e438ff3c	حمدى	$2b$10$5rqcfHCc4Q7gDzJKuIxSFOyOpeWkkcMdn3Pd97nTu46GiU.TsXx32	محمد حمدى ابوزيد	cashier	t	2026-02-13 13:16:51.254668	97acdefb-5dac-44bf-8661-f1484c6161ad	pharmacy-1
9f924d3a-3916-4997-b011-44771590a405	عمرو	$2b$10$97nVwiEIoSIchNrWoQobg.c0pFq.2BgdE4oT1S0CC74KMcte7KNu6	عمرو طوخى	cashier	t	2026-02-13 13:17:43.533504	45b62b52-f35e-414b-99aa-3d2af7a7266c	pharmacy-2
45d62cf2-94f6-47b8-a151-1543d6e5c950	احمد	$2b$10$K/w76WpOq8vOWI8awG7DHuBBuSPeGHoVDmBmqv.p6M7vhbAQ6E.Oe	احمد محمد سيد	accounts_manager	t	2026-02-13 13:18:22.049866	\N	\N
\.


--
-- Data for Name: warehouses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.warehouses (id, warehouse_code, name_ar, department_id, is_active, created_at, pharmacy_id, gl_account_id) FROM stdin;
8481eec7-6c7f-44c6-99bc-5a39f708f519	WH-PHARM	صيدلية رئيسية	\N	t	2026-02-13 10:00:58.339219	\N	\N
9d6dfc3c-8b7c-4f44-8568-a0d1db644cc0	WH01	مستودع رئيسي	4b00fc6a-0b19-4043-a870-62a509196de3	t	2026-02-07 20:24:41.843111	pharmacy-1	\N
45c6f23f-0eea-4d36-b10a-e7df6f894522	WH001	صيدلية د/حسنى	45b62b52-f35e-414b-99aa-3d2af7a7266c	t	2026-02-07 19:24:45.136873	pharmacy-1	\N
7980d189-399f-41d3-94b4-c487da69975f	WH-RCV	صيدلية د/سحر (الثامن)	97acdefb-5dac-44bf-8661-f1484c6161ad	t	2026-02-07 20:27:58.380758	pharmacy-2	\N
c2e71ee4-9535-435a-95c9-88fcc7fa56bf	WH002	مخزن العناية	e0770ff7-7fbb-4cb6-bbeb-d38889ce5bbe	t	2026-02-07 19:24:59.341994	pharmacy-2	\N
b045a6c1-dc79-4480-8907-a8fb6975a92f	wh004	مخزن العمليات	ce561e66-ec39-4fac-89df-950e7595cea5	t	2026-02-07 20:11:11.411633	pharmacy-2	\N
a5124fb7-73ad-4c35-906f-80ba5b9f3a00	wh003	تالف	\N	t	2026-02-07 20:09:35.570861	\N	\N
d2aff5ea-0a7e-4faf-b9c0-23f73439c117	WCR-1770976857059	مستودع تصحيح 1770976857059	\N	t	2026-02-13 10:00:57.309985	\N	\N
2805ee57-b608-4212-921b-29c390caaf82	WD-1770976857868	مستودع خصم 1770976857868	\N	t	2026-02-13 10:00:58.10464	\N	\N
\.


--
-- Name: account_mappings account_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_mappings
    ADD CONSTRAINT account_mappings_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_code_unique UNIQUE (code);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: admissions admissions_admission_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_admission_number_key UNIQUE (admission_number);


--
-- Name: admissions admissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: cashier_audit_log cashier_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cashier_audit_log
    ADD CONSTRAINT cashier_audit_log_pkey PRIMARY KEY (id);


--
-- Name: cashier_receipts cashier_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cashier_receipts
    ADD CONSTRAINT cashier_receipts_pkey PRIMARY KEY (id);


--
-- Name: cashier_refund_receipts cashier_refund_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cashier_refund_receipts
    ADD CONSTRAINT cashier_refund_receipts_pkey PRIMARY KEY (id);


--
-- Name: cashier_shifts cashier_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cashier_shifts
    ADD CONSTRAINT cashier_shifts_pkey PRIMARY KEY (id);


--
-- Name: cost_centers cost_centers_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_code_unique UNIQUE (code);


--
-- Name: cost_centers cost_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_pkey PRIMARY KEY (id);


--
-- Name: departments departments_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_code_unique UNIQUE (code);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: doctors doctors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_pkey PRIMARY KEY (id);


--
-- Name: drawer_passwords drawer_passwords_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drawer_passwords
    ADD CONSTRAINT drawer_passwords_pkey PRIMARY KEY (id);


--
-- Name: fiscal_periods fiscal_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fiscal_periods
    ADD CONSTRAINT fiscal_periods_pkey PRIMARY KEY (id);


--
-- Name: inventory_lot_movements inventory_lot_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_lot_movements
    ADD CONSTRAINT inventory_lot_movements_pkey PRIMARY KEY (id);


--
-- Name: inventory_lots inventory_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_lots
    ADD CONSTRAINT inventory_lots_pkey PRIMARY KEY (id);


--
-- Name: item_barcodes item_barcodes_barcode_value_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_barcodes
    ADD CONSTRAINT item_barcodes_barcode_value_unique UNIQUE (barcode_value);


--
-- Name: item_barcodes item_barcodes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_barcodes
    ADD CONSTRAINT item_barcodes_pkey PRIMARY KEY (id);


--
-- Name: item_department_prices item_department_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_department_prices
    ADD CONSTRAINT item_department_prices_pkey PRIMARY KEY (id);


--
-- Name: item_form_types item_form_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_form_types
    ADD CONSTRAINT item_form_types_pkey PRIMARY KEY (id);


--
-- Name: item_uoms item_uoms_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_uoms
    ADD CONSTRAINT item_uoms_code_key UNIQUE (code);


--
-- Name: item_uoms item_uoms_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_uoms
    ADD CONSTRAINT item_uoms_code_unique UNIQUE (code);


--
-- Name: item_uoms item_uoms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_uoms
    ADD CONSTRAINT item_uoms_pkey PRIMARY KEY (id);


--
-- Name: items items_item_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_item_code_unique UNIQUE (item_code);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_entry_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_entry_number_unique UNIQUE (entry_number);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: journal_templates journal_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_templates
    ADD CONSTRAINT journal_templates_pkey PRIMARY KEY (id);


--
-- Name: patient_invoice_headers patient_invoice_headers_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_invoice_headers
    ADD CONSTRAINT patient_invoice_headers_invoice_number_key UNIQUE (invoice_number);


--
-- Name: patient_invoice_headers patient_invoice_headers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_invoice_headers
    ADD CONSTRAINT patient_invoice_headers_pkey PRIMARY KEY (id);


--
-- Name: patient_invoice_lines patient_invoice_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_invoice_lines
    ADD CONSTRAINT patient_invoice_lines_pkey PRIMARY KEY (id);


--
-- Name: patient_invoice_payments patient_invoice_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_invoice_payments
    ADD CONSTRAINT patient_invoice_payments_pkey PRIMARY KEY (id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: pharmacies pharmacies_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pharmacies
    ADD CONSTRAINT pharmacies_code_key UNIQUE (code);


--
-- Name: pharmacies pharmacies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pharmacies
    ADD CONSTRAINT pharmacies_pkey PRIMARY KEY (id);


--
-- Name: price_adjustments_log price_adjustments_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_adjustments_log
    ADD CONSTRAINT price_adjustments_log_pkey PRIMARY KEY (id);


--
-- Name: price_list_items price_list_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_list_items
    ADD CONSTRAINT price_list_items_pkey PRIMARY KEY (id);


--
-- Name: price_lists price_lists_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_code_unique UNIQUE (code);


--
-- Name: price_lists price_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_pkey PRIMARY KEY (id);


--
-- Name: purchase_invoice_headers purchase_invoice_headers_invoice_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_invoice_headers
    ADD CONSTRAINT purchase_invoice_headers_invoice_number_unique UNIQUE (invoice_number);


--
-- Name: purchase_invoice_headers purchase_invoice_headers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_invoice_headers
    ADD CONSTRAINT purchase_invoice_headers_pkey PRIMARY KEY (id);


--
-- Name: purchase_invoice_lines purchase_invoice_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_invoice_lines
    ADD CONSTRAINT purchase_invoice_lines_pkey PRIMARY KEY (id);


--
-- Name: purchase_transactions purchase_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_transactions
    ADD CONSTRAINT purchase_transactions_pkey PRIMARY KEY (id);


--
-- Name: receiving_headers receiving_headers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receiving_headers
    ADD CONSTRAINT receiving_headers_pkey PRIMARY KEY (id);


--
-- Name: receiving_headers receiving_headers_receiving_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receiving_headers
    ADD CONSTRAINT receiving_headers_receiving_number_unique UNIQUE (receiving_number);


--
-- Name: receiving_lines receiving_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receiving_lines
    ADD CONSTRAINT receiving_lines_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: sales_invoice_headers sales_invoice_headers_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales_invoice_headers
    ADD CONSTRAINT sales_invoice_headers_invoice_number_key UNIQUE (invoice_number);


--
-- Name: sales_invoice_headers sales_invoice_headers_invoice_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales_invoice_headers
    ADD CONSTRAINT sales_invoice_headers_invoice_number_unique UNIQUE (invoice_number);


--
-- Name: sales_invoice_headers sales_invoice_headers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales_invoice_headers
    ADD CONSTRAINT sales_invoice_headers_pkey PRIMARY KEY (id);


--
-- Name: sales_invoice_lines sales_invoice_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales_invoice_lines
    ADD CONSTRAINT sales_invoice_lines_pkey PRIMARY KEY (id);


--
-- Name: sales_transactions sales_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales_transactions
    ADD CONSTRAINT sales_transactions_pkey PRIMARY KEY (id);


--
-- Name: service_consumables service_consumables_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_consumables
    ADD CONSTRAINT service_consumables_pkey PRIMARY KEY (id);


--
-- Name: service_prices service_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_prices
    ADD CONSTRAINT service_prices_pkey PRIMARY KEY (id);


--
-- Name: service_prices service_prices_price_list_id_service_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_prices
    ADD CONSTRAINT service_prices_price_list_id_service_id_key UNIQUE (price_list_id, service_id);


--
-- Name: services services_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_code_unique UNIQUE (code);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: store_transfers store_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_transfers
    ADD CONSTRAINT store_transfers_pkey PRIMARY KEY (id);


--
-- Name: store_transfers store_transfers_transfer_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_transfers
    ADD CONSTRAINT store_transfers_transfer_number_unique UNIQUE (transfer_number);


--
-- Name: suppliers suppliers_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_code_unique UNIQUE (code);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: template_lines template_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_lines
    ADD CONSTRAINT template_lines_pkey PRIMARY KEY (id);


--
-- Name: transfer_line_allocations transfer_line_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transfer_line_allocations
    ADD CONSTRAINT transfer_line_allocations_pkey PRIMARY KEY (id);


--
-- Name: transfer_lines transfer_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transfer_lines
    ADD CONSTRAINT transfer_lines_pkey PRIMARY KEY (id);


--
-- Name: user_departments user_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_departments
    ADD CONSTRAINT user_departments_pkey PRIMARY KEY (id);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (id);


--
-- Name: user_warehouses user_warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_warehouses
    ADD CONSTRAINT user_warehouses_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_warehouse_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_warehouse_code_unique UNIQUE (warehouse_code);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: idx_accounts_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accounts_parent ON public.accounts USING btree (parent_id);


--
-- Name: idx_accounts_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accounts_type ON public.accounts USING btree (account_type);


--
-- Name: idx_acct_map_tx_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_acct_map_tx_type ON public.account_mappings USING btree (transaction_type);


--
-- Name: idx_adm_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_adm_date ON public.admissions USING btree (admission_date);


--
-- Name: idx_adm_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_adm_number ON public.admissions USING btree (admission_number);


--
-- Name: idx_adm_patient; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_adm_patient ON public.admissions USING btree (patient_name);


--
-- Name: idx_adm_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_adm_status ON public.admissions USING btree (status);


--
-- Name: idx_audit_log_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_log_created_at ON public.audit_log USING btree (created_at);


--
-- Name: idx_audit_log_table_record; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_log_table_record ON public.audit_log USING btree (table_name, record_id);


--
-- Name: idx_barcodes_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_barcodes_item ON public.item_barcodes USING btree (item_id);


--
-- Name: idx_cashier_audit_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cashier_audit_action ON public.cashier_audit_log USING btree (action);


--
-- Name: idx_cashier_audit_performed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cashier_audit_performed ON public.cashier_audit_log USING btree (performed_at);


--
-- Name: idx_cashier_audit_shift; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cashier_audit_shift ON public.cashier_audit_log USING btree (shift_id);


--
-- Name: idx_cashier_receipts_invoice_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_cashier_receipts_invoice_unique ON public.cashier_receipts USING btree (invoice_id);


--
-- Name: idx_cashier_receipts_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cashier_receipts_number ON public.cashier_receipts USING btree (receipt_number);


--
-- Name: idx_cashier_receipts_shift; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cashier_receipts_shift ON public.cashier_receipts USING btree (shift_id);


--
-- Name: idx_cashier_refunds_invoice_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_cashier_refunds_invoice_unique ON public.cashier_refund_receipts USING btree (invoice_id);


--
-- Name: idx_cashier_refunds_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cashier_refunds_number ON public.cashier_refund_receipts USING btree (receipt_number);


--
-- Name: idx_cashier_refunds_shift; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cashier_refunds_shift ON public.cashier_refund_receipts USING btree (shift_id);


--
-- Name: idx_cashier_shifts_cashier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cashier_shifts_cashier ON public.cashier_shifts USING btree (cashier_id);


--
-- Name: idx_cashier_shifts_opened; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cashier_shifts_opened ON public.cashier_shifts USING btree (opened_at);


--
-- Name: idx_cashier_shifts_pharmacy; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cashier_shifts_pharmacy ON public.cashier_shifts USING btree (pharmacy_id);


--
-- Name: idx_cashier_shifts_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cashier_shifts_status ON public.cashier_shifts USING btree (status);


--
-- Name: idx_cost_centers_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cost_centers_parent ON public.cost_centers USING btree (parent_id);


--
-- Name: idx_doctors_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_doctors_name ON public.doctors USING btree (name);


--
-- Name: idx_drawer_passwords_gl_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_drawer_passwords_gl_account ON public.drawer_passwords USING btree (gl_account_id);


--
-- Name: idx_item_dept_prices_dept; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_item_dept_prices_dept ON public.item_department_prices USING btree (department_id);


--
-- Name: idx_item_dept_prices_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_item_dept_prices_item ON public.item_department_prices USING btree (item_id);


--
-- Name: idx_item_dept_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_item_dept_unique ON public.item_department_prices USING btree (item_id, department_id);


--
-- Name: idx_items_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_items_category ON public.items USING btree (category);


--
-- Name: idx_items_form_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_items_form_type ON public.items USING btree (form_type_id);


--
-- Name: idx_items_item_code_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_items_item_code_trgm ON public.items USING gin (item_code public.gin_trgm_ops);


--
-- Name: idx_items_name_ar; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_items_name_ar ON public.items USING btree (name_ar);


--
-- Name: idx_items_name_ar_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_items_name_ar_trgm ON public.items USING gin (name_ar public.gin_trgm_ops);


--
-- Name: idx_items_name_en_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_items_name_en_trgm ON public.items USING gin (name_en public.gin_trgm_ops);


--
-- Name: idx_journal_entries_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_journal_entries_date ON public.journal_entries USING btree (entry_date);


--
-- Name: idx_journal_entries_period; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_journal_entries_period ON public.journal_entries USING btree (period_id);


--
-- Name: idx_journal_entries_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_journal_entries_source ON public.journal_entries USING btree (source_type, source_document_id);


--
-- Name: idx_journal_entries_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_journal_entries_status ON public.journal_entries USING btree (status);


--
-- Name: idx_journal_lines_account; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_journal_lines_account ON public.journal_lines USING btree (account_id);


--
-- Name: idx_journal_lines_cost_center; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_journal_lines_cost_center ON public.journal_lines USING btree (cost_center_id);


--
-- Name: idx_journal_lines_entry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_journal_lines_entry ON public.journal_lines USING btree (journal_entry_id);


--
-- Name: idx_lot_movements_lot_txdate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lot_movements_lot_txdate ON public.inventory_lot_movements USING btree (lot_id, tx_date);


--
-- Name: idx_lots_item_expiry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lots_item_expiry ON public.inventory_lots USING btree (item_id, expiry_year, expiry_month);


--
-- Name: idx_lots_item_received; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lots_item_received ON public.inventory_lots USING btree (item_id, received_date);


--
-- Name: idx_lots_item_warehouse; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lots_item_warehouse ON public.inventory_lots USING btree (item_id, warehouse_id);


--
-- Name: idx_lots_item_warehouse_expiry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lots_item_warehouse_expiry ON public.inventory_lots USING btree (item_id, warehouse_id, expiry_year, expiry_month);


--
-- Name: idx_lots_item_warehouse_expiry_month; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lots_item_warehouse_expiry_month ON public.inventory_lots USING btree (item_id, warehouse_id, expiry_year, expiry_month);


--
-- Name: idx_pat_inv_admission; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pat_inv_admission ON public.patient_invoice_headers USING btree (admission_id);


--
-- Name: idx_pat_inv_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pat_inv_date ON public.patient_invoice_headers USING btree (invoice_date);


--
-- Name: idx_pat_inv_doctor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pat_inv_doctor ON public.patient_invoice_headers USING btree (doctor_name);


--
-- Name: idx_pat_inv_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pat_inv_number ON public.patient_invoice_headers USING btree (invoice_number);


--
-- Name: idx_pat_inv_patient; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pat_inv_patient ON public.patient_invoice_headers USING btree (patient_name);


--
-- Name: idx_pat_inv_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pat_inv_status ON public.patient_invoice_headers USING btree (status);


--
-- Name: idx_pat_line_header; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pat_line_header ON public.patient_invoice_lines USING btree (header_id);


--
-- Name: idx_pat_line_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pat_line_type ON public.patient_invoice_lines USING btree (line_type);


--
-- Name: idx_pat_pay_header; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pat_pay_header ON public.patient_invoice_payments USING btree (header_id);


--
-- Name: idx_patients_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_patients_name ON public.patients USING btree (full_name);


--
-- Name: idx_patients_national_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_patients_national_id ON public.patients USING btree (national_id);


--
-- Name: idx_patients_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_patients_phone ON public.patients USING btree (phone);


--
-- Name: idx_pharmacies_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pharmacies_code ON public.pharmacies USING btree (code);


--
-- Name: idx_pi_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pi_date ON public.purchase_invoice_headers USING btree (invoice_date);


--
-- Name: idx_pi_lines_invoice; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pi_lines_invoice ON public.purchase_invoice_lines USING btree (invoice_id);


--
-- Name: idx_pi_lines_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pi_lines_item ON public.purchase_invoice_lines USING btree (item_id);


--
-- Name: idx_pi_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pi_number ON public.purchase_invoice_headers USING btree (invoice_number);


--
-- Name: idx_pi_receiving; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pi_receiving ON public.purchase_invoice_headers USING btree (receiving_id);


--
-- Name: idx_pi_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pi_status ON public.purchase_invoice_headers USING btree (status);


--
-- Name: idx_pi_supplier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pi_supplier ON public.purchase_invoice_headers USING btree (supplier_id);


--
-- Name: idx_pli_price_list; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pli_price_list ON public.price_list_items USING btree (price_list_id);


--
-- Name: idx_pli_service; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pli_service ON public.price_list_items USING btree (service_id);


--
-- Name: idx_pli_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_pli_unique ON public.price_list_items USING btree (price_list_id, service_id);


--
-- Name: idx_purchase_tx_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_purchase_tx_date ON public.purchase_transactions USING btree (tx_date);


--
-- Name: idx_purchase_tx_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_purchase_tx_item ON public.purchase_transactions USING btree (item_id);


--
-- Name: idx_receiving_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_receiving_date ON public.receiving_headers USING btree (receive_date);


--
-- Name: idx_receiving_lines_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_receiving_lines_item ON public.receiving_lines USING btree (item_id);


--
-- Name: idx_receiving_lines_receiving; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_receiving_lines_receiving ON public.receiving_lines USING btree (receiving_id);


--
-- Name: idx_receiving_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_receiving_number ON public.receiving_headers USING btree (receiving_number);


--
-- Name: idx_receiving_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_receiving_status ON public.receiving_headers USING btree (status);


--
-- Name: idx_receiving_supplier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_receiving_supplier ON public.receiving_headers USING btree (supplier_id);


--
-- Name: idx_receiving_supplier_invoice; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_receiving_supplier_invoice ON public.receiving_headers USING btree (supplier_id, supplier_invoice_no);


--
-- Name: idx_receiving_warehouse; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_receiving_warehouse ON public.receiving_headers USING btree (warehouse_id);


--
-- Name: idx_role_perm_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_role_perm_unique ON public.role_permissions USING btree (role, permission);


--
-- Name: idx_sales_inv_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sales_inv_date ON public.sales_invoice_headers USING btree (invoice_date);


--
-- Name: idx_sales_inv_is_return; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sales_inv_is_return ON public.sales_invoice_headers USING btree (is_return);


--
-- Name: idx_sales_inv_pharmacy; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sales_inv_pharmacy ON public.sales_invoice_headers USING btree (pharmacy_id);


--
-- Name: idx_sales_inv_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sales_inv_status ON public.sales_invoice_headers USING btree (status);


--
-- Name: idx_sales_tx_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sales_tx_date ON public.sales_transactions USING btree (tx_date);


--
-- Name: idx_sales_tx_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sales_tx_item ON public.sales_transactions USING btree (item_id);


--
-- Name: idx_sc_service; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sc_service ON public.service_consumables USING btree (service_id);


--
-- Name: idx_sc_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_sc_unique ON public.service_consumables USING btree (service_id, item_id);


--
-- Name: idx_service_prices_price_list; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_service_prices_price_list ON public.service_prices USING btree (price_list_id);


--
-- Name: idx_service_prices_service; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_service_prices_service ON public.service_prices USING btree (service_id);


--
-- Name: idx_services_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_services_active ON public.services USING btree (is_active);


--
-- Name: idx_services_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_services_category ON public.services USING btree (category);


--
-- Name: idx_services_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_services_code ON public.services USING btree (code);


--
-- Name: idx_services_department; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_services_department ON public.services USING btree (department_id);


--
-- Name: idx_services_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_services_type ON public.services USING btree (service_type);


--
-- Name: idx_suppliers_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_suppliers_code ON public.suppliers USING btree (code);


--
-- Name: idx_suppliers_name_ar; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_suppliers_name_ar ON public.suppliers USING btree (name_ar);


--
-- Name: idx_transfer_allocs_line; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transfer_allocs_line ON public.transfer_line_allocations USING btree (line_id);


--
-- Name: idx_transfer_lines_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transfer_lines_item ON public.transfer_lines USING btree (item_id);


--
-- Name: idx_transfer_lines_transfer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transfer_lines_transfer ON public.transfer_lines USING btree (transfer_id);


--
-- Name: idx_transfers_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transfers_date ON public.store_transfers USING btree (transfer_date);


--
-- Name: idx_transfers_dest; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transfers_dest ON public.store_transfers USING btree (destination_warehouse_id);


--
-- Name: idx_transfers_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transfers_number ON public.store_transfers USING btree (transfer_number);


--
-- Name: idx_transfers_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_transfers_source ON public.store_transfers USING btree (source_warehouse_id);


--
-- Name: idx_user_departments_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_user_departments_unique ON public.user_departments USING btree (user_id, department_id);


--
-- Name: idx_user_perm_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_user_perm_unique ON public.user_permissions USING btree (user_id, permission);


--
-- Name: idx_user_warehouses_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_user_warehouses_unique ON public.user_warehouses USING btree (user_id, warehouse_id);


--
-- Name: idx_warehouses_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_warehouses_code ON public.warehouses USING btree (warehouse_code);


--
-- Name: idx_warehouses_pharmacy; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_warehouses_pharmacy ON public.warehouses USING btree (pharmacy_id);


--
-- Name: account_mappings account_mappings_credit_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_mappings
    ADD CONSTRAINT account_mappings_credit_account_id_fkey FOREIGN KEY (credit_account_id) REFERENCES public.accounts(id);


--
-- Name: account_mappings account_mappings_debit_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_mappings
    ADD CONSTRAINT account_mappings_debit_account_id_fkey FOREIGN KEY (debit_account_id) REFERENCES public.accounts(id);


--
-- Name: account_mappings account_mappings_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_mappings
    ADD CONSTRAINT account_mappings_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: accounts accounts_parent_id_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_parent_id_accounts_id_fk FOREIGN KEY (parent_id) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: admissions admissions_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admissions
    ADD CONSTRAINT admissions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);


--
-- Name: audit_log audit_log_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: cashier_audit_log cashier_audit_log_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cashier_audit_log
    ADD CONSTRAINT cashier_audit_log_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.cashier_shifts(id);


--
-- Name: cashier_receipts cashier_receipts_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cashier_receipts
    ADD CONSTRAINT cashier_receipts_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.sales_invoice_headers(id);


--
-- Name: cashier_receipts cashier_receipts_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cashier_receipts
    ADD CONSTRAINT cashier_receipts_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.cashier_shifts(id);


--
-- Name: cashier_refund_receipts cashier_refund_receipts_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cashier_refund_receipts
    ADD CONSTRAINT cashier_refund_receipts_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.sales_invoice_headers(id);


--
-- Name: cashier_refund_receipts cashier_refund_receipts_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cashier_refund_receipts
    ADD CONSTRAINT cashier_refund_receipts_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.cashier_shifts(id);


--
-- Name: cashier_shifts cashier_shifts_gl_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cashier_shifts
    ADD CONSTRAINT cashier_shifts_gl_account_id_fkey FOREIGN KEY (gl_account_id) REFERENCES public.accounts(id);


--
-- Name: cashier_shifts cashier_shifts_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cashier_shifts
    ADD CONSTRAINT cashier_shifts_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES public.pharmacies(id);


--
-- Name: cost_centers cost_centers_parent_id_cost_centers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_parent_id_cost_centers_id_fk FOREIGN KEY (parent_id) REFERENCES public.cost_centers(id) ON DELETE SET NULL;


--
-- Name: drawer_passwords drawer_passwords_gl_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.drawer_passwords
    ADD CONSTRAINT drawer_passwords_gl_account_id_fkey FOREIGN KEY (gl_account_id) REFERENCES public.accounts(id);


--
-- Name: fiscal_periods fiscal_periods_closed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fiscal_periods
    ADD CONSTRAINT fiscal_periods_closed_by_users_id_fk FOREIGN KEY (closed_by) REFERENCES public.users(id);


--
-- Name: inventory_lot_movements inventory_lot_movements_lot_id_inventory_lots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_lot_movements
    ADD CONSTRAINT inventory_lot_movements_lot_id_inventory_lots_id_fk FOREIGN KEY (lot_id) REFERENCES public.inventory_lots(id) ON DELETE RESTRICT;


--
-- Name: inventory_lot_movements inventory_lot_movements_warehouse_id_warehouses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_lot_movements
    ADD CONSTRAINT inventory_lot_movements_warehouse_id_warehouses_id_fk FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: inventory_lots inventory_lots_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_lots
    ADD CONSTRAINT inventory_lots_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: inventory_lots inventory_lots_warehouse_id_warehouses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_lots
    ADD CONSTRAINT inventory_lots_warehouse_id_warehouses_id_fk FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: item_barcodes item_barcodes_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_barcodes
    ADD CONSTRAINT item_barcodes_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: item_department_prices item_department_prices_department_id_departments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_department_prices
    ADD CONSTRAINT item_department_prices_department_id_departments_id_fk FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: item_department_prices item_department_prices_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_department_prices
    ADD CONSTRAINT item_department_prices_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;


--
-- Name: items items_form_type_id_item_form_types_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_form_type_id_item_form_types_id_fk FOREIGN KEY (form_type_id) REFERENCES public.item_form_types(id);


--
-- Name: journal_entries journal_entries_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: journal_entries journal_entries_period_id_fiscal_periods_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_period_id_fiscal_periods_id_fk FOREIGN KEY (period_id) REFERENCES public.fiscal_periods(id);


--
-- Name: journal_entries journal_entries_posted_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_posted_by_users_id_fk FOREIGN KEY (posted_by) REFERENCES public.users(id);


--
-- Name: journal_entries journal_entries_reversal_entry_id_journal_entries_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_reversal_entry_id_journal_entries_id_fk FOREIGN KEY (reversal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_reversed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_reversed_by_users_id_fk FOREIGN KEY (reversed_by) REFERENCES public.users(id);


--
-- Name: journal_entries journal_entries_template_id_journal_templates_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_template_id_journal_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.journal_templates(id) ON DELETE SET NULL;


--
-- Name: journal_lines journal_lines_account_id_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_account_id_accounts_id_fk FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: journal_lines journal_lines_cost_center_id_cost_centers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_cost_center_id_cost_centers_id_fk FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id);


--
-- Name: journal_lines journal_lines_journal_entry_id_journal_entries_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_journal_entry_id_journal_entries_id_fk FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;


--
-- Name: journal_templates journal_templates_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_templates
    ADD CONSTRAINT journal_templates_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: patient_invoice_headers patient_invoice_headers_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_invoice_headers
    ADD CONSTRAINT patient_invoice_headers_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: patient_invoice_headers patient_invoice_headers_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_invoice_headers
    ADD CONSTRAINT patient_invoice_headers_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: patient_invoice_lines patient_invoice_lines_header_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_invoice_lines
    ADD CONSTRAINT patient_invoice_lines_header_id_fkey FOREIGN KEY (header_id) REFERENCES public.patient_invoice_headers(id) ON DELETE CASCADE;


--
-- Name: patient_invoice_lines patient_invoice_lines_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_invoice_lines
    ADD CONSTRAINT patient_invoice_lines_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id);


--
-- Name: patient_invoice_lines patient_invoice_lines_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_invoice_lines
    ADD CONSTRAINT patient_invoice_lines_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);


--
-- Name: patient_invoice_payments patient_invoice_payments_header_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patient_invoice_payments
    ADD CONSTRAINT patient_invoice_payments_header_id_fkey FOREIGN KEY (header_id) REFERENCES public.patient_invoice_headers(id) ON DELETE CASCADE;


--
-- Name: price_adjustments_log price_adjustments_log_price_list_id_price_lists_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_adjustments_log
    ADD CONSTRAINT price_adjustments_log_price_list_id_price_lists_id_fk FOREIGN KEY (price_list_id) REFERENCES public.price_lists(id);


--
-- Name: price_list_items price_list_items_price_list_id_price_lists_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_list_items
    ADD CONSTRAINT price_list_items_price_list_id_price_lists_id_fk FOREIGN KEY (price_list_id) REFERENCES public.price_lists(id) ON DELETE CASCADE;


--
-- Name: price_list_items price_list_items_service_id_services_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_list_items
    ADD CONSTRAINT price_list_items_service_id_services_id_fk FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: price_lists price_lists_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: purchase_invoice_headers purchase_invoice_headers_receiving_id_receiving_headers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_invoice_headers
    ADD CONSTRAINT purchase_invoice_headers_receiving_id_receiving_headers_id_fk FOREIGN KEY (receiving_id) REFERENCES public.receiving_headers(id);


--
-- Name: purchase_invoice_headers purchase_invoice_headers_supplier_id_suppliers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_invoice_headers
    ADD CONSTRAINT purchase_invoice_headers_supplier_id_suppliers_id_fk FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: purchase_invoice_headers purchase_invoice_headers_warehouse_id_warehouses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_invoice_headers
    ADD CONSTRAINT purchase_invoice_headers_warehouse_id_warehouses_id_fk FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: purchase_invoice_lines purchase_invoice_lines_invoice_id_purchase_invoice_headers_id_f; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_invoice_lines
    ADD CONSTRAINT purchase_invoice_lines_invoice_id_purchase_invoice_headers_id_f FOREIGN KEY (invoice_id) REFERENCES public.purchase_invoice_headers(id) ON DELETE CASCADE;


--
-- Name: purchase_invoice_lines purchase_invoice_lines_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_invoice_lines
    ADD CONSTRAINT purchase_invoice_lines_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: purchase_transactions purchase_transactions_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.purchase_transactions
    ADD CONSTRAINT purchase_transactions_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: receiving_headers receiving_headers_supplier_id_suppliers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receiving_headers
    ADD CONSTRAINT receiving_headers_supplier_id_suppliers_id_fk FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: receiving_headers receiving_headers_warehouse_id_warehouses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receiving_headers
    ADD CONSTRAINT receiving_headers_warehouse_id_warehouses_id_fk FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: receiving_lines receiving_lines_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receiving_lines
    ADD CONSTRAINT receiving_lines_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: receiving_lines receiving_lines_receiving_id_receiving_headers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.receiving_lines
    ADD CONSTRAINT receiving_lines_receiving_id_receiving_headers_id_fk FOREIGN KEY (receiving_id) REFERENCES public.receiving_headers(id) ON DELETE CASCADE;


--
-- Name: sales_invoice_headers sales_invoice_headers_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales_invoice_headers
    ADD CONSTRAINT sales_invoice_headers_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES public.pharmacies(id);


--
-- Name: sales_invoice_headers sales_invoice_headers_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales_invoice_headers
    ADD CONSTRAINT sales_invoice_headers_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: sales_invoice_lines sales_invoice_lines_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales_invoice_lines
    ADD CONSTRAINT sales_invoice_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.sales_invoice_headers(id) ON DELETE CASCADE;


--
-- Name: sales_invoice_lines sales_invoice_lines_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales_invoice_lines
    ADD CONSTRAINT sales_invoice_lines_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: sales_transactions sales_transactions_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales_transactions
    ADD CONSTRAINT sales_transactions_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: service_consumables service_consumables_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_consumables
    ADD CONSTRAINT service_consumables_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id);


--
-- Name: service_consumables service_consumables_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_consumables
    ADD CONSTRAINT service_consumables_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: service_prices service_prices_price_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_prices
    ADD CONSTRAINT service_prices_price_list_id_fkey FOREIGN KEY (price_list_id) REFERENCES public.price_lists(id) ON DELETE CASCADE;


--
-- Name: service_prices service_prices_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_prices
    ADD CONSTRAINT service_prices_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: services services_cost_center_id_cost_centers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_cost_center_id_cost_centers_id_fk FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id);


--
-- Name: services services_default_warehouse_id_warehouses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_default_warehouse_id_warehouses_id_fk FOREIGN KEY (default_warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: services services_department_id_departments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_department_id_departments_id_fk FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: services services_revenue_account_id_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_revenue_account_id_accounts_id_fk FOREIGN KEY (revenue_account_id) REFERENCES public.accounts(id);


--
-- Name: store_transfers store_transfers_destination_warehouse_id_warehouses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_transfers
    ADD CONSTRAINT store_transfers_destination_warehouse_id_warehouses_id_fk FOREIGN KEY (destination_warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: store_transfers store_transfers_source_warehouse_id_warehouses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.store_transfers
    ADD CONSTRAINT store_transfers_source_warehouse_id_warehouses_id_fk FOREIGN KEY (source_warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: template_lines template_lines_account_id_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_lines
    ADD CONSTRAINT template_lines_account_id_accounts_id_fk FOREIGN KEY (account_id) REFERENCES public.accounts(id);


--
-- Name: template_lines template_lines_cost_center_id_cost_centers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_lines
    ADD CONSTRAINT template_lines_cost_center_id_cost_centers_id_fk FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id);


--
-- Name: template_lines template_lines_template_id_journal_templates_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.template_lines
    ADD CONSTRAINT template_lines_template_id_journal_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.journal_templates(id) ON DELETE CASCADE;


--
-- Name: transfer_line_allocations transfer_line_allocations_destination_lot_id_inventory_lots_id_; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transfer_line_allocations
    ADD CONSTRAINT transfer_line_allocations_destination_lot_id_inventory_lots_id_ FOREIGN KEY (destination_lot_id) REFERENCES public.inventory_lots(id);


--
-- Name: transfer_line_allocations transfer_line_allocations_line_id_transfer_lines_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transfer_line_allocations
    ADD CONSTRAINT transfer_line_allocations_line_id_transfer_lines_id_fk FOREIGN KEY (line_id) REFERENCES public.transfer_lines(id) ON DELETE CASCADE;


--
-- Name: transfer_line_allocations transfer_line_allocations_source_lot_id_inventory_lots_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transfer_line_allocations
    ADD CONSTRAINT transfer_line_allocations_source_lot_id_inventory_lots_id_fk FOREIGN KEY (source_lot_id) REFERENCES public.inventory_lots(id);


--
-- Name: transfer_lines transfer_lines_item_id_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transfer_lines
    ADD CONSTRAINT transfer_lines_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;


--
-- Name: transfer_lines transfer_lines_transfer_id_store_transfers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transfer_lines
    ADD CONSTRAINT transfer_lines_transfer_id_store_transfers_id_fk FOREIGN KEY (transfer_id) REFERENCES public.store_transfers(id) ON DELETE CASCADE;


--
-- Name: user_departments user_departments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_departments
    ADD CONSTRAINT user_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: user_departments user_departments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_departments
    ADD CONSTRAINT user_departments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_warehouses user_warehouses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_warehouses
    ADD CONSTRAINT user_warehouses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_warehouses user_warehouses_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_warehouses
    ADD CONSTRAINT user_warehouses_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;


--
-- Name: warehouses warehouses_department_id_departments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_department_id_departments_id_fk FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: warehouses warehouses_gl_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_gl_account_id_fkey FOREIGN KEY (gl_account_id) REFERENCES public.accounts(id);


--
-- Name: warehouses warehouses_pharmacy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pharmacy_id_fkey FOREIGN KEY (pharmacy_id) REFERENCES public.pharmacies(id);


--
-- PostgreSQL database dump complete
--

\unrestrict bK7z2YWJ0NiMYJuxJtHx1NZYVrJeGtTeXCvZhwxmPsMrLB60hp4BjBpZRgUFfNM

