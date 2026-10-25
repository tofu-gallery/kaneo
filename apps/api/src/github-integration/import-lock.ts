import { HTTPException } from "hono/http-exception";
import type { PoolClient } from "pg";
import { getDatabasePool } from "../database";
import {
  releaseSessionLock,
  reserveSessionLock,
} from "../database/session-lock-budget";

export const MAX_GITHUB_IMPORTS_IN_FLIGHT = 2;
const LOCK_NAMESPACE = 773623;
let active = 0;

function busy() {
  return new HTTPException(429, {
    res: new Response("GitHub import is busy; retry this request", {
      status: 429,
      headers: { "Retry-After": "1" },
    }),
  });
}

/**
 * Locks span awaited provider calls. Tofu (2026-10-25): they are now held by a
 * transaction on one pinned client (`pg_try_advisory_xact_lock`) and released
 * by its COMMIT, instead of session locks taken and released by separate
 * statements. Behind a transaction pooler (Tofu's DATABASE_URL) each statement
 * outside a transaction may run on another server connection, so a session
 * lock's unlock could miss it and leave it held for good; a transaction keeps
 * one server connection until it ends. The transaction holds no rows.
 */
export async function withGithubImportLock<T>(
  id: string,
  run: () => Promise<T>,
): Promise<T> {
  if (active >= MAX_GITHUB_IMPORTS_IN_FLIGHT || !reserveSessionLock())
    throw busy();
  active++;
  let client: PoolClient | undefined;
  let open = false;
  let releaseError: Error | undefined;
  try {
    client = await getDatabasePool().connect();
    await client.query("BEGIN");
    open = true;
    let slot: number | undefined;
    for (
      let candidate = 0;
      candidate < MAX_GITHUB_IMPORTS_IN_FLIGHT;
      candidate++
    ) {
      const { rows } = await client.query(
        "SELECT pg_try_advisory_xact_lock($1::int, $2::int) AS acquired",
        [LOCK_NAMESPACE, candidate],
      );
      if (rows[0]?.acquired) {
        slot = candidate;
        break;
      }
    }
    if (slot === undefined) throw busy();
    const { rows } = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired",
      [`github-import:${id}`],
    );
    if (rows[0]?.acquired !== true) throw busy();
    return await run();
  } finally {
    if (client) {
      if (open) {
        try {
          await client.query("COMMIT");
        } catch (error) {
          // Destroy a connection whose lock release was not confirmed.
          releaseError =
            error instanceof Error
              ? error
              : new Error("Import lock release failed");
        }
      }
      client.release(releaseError);
    }
    releaseSessionLock();
    active--;
  }
}
