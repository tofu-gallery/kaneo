-- Tofu (2026-10-26): this file is Tofu's addition; it is not part of upstream Kaneo. Nothing runs it.
-- On a database with Supabase's Data API roles (anon, authenticated), every start already turns on row-level
-- security, with no policy, for every table Kaneo's role owns in public and drizzle, tables that later migrations
-- add included (enableRowLevelSecurityForDataApi in ./tofu-data-api.ts). This file says the same in SQL for tools
-- that read SQL files rather than run the app, such as Tofu's safety check. It names every table that any .sql file
-- in this repository makes. That includes the three tables of scripts/ui-review-bot/worker/schema.sql, which belong
-- to the Cloudflare D1 (SQLite) database of upstream's review bot, a separate database Kaneo never uses, so their
-- lines do nothing. ./tofu-row-level-security.test.ts keeps the list exact.

ALTER TABLE IF EXISTS public."account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."apikey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."billing_event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."billing_reminder_sent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."calendar_feed" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."column" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."commands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."comment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."custom_field_definition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."custom_field_value" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."data_migration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."device_code" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."external_link" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."github_import" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."github_integration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."import_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."integration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."job_lease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."label" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."mcp_oauth_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."review_budget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."review_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."storage_cleanup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."task_relation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."task_reminder_sent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."team_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."time_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."trial_grant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."user_avatar" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."user_notification_preference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."user_notification_workspace_project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."user_notification_workspace_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."verification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."workflow_rule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."workspace_billing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."workspace_member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."workspace_member_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."workspace_member_project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public."workspace_role" ENABLE ROW LEVEL SECURITY;
