ALTER TABLE "documents" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "delete_reason" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "delete_reason" text;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- A deleted sale never changes again; deleting sets deleted_at/by/reason once.
CREATE OR REPLACE FUNCTION om_sales_deleted_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'om_integrity: sale % was deleted and cannot be changed', OLD.sale_number USING ERRCODE = '23001';
  END IF;
  IF NEW.deleted_at IS NOT NULL AND (NEW.deleted_by IS NULL OR NEW.delete_reason IS NULL) THEN
    RAISE EXCEPTION 'om_integrity: deleting a sale requires who and why' USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER sales_deleted_guard BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION om_sales_deleted_guard();--> statement-breakpoint
-- Lines of a deleted sale are frozen too.
CREATE OR REPLACE FUNCTION om_sale_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  s text;
  gone timestamptz;
BEGIN
  SELECT status, deleted_at INTO s, gone FROM sales WHERE id = COALESCE(NEW.sale_id, OLD.sale_id);
  IF gone IS NOT NULL THEN
    RAISE EXCEPTION 'om_integrity: lines of a deleted sale cannot be changed' USING ERRCODE = '23001';
  END IF;
  IF s IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'om_integrity: lines of a % sale cannot be changed', s USING ERRCODE = '23001';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.sale_id <> OLD.sale_id THEN
    RAISE EXCEPTION 'om_integrity: line cannot move between sales' USING ERRCODE = '23001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
-- Documents: deletion (once, with who and why) joins cancellation, sharing and print counters as the only changes.
CREATE OR REPLACE FUNCTION om_documents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT om_only_changed(to_jsonb(OLD), to_jsonb(NEW),
       ARRAY['status','cancelled_at','cancelled_by','cancel_reason','share_token','print_count','last_printed_at','deleted_at','deleted_by','delete_reason']) THEN
    RAISE EXCEPTION 'om_integrity: issued document % cannot be altered; use cancellation or a credit note', OLD.doc_number
      USING ERRCODE = '23001';
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'om_integrity: document % was deleted and cannot be changed', OLD.doc_number USING ERRCODE = '23001';
  END IF;
  IF NEW.deleted_at IS NOT NULL AND (NEW.deleted_by IS NULL OR NEW.delete_reason IS NULL) THEN
    RAISE EXCEPTION 'om_integrity: deleting a document requires who and why' USING ERRCODE = '23001';
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
END $$;
