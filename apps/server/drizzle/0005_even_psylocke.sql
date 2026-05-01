ALTER TABLE "books" ADD COLUMN "worldview" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "era" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "themes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "hook" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "pov" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "tone" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "rules" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "avoid" jsonb DEFAULT '[]'::jsonb NOT NULL;