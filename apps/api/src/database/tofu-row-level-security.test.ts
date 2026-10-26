// Tofu (2026-10-26): this file is Tofu's addition; it is not part of upstream Kaneo.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

// Tofu's safety check reads every .sql file in a repository, comments
// included, and warns about every table one of them makes unless some .sql
// file turns on row-level security for it. Kaneo turns it on at every start
// (./tofu-data-api.ts), and ./tofu-row-level-security.sql says the same in SQL.
// These are the check's own two patterns and its own reading of a name, so a
// table that a new upstream migration adds fails here instead of bringing the
// warning back.
const CREATE_TABLE_RE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)/gi;
const ENABLE_RLS_RE =
  /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?((?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?)\s+enable\s+row\s+level\s+security/gi;
// Schemas the check never warns about.
const SYSTEM_SCHEMAS = new Set([
  "auth",
  "storage",
  "extensions",
  "realtime",
  "vault",
  "graphql",
  "graphql_public",
  "net",
  "cron",
  "pgsodium",
  "pgsodium_masks",
  "supabase_functions",
  "supabase_migrations",
  "information_schema",
  "pg_catalog",
]);
// Folders Tofu's import leaves out, so its safety check never reads them. For
// an app built from its own Dockerfile, as Kaneo is, the import keeps dist and
// build folders, and the check reads them, so they are read here too.
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".turbo",
  ".output",
]);

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const rowLevelSecurityFile = fileURLToPath(
  new URL("./tofu-row-level-security.sql", import.meta.url),
);

// "schema.table", lower case and without quotes; a bare name is in public.
function tableKey(raw: string): string {
  const parts = raw.replace(/"/g, "").trim().toLowerCase().split(".");
  return parts.length > 1
    ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
    : `public.${parts[0]}`;
}

function tablesMatching(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => tableKey(match[1] ?? ""));
}

function sqlFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) files.push(...sqlFiles(path));
    } else if (entry.isFile() && /\.sql$/i.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

// Every table the repository's other .sql files make, with the first file
// that makes it.
function tablesMadeElsewhere(): Map<string, string> {
  const made = new Map<string, string>();
  for (const file of sqlFiles(repositoryRoot).sort()) {
    if (file === rowLevelSecurityFile) continue;
    const text = readFileSync(file, "utf8");
    for (const table of tablesMatching(text, CREATE_TABLE_RE)) {
      if (SYSTEM_SCHEMAS.has(table.split(".")[0] ?? "")) continue;
      if (!made.has(table)) made.set(table, relative(repositoryRoot, file));
    }
  }
  return made;
}

describe("tofu-row-level-security.sql", () => {
  const listed = readFileSync(rowLevelSecurityFile, "utf8");

  it("names exactly the tables the repository's other .sql files make", () => {
    const made = tablesMadeElsewhere();
    const named = new Set(tablesMatching(listed, ENABLE_RLS_RE));
    const missing = [...made]
      .filter(([table]) => !named.has(table))
      .map(([table, file]) => `${table} (made in ${file})`)
      .sort();
    const extra = [...named].filter((table) => !made.has(table)).sort();
    expect(made.size).toBeGreaterThan(0);
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it("makes no table itself", () => {
    expect(tablesMatching(listed, CREATE_TABLE_RE)).toEqual([]);
  });
});
