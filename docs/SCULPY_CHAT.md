# Sculpy conversational workspace — first stage

The new chat panel is available globally and on order pages. It preserves follow-up turns, reads current business context before model inference, queries additional authorized orders through a bounded tool loop, and returns explicit save proposals. The existing extraction/voice interface remains available. The old `sculpy-ai` deployment is unchanged.

## Data and identity

- Logged-in workspace loads a paginated order list from `sculpy_context`. It is intentionally independent from the demo's fictional IDs and role switcher.
- Every cloud request verifies the bearer token using Supabase Auth, then reads the active profile through the context RPC. The backend never accepts client-supplied cloud records, role, history, or preferences.
- Only owner/operations have global order access. Others require an active artist assignment. The projection omits price for non-admins and never exposes contact/private tables.
- `sculpy_private.context` is a non-exposed, tightly scoped definer function with a mandatory authenticated active-profile check and explicit assignment checks. The public wrapper is security-invoker. No broad business-table grants were introduced.
- Conversations and response preferences are user-owned RLS tables. Managers do not implicitly read other users' conversations or preferences. Each user has global and order-scoped conversations. Before reuse, turns referencing orders no longer accessible are excluded.
- Demo conversations/preferences are localStorage namespaced by selected demo persona, never cloud-synchronized. Demo mode accepts only provided fictional records and never enters the cloud query path. It is not a secure multi-user environment; do not enter real customer data.

## Answer and save behavior

The model is `gpt-6-luna` via Responses, store=false. A maximum of four model calls is allowed per turn; tool calls have no direct mutation capability. Replies include safe order references and validated proposals, not arbitrary model URLs or SQL. Input/output token totals and call count are attached to each turn.

The interface escapes all model text, supports paragraphs/bold, and uses native buttons for references. Voice reuses the existing transcription service and waits for user review before sending.

Confirmed proposals call the existing transactional `save_context_memory` RPC with a stable UUID for idempotency. Notes/tasks become annotations; changes remain pending-review proposals. Dates, amounts, payments and canonical task assignments are not silently changed. The UI reports success only after persistence succeeds. Retrying a saved proposal is safe even if its visual badge was lost on reload.

The user owns response preferences (brief/balanced/detailed and up to 1,000 characters of guidance). Company rules are shared and editable only by owner/operations. Rules must not contain secrets. System permission and save safeguards outrank these data fields.

## Limits / next stage

- Automatic long-term memory extraction, deduplication, expiry and Mem0 integration are NOT enabled. Preferences are explicitly edited by users. No model fine-tuning occurs.
- Latest 12 turns enter inference; at most 100 turns per scope are retained. Older conversational facts require business records; no claim of unlimited memory.
- Detail queries read the latest 20 work logs and 30 context records. Lists page in groups of 30. This is not full historical search or a financial analytics tool.
- Full production customer/order CRUD, review queue, real order onboarding, durable distributed rate limiting, streaming and external web search remain separate work.
- The current cloud database contains no orders. Demo mode is the immediately useful test environment.
- Existing security advisor findings on older public definer helpers and leaked-password protection remain unchanged by this feature. Before real team rollout, review https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . No new table lacks RLS.

## Verification

`node --test scripts/chat.test.mjs scripts/chat-database.test.mjs` verifies follow-up tool calls, reference/proposal filtering, token accounting, query failures, assignment checks, financial-field projection, personal memory isolation, inactive accounts and anonymous access.

`node scripts/chat.cjs` checks the demo panel, follow-up history, successful saves appearing in subsequent retrieval, refresh persistence, persona separation and mobile width. Live model smoke test verifies a detailed grounded answer and anonymous cloud rejection (401).

Deploy migration `sculpy_conversations`, function `sculpy-chat`, then the static frontend. Gateway verification is disabled only because cloud mode performs explicit Auth verification and demo mode has no cloud data access. OpenAI credentials remain server-side.
