-- Reprice and requota the four offers (operator decision, Oct 2026).
--
-- Free stays 1,000 + 1,000 at $0. Starter keeps its $29 price but grows to
-- 25,000 + 25,000. Pro keeps $79 and grows to 100,000 + 100,000. The fourth row
-- stops calling itself Enterprise and becomes the Custom card: uncapped, priced
-- with the team, whose call to action is the contact page, not signup.
--
-- Plain UPDATEs keyed on slug, so a replay is a silent no-op and a plan the
-- operator retired (deleted_at set) is left alone. New clusters get the old seed
-- from 0012 first and converge here, which is why 0012 itself is untouched.
UPDATE "plans" SET "message_limit" = 1000, "comment_limit" = 1000, "features" = '["Storefront, orders and posts included"]', "updated_at" = now() WHERE "slug" = 'free' AND "deleted_at" IS NULL;--> statement-breakpoint
UPDATE "plans" SET "message_limit" = 25000, "comment_limit" = 25000, "features" = '["Storefront, orders and posts included","Priority support"]', "updated_at" = now() WHERE "slug" = 'starter' AND "deleted_at" IS NULL;--> statement-breakpoint
UPDATE "plans" SET "message_limit" = 100000, "comment_limit" = 100000, "features" = '["Storefront, orders and posts included","Priority support","Multiple pages and posts"]', "updated_at" = now() WHERE "slug" = 'pro' AND "deleted_at" IS NULL;--> statement-breakpoint
UPDATE "plans" SET "name" = 'Custom', "message_limit" = NULL, "comment_limit" = NULL, "features" = '["Custom pricing, agreed with our team","Storefront, orders and posts included","Priority support","Multiple pages and posts","Dedicated onboarding"]', "updated_at" = now() WHERE "slug" = 'enterprise' AND "deleted_at" IS NULL;
