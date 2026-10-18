-- =====================================================================
-- OM Enterprise — data integrity & record-retention rules
--
-- These triggers make the database itself refuse silent deletion or
-- alteration of financial history, independent of application code.
-- Corrections must go through explicit workflows (cancellation, credit
-- notes, refunds, reversals) which are recorded and audited.
-- =====================================================================

-- Human-friendly running numbers
CREATE SEQUENCE IF NOT EXISTS sale_number_seq START 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS website_order_seq START 1;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION om_only_changed(old_row jsonb, new_row jsonb, allowed text[])
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT (old_row - allowed) = (new_row - allowed)
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION om_block_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'om_integrity: deleting rows from % is not permitted (record retention)', TG_TABLE_NAME
    USING ERRCODE = '23001';
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION om_block_modify() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'om_integrity: % is append-only (% not permitted)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '23001';
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION om_block_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'om_integrity: TRUNCATE on % is not permitted', TG_TABLE_NAME
    USING ERRCODE = '23001';
END $$;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Append-only ledgers
-- ---------------------------------------------------------------------
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION om_block_modify();--> statement-breakpoint
CREATE TRIGGER variant_costs_append_only BEFORE UPDATE OR DELETE ON variant_costs
  FOR EACH ROW EXECUTE FUNCTION om_block_modify();--> statement-breakpoint
CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION om_block_modify();--> statement-breakpoint
CREATE TRIGGER sale_returns_append_only BEFORE UPDATE OR DELETE ON sale_returns
  FOR EACH ROW EXECUTE FUNCTION om_block_modify();--> statement-breakpoint
CREATE TRIGGER sale_return_lines_append_only BEFORE UPDATE OR DELETE ON sale_return_lines
  FOR EACH ROW EXECUTE FUNCTION om_block_modify();--> statement-breakpoint

-- No deletes on core financial / master records
CREATE TRIGGER sales_no_delete BEFORE DELETE ON sales
  FOR EACH ROW EXECUTE FUNCTION om_block_delete();--> statement-breakpoint
CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION om_block_delete();--> statement-breakpoint
CREATE TRIGGER documents_no_delete BEFORE DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION om_block_delete();--> statement-breakpoint
CREATE TRIGGER variant_prices_no_delete BEFORE DELETE ON variant_prices
  FOR EACH ROW EXECUTE FUNCTION om_block_delete();--> statement-breakpoint
CREATE TRIGGER approval_requests_no_delete BEFORE DELETE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION om_block_delete();--> statement-breakpoint
CREATE TRIGGER payment_events_no_delete BEFORE DELETE ON payment_events
  FOR EACH ROW EXECUTE FUNCTION om_block_delete();--> statement-breakpoint
CREATE TRIGGER document_sequences_no_delete BEFORE DELETE ON document_sequences
  FOR EACH ROW EXECUTE FUNCTION om_block_delete();--> statement-breakpoint
CREATE TRIGGER users_no_delete BEFORE DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION om_block_delete();--> statement-breakpoint

-- No TRUNCATE on financial tables
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION om_block_truncate();--> statement-breakpoint
CREATE TRIGGER sales_no_truncate BEFORE TRUNCATE ON sales
  FOR EACH STATEMENT EXECUTE FUNCTION om_block_truncate();--> statement-breakpoint
CREATE TRIGGER sale_lines_no_truncate BEFORE TRUNCATE ON sale_lines
  FOR EACH STATEMENT EXECUTE FUNCTION om_block_truncate();--> statement-breakpoint
CREATE TRIGGER payments_no_truncate BEFORE TRUNCATE ON payments
  FOR EACH STATEMENT EXECUTE FUNCTION om_block_truncate();--> statement-breakpoint
CREATE TRIGGER documents_no_truncate BEFORE TRUNCATE ON documents
  FOR EACH STATEMENT EXECUTE FUNCTION om_block_truncate();--> statement-breakpoint
CREATE TRIGGER variant_prices_no_truncate BEFORE TRUNCATE ON variant_prices
  FOR EACH STATEMENT EXECUTE FUNCTION om_block_truncate();--> statement-breakpoint
CREATE TRIGGER variant_costs_no_truncate BEFORE TRUNCATE ON variant_costs
  FOR EACH STATEMENT EXECUTE FUNCTION om_block_truncate();--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Price versions: immutable once decided. Pending → approved/rejected/cancelled.
-- An approved *future-dated* price may be cancelled before it takes effect.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION om_variant_prices_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT om_only_changed(to_jsonb(OLD), to_jsonb(NEW),
       ARRAY['status','decided_by','decided_at','decision_note']) THEN
    RAISE EXCEPTION 'om_integrity: price versions are immutable; create a new version instead'
      USING ERRCODE = '23001';
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'pending' AND NEW.status IN ('approved','rejected','cancelled') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'approved' AND NEW.status = 'cancelled' AND OLD.effective_from > now() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'om_integrity: price version status % → % not permitted', OLD.status, NEW.status
    USING ERRCODE = '23001';
END $$;--> statement-breakpoint
CREATE TRIGGER variant_prices_guard BEFORE UPDATE ON variant_prices
  FOR EACH ROW EXECUTE FUNCTION om_variant_prices_guard();--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Approval requests: details frozen; only a pending request can be decided.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION om_approvals_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT om_only_changed(to_jsonb(OLD), to_jsonb(NEW),
       ARRAY['status','decided_by','decided_at','decision_note','decision_channel']) THEN
    RAISE EXCEPTION 'om_integrity: approval request details are immutable' USING ERRCODE = '23001';
  END IF;
  IF OLD.status <> NEW.status AND OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'om_integrity: approval request already %', OLD.status USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER approval_requests_guard BEFORE UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION om_approvals_guard();--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Sales: once finalised, the agreed pricing snapshot is frozen.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION om_sales_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  frozen text[] := ARRAY[
    'id','sale_number','is_training','price_list_id','tax_mode','place_of_supply_state_code',
    'cart_discount_type','cart_discount_value','cart_discount_reason','round_off_mode',
    'list_total','subtotal_gross','line_discount_total','cart_discount_total','taxable_total',
    'cgst_total','sgst_total','igst_total','cess_total','charges_total','round_off','grand_total',
    'effective_discount_percent','cost_known','cost_total','gross_profit','cart_fingerprint',
    'created_by','created_at','source'];
  old_j jsonb := to_jsonb(OLD);
  new_j jsonb := to_jsonb(NEW);
  k text;
BEGIN
  -- Identity never changes
  IF NEW.id <> OLD.id OR NEW.sale_number <> OLD.sale_number OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'om_integrity: sale identity is immutable' USING ERRCODE = '23001';
  END IF;

  IF OLD.status = 'draft' THEN
    IF NEW.status NOT IN ('draft','finalized','cancelled') THEN
      RAISE EXCEPTION 'om_integrity: draft sale cannot move to %', NEW.status USING ERRCODE = '23001';
    END IF;
    RETURN NEW;
  END IF;

  -- Not a draft: pricing snapshot is frozen.
  FOREACH k IN ARRAY frozen LOOP
    IF (old_j -> k) IS DISTINCT FROM (new_j -> k) THEN
      RAISE EXCEPTION 'om_integrity: sale % is %; field % is frozen', OLD.sale_number, OLD.status, k
        USING ERRCODE = '23001';
    END IF;
  END LOOP;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'finalized' AND NEW.status = 'draft' THEN
    IF OLD.amount_paid > 0 THEN
      RAISE EXCEPTION 'om_integrity: cannot reopen a sale that has received payments' USING ERRCODE = '23001';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'finalized' AND NEW.status = 'completed' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('finalized','completed') AND NEW.status = 'cancelled' THEN
    IF NEW.amount_paid - NEW.amount_refunded <> 0 THEN
      RAISE EXCEPTION 'om_integrity: refund all payments before cancelling a sale' USING ERRCODE = '23001';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'om_integrity: sale status % → % not permitted', OLD.status, NEW.status
    USING ERRCODE = '23001';
END $$;--> statement-breakpoint
CREATE TRIGGER sales_guard BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION om_sales_guard();--> statement-breakpoint

-- Sale lines can only change while the parent sale is a draft.
CREATE OR REPLACE FUNCTION om_sale_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  s text;
BEGIN
  SELECT status INTO s FROM sales WHERE id = COALESCE(NEW.sale_id, OLD.sale_id);
  IF s IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'om_integrity: lines of a % sale cannot be changed', s USING ERRCODE = '23001';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.sale_id <> OLD.sale_id THEN
    RAISE EXCEPTION 'om_integrity: line cannot move between sales' USING ERRCODE = '23001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER sale_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON sale_lines
  FOR EACH ROW EXECUTE FUNCTION om_sale_lines_guard();--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Payments: amount/method/provider/sale are fixed at creation.
-- Pending/initiated may resolve once. Successful may only be reversed.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION om_payments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sale_id <> OLD.sale_id OR NEW.amount <> OLD.amount OR NEW.direction <> OLD.direction
     OR NEW.method <> OLD.method OR NEW.provider <> OLD.provider
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'om_integrity: payment amount/method/sale are immutable' USING ERRCODE = '23001';
  END IF;

  IF OLD.status IN ('pending','initiated') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'successful' THEN
    IF NEW.status = 'successful' AND om_only_changed(to_jsonb(OLD), to_jsonb(NEW),
         ARRAY['updated_at','credit_note_document_id']) THEN
      RETURN NEW;
    END IF;
    IF NEW.status = 'reversed' AND NEW.reversed_by IS NOT NULL AND NEW.reversal_reason IS NOT NULL
       AND om_only_changed(to_jsonb(OLD), to_jsonb(NEW),
         ARRAY['status','reversed_by','reversed_at','reversal_reason','updated_at']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'om_integrity: a successful payment can only be reversed (with reason)'
      USING ERRCODE = '23001';
  END IF;

  -- failed / expired / cancelled / reversed are terminal
  IF om_only_changed(to_jsonb(OLD), to_jsonb(NEW), ARRAY['updated_at']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'om_integrity: payment in terminal status % cannot change', OLD.status
    USING ERRCODE = '23001';
END $$;--> statement-breakpoint
CREATE TRIGGER payments_guard BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION om_payments_guard();--> statement-breakpoint

-- Webhook inbox: payload is evidence; only processing columns may change.
CREATE OR REPLACE FUNCTION om_payment_events_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT om_only_changed(to_jsonb(OLD), to_jsonb(NEW), ARRAY['processed_at','result','payment_id']) THEN
    RAISE EXCEPTION 'om_integrity: payment event payload is immutable' USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER payment_events_guard BEFORE UPDATE ON payment_events
  FOR EACH ROW EXECUTE FUNCTION om_payment_events_guard();--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Documents: number, snapshot and totals are permanent.
-- Only cancellation (once, with reason), sharing and print counters change.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION om_documents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT om_only_changed(to_jsonb(OLD), to_jsonb(NEW),
       ARRAY['status','cancelled_at','cancelled_by','cancel_reason','share_token','print_count','last_printed_at']) THEN
    RAISE EXCEPTION 'om_integrity: issued document % cannot be altered; use cancellation or a credit note', OLD.doc_number
      USING ERRCODE = '23001';
  END IF;
  IF OLD.status = 'cancelled' AND (NEW.status <> 'cancelled'
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
       OR NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason) THEN
    RAISE EXCEPTION 'om_integrity: cancelled document % cannot be reinstated or edited', OLD.doc_number
      USING ERRCODE = '23001';
  END IF;
  IF OLD.status = 'issued' AND NEW.status = 'cancelled'
     AND (NEW.cancelled_by IS NULL OR NEW.cancel_reason IS NULL OR NEW.cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'om_integrity: cancellation requires who, when and why' USING ERRCODE = '23001';
  END IF;
  IF NEW.print_count < OLD.print_count THEN
    RAISE EXCEPTION 'om_integrity: print counter cannot decrease' USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER documents_guard BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION om_documents_guard();--> statement-breakpoint

-- Document numbering only moves forward (no reuse of numbers).
CREATE OR REPLACE FUNCTION om_doc_seq_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.series_key <> OLD.series_key OR NEW.financial_year <> OLD.financial_year
     OR NEW.next_seq <= OLD.next_seq THEN
    RAISE EXCEPTION 'om_integrity: document sequences can only increase' USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER document_sequences_guard BEFORE UPDATE ON document_sequences
  FOR EACH ROW EXECUTE FUNCTION om_doc_seq_guard();--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Lock down direct table access for any non-owner role.
-- The application connects as the table owner and enforces authorization
-- in server code. On Supabase this prevents the auto-generated REST API
-- (anon / authenticated roles) from reading or writing any table.
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
