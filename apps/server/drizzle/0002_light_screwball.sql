CREATE TABLE "outline" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"parent_id" text,
	"order" integer NOT NULL,
	"notes" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
