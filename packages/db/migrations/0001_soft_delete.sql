ALTER TABLE "agents" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "variants" ADD COLUMN "deleted_at" timestamp;