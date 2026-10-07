import { OPENAI_API_KEY, ALLOWED_ORIGINS } from "./config.ts";
import { cors, json, rateLimited } from "./http.ts";
import { transcribe } from "./transcribe.ts";
import { extract } from "./extract.ts";
import { search } from "./search.ts";

export const handleRequest = async (request: Request) => {
  const origin = request.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin))
    return json(origin || "null", { error: "Origin is not allowed." }, 403);
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== "POST")
    return json(origin, { error: "Method not allowed." }, 405);
  if (!OPENAI_API_KEY)
    return json(origin, { error: "Server AI configuration is missing." }, 500);
  if (rateLimited(request))
    return json(
      origin,
      { error: "Too many requests. Please wait one minute." },
      429,
    );

  try {
    const action = new URL(request.url).searchParams.get("action");
    if (action === "transcribe") return await transcribe(request, origin);
    if (action === "extract") return await extract(request, origin);
    if (action === "search") return await search(request, origin);
    return json(origin, { error: "Unknown action." }, 404);
  } catch (error) {
    console.error(error);
    return json(
      origin,
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error.",
      },
      500,
    );
  }
};
