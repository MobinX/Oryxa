-- Postgres cannot remove an enum value. Rows written with 'inbox_suggestion' keep it;
-- delete them first if this rollback is ever needed.
DELETE FROM "llm_token_logs" WHERE "integration_type" = 'inbox_suggestion';
DELETE FROM "hourly_token_analytics" WHERE "integration_type" = 'inbox_suggestion';
