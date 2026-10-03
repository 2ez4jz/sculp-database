# Sculpy — SCULP Studio internal app

Every SCULP booking becomes a record connecting the client, artist, venue, partners, notes and photos.

## Run

No build or dependencies required. Run `python -m http.server 4173` in this folder and open http://localhost:4173.

## Included

- 24 linked bookings, 12 fictional clients, 8 real public employee profiles, 6 venues and 8 partners.
- Booking list and month calendar, global booking search, artist/service/status/date/venue filters.
- Client, artist, venue and partner profiles with calculated collaboration history.
- Booking notes with original text, prepared demo summaries and structured preferences.
- Galleries, category filters, full-size image previews and personal portfolio selection/reordering.
- Admin/Artist interface simulation. Artist view only shows assigned bookings, service details and own statistics; CRM/contact details and marketing opportunities are hidden in the interface.
- Sculpy voice capture, mock transcription, reviewed AI extraction, database search and browser-local note persistence.
- Installable web-app manifest, Demo/Production configuration boundary and formal Supabase schema with row-level policies.
- Eight-step presentation mode and responsive layouts.

## Demo boundaries

This repository is public and contains only fictional business records. Existing SCULP portfolio images are associated with mock bookings solely to demonstrate navigation; those associations do not describe real clients or services.

Identity switching is an interface simulation, not authentication or data protection. All seed data is shipped to the browser. Do not add real client information until server-side access controls exist.

Sculpy currently runs in `mock` mode: microphone capture is real, but transcription, extraction and search responses are local controlled samples. The three API contracts are documented in `docs/API_CONTRACT.md`; no OpenAI key is shipped to the browser. Added notes and portfolio choices persist only in the current browser via localStorage.

## Presentation path

Use **发布会演示** on Bookings: bookings → wedding detail → client → venue → photographer → artist → media → Sculpy. On the last step select **试试发布会示例**, review the fields, save, then show the added record in the booking.

## Production foundation

`supabase/migrations/001_initial_schema.sql` defines the production data model, audit events and row-level access policies. `supabase/seed_team.sql` contains only public employee profiles and service definitions. Connect a private Supabase project plus server-side OpenAI endpoints before enabling real login or importing client data.
