const PASSWORD_POLICY_HINT =
  "Password must be at least 10 characters and include at least one uppercase letter, one lowercase letter, and one number.";

/**
 * User-friendly message for Supabase auth password validation errors.
 * @param {unknown} error
 * @param {string} [fallbackPrefix]
 * @returns {string}
 */
export function getPasswordUpdateErrorMessage(
  error,
  fallbackPrefix = "Password update failed",
) {
  const raw =
    error && typeof error === "object" && "message" in error
      ? String(/** @type {{ message?: string }} */ (error).message ?? "")
      : typeof error === "string"
        ? error
        : "";

  const lower = raw.toLowerCase();
  const looksLikePolicyError =
    lower.includes("password should be at least") ||
    lower.includes("contain at least one character") ||
    lower.includes("abcdefghijklmnopqrstuvwxyz");

  if (looksLikePolicyError) {
    return PASSWORD_POLICY_HINT;
  }

  if (raw.trim()) {
    return `${fallbackPrefix}: ${raw}`;
  }

  return `${fallbackPrefix}. Please try again.`;
}
