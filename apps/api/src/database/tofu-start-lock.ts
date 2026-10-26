// Tofu (2026-10-26): this file is Tofu's addition; it is not part of upstream Kaneo.
//
// Several starts of one copy can run at the same moment: Tofu's hosting may
// start the app more than once within a second or two when a new deployment
// gets its first requests, and those starts share nothing but the database. On
// an empty database each of them would run Kaneo's migrations at once, and all
// but one would stop with `duplicate key value violates unique constraint
// "pg_namespace_nspname_index"` or `relation "__drizzle_migrations" already
// exists`. So every step a start runs on the schema (upstream's checks before
// and after the migrations, the migrations, the default roles and row-level
// security) runs in one transaction whose first statement takes one advisory
// lock, pg_advisory_xact_lock(SCHEMA_LOCK_KEY). One start does the work while
// the others wait; then each of them runs the same steps, which read the state
// again inside the lock and find it done.
//
// A transaction-level lock is what holds through a transaction pooler, which is
// what Tofu's DATABASE_URL points at (port 6543): the pooler keeps one server
// connection with one client from BEGIN to COMMIT and lends it to other clients
// only between transactions, and PostgreSQL releases the lock when that
// transaction ends, however it ends. A session-level lock (pg_advisory_lock)
// would stay on a server connection the pooler goes on lending. Because the
// steps run in the lock's transaction, a start uses one server connection for
// all of them, and a start that stops halfway leaves nothing behind: its
// transaction rolls back.
import { drizzle } from "drizzle-orm/node-postgres";
import { getDatabasePool, runInSchemaStep, schema } from ".";

/** Any fixed number does, as long as every start of Kaneo uses the same one. */
const SCHEMA_LOCK_KEY = "1740270557711857";
/**
 * How long a start waits for another start's schema step. One that waits
 * longer stops with an error rather than change the schema beside it, and the
 * host starts it again.
 */
const SCHEMA_LOCK_WAIT = "120s";

/**
 * Runs `step` in a transaction that holds Kaneo's schema lock; inside it, the
 * default `db` export is that transaction. A step that still meets an object
 * made beside it (something that did not take the lock made it) runs once more.
 */
export async function runSchemaStepLocked(
  step: () => Promise<void>,
): Promise<void> {
  try {
    await runSchemaStepOnce(step);
  } catch (error) {
    if (!isDuplicateObject(error)) throw error;
    console.warn(
      "⚠️ The schema step met an object made beside it; running the step once more",
      error,
    );
    await runSchemaStepOnce(step);
  }
}

async function runSchemaStepOnce(step: () => Promise<void>): Promise<void> {
  const client = await getDatabasePool().connect();
  let failure: Error | undefined;
  try {
    await drizzle(client, { schema }).transaction(async (transaction) => {
      // One round trip. The wait bound applies to this lock alone: the steps
      // after it wait for table locks as upstream's do.
      try {
        await client.query(
          `SET LOCAL lock_timeout = '${SCHEMA_LOCK_WAIT}'; SET LOCAL statement_timeout = 0; SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_KEY}); SET LOCAL lock_timeout TO DEFAULT; SET LOCAL statement_timeout TO DEFAULT`,
        );
      } catch (error) {
        if (sqlState(error) === "55P03") {
          throw new Error(
            `Another start of Kaneo has held the schema lock for over ${SCHEMA_LOCK_WAIT}; stopping instead of changing the schema beside it.`,
            { cause: error },
          );
        }
        throw error;
      }
      await runInSchemaStep(
        transaction as unknown as Parameters<typeof runInSchemaStep>[0],
        step,
      );
    });
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
    throw error;
  } finally {
    // A client whose transaction failed is closed rather than lent again.
    client.release(failure);
  }
}

/** The SQLSTATE of the first PostgreSQL error in `error`'s cause chain. */
function sqlState(error: unknown): string | undefined {
  for (let cause = error; cause instanceof Object; ) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cause = (cause as { cause?: unknown }).cause;
  }
  return undefined;
}

function isDuplicateObject(error: unknown): boolean {
  switch (sqlState(error)) {
    case "42P07": // duplicate_table: relation ... already exists
    case "42710": // duplicate_object
    case "42P06": // duplicate_schema
    case "42723": // duplicate_function
    case "42701": // duplicate_column
    case "23505": // unique_violation, as when two CREATEs cross in pg_type
      return true;
    default:
      return false;
  }
}
