# SCULPY V2.5 — Communication screenshot drag/drop — 2026-11-02

Status: implementation; not yet published. Baseline main 4012a81.

## Change

The existing Lead and Booking communication composer now accepts dropped files anywhere within that communication panel. A small composer hint and muted green hover state identify the destination. Nested child drag events retain the highlight. Ordinary text drags keep native browser behavior; file drops are prevented from navigating away, including while the record is saving or awaiting retry.

Dropped files and the retained mobile/keyboard file picker share the existing staging list, remove controls and prepareCommunicationFile validation. Screenshots remain PNG/JPEG/WebP up to 10 MB each, voice retains the existing rules, and the whole draft remains limited to 20 attachments. Invalid, empty and oversized files are reported; valid files in a mixed batch are retained. Nothing is uploaded or saved automatically: the user still clicks 保存记录. An uncertain save keeps the exact request and attachment payload frozen for retry. No changes to database, Storage permissions, AI interpretation or business fields.

## Verification

Local syntax and 18 focused chat/multistep/communication checks passed. Browser CI, desktop/mobile visual review and actual deployment readback are pending. Browser acceptance uses only fictional customer data and real PNG-format fixture bytes; Auth, AI and Storage transport are mocked. Existing SQL permission tests remain separate from those UI fixtures.

## Release and rollback

Pending PR and deployment. Reuse the existing GitHub Pages workflow. Restore the prior frontend resources to roll back; no database migration or data deletion is needed. Runtime product knowledge will be updated only after actual source publication, preserving the newer live AI implementation.
