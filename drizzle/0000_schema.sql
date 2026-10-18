CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"sale_id" uuid,
	"price_version_id" uuid,
	"cart_fingerprint" text,
	"details" jsonb NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"decision_channel" text,
	CONSTRAINT "approvals_type" CHECK ("approval_requests"."type" in ('sale_discount','price_change')),
	CONSTRAINT "approvals_status" CHECK ("approval_requests"."status" in ('pending','approved','rejected','cancelled','superseded'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"summary" text NOT NULL,
	"data" jsonb,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"manufacturer" text,
	"description" text,
	"website" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_name_unique" UNIQUE("name"),
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"target_margin_percent" numeric(5, 2),
	"min_margin_percent" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"mobile" text,
	"email" text,
	"business_name" text,
	"gstin" text,
	"billing_address" text,
	"city" text,
	"state_code" text,
	"pincode" text,
	"customer_type" text DEFAULT 'retail' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_type" CHECK ("customers"."customer_type" in ('retail','contractor','business'))
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"series_key" text NOT NULL,
	"financial_year" text NOT NULL,
	"next_seq" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "document_sequences_series_key_financial_year_pk" PRIMARY KEY("series_key","financial_year")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"series_key" text NOT NULL,
	"financial_year" text NOT NULL,
	"seq" integer NOT NULL,
	"doc_number" text NOT NULL,
	"is_training" boolean DEFAULT false NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" uuid NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"taxable_total" numeric(14, 2) NOT NULL,
	"tax_total" numeric(14, 2) NOT NULL,
	"grand_total" numeric(14, 2) NOT NULL,
	"original_document_id" uuid,
	"valid_until" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"share_token" text,
	"print_count" integer DEFAULT 0 NOT NULL,
	"last_printed_at" timestamp with time zone,
	CONSTRAINT "documents_doc_number_unique" UNIQUE("doc_number"),
	CONSTRAINT "documents_share_token_unique" UNIQUE("share_token"),
	CONSTRAINT "documents_type" CHECK ("documents"."doc_type" in ('quotation','tax_invoice','bill_of_supply','cash_memo','credit_note')),
	CONSTRAINT "documents_status" CHECK ("documents"."status" in ('issued','cancelled')),
	CONSTRAINT "documents_number_len" CHECK (char_length("documents"."doc_number") <= 16 and "documents"."doc_number" ~ '^[A-Za-z0-9/-]+$')
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"signature_valid" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"result" text,
	"payment_id" uuid
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"direction" text DEFAULT 'in' NOT NULL,
	"method" text NOT NULL,
	"provider" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" text NOT NULL,
	"reference" text,
	"provider_order_id" text,
	"provider_payment_id" text,
	"qr_payload" text,
	"expires_at" timestamp with time zone,
	"tendered_amount" numeric(14, 2),
	"verification_method" text,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"verification_note" text,
	"received_at" timestamp with time zone,
	"failure_reason" text,
	"refund_of_payment_id" uuid,
	"credit_note_document_id" uuid,
	"reversed_by" uuid,
	"reversed_at" timestamp with time zone,
	"reversal_reason" text,
	"provider_data" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_direction" CHECK ("payments"."direction" in ('in','refund')),
	CONSTRAINT "payments_method" CHECK ("payments"."method" in ('upi','cash','card','bank_transfer','cheque','other')),
	CONSTRAINT "payments_status" CHECK ("payments"."status" in ('pending','initiated','successful','failed','expired','cancelled','reversed')),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_success_verified" CHECK ("payments"."status" <> 'successful' or ("payments"."verification_method" is not null and "payments"."verified_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_lists_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"upload_id" uuid,
	"url" text NOT NULL,
	"alt" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"name" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unit_code" text NOT NULL,
	"tax_class_id" uuid,
	"discount_eligible" boolean,
	"target_margin_percent" numeric(5, 2),
	"min_margin_percent" numeric(5, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"reorder_level" numeric(14, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variants_sku_format" CHECK ("product_variants"."sku" ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{1,39}$')
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"brand_id" uuid,
	"category_id" uuid NOT NULL,
	"manufacturer" text,
	"model" text,
	"description" text,
	"specifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variant_attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warranty_info" text,
	"hsn_code" text,
	"tax_class_id" uuid,
	"unit_code" text NOT NULL,
	"discount_eligible" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"review_status" text DEFAULT 'draft' NOT NULL,
	"source_info" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_review_status" CHECK ("products"."review_status" in ('draft','pending_review','approved')),
	CONSTRAINT "products_hsn_format" CHECK ("products"."hsn_code" is null or "products"."hsn_code" ~ '^[0-9]{4,8}$')
);
--> statement-breakpoint
CREATE TABLE "purchase_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 4) NOT NULL,
	"tax_rate" numeric(6, 3) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"supplier_bill_no" text,
	"bill_date" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"default_discount_limit_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"default_approval_limit_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"line_type" text DEFAULT 'item' NOT NULL,
	"variant_id" uuid,
	"sku" text,
	"product_name" text NOT NULL,
	"variant_name" text,
	"brand_name" text,
	"hsn_code" text,
	"unit_code" text NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"price_list_unit_price" numeric(14, 2) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"price_includes_tax" boolean NOT NULL,
	"price_version_id" uuid,
	"price_source" text NOT NULL,
	"override_reason" text,
	"discount_eligible" boolean DEFAULT true NOT NULL,
	"line_discount_type" text,
	"line_discount_value" numeric(14, 2),
	"line_discount_reason" text,
	"gross_amount" numeric(14, 2) NOT NULL,
	"line_discount_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cart_discount_share" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(14, 2) NOT NULL,
	"gst_rate" numeric(6, 3) NOT NULL,
	"cess_rate" numeric(6, 3) DEFAULT '0' NOT NULL,
	"taxable_value" numeric(14, 2) NOT NULL,
	"cgst_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cess_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"unit_cost" numeric(14, 4),
	"cost_version_id" uuid,
	"cost_total" numeric(14, 2),
	"gross_profit" numeric(14, 2),
	"below_cost" boolean DEFAULT false NOT NULL,
	"below_margin_floor" boolean DEFAULT false NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_lines_type" CHECK ("sale_lines"."line_type" in ('item','charge')),
	CONSTRAINT "sale_lines_qty_positive" CHECK ("sale_lines"."quantity" > 0),
	CONSTRAINT "sale_lines_item_has_variant" CHECK ("sale_lines"."line_type" = 'charge' or "sale_lines"."variant_id" is not null),
	CONSTRAINT "sale_lines_price_source" CHECK ("sale_lines"."price_source" in ('price_list','quantity_tier','quotation','override','manual_charge'))
);
--> statement-breakpoint
CREATE TABLE "sale_return_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_id" uuid NOT NULL,
	"sale_line_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"taxable_value" numeric(14, 2) NOT NULL,
	"cgst_amount" numeric(14, 2) NOT NULL,
	"sgst_amount" numeric(14, 2) NOT NULL,
	"igst_amount" numeric(14, 2) NOT NULL,
	"cess_amount" numeric(14, 2) NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"cost_total" numeric(14, 2)
);
--> statement-breakpoint
CREATE TABLE "sale_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"credit_note_document_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"taxable_total" numeric(14, 2) NOT NULL,
	"tax_total" numeric(14, 2) NOT NULL,
	"grand_total" numeric(14, 2) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"approval_status" text DEFAULT 'not_required' NOT NULL,
	"is_training" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'pos' NOT NULL,
	"website_order_id" uuid,
	"price_list_id" uuid NOT NULL,
	"customer_id" uuid,
	"tax_mode" text DEFAULT 'intra' NOT NULL,
	"place_of_supply_state_code" text NOT NULL,
	"cart_discount_type" text,
	"cart_discount_value" numeric(14, 2),
	"cart_discount_reason" text,
	"round_off_mode" text DEFAULT 'nearest_rupee' NOT NULL,
	"list_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"subtotal_gross" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_discount_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cart_discount_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"taxable_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cgst_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sgst_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"igst_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cess_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"charges_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"round_off" numeric(14, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"effective_discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"cost_known" boolean DEFAULT false NOT NULL,
	"cost_total" numeric(14, 2),
	"gross_profit" numeric(14, 2),
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount_refunded" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cart_fingerprint" text,
	"approval_request_id" uuid,
	"quotation_document_id" uuid,
	"quotation_valid_until" timestamp with time zone,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalized_by" uuid,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	CONSTRAINT "sales_sale_number_unique" UNIQUE("sale_number"),
	CONSTRAINT "sales_status" CHECK ("sales"."status" in ('draft','finalized','completed','cancelled')),
	CONSTRAINT "sales_payment_status" CHECK ("sales"."payment_status" in ('unpaid','partially_paid','paid','partially_refunded','refunded')),
	CONSTRAINT "sales_approval_status" CHECK ("sales"."approval_status" in ('not_required','required','pending','approved','rejected')),
	CONSTRAINT "sales_tax_mode" CHECK ("sales"."tax_mode" in ('intra','inter','none')),
	CONSTRAINT "sales_source" CHECK ("sales"."source" in ('pos','website_order')),
	CONSTRAINT "sales_amounts_nonneg" CHECK ("sales"."grand_total" >= 0 and "sales"."amount_paid" >= 0 and "sales"."amount_refunded" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"section" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "stock_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "stock_locations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity_change" numeric(14, 3) NOT NULL,
	"movement_type" text NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"unit_cost" numeric(14, 4),
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_mov_type" CHECK ("stock_movements"."movement_type" in ('opening','purchase_receipt','sale','customer_return','supplier_return','damage','adjustment','transfer_in','transfer_out'))
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"gstin" text,
	"mobile" text,
	"email" text,
	"address" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "tax_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"gst_rate" numeric(6, 3) NOT NULL,
	"cess_rate" numeric(6, 3) DEFAULT '0' NOT NULL,
	"is_exempt" boolean DEFAULT false NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_classes_name_unique" UNIQUE("name"),
	CONSTRAINT "tax_rate_range" CHECK ("tax_classes"."gst_rate" >= 0 and "tax_classes"."gst_rate" <= 100 and "tax_classes"."cess_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "units" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"uqc" text DEFAULT 'OTH' NOT NULL,
	"decimals" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"purpose" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "user_permission_overrides" (
	"user_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"effect" text NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_permission_overrides_user_id_permission_pk" PRIMARY KEY("user_id","permission"),
	CONSTRAINT "upo_effect" CHECK ("user_permission_overrides"."effect" in ('grant','deny'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"mobile" text,
	"email" text,
	"password_hash" text NOT NULL,
	"role_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"discount_limit_percent" numeric(5, 2),
	"approval_limit_percent" numeric(5, 2),
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_format" CHECK ("users"."username" ~ '^[A-Za-z0-9._-]{3,40}$')
);
--> statement-breakpoint
CREATE TABLE "variant_compatibility" (
	"variant_a" uuid NOT NULL,
	"variant_b" uuid NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variant_compatibility_variant_a_variant_b_pk" PRIMARY KEY("variant_a","variant_b"),
	CONSTRAINT "compat_ordered" CHECK ("variant_compatibility"."variant_a" < "variant_compatibility"."variant_b")
);
--> statement-breakpoint
CREATE TABLE "variant_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"purchase_cost" numeric(14, 4) NOT NULL,
	"purchase_tax_rate" numeric(6, 3) DEFAULT '0' NOT NULL,
	"freight" numeric(14, 4) DEFAULT '0' NOT NULL,
	"handling" numeric(14, 4) DEFAULT '0' NOT NULL,
	"other_costs" numeric(14, 4) DEFAULT '0' NOT NULL,
	"itc_policy" text NOT NULL,
	"landed_cost" numeric(14, 4) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"supplier_id" uuid,
	"source_ref" text,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vc_itc" CHECK ("variant_costs"."itc_policy" in ('recoverable','non_recoverable')),
	CONSTRAINT "vc_nonneg" CHECK ("variant_costs"."purchase_cost" >= 0 and "variant_costs"."freight" >= 0 and "variant_costs"."handling" >= 0 and "variant_costs"."other_costs" >= 0 and "variant_costs"."landed_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "variant_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"price_includes_tax" boolean NOT NULL,
	"mrp" numeric(14, 2),
	"tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"reason" text NOT NULL,
	"previous_version_id" uuid,
	"previous_price" numeric(14, 2),
	"landed_cost_snapshot" numeric(14, 4),
	"margin_percent_snapshot" numeric(8, 2),
	"previous_margin_percent" numeric(8, 2),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	CONSTRAINT "vp_status" CHECK ("variant_prices"."status" in ('pending','approved','rejected','cancelled')),
	CONSTRAINT "vp_price_nonneg" CHECK ("variant_prices"."price" >= 0 and ("variant_prices"."mrp" is null or "variant_prices"."mrp" >= 0))
);
--> statement-breakpoint
CREATE TABLE "variant_suppliers" (
	"variant_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"supplier_sku" text,
	"is_preferred" boolean DEFAULT false NOT NULL,
	CONSTRAINT "variant_suppliers_variant_id_supplier_id_pk" PRIMARY KEY("variant_id","supplier_id")
);
--> statement-breakpoint
CREATE TABLE "variant_unit_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"unit_code" text NOT NULL,
	"factor" numeric(14, 6) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vuc_factor_positive" CHECK ("variant_unit_conversions"."factor" > 0)
);
--> statement-breakpoint
CREATE TABLE "website_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"variant_name" text,
	"sku" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"indicative_unit_price" numeric(14, 2),
	"price_includes_tax" boolean
);
--> statement-breakpoint
CREATE TABLE "website_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"kind" text NOT NULL,
	"customer_name" text NOT NULL,
	"mobile" text NOT NULL,
	"email" text,
	"city" text,
	"address" text,
	"message" text,
	"preferred_contact" text,
	"status" text DEFAULT 'new' NOT NULL,
	"indicative_total" numeric(14, 2),
	"converted_sale_id" uuid,
	"handled_by" uuid,
	"staff_notes" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "website_orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "website_orders_kind" CHECK ("website_orders"."kind" in ('enquiry','order_request')),
	CONSTRAINT "website_orders_status" CHECK ("website_orders"."status" in ('new','contacted','quoted','converted','closed','spam'))
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_price_version_id_variant_prices_id_fk" FOREIGN KEY ("price_version_id") REFERENCES "public"."variant_prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_unit_code_units_code_fk" FOREIGN KEY ("unit_code") REFERENCES "public"."units"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_tax_class_id_tax_classes_id_fk" FOREIGN KEY ("tax_class_id") REFERENCES "public"."tax_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tax_class_id_tax_classes_id_fk" FOREIGN KEY ("tax_class_id") REFERENCES "public"."tax_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_unit_code_units_code_fk" FOREIGN KEY ("unit_code") REFERENCES "public"."units"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_lines" ADD CONSTRAINT "sale_return_lines_return_id_sale_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."sale_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_lines" ADD CONSTRAINT "sale_return_lines_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_credit_note_document_id_documents_id_fk" FOREIGN KEY ("credit_note_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_compatibility" ADD CONSTRAINT "variant_compatibility_variant_a_product_variants_id_fk" FOREIGN KEY ("variant_a") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_compatibility" ADD CONSTRAINT "variant_compatibility_variant_b_product_variants_id_fk" FOREIGN KEY ("variant_b") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_compatibility" ADD CONSTRAINT "variant_compatibility_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_costs" ADD CONSTRAINT "variant_costs_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_costs" ADD CONSTRAINT "variant_costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_prices" ADD CONSTRAINT "variant_prices_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_prices" ADD CONSTRAINT "variant_prices_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_prices" ADD CONSTRAINT "variant_prices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_prices" ADD CONSTRAINT "variant_prices_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_suppliers" ADD CONSTRAINT "variant_suppliers_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_suppliers" ADD CONSTRAINT "variant_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_unit_conversions" ADD CONSTRAINT "variant_unit_conversions_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_unit_conversions" ADD CONSTRAINT "variant_unit_conversions_unit_code_units_code_fk" FOREIGN KEY ("unit_code") REFERENCES "public"."units"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_unit_conversions" ADD CONSTRAINT "variant_unit_conversions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_order_lines" ADD CONSTRAINT "website_order_lines_order_id_website_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."website_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_order_lines" ADD CONSTRAINT "website_order_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_orders" ADD CONSTRAINT "website_orders_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approval_requests" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "approvals_sale_idx" ON "approval_requests" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_logs" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "customers_mobile_idx" ON "customers" USING btree ("mobile");--> statement-breakpoint
CREATE INDEX "customers_name_trgm" ON "customers" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "documents_series_seq_uq" ON "documents" USING btree ("series_key","financial_year","seq");--> statement-breakpoint
CREATE INDEX "documents_sale_idx" ON "documents" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "documents_issued_idx" ON "documents" USING btree ("doc_type","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_uq" ON "payment_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "payments_sale_idx" ON "payments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_uq" ON "payments" USING btree ("provider","provider_payment_id") WHERE "payments"."provider_payment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reference_uq" ON "payments" USING btree ("method",upper("reference")) WHERE "payments"."reference" is not null and "payments"."direction" = 'in' and "payments"."status" = 'successful';--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_sku_uq" ON "product_variants" USING btree (upper("sku"));--> statement-breakpoint
CREATE UNIQUE INDEX "variants_barcode_uq" ON "product_variants" USING btree ("barcode") WHERE "product_variants"."barcode" is not null;--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "variants_name_trgm" ON "product_variants" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "products_name_trgm" ON "products" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "sale_lines_no_uq" ON "sale_lines" USING btree ("sale_id","line_no");--> statement-breakpoint
CREATE INDEX "sale_lines_variant_idx" ON "sale_lines" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "sale_returns_sale_idx" ON "sale_returns" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sales_status_idx" ON "sales" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "sales_created_by_idx" ON "sales" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "sales_customer_idx" ON "sales" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_mov_variant_idx" ON "stock_movements" USING btree ("variant_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_uq" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "variant_costs_lookup_idx" ON "variant_costs" USING btree ("variant_id","effective_from");--> statement-breakpoint
CREATE INDEX "variant_prices_lookup_idx" ON "variant_prices" USING btree ("variant_id","price_list_id","status","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "vuc_variant_unit_uq" ON "variant_unit_conversions" USING btree ("variant_id","unit_code");--> statement-breakpoint
CREATE INDEX "website_orders_status_idx" ON "website_orders" USING btree ("status","created_at");