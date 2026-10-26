// Tofu (2026-10-25): this file is Tofu's addition; it is not part of upstream Kaneo.
// Tofu (2026-10-26): it now runs in the transaction that holds the schema lock (./tofu-start-lock.ts), covers every
// table Kaneo's role owns in public and drizzle (Drizzle's bookkeeping included), not only the ones its schema
// names, sends its statements in two round trips, and stops the start when it fails.
import { sql } from "drizzle-orm";
import db from ".";

/**
 * Supabase's Data API reaches the tables in `public` through the roles `anon`
 * and `authenticated`. On a database whose default privileges still give every
 * new table in `public` to those roles, which is every Tofu database made
 * before 2026-10-30, anyone holding the project's public key could read and
 * change Kaneo's tables through it, accounts, sessions and API keys included.
 * So, on a database that has those roles, every start turns on row-level
 * security, with no policy, for every ordinary table that Kaneo's role owns in
 * the schemas Kaneo makes tables in: `public`, and `drizzle` for Drizzle's
 * bookkeeping. Those roles then see no row and can write none, while Kaneo's
 * own connection owns the tables and is not limited by it. It only ever turns
 * row-level security on, and leaves tables Kaneo's role does not own as they
 * are. One round trip lists what is still open; one more closes all of it.
 */
export async function enableRowLevelSecurityForDataApi(): Promise<void> {
  const { rows } = await db.execute<{ statement: string }>(sql`
    SELECT format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', n.nspname, c.relname) AS statement
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public', 'drizzle')
       AND c.relkind IN ('r', 'p')
       AND NOT c.relrowsecurity
       AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
       AND (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated')) = 2
     ORDER BY n.nspname, c.relname`);
  if (rows.length > 0) {
    // format's %I quotes each name; the statements go as one simple query.
    await db.execute(sql.raw(rows.map((row) => row.statement).join(";\n")));
  }
  console.log(
    `✅ Row-level security on Kaneo's tables for Supabase's Data API (turned on now: ${rows.length})`,
  );
}
