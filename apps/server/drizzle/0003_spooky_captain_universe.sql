CREATE TABLE "chapter" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL,
	"chapter_root_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"version" integer NOT NULL,
	"parent_version_id" text,
	"status" text NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"order" integer NOT NULL,
	"notes" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
