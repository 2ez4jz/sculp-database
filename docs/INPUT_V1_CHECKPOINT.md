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
