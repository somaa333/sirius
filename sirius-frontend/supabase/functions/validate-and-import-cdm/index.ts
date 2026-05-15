/**
 * CDM validate-and-import Edge Function.
 *
 * If HTTP 401 is returned before the handler runs, the Supabase Edge gateway may be
 * rejecting the JWT. Configure in `supabase/config.toml`:
 *
 *   [functions.validate-and-import-cdm]
 *   verify_jwt = false
 */
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();

  if (userErr || !userData?.user) {
    if (userErr) {
      console.error("validate-and-import-cdm: unauthorized:", userErr.message);
    }
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        detail: userErr?.message ?? "No user from getUser()",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

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
