# SCULP / Sculpy architecture checkpoint

This document defines the architecture boundary for the next major product update. It is intentionally evolutionary: preserve the working V1 demo, avoid a framework rewrite, and move high-change responsibilities out of the current monolith as new production capabilities are added.

## Principles

1. Preserve current UI behavior and presentation flow unless a product change explicitly requires otherwise.
2. Do not rewrite the app or migrate frameworks as part of this checkpoint.
3. Keep the existing Supabase relational model and RLS foundation unless a concrete data-model defect is identified.
4. AI proposes; authenticated application logic validates and writes. High-impact AI output must remain reviewable before persistence.
5. Browser role simulation is demo-only. Production authorization comes from Supabase Auth + RLS, never from hidden UI controls.
6. OpenAI credentials remain server-side. Production AI endpoints must validate the authenticated session and derive permissions server-side.
7. New major features must not increase `src/app.js` responsibilities. Prefer extraction by domain/page/service as features are touched.
8. Tests are part of the architecture. Existing smoke, permission and responsive checks must remain green through refactors.

## Current boundaries to preserve

- `src/data/demo.js` — fictional preview data only.
- `src/services/storage.js` — browser-local demo persistence only.
- `src/services/sculpy.js` — browser-facing AI adapter. UI code should not call OpenAI or Supabase AI endpoints directly.
- `supabase/migrations/` — production schema and row-level authorization source of truth.
- `supabase/functions/sculpy-ai/` — server boundary for AI capabilities.
- `docs/API_CONTRACT.md` — stable client/server contract for Sculpy actions.

## Refactor order

### Phase A — before / during the next major update

- Keep CI green before structural changes.
- Extract new Sculpy UI orchestration and analytics/chart logic instead of adding more large functions to `src/app.js`.
- Keep domain calculations deterministic. AI may decide what the user is asking, but financial totals, percentages and chart values must be computed from authorized database records.
- Split additional Edge Function capabilities into focused modules before adding more actions to the single handler.
- Add or update tests for every changed user flow.

### Phase B — production connection

- Add Supabase Auth and replace demo role switching as the source of authorization.
- Introduce a production data repository layer so pages do not depend directly on demo arrays.
- Replace browser-local notes/selections with authenticated Supabase writes.
- Require a valid session for production Sculpy endpoints.
- Query production records server-side under the user's role; do not send a broad production catalog from the browser to the model.
- Persist AI proposals in `ai_drafts`, then confirm through an authenticated transaction.
- Add audit events for material writes.

### Phase C — later modularization

Only split code that is being actively changed or has become difficult to test. Preferred target shape:

```text
src/
  app/
  pages/
    bookings/
    clients/
    artists/
    insights/
    sculpy/
  domain/
    bookings/
    permissions/
    analytics/
  services/
    sculpy.js
    storage.js
    api.js
    auth.js

supabase/functions/sculpy-ai/
  index.ts
  openai.ts
  transcribe.ts
  extract.ts
  search.ts
  schemas.ts
```

This is a direction, not a requirement to move every existing function immediately.

## Production security gate

The public V1 demo may use fictional data and a restricted public AI endpoint. Before any real client record is connected, all of the following must be true:

- authenticated Supabase session is required for production AI actions;
- role and user identity are derived server-side;
- data queries are permission-scoped server-side;
- RLS is enabled and tested for every production table involved;
- no service-role key or OpenAI key is exposed to the browser;
- AI-generated writes use validation and confirmation rather than direct arbitrary table updates;
- rate limiting is durable enough for production traffic rather than relying only on per-instance memory.

## Definition of done for the architecture checkpoint

- Current demo remains visually and behaviorally equivalent.
- Smoke and permission checks pass.
- New major-version code follows the boundaries above.
- `src/app.js` stops growing as the default destination for new cross-cutting capabilities.
- The production path is explicitly authenticated before real customer data is introduced.
