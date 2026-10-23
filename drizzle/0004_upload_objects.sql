CREATE TABLE "upload_objects" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Same lockdown as every other table (see 0001_integrity.sql): no policies, so hosted REST roles see nothing.
ALTER TABLE "upload_objects" ENABLE ROW LEVEL SECURITY;
