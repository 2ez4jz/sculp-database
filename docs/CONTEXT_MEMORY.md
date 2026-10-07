# Contextual Sculpy input

## Delivered UI

A shared right-side dialog (bottom sheet on phones) opens from the floating
“记一下” button or an entity's “告诉 Sculpy” button. Booking, client, artist, venue
and partner detail pages preselect their entity. Lists, media, Insights and
settings require explicit selection. The existing Sculpy page retains its own
input; the floating button is hidden there to avoid duplication.

The user can record audio or type, edit the transcript, request extraction,
review/edit/uncheck cards, and save. Cards always name their destination. An
order may add preferences to its linked customer or experience to its linked
venue/partners. Follow-ups may have an explicit date and assignee; an unspecified
date/assignee stays visibly unresolved. New records preserve the source text,
author, input method and source entity. Profile and order pages show the records;
confirmed customer preferences also appear in the existing preference sections.

Changing the destination invalidates proposals. Closing preserves unsaved text
in memory for that entity, but changing identity clears those drafts. Page
navigation closes the panel, stops microphone capture, and invalidates pending
extraction/transcription. Text drafts do not survive a browser refresh.

Amounts, dates, staffing and status changes are recorded as pending requests,
never applied to canonical fields. Employee customer preferences also remain
pending; they do not overwrite the customer's preferences. A manager approval
UI for pending items is not included in this increment. Managers can read the
proposal and manually add their confirmed preference as a separate record.

## Persistence status — do not confuse Demo with cloud

The deployed application still loads `src/data/demo.js` and simulates roles.
It has no authenticated session or real UUID-backed records. This feature uses
`createDemoMemoryRepository` in demo mode; saving is explicitly labeled local.
The complete batch is written atomically under the existing localStorage key
before changing application state. Failed writes retain the input for retry.
Request IDs make duplicate submission idempotent.

`createCloudMemoryRepository` is an integration adapter, not an enabled cloud
connection. Production mode fails closed without an authenticated Supabase
client; it never falls back to localStorage. `app.js` deliberately passes no
client while the app still uses demo arrays. Enabling cloud requires:

1. A private staging/production Supabase project and invite-only authentication.
2. Loading real, permission-scoped entities instead of demo arrays.
3. Applying migrations 001–003 and verifying actual REST/RLS grants.
4. Injecting the authenticated client into the repository and mapping cloud
   batches/items back to the UI's memory model. Cloud loading is not wired yet.
5. Resolving the pre-existing sensitive-column/RLS and public-AI blockers in
   `ARCHITECTURE.md` before sending real records to extraction.

No SQL was applied to a live database in this change.

## Backend contracts

`extract` accepts `pageContext.mode = context_memory`, a selected `entity`
(`type`, `id`, `label`) and related entities. The updated handler returns summary,
optional `items` (kind, entityType, entityId, text), warnings and confidence.
Unknown target IDs and non-client preferences are filtered. The endpoint is
still a public demo endpoint; target filtering is not authentication.

Before the updated Edge Function is deployed, the client also accepts the old
summary/preferences/opportunities format. That supports the primary note,
customer preferences and follow-ups; automatic per-venue/per-partner suggestions
need the updated handler. Users can still add/edit related cards manually.
Mock mode preserves raw text and explicitly requests manual categorization;
it does not claim AI inference took place.

Migration 003 adds `context_memory_batches`, `context_memory_items` and the
`save_context_memory` RPC. It verifies active identity, actual root ownership,
allowed linked entities and task assignees server-side. It derives status rather
than trusting the browser. Within one transaction it writes an `ai_drafts`
confirmation, original text, selected items and an audit event. Row policies
scope reads, direct table writes are revoked, and retries use a transaction lock.
This annotation transaction never changes order amounts, dates or assignments.

## Verification

- Domain tests: allowed targets, employee preference review, invalid AI targets,
  local-storage rollback/idempotency, no cloud fallback and private requests.
- Backend contract test: context schema and hallucinated-ID filtering.
- PGlite PostgreSQL tests apply all three migrations (only the pgcrypto extension
  statement is omitted; UUID generation uses built-in PostgreSQL support), then
  verify role restrictions, all-or-nothing writes, idempotency and audit linkage.
- Browser tests cover recording, all entity types, linked customer preferences,
  refresh persistence, empty list attribution, in-session drafts, employee scope,
  and mobile width. Existing smoke/permission/lifecycle tests remain required.

PGlite is a local SQL check, not proof of a live Supabase deployment. No new
runtime frontend dependency is introduced.
