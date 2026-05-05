CREATE TABLE IF NOT EXISTS "feedback_record" (
  "id" text PRIMARY KEY NOT NULL,
  "book_id" text NOT NULL,
  "chapter_root_id" text,
  "chapter_version_id" text,
  "source" text NOT NULL,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text,
  "original_content" text,
  "final_content" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" text NOT NULL
);
