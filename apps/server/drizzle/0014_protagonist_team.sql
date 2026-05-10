ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "protagonist_team" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "protagonist_team_confirmed_at" text;
