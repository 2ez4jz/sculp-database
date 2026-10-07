import { json } from "./http.ts";
import { openAIJson } from "./openai.ts";
import { extractSchema } from "./schemas.ts";

export async function extract(request: Request, origin: string) {
  const body = await request.json();
  const rawText = String(body?.rawText || "").trim();
  if (!rawText || rawText.length > 4_000)
    return json(
      origin,
      { error: "Work note must be 1–4,000 characters." },
      400,
    );

  const result = await openAIJson(
    "You are Sculpy, an internal assistant for a premium bridal beauty studio. Convert an employee work note into a concise, factual draft. Never invent facts. Keep client feedback distinct from follow-up opportunities. Reply in Simplified Chinese except proper names. Confidence is 0 to 1.",
    JSON.stringify({
      rawText,
      bookingId: body?.bookingId || null,
      pageContext: body?.pageContext || {},
    }),
    "sculpy_work_memory",
    extractSchema,
  );
  return json(origin, { ...result, provider: "openai" });
}
