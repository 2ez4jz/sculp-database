import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { accountHandler } from "./handler.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  options,
);
Deno.serve(
  accountHandler({
    admin,
    allowedOrigins: new Set(
      (Deno.env.get("ACCOUNT_ALLOWED_ORIGINS") || "https://2ez4jz.github.io")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    ),
    callerFor: (authorization: string) =>
      createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        ...options,
        global: { headers: { Authorization: authorization } },
      }),
  }),
);
