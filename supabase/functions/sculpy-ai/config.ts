export const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
export const ALLOWED_ORIGINS = new Set(
  (
    Deno.env.get("SCULPY_ALLOWED_ORIGINS") ||
    "https://2ez4jz.github.io,http://localhost:4173,http://127.0.0.1:4173"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
