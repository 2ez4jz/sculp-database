import { OPENAI_API_KEY } from "./config.ts";
import { json } from "./http.ts";
import {audioUpload} from './audio-format.js';

export async function transcribe(request: Request, origin: string) {
  const incoming = await request.formData();
  const audio = incoming.get("audio");
  if (!(audio instanceof File))
    return json(origin, { error: "Audio file is required." }, 400);
  if (!audio.size || audio.size > 5_000_000)
    return json(
      origin,
      { error: "Audio must be between 1 byte and 5 MB." },
      400,
    );

  const form = new FormData();
  // Also repair uploads from older cached clients that named MP4 bytes .webm.
  let upload;
  try { upload=await audioUpload(audio); }
  catch(error) { return json(origin,{error:error instanceof Error?error.message:'录音格式无法识别。'},400); }
  form.append("file", upload.blob, upload.name);
  form.append("model", "gpt-transcribe");
  form.append(
    "prompt",
    "SCULP Studio premium bridal beauty work note. Names may include Sculpy, Miranda, Mira, Yuki, Angelina, Elaine, Emily, Michelle, Giselle and Jz. Common terms include bridal trial, wedding-day styling, half-day, full-day, makeup, hairstyling, touch-up, ceremony, reception, photographer, planner and venue. Preserve Chinese and English code-switching, names, prices, dates and times accurately. Do not summarize; return the complete spoken transcript.",
  );

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    },
  );
  const payload = await response.json();
  if (!response.ok)
    throw new Error(
      payload?.error?.message || `Transcription failed (${response.status}).`,
    );
  return json(origin, {
    text: payload.text || "",
    provider: "openai",
    requestId: response.headers.get("x-request-id"),
  });
}
