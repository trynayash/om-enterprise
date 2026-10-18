CREATE TABLE "login_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "login_secret_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "login_secret_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "login_challenges" ADD CONSTRAINT "login_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_challenges_user_idx" ON "login_challenges" USING btree ("user_id");--> statement-breakpoint
-- Same lockdown as every other table (see 0001_integrity.sql): no access through PostgREST-style roles.
ALTER TABLE "login_challenges" ENABLE ROW LEVEL SECURITY;
