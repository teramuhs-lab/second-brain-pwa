CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb,
	"last_active" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notion_id" text,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"status" text,
	"priority" text,
	"content" jsonb DEFAULT '{}'::jsonb,
	"embedding" vector(1536),
	"due_date" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_notion_id_unique" UNIQUE("notion_id")
);
--> statement-breakpoint
CREATE TABLE "entry_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"relation_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notion_id" text,
	"raw_input" text NOT NULL,
	"category" text,
	"confidence" real,
	"destination_id" text,
	"status" text,
	"slack_thread" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_log_notion_id_unique" UNIQUE("notion_id")
);
--> statement-breakpoint
ALTER TABLE "entry_relations" ADD CONSTRAINT "entry_relations_source_id_entries_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_relations" ADD CONSTRAINT "entry_relations_target_id_entries_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_sessions_session_id_idx" ON "chat_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "config_key_idx" ON "config" USING btree ("key");--> statement-breakpoint
CREATE INDEX "entries_category_idx" ON "entries" USING btree ("category");--> statement-breakpoint
CREATE INDEX "entries_status_idx" ON "entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "entries_due_date_idx" ON "entries" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "entries_created_at_idx" ON "entries" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entries_notion_id_idx" ON "entries" USING btree ("notion_id");--> statement-breakpoint
CREATE INDEX "relations_source_idx" ON "entry_relations" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "relations_target_idx" ON "entry_relations" USING btree ("target_id");