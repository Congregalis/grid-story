ALTER TABLE "scene_simulations" ADD COLUMN IF NOT EXISTS "rerolled_from" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scene_simulations_rerolled_from_idx"
ON "scene_simulations" ("rerolled_from");
