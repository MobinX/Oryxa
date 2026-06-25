CREATE TYPE "public"."message_from" AS ENUM('self', 'customer');--> statement-breakpoint
CREATE TYPE "public"."message_state" AS ENUM('pending', 'working', 'done');--> statement-breakpoint
CREATE TYPE "public"."order_state" AS ENUM('pending', 'acknowledged', 'onDelivery', 'done');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('facebook', 'instagram', 'whatsapp', 'telegram', 'twitter');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"system_prompt" text NOT NULL,
	"platform_type" "platform" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"employee_count" integer,
	"type" varchar(100),
	"founded_date" timestamp,
	"has_trade_license" boolean DEFAULT false,
	"has_tax_license" boolean DEFAULT false,
	"facebook_page_link" varchar(500),
	"phone" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"api_token" text NOT NULL,
	"platform_channel_id" varchar(255) NOT NULL,
	"extra_info" text,
	"agent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"customer_platform_id" varchar(255) NOT NULL,
	"customer_name" varchar(255),
	"customer_avatar" varchar(500),
	"last_message_state" "message_state" DEFAULT 'done' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"from" "message_from" NOT NULL,
	"content_type" varchar(20) DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"time" timestamp DEFAULT now() NOT NULL,
	"state" "message_state" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"count" integer DEFAULT 1 NOT NULL,
	"variant_price" numeric(10, 2) NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"customer_avatar" varchar(500),
	"customer_address" text,
	"customer_phone" varchar(20),
	"state" "order_state" DEFAULT 'pending' NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"conversation_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"category_id" uuid,
	"name" varchar(255) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"sku" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"gender" varchar(20),
	"phone" varchar(20),
	"email" varchar(255),
	"firebase_uid" varchar(255) NOT NULL,
	"sign_in_method" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid")
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"image_url" varchar(500),
	"price" numeric(10, 2),
	"stock" integer DEFAULT 0 NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"rating" numeric(3, 2)
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_business_slug_idx" ON "categories" USING btree ("business_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_business_platform_channel_idx" ON "channels" USING btree ("business_id","platform","platform_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_channel_customer_idx" ON "conversations" USING btree ("channel_id","customer_platform_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_time_idx" ON "messages" USING btree ("conversation_id","time");--> statement-breakpoint
CREATE UNIQUE INDEX "products_business_slug_idx" ON "products" USING btree ("business_id","slug");