import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleRequest } from "./handler.ts";

// Fictional demo endpoint: preserve the existing origin allow-list and quota.
// Authenticated production chat is a separate function.
Deno.serve(handleRequest);
