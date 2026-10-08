# SCULP V1.0 — Input module implementation checkpoint
Date: 2026-10-07

## Product contract
Three core pillars: Input → Organize → Analyze. This checkpoint concerns Input only.

All entries require source fidelity:
1. Original text / full audio transcript / image transcribed text retained unchanged as source text.
2. AI produces a separate polished full transcript (polishedText), keeping corrections, uncertainty, chronology, and all facts.
3. AI generates short summary and individually reviewable notes, preferences, tasks and change proposals.
4. Each batch records recording-start timestamp, save timestamp, author, entry type and target. No AI proposal is a canonical field edit.
5. Only explicit confirmation saves the batch. Demo storage is browser-local, not shared or authenticated.

## Implemented in repository this session
- Improved existing context memory panel with source timestamp and independent full transcript review.
- Existing text and complete audio transcription still use the same reviewed extraction flow.
- Image input now accepts PNG/JPEG/WebP under 4MB via upload, clipboard paste and drag-and-drop into the dialog; calls a server-side image-to-text endpoint; inserts extracted text into source editor for human review before AI processing.
- Added browser assertions for timestamps and the polished preview.
- Maintained existing admin/artist demo rules and confirmation card safeguards.

## Not yet finished / do not claim supported
- Image binary archival: current image path retains extracted text and filename but NOT the original image bytes.
- Cross-session, multi-user durable writes: demo remains localStorage; production Supabase adapter is not live.
- New customer or booking CRUD from arbitrary natural language is not wired to canonical tables.
- Multi-entity source routing is limited to the current entity and explicit related targets.
- Screenshot transcription endpoint must be deployed and verified against an authorized test account; public demo input must contain only fictional data.
- Long audio, cancellation, mobile drag/drop and OCR accuracy require field testing.
- Record timestamp is initial panel-open time, not actual event occurrence time; event date should be an independent user-editable field in a future iteration.
- Full regression and deployment check must pass before release.

## Next acceptance test
Paste a fictional conversation screenshot; verify OCR text can be corrected; click organize; compare polished full text and review cards; confirm, refresh and verify source metadata; repeat with long voice transcription. Never test with real client records in public demo.

## Follow-up implementation — same development session
- Added IndexedDB browser-local image binary archive linked to confirmed memory batches; image input still requires OCR service availability. The archive is device/browser scoped, not shared cloud storage. Clearing browser site data also removes it.
- Added admin-only demo customer creation (name + city, same-name warning) and demo booking creation (selected customer, service date/type, artist and venue). Canonical placeholder values are explicitly identified; no automatic model-generated customer or booking creation yet.
- Added localStorage overlay collections `demoClients` and `demoBookings`; the app hydrates these into demo directories and booking views on reload, and demo reset clears these overlays. No actual Supabase production CRUD or cross-device persistence.
- Newest-first contextual records display original recorded time and save time.
- Added Playwright browser regression for creating customer and booking, refreshing and finding both. Automated workflow must succeed before calling this verified.

## Known next blockers
- Reviewable AI entity cards are implemented locally in the follow-up below; publishing and live-model acceptance remain blocked/pending.
- Image binary cloud storage, privacy controls, upload abuse protection and live authenticated data write path must precede any real-customer usage.
- Multi-image attachments in a single input and image previews need additional QA.
- Browser reset currently clears textual index but may leave orphaned local IndexedDB images; archive reset/purge should be added before claiming complete cleanup.

## Next-stage follow-up — reviewed entity intake (publication authorized)
- Added a separate `entity_intake` extraction contract and editable client/booking confirmation cards for demo administrators, without requiring an existing target first.
- IDs are resolved locally only for an exact unique name; ambiguous/missing references remain blank. Invalid calendar dates, missing required booking fields, duplicate client names and same-client/date/service bookings are blocked.
- Entity and original source batch persist in a single localStorage write; image originals use the existing archive with rollback on a failed entity write. Changing source invalidates the proposal.
- Verified: 22 Node tests, `scripts/intake.cjs`, and existing `scripts/context-memory.cjs` pass locally with stubbed AI. Mobile overflow checked; Chinese font rendering unavailable in this local browser environment.
- No production schema changes or real customer writes. User authorized publication; sculpy-ai v4 deployed. Frontend proceeds through PR verification before publication. Live sample results are recorded in WORK_LOG.md.
- Scope remains one confirmation at a time. For a new client plus booking, create the client then identify again; no batch multi-entity transaction or production CRUD is claimed.
