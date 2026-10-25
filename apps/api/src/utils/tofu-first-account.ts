// Tofu (2026-10-25): this file is Tofu's addition; it is not part of upstream Kaneo.
import { createHash, timingSafeEqual } from "node:crypto";
import { APIError } from "better-auth/api";
import { resolveFileSecret } from "./file-secret";

/**
 * A copy of Kaneo on Tofu is online at a public address before its owner first
 * opens it, and Kaneo makes whoever creates the first account the instance
 * administrator. So while the instance has no account, the first one can only
 * be created with the email-and-password form, and only with the password the
 * owner saved as the hidden setting KANEO_ADMIN_PASSWORD, which becomes that
 * account's password. Without the setting nobody can create the first account.
 * Once an account exists this check no longer applies.
 */
export function assertFirstAccountAllowed(context: {
  path?: string;
  password?: unknown;
}): void {
  const expected = resolveFileSecret("KANEO_ADMIN_PASSWORD");
  if (!expected) {
    throw new APIError("FORBIDDEN", {
      code: "ADMIN_PASSWORD_NOT_SET",
      message:
        "This copy has no account yet, and only its owner can create the first one. Save a password of at least 8 characters as the hidden setting KANEO_ADMIN_PASSWORD in the app's settings on Tofu, deploy again, then create your account here with that password.",
    });
  }
  if (
    context.path !== "/sign-up/email" ||
    typeof context.password !== "string" ||
    !samePassword(context.password, expected)
  ) {
    throw new APIError("FORBIDDEN", {
      code: "ADMIN_PASSWORD_REQUIRED",
      message:
        "To create the first account, use the admin password saved as KANEO_ADMIN_PASSWORD in the app's settings as your password.",
    });
  }
}

function samePassword(given: string, expected: string): boolean {
  const digest = (value: string) =>
    createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(given), digest(expected));
}
