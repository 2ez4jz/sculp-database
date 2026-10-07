// Setup type definitions for built-in Supabase Runtime APIs.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

import { handleRequest } from "./handler.ts";

export default {
  fetch: withSupabase(
    {
      auth: "none",
      // This function has a strict origin allow-list below.
      cors: "disabled",
    },
    async (request) => handleRequest(request),
  ),
};
