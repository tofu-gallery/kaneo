// Tofu (2026-10-26): this file is Tofu's addition; it is not part of upstream Kaneo.
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import db from ".";

const BOOKKEEPING = `"drizzle"."__drizzle_migrations"`;

/**
 * Applies Kaneo's Drizzle migrations the way drizzle-orm's `migrate()` for
 * node-postgres (0.45) does: the same files, the same order, the same rule for
 * which ones are new, and the same rows in drizzle.__drizzle_migrations, so
 * Drizzle's own `migrate()` and `drizzle-kit` read the result as theirs. It
 * differs only in how many round trips it costs. Drizzle sends each of the
 * files' statements on its own (382 for an empty database, with 64 bookkeeping
 * rows), and through Tofu's pooler every one costs a network round trip while
 * the first request waits. Here the new migrations go to PostgreSQL as one
 * script in one round trip: three in all, and two when nothing is new. A script
 * of several statements runs as one transaction, as Drizzle's loop does.
 * Returns how many migrations it applied.
 */
export async function applyMigrations(migrationsFolder: string): Promise<number> {
  const migrations = readMigrationFiles({ migrationsFolder });
  await db.execute(
    sql.raw(
      `CREATE SCHEMA IF NOT EXISTS "drizzle"; CREATE TABLE IF NOT EXISTS ${BOOKKEEPING} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
    ),
  );
  const { rows } = await db.execute<{ created_at: string | number | null }>(
    sql.raw(
      `SELECT id, hash, created_at FROM ${BOOKKEEPING} ORDER BY created_at DESC LIMIT 1`,
    ),
  );
  const last = rows[0];
  const pending = migrations
    .map((migration, index) => ({ migration, index }))
    .filter(
      ({ migration }) =>
        !last || Number(last.created_at) < migration.folderMillis,
    );
  if (pending.length === 0) return 0;

  // Each part ends on its own line before its `;`, so a part that ends in a
  // line comment or without a semicolon still ends where Drizzle's would.
  const starts: { offset: number; index: number }[] = [];
  let script = "";
  for (const { migration, index } of pending) {
    if (
      !/^[0-9a-f]{64}$/.test(migration.hash) ||
      !Number.isSafeInteger(migration.folderMillis)
    ) {
      throw new Error(`Unexpected bookkeeping for migration ${index}`);
    }
    starts.push({ offset: script.length, index });
    for (const statement of migration.sql) script += `${statement}\n;\n`;
    script += `INSERT INTO ${BOOKKEEPING} ("hash", "created_at") VALUES ('${migration.hash}', ${migration.folderMillis})\n;\n`;
  }

  try {
    await db.execute(sql.raw(script));
  } catch (error) {
    throw new Error(
      `Applying Kaneo's migrations failed in ${failedMigration(migrationsFolder, script, starts, error)}`,
      { cause: error },
    );
  }
  return pending.length;
}

/** Names the migration that holds the position PostgreSQL's error points at. */
function failedMigration(
  migrationsFolder: string,
  script: string,
  starts: { offset: number; index: number }[],
  error: unknown,
): string {
  let position: number | undefined;
  for (let cause = error; cause instanceof Object; ) {
    const value = Number((cause as { position?: unknown }).position);
    if (Number.isInteger(value) && value > 0) position = value;
    cause = (cause as { cause?: unknown }).cause;
  }
  if (position === undefined) return "one of the new migrations";
  // PostgreSQL counts characters from 1.
  const offset = [...script].slice(0, position - 1).join("").length;
  const found = starts.filter((start) => start.offset <= offset).at(-1);
  if (!found) return "one of the new migrations";
  try {
    const journal = JSON.parse(
      readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8"),
    ) as { entries: { tag: string }[] };
    return `${journal.entries[found.index]?.tag ?? `migration ${found.index}`}.sql`;
  } catch {
    return `migration ${found.index}`;
  }
}
