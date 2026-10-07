import { json } from "./http.ts";
import { openAIJson } from "./openai.ts";
import { searchSchema } from "./schemas.ts";

export async function search(request: Request, origin: string) {
  const body = await request.json();
  const query = String(body?.query || "").trim();
  if (!query || query.length > 300)
    return json(
      origin,
      { error: "Search query must be 1–300 characters." },
      400,
    );
  const catalog = body?.catalog || {};
  const safeCatalog = {
    bookings: Array.isArray(catalog.bookings)
      ? catalog.bookings.slice(0, 80)
      : [],
    artists: Array.isArray(catalog.artists) ? catalog.artists.slice(0, 30) : [],
    partners: Array.isArray(catalog.partners)
      ? catalog.partners.slice(0, 50)
      : [],
    notes: Array.isArray(catalog.notes) ? catalog.notes.slice(0, 80) : [],
  };

  const result = await openAIJson(
    "You are Sculpy, an internal search and decision assistant for SCULP Studio. Answer only from the supplied fictional demo catalog. Be concise and useful. If evidence is insufficient, say so. Return at most 6 results and use only IDs and entity kinds present in the catalog. Reply in Simplified Chinese except proper names.",
    JSON.stringify({ query, catalog: safeCatalog }),
    "sculpy_database_search",
    searchSchema,
  );
  const allowed = new Map<string, Set<string>>([
    [
      "booking",
      new Set(
        safeCatalog.bookings
          .map((item: any) => String(item?.id || ""))
          .filter(Boolean),
      ),
    ],
    [
      "artist",
      new Set(
        safeCatalog.artists
          .map((item: any) => String(item?.id || ""))
          .filter(Boolean),
      ),
    ],
    [
      "partner",
      new Set(
        safeCatalog.partners
          .map((item: any) => String(item?.id || ""))
          .filter(Boolean),
      ),
    ],
  ]);
  const results = (result.results || []).filter((item: any) =>
    allowed.get(item.kind)?.has(String(item.id)),
  );
  const evidenceIds = (result.evidenceIds || []).filter((id: any) =>
    [...allowed.values()].some((ids) => ids.has(String(id))),
  );
  return json(origin, { ...result, results, evidenceIds, provider: "openai" });
}
