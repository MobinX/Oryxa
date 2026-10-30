-- Suggestions are model calls too; give them their own billable lane so the business
-- token table does not merge them into Messenger replies or post generation.
ALTER TYPE "integration_type" ADD VALUE IF NOT EXISTS 'inbox_suggestion';
