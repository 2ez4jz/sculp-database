# Sculpy — SCULP Studio internal app

Every SCULP booking becomes a record connecting the client, artist, venue, partners, notes and photos.

## Run

No build or dependencies required. Run `python -m http.server 4173` in this folder and open http://localhost:4173.

## Included

- 24 linked bookings, 12 fictional clients, 9 team profiles, 6 venues and 8 partners.
- Booking list and month calendar, global booking search, artist/service/status/date/venue filters.
- Client, artist, venue and partner profiles with calculated collaboration history.
- Booking notes with original text, prepared demo summaries and structured preferences.
- Galleries, category filters, full-size image previews and personal portfolio selection/reordering.
- Official artist galleries read directly from each member's public SCULP Studio portfolio. Remaining public site work is assigned to Miranda; studio interior/location images are excluded.
- Admin/Artist interface simulation. Artist view only shows assigned bookings, service details and own statistics; CRM/contact details and marketing opportunities are hidden in the interface.
- Sculpy voice capture, deploy-ready OpenAI transcription, reviewed AI extraction, semantic demo-database search and browser-local note persistence.
- Installable web-app manifest, Demo/Production configuration boundary and formal Supabase schema with row-level policies.
- Context-aware Sculpy voice/text panel on order and profile pages, reviewed multi-destination notes/preferences/follow-ups, and browser-local persistence. See `docs/CONTEXT_MEMORY.md` for cloud integration prerequisites.
- Eight-step presentation mode and responsive layouts.

## Demo boundaries

This repository is public and contains only fictional business records. Existing SCULP portfolio images are associated with mock bookings solely to demonstrate navigation; those associations do not describe real clients or services.

Identity switching is an interface simulation, not authentication or data protection. All seed data is shipped to the browser. Do not add real client information until server-side access controls exist.

The intended production access model has two global business viewers only: Jz (`operations`) and Miranda (`owner`). Jz additionally sees system health, data quality, AI configuration and audit events. Miranda sees the full business view without technical administration. Artists see only assigned work and their own portfolio.

Sculpy's online mode runs through one Supabase Edge Function. OpenAI credentials remain in Supabase Secrets and are never shipped to the browser. Search receives only the repository's fictional demo catalog; no real client records are present. The checked-in config currently selects `openai` mode; `mock` is an explicit configuration override, not an automatic fallback. Added notes and portfolio choices still persist only in the current browser via localStorage.

## Presentation path

Use **发布会演示** on Bookings: bookings → wedding detail → client → venue → photographer → artist → media → Sculpy. On the last step select **试试发布会示例**, review the fields, save, then show the added record in the booking.

## Production foundation

`supabase/migrations/001_initial_schema.sql` defines the V1 foundation. `supabase/migrations/002_production_core.sql` adds production billing, payments, consent history, strict Jz/Miranda access boundaries, auditable AI conversations and trusted reporting views. See `docs/DATABASE_V2.md` for the full model and rollout order. `supabase/seed_team.sql` contains only public employee profiles and service definitions. Connect a private Supabase project plus server-side OpenAI endpoints before enabling real login or importing client data.

## Cloud intake (2026-10-08)

Authenticated owner/operations accounts can open **录入新订单**, retain the original message, review a client match and booking fields, and explicitly save through `sculpy_confirm_intake`. The transaction persists the client, booking, optional artist assignment and source together. Cloud details and Sculpy context read the same canonical booking. Budget is not price; unknown times/prices are not guessed. Demo entry remains local-only.

The new AI extraction function is implemented but **not deployed or enabled**: automatic approval review requires explicit authorization to send customer source text to OpenAI. `cloudIntakeAiEnabled` remains `false`. See [the work log](docs/WORK_LOG.md) for verification and remaining acceptance boundaries.
