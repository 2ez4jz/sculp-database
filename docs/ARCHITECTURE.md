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

## Implemented module boundaries (2026-10-07)

- `src/app.js` still owns routing, shared UI helpers, the current demo context,
  and stable booking/directory/media pages. This is an incremental extraction,
  not a claim that every application responsibility has already moved out.
- `src/pages/sculpy/index.js` owns Sculpy rendering, reviewed drafts and action
  handling. It receives live context via `getContext()` and explicit helpers;
  it never imports the application entrypoint. The application forwards events
  to the controller instead of installing listeners on every render.
- `src/pages/sculpy/voice.js` owns microphone capture and track cleanup. Page
  disposal invalidates pending requests and stops recording without submitting
  a transcription. Extraction/search responses are also invalidated on remount;
  editing source text or the target booking invalidates the previous draft.
- `src/pages/insights/index.js` owns the existing business/technical overview.
  `chart.js` owns chart markup; `src/domain/analytics.js` calculates revenue
  deterministically from supplied records. Demo reporting still anchors to the
  latest completed sample booking; production-mode calculation anchors to today.
- `src/domain/permissions.js` centralizes reusable demo visibility rules.
  `src/domain/sculpy.js` projects scoped demo search inputs and validates result
  links against that input. Neither module replaces server authorization.
- The Edge Function entrypoint wraps `handler.ts`. `http.ts` contains CORS and
  the existing in-memory rate limiter; `config.ts` reads server configuration;
  `openai.ts`, `schemas.ts`, `transcribe.ts`, `extract.ts` and `search.ts` own
  provider calls and action contracts. Action URLs and response fields remain
  compatible. No migrations or provider/model changes are part of this refactor.

Add new Sculpy interactions to its page controller, pure reporting rules to
`domain`, and provider transport to services or backend action modules. Stable
pages can move out when they need material changes.

## Verified limitations and production blockers

1. `supabase/config.toml` disables gateway JWT verification and `index.ts` uses
   `auth: 'none'`. CORS is not authentication. The function still trusts a
   browser-supplied demo catalog; real data must instead be queried server-side
   under an authenticated identity and RLS.
2. The rate limiter is per-process memory keyed by a forwarding header. It is
   not a durable, shared quota or a sufficient abuse/cost control.
3. Extraction currently returns JSON only. There is no `ai_drafts` insert,
   confirmation transaction or production audit write in the current handlers.
   Demo confirmation persists notes to localStorage only.
4. SQL row policies are not column protection. Migration 001 stores order
   amounts (`price_cad`, `deposit_cad`, `balance_cad`) on `bookings`, and migration
   002 still allows assigned artists to select booking rows. With table SELECT
   grants, that also exposes those columns. Likewise, authenticated venue and
   partner reads cover rows containing `internal_notes`. Before connecting
   artist accounts, define safe views/RPCs, column grants or private tables and
   test direct API access. Browser permission tests do not prove database RLS.
5. Existing migrations have not been executed or verified against a live
   Supabase database in this change. No claim of production readiness is made.
6. No OpenAI key is embedded in the changed browser modules. The server still
   reads `OPENAI_API_KEY` from the environment. Tests stub provider calls and
   do not establish live model availability or deployment compatibility.

## Regression checks

Run a static server on port 4173, then use Node 24 and Playwright:

```sh
node --test scripts/domain.test.mjs scripts/backend.test.mjs
node scripts/smoke.cjs
node scripts/permissions.cjs
node scripts/sculpy-lifecycle.cjs
```

Set `CHROME_PATH` if Chrome is not at `/usr/bin/google-chrome`. The backend tests
execute the TypeScript handlers with a minimal Deno environment stub; the
Supabase runtime wrapper still requires deployment validation. Verification now
runs on pull requests as well as main, without deploying the PR.

### Local execution evidence

At baseline commit `1f9b975`, the existing smoke and permission scripts passed.
After extraction, both scripts passed again, along with all 6 domain/backend
contract tests and the Sculpy lifecycle browser regression. Browser execution
used Chromium 153 through `CHROME_PATH`; provider calls were intercepted.
Mobile overflow assertions passed. Local screenshots lack Chinese font glyphs,
so full typography QA remains with the existing font-equipped CI environment.
No live Supabase migration, Edge Function deployment or OpenAI request was run.

## Contextual input extension

`src/components/memory/` owns the shared input dialog and record feed. Pure target
validation lives in `src/domain/memory.js`; persistence lives in
`src/services/memory.js`. See `CONTEXT_MEMORY.md` for the delivered Demo behavior,
the new annotation transaction and the remaining cloud integration work.
