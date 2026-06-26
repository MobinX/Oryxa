ALTER TABLE "messages" ADD COLUMN "external_id" varchar(100);--> statement-breakpoint
CREATE UNIQUE INDEX "messages_external_id_idx" ON "messages" USING btree ("external_id");