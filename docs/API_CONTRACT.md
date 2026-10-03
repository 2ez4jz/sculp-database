# Sculpy API contract

The static preview runs with `aiMode: "mock"`. Production switches the same client to `aiMode: "openai"` and sets a server-side API base URL. The OpenAI API key must never be included in browser code.

## `POST /api/transcribe`

Multipart field: `audio` (`webm`, `m4a`, `wav`, or `mp3`).

Response:

```json
{"text":"...","provider":"openai","requestId":"..."}
```

## `POST /api/sculpy/extract`

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

## `POST /api/sculpy/search`

Request: `{"query":"..."}`. The server derives user identity and role from the session. It executes allow-listed database tools and returns only rows the user can access.

Response:

```json
{
  "answer":"...",
  "results":[{"type":"booking","id":"uuid","title":"...","meta":"...","href":"#bookings/uuid"}],
  "evidenceIds":["uuid"],
  "provider":"openai"
}
```

## Environment separation

- Development/Demo: dedicated Supabase project, fictional clients and bookings, real public team profiles.
- Production: separate Supabase project, invite-only accounts, no demo rows.
- Preview deployments never receive production service-role credentials.

