import { supabase } from "../supabaseClient";

export const SESSION_INVALID_MSG =
  "Your session is no longer valid. Please sign in again and retry.";

/**
 * Read session and refresh if access token is missing or expired (Edge Functions need a valid JWT).
 * @returns {Promise<{ access_token: string, expires_at?: number }>}
 */
export async function ensureSessionForEdgeFunctionInvoke() {
  let {
    data: { session },
    error: getErr,
  } = await supabase.auth.getSession();
  if (getErr) {
    console.warn("[edgeSession] getSession before invoke:", getErr.message);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const missingToken = !session?.access_token;
  const expired =
    typeof session?.expires_at === "number" && session.expires_at <= nowSec;

  if (missingToken || expired) {
    const { data: refData, error: refErr } = await supabase.auth.refreshSession();
    if (refErr) {
      console.error("[edgeSession] refreshSession failed:", refErr.message);
      throw new Error(SESSION_INVALID_MSG);
    }
    session = refData?.session ?? null;
  }

  if (!session?.access_token) {
    const { data: again } = await supabase.auth.getSession();
    session = again.session;
  }

  if (!session?.access_token) {
    throw new Error(SESSION_INVALID_MSG);
  }

  return session;
}

/**
 * Best-effort message from functions.invoke error + optional JSON body.
 * @param {unknown} fnError
 * @param {unknown} data
 * @param {string} [fallback]
 */
export function edgeFunctionInvokeErrorMessage(
  fnError,
  data,
  fallback = "Could not complete the request.",
) {
  if (data != null && typeof data === "object" && "error" in data) {
    const e = /** @type {{ error?: unknown }} */ (data).error;
    if (typeof e === "string" && e.trim()) return e;
  }

  const err = /** @type {{ message?: string; context?: { status?: number; body?: string } }} */ (
    fnError
  );
  const status =
    typeof err?.context?.status === "number" ? err.context.status : undefined;
  if (status === 401) {
    return "Unauthorized (401). Sign in again, or check that this Edge Function allows your JWT (verify_jwt / gateway settings).";
  }
  if (status === 404) {
    return 'Edge Function "admin-operators" was not found (404). Deploy it in Supabase or check the function name.';
  }

  if (typeof err?.context?.body === "string" && err.context.body.trim()) {
    try {
      const p = JSON.parse(err.context.body);
      if (p && typeof p.error === "string") return p.error;
      if (p && typeof p.message === "string") return p.message;
    } catch {
      /* ignore */
    }
  }

  if (typeof err?.message === "string" && err.message.trim()) {
    return err.message;
  }

  return fallback;
}
