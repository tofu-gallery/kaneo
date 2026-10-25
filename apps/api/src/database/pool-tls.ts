// Tofu (2026-10-25): this file is Tofu's addition; it is not part of upstream Kaneo.
import type { PoolConfig } from "pg";

/**
 * node-postgres lets a URL's `sslmode` override its own `ssl` option and treats
 * `require` as full certificate verification against the system's
 * certificates, which fails against a managed database's pooler
 * (SELF_SIGNED_CERT_IN_CHAIN). Tofu's DATABASE_URL ends in `?sslmode=require`.
 * When the URL names an `sslmode`, it is taken out and TLS is set here:
 * verified against SUPABASE_CA_CERT (PEM text, or base64) when that is set,
 * encrypted without verification otherwise (what `require` means to libpq),
 * and off for `disable`. A URL without `sslmode` reaches pg unchanged, as it
 * did upstream. Nothing here depends on the database's host.
 */
export function poolConnectionConfig(
  connectionString: string,
): Pick<PoolConfig, "connectionString" | "ssl"> {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // A shape the URL parser refuses is left to pg's own parser.
    return { connectionString };
  }

  const sslmode = url.searchParams.get("sslmode");
  if (!sslmode) return { connectionString };
  url.searchParams.delete("sslmode");

  const caSetting = process.env.SUPABASE_CA_CERT?.trim();
  const ca = caSetting
    ? caSetting.includes("-----BEGIN")
      ? caSetting
      : Buffer.from(caSetting, "base64").toString("utf8")
    : undefined;

  let ssl: PoolConfig["ssl"];
  if (sslmode === "disable") {
    ssl = false;
  } else if (sslmode === "verify-ca" || sslmode === "verify-full") {
    ssl = ca ? { ca } : true;
  } else {
    ssl = ca ? { ca } : { rejectUnauthorized: false };
  }

  return { connectionString: url.toString(), ssl };
}
