ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "engine_mode" text NOT NULL DEFAULT 'scripted';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decision_profiles" (
  "id" text PRIMARY KEY NOT NULL,
  "book_id" text NOT NULL,
  "character_id" text NOT NULL,
  "archetype" text,
  "responses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "hard_constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "blind_spots" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "growth_arc_hints" text,
  "notes" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "decision_profiles_book_character_unique"
ON "decision_profiles" ("book_id", "character_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drives" (
  "id" text PRIMARY KEY NOT NULL,
  "book_id" text NOT NULL,
  "character_id" text NOT NULL,
  "horizon" text NOT NULL,
  "description" text NOT NULL,
  "goal_state" text NOT NULL,
  "motivation" text NOT NULL,
  "priority" integer NOT NULL,
  "progress" integer NOT NULL,
  "status" text NOT NULL,
  "blockers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evolved_from" text,
  "created_chapter" integer,
  "resolved_chapter" integer,
  "notes" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drives_book_character_idx" ON "drives" ("book_id", "character_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relationships" (
  "id" text PRIMARY KEY NOT NULL,
  "book_id" text NOT NULL,
  "from_character_id" text NOT NULL,
  "to_character_id" text NOT NULL,
  "relation_label" text NOT NULL,
  "current_tension" jsonb NOT NULL,
  "target_trajectory" jsonb,
  "history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_public_knowledge" boolean DEFAULT false NOT NULL,
  "notes" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_book_from_idx" ON "relationships" ("book_id", "from_character_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_book_to_idx" ON "relationships" ("book_id", "to_character_id");
--> statement-breakpoint
INSERT INTO "relationships" (
  "id",
  "book_id",
  "from_character_id",
  "to_character_id",
  "relation_label",
  "current_tension",
  "target_trajectory",
  "history",
  "is_public_knowledge",
  "notes",
  "created_at",
  "updated_at"
)
SELECT
  'legacy-' || c."id" || '-' || (rel.value ->> 'targetId') || '-' || rel.ordinality,
  c."book_id",
  c."id",
  rel.value ->> 'targetId',
  COALESCE(NULLIF(rel.value ->> 'type', ''), 'legacy'),
  '{"class":0,"info":0,"emotion":0}'::jsonb,
  NULL,
  '[]'::jsonb,
  false,
  rel.value ->> 'description',
  c."created_at",
  c."updated_at"
FROM "character" c
CROSS JOIN LATERAL jsonb_array_elements(c."relationships") WITH ORDINALITY AS rel(value, ordinality)
WHERE rel.value ? 'targetId'
  AND NULLIF(rel.value ->> 'targetId', '') IS NOT NULL
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_variables" (
  "id" text PRIMARY KEY NOT NULL,
  "book_id" text NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "scope" jsonb NOT NULL,
  "current_value" text NOT NULL,
  "scale" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "affects" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "world_variables_book_idx" ON "world_variables" ("book_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_variable_history" (
  "id" text PRIMARY KEY NOT NULL,
  "book_id" text NOT NULL,
  "world_variable_id" text NOT NULL,
  "chapter" integer NOT NULL,
  "from_value" text NOT NULL,
  "to_value" text NOT NULL,
  "cause" text NOT NULL,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "world_variable_history_variable_idx"
ON "world_variable_history" ("book_id", "world_variable_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chekhov_hooks" (
  "id" text PRIMARY KEY NOT NULL,
  "book_id" text NOT NULL,
  "type" text NOT NULL,
  "description" text NOT NULL,
  "involved_characters" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "involved_entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "planted_at_chapter" integer NOT NULL,
  "planted_scene" text,
  "preferred_payoff_window" jsonb NOT NULL,
  "urgency" integer NOT NULL,
  "status" text NOT NULL,
  "paid_off_at_chapter" integer,
  "payoff_notes" text,
  "source" text NOT NULL,
  "notes" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chekhov_hooks_book_status_idx" ON "chekhov_hooks" ("book_id", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scene_simulations" (
  "id" text PRIMARY KEY NOT NULL,
  "book_id" text NOT NULL,
  "scene_id" text NOT NULL,
  "chapter_id" text NOT NULL,
  "scene_index" integer NOT NULL,
  "status" text NOT NULL,
  "result" jsonb NOT NULL,
  "adopted_branch_label" text,
  "notes" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scene_simulations_book_chapter_idx"
ON "scene_simulations" ("book_id", "chapter_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "causal_links" (
  "id" text PRIMARY KEY NOT NULL,
  "book_id" text NOT NULL,
  "scene_simulation_id" text,
  "from_scene_ref" text,
  "to_scene_ref" text NOT NULL,
  "type" text NOT NULL,
  "description" text NOT NULL,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "causal_links_book_to_idx" ON "causal_links" ("book_id", "to_scene_ref");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pacing_evaluations" (
  "id" text PRIMARY KEY NOT NULL,
  "book_id" text NOT NULL,
  "chapter_id" text NOT NULL,
  "chapter_number" integer NOT NULL,
  "scene_simulation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "score" jsonb NOT NULL,
  "warning" jsonb,
  "notes" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pacing_evaluations_book_chapter_idx"
ON "pacing_evaluations" ("book_id", "chapter_number");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "offscreen_actions" (
  "id" text PRIMARY KEY NOT NULL,
  "book_id" text NOT NULL,
  "chapter_id" text NOT NULL,
  "character_id" text NOT NULL,
  "tier" text NOT NULL,
  "summary" text NOT NULL,
  "drive_deltas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "hook_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offscreen_actions_book_chapter_idx"
ON "offscreen_actions" ("book_id", "chapter_id");
