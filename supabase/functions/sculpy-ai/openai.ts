import { OPENAI_API_KEY } from "./config.ts";

function getOutputText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string")
        return content.text;
    }
  }
  throw new Error("OpenAI response did not contain output text.");
}

export async function openAIJson(
  instructions: string,
  input: string,
  name: string,
  schema: object,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-6-luna",
      store: false,
      instructions,
      input,
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(
      payload?.error?.message || `OpenAI request failed (${response.status}).`,
    );
  return JSON.parse(getOutputText(payload));
}
