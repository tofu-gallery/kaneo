// Tofu (2026-10-25): this file is Tofu's addition; it is not part of upstream Kaneo.
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { getDatabasePool } from ".";
import * as tables from "./schema";

/**
 * Supabase's Data API reaches the tables in `public` through the roles `anon`
 * and `authenticated`. On a database whose default privileges still give every
 * new table in `public` to those roles, anyone holding the project's public key
 * could read and change Kaneo's tables through it, accounts and sessions
 * included. So after its migrations Kaneo turns on row-level security, with no
 * policy, for its own tables (the ones its schema names) that its role owns and
 * that do not have it yet: those roles then see no row, while Kaneo's own
 * connection owns the tables and is not limited by it. It never turns
 * row-level security off, touches no other table, and does nothing on a
 * PostgreSQL without those roles. A failure is logged and does not stop Kaneo.
 */
export async function enableRowLevelSecurityForDataApi(): Promise<void> {
  try {
    const names = (Object.values(tables) as unknown[])
      .filter((value): value is PgTable => is(value, PgTable))
      .map((table) => getTableConfig(table))
      .filter((config) => (config.schema ?? "public") === "public")
      .map((config) => config.name);
    const pool = getDatabasePool();
    const roles = await pool.query<{ found: number }>(
      "SELECT count(*)::int AS found FROM pg_roles WHERE rolname IN ('anon', 'authenticated')",
    );
    if (roles.rows[0]?.found !== 2) return;

    const { rows } = await pool.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
          AND NOT c.relrowsecurity
          AND pg_get_userbyid(c.relowner) = current_user
          AND c.relname = ANY($1::text[])`,
      [names],
    );
    for (const { relname } of rows) {
      await pool.query(
        `ALTER TABLE public."${relname.replaceAll('"', '""')}" ENABLE ROW LEVEL SECURITY`,
      );
    }
    console.log(
      `✅ Row-level security on Kaneo's tables for Supabase's Data API (turned on now: ${rows.length})`,
    );
  } catch (error) {
    console.warn(
      "⚠️ Could not turn on row-level security for Supabase's Data API",
      error,
    );
  }
}
