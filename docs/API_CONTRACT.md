# Sculpy API contract

The static preview switches from `aiMode: "mock"` to `aiMode: "openai"` after the `sculpy-ai` Supabase Edge Function is deployed. The function uses an action query parameter (`transcribe`, `extract`, or `search`). The OpenAI API key exists only in Supabase Secrets and must never be included in browser code.

## `POST /functions/v1/sculpy-ai?action=transcribe`

Multipart field: `audio` (`webm`, `m4a`, `wav`, or `mp3`).

Response:

```json
{"text":"...","provider":"openai","requestId":"..."}
```

## `POST /functions/v1/sculpy-ai?action=extract`

Request:

```json
{"bookingId":"uuid","rawText":"...","pageContext":{"artistId":"uuid","clientId":"uuid"}}
```

Response must conform to a server-validated schema:

```json
{
  "summary":"...",
  "preferences":["..."],
  "opportunities":["..."],
  "partners":[{"name":"...","type":"Photography","confidence":0.8}],
  "confidence":0.91,
  "provider":"openai"
}
```

The endpoint creates an `ai_drafts` row. It does not update clients or work logs. Confirmation uses a separate authenticated transaction.

## `POST /functions/v1/sculpy-ai?action=search`

Demo request: `{"query":"...","catalog":{...}}`. Only the fictional catalog already visible in the public preview is sent. Production derives user identity and role from the session, queries Supabase under row-level security and returns only rows the user can access. The browser never sends an unrestricted catalog in production.

Response:

```json
{
  "answer":"...",
  "results":[{"type":"booking","id":"uuid","title":"...","meta":"...","href":"#bookings/uuid"}],
  "evidenceIds":["uuid"],
  "provider":"openai"
}
```

For numeric answers and charts, the server calls approved reporting views such as `booking_financials` and `service_revenue_monthly`. OpenAI explains the returned data but does not calculate authoritative totals. Each production request creates an `ai_runs` record containing its purpose, source/output record IDs, model usage and estimated cost; the service role writes this log and clients cannot forge it.

## Environment separation

- Development/Demo: dedicated Supabase project, fictional clients and bookings, real public team profiles.
- Production: separate Supabase project, invite-only accounts, no demo rows.
- Preview deployments never receive production service-role credentials.
