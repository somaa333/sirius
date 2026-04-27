/**
 * CDM validate-and-import Edge Function — auth probe + logging.
 *
 * If HTTP 401 is returned *before* these logs appear in the function logs, the
 * Supabase Edge gateway is likely rejecting the JWT. Configure in `supabase/config.toml`:
 *
 *   [functions.validate-and-import-cdm]
 *   verify_jwt = false
 *
 * Then this handler’s manual `getUser()` auth can run.
 *
 * Merge your existing queue / `cdm_uploads` / worker-trigger logic from production
 * after the successful `getUser()` check (do not remove the manual auth pattern).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

console.log("validate-and-import-cdm: module loaded");

Deno.serve(async (req: Request) => {
  console.log("validate-and-import-cdm invoked");

  const authHeader = req.headers.get("Authorization") ?? "";
  console.log("Authorization header present:", Boolean(authHeader));
  console.log("Authorization starts with 'Bearer ':", authHeader.startsWith("Bearer "));

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  console.log("userClient.auth.getUser() result:", {
    userId: userData?.user?.id ?? null,
    email: userData?.user?.email ?? null,
    error: userErr?.message ?? null,
  });

  if (userErr || !userData?.user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        detail: userErr?.message ?? "No user from getUser()",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- Keep your production queue / DB logic below; this stub only proves auth + logging. ---
  let payload: Record<string, unknown> = {};
  try {
    if (req.method === "POST") {
      const ct = req.headers.get("Content-Type") ?? "";
      if (ct.includes("application/json")) {
        payload = (await req.json()) as Record<string, unknown>;
      }
    }
  } catch {
    // ignore body parse errors for stub
  }

  return new Response(
    JSON.stringify({
      success: true,
      message:
        "Auth OK. Replace this response body with your queue-only contract in production.",
      uploadId: payload.uploadId,
      filePath: payload.filePath,
      sourceType: payload.sourceType,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
