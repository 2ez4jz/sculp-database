# SCULPY V2.4 — 2026-11-02

Status: production frontend, database and sculpy-intake v2 deployed and verified; physical-device and authenticated live-model acceptance remains open.

## Changes

- Lead/Enquiry and Booking details share an authenticated communication panel. Original text, author and server timestamp are immutable; attachments use private Supabase Storage, never Demo localStorage.
- Multiple PNG/JPEG/WebP screenshots (10 MB/file) and audio (5 MB/file); 20 attachments/save. Text has no UI/SQL length cap. AI batches are explicitly limited to 50 selected records, 10 screenshots, 18 MB attachments and 100,000 text characters. Larger batches fail visibly and preserve all originals rather than silently truncating.
- Existing `sculpy-intake` Edge Function authenticates the session and checks active owner/operations access before reading sources or calling OpenAI. Existing `OPENAI_API_KEY` and transcription helpers are reused. The summary endpoint reads exact server-authorized source IDs and private bytes, never browser-supplied customer snapshots.
- Five editable summary sections; explicit human confirmation creates a separate immutable version with source IDs and approver. New records remain pending. AI does not write formal dates, prices, assignments or payment fields.
- Conversion reuses the existing intake transaction, client matching and duplicate checks. Lead link, attribution and booking are written atomically, with immutable request replay. All communication history remains linked to the original Lead and visible in Booking. The resulting order is still inquiry; actual signing and won status keep existing human confirmation steps.
- Desktop sign-in and authenticated layouts are separated. Authenticated desktop has a 216 px sidebar, wide content, three metric cards, two chart columns and two-column original/summary comparison. Tablet and phone collapse progressively, with 16 px input text, 44 px controls, stacked content and contained table scrolling.
- Owner/operations communication inbox opens pending customer records; new inquiry shortcut appears at the top. Raw client communication and files are intentionally restricted to active owner/operations accounts; staff retain their existing assigned-booking access without access to private manager communications.

## Reused modules and compatibility

`website_enquiries`, canonical Booking/Client tables, `sculpy_private.confirm_intake`, `sculpy_wedding_command`, existing client match UI, microphone lifecycle/audio container detection, `sculpy-intake`, existing server-side API secret, current Pages workflow and existing financial/order/chat behavior.

The additive migration creates three public RLS tables and private replay state, privileged implementations in the non-exposed private schema, SECURITY INVOKER public wrappers with explicit grants, private Storage bucket and policies. It replaces no existing table, policy or business function. Deploy migration and Edge Function before merging the frontend. See V24_ROLLBACK.md.

## Verification

- Local database integration exercises full migrations, long originals, attachment metadata and private object policies, two manager identities, disabled/artist/anonymous isolation, human-edited summaries, scoped source selection, pending counts, conversion, client/booking deduplication and lost-response replay.
- Backend tests use mocked OpenAI/storage transport to verify authorization precedes model access, exact source authorization, actual image bytes in multimodal input, no writes, failure of unavailable/oversized sources, structured draft response and retry identity.
- Browser acceptance script uses fictional SDK/model/storage replacements, real PNG buffers and actual application components. It checks 1920/1440/1024/768/390/360 widths, multiple uploads, lost acknowledgment, edited summary confirmation and retained history after conversion. These are UI contract tests, not a live API or real-device test.
- Existing financial, booking, AI contract and product-knowledge tests remain required. One old monthly-report fixture was corrected to assert cancellation by service month rather than the computer's current cancellation month; production reporting code is unchanged.

## Human acceptance still required

Miranda's physical phone microphone permission/audio quality and camera-roll selection; authenticated real OpenAI summary quality; actual manager sign-in on phone and desktop reading the same saved note and private attachment; long-running use/reconnection. Test data must be fictional. No real customer information is added to the public Demo.

## Deployment evidence

Record migration, Edge version, merged PR/SHA, Pages workflow conclusion and production resource checks here after verification. A merge alone is not release evidence.


Production backend verification: private bucket/RLS/grants inspected; transactional Lead→record→edited summary→conversion/replay→unauthorized read probe passed and rolled back. Counts remained 0 bookings, 0 clients, 4 pre-existing enquiries, 0 communication records/summaries. Existing live sculpy-chat v45 contains native long-term-memory changes beyond main; preserve that runtime when updating release knowledge rather than redeploying older main chat code.


## Verified release evidence

- PR #37 merged after both browser and PostgreSQL checks succeeded: `bb212fbf18fd9d6fe7e22a3e75e900ecef44bfd2`, CI run `41438030432`.
- Squash merge: `3bd9f7321fed06c9e601cdaa95152ae24f6466ed`.
- Pages deployment run `41438356984` completed successfully. Production index, studio CSS, communication panel and authenticated entrypoint returned HTTP 200 with byte-for-byte matches to the deployed source. URL: https://2ez4jz.github.io/sculp-database/
- Additive production migration applied successfully; all three public tables have RLS, anonymous RPC access is revoked, public wrappers are SECURITY INVOKER, and the file bucket is private.
- `sculpy-intake` v2 is ACTIVE. Summary/voice endpoints reject unauthenticated requests with HTTP 401. The existing API secret remains server-side.
- Local suite: 183 passed, 2 PostgreSQL-only concurrency tests skipped. PostgreSQL CI and backup/recovery passed. Fictional UI fixtures exercised six viewport widths and two real-format PNG uploads, lost-response replay, manual summary edits and conversion history.
- Formal database transactional smoke passed and rolled back; business row counts returned to their exact prior values. This does not establish real account cross-device operation or model/transcription quality.
- The two checked-in screenshots are fictional UI acceptance views, not real business data.

[Desktop view](screenshots/v24-desktop-20261102.jpg) · [390px phone view](screenshots/v24-mobile-20261102.jpg)

Chat release knowledge: sculpy-chat v46 deployed ACTIVE and re-read successfully. All 15 non-knowledge files from live v45 remain byte-for-byte unchanged, including native long-term memory and diagnostics; only release knowledge and the shared V2.4 facts module changed. Main remains behind those earlier live-only implementations: reconcile that pre-existing drift before any future full chat deployment.
