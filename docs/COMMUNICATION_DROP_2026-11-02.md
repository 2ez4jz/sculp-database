# SCULPY V2.5 — Communication screenshot drag/drop — 2026-11-02

Status: deployed and public-source verified on 2026-11-02. Baseline main 4012a81.

## Change

The existing Lead and Booking communication composer now accepts dropped files anywhere within that communication panel. A small composer hint and muted green hover state identify the destination. Nested child drag events retain the highlight. Ordinary text drags keep native browser behavior; file drops are prevented from navigating away, including while the record is saving or awaiting retry.

Dropped files and the retained mobile/keyboard file picker share the existing staging list, remove controls and prepareCommunicationFile validation. Screenshots remain PNG/JPEG/WebP up to 10 MB each, voice retains the existing rules, and the whole draft remains limited to 20 attachments. Invalid, empty and oversized files are reported; valid files in a mixed batch are retained. Nothing is uploaded or saved automatically: the user still clicks 保存记录. An uncertain save keeps the exact request and attachment payload frozen for retry. No changes to database, Storage permissions, AI interpretation or business fields.

## Verification

Local syntax and 18 focused chat/multistep/communication checks passed. Checked-head CI 41528784478 passed: 106 unit checks, 26 ephemeral database checks (3 PostgreSQL-only skips), 25 real PostgreSQL checks with no skips plus backup/recovery, and all existing browser regressions. Extended communication browser checks passed for Lead and Booking multi-image drops, nested hover, native text drops, mixed invalid/oversize/empty input, file-picker coexistence, no auto-save, frozen retry payload, 20-file limit/removal, saved image preview, AI summary confirmation and conversion history, across seven widths from 320 to 1920px. Desktop and 390px phone UI were also inspected; a real file chooser selected two fictional PNG fixtures successfully. Browser acceptance uses only fictional customer data and real PNG-format fixture bytes; Auth, AI and Storage transport are mocked. Existing SQL permission tests remain separate from those UI fixtures.

## Release and rollback

PR [#43](https://github.com/2ez4jz/sculp-database/pull/43) passed checked-head CI and merged as 4495e0aa75f543d283516a1fce97fc9900c6c7a4. Existing Pages deployment [41529319802](https://github.com/2ez4jz/sculp-database/actions/runs/41529319802) succeeded. All seven changed public frontend files were downloaded and matched released bytes: index, bootstrap, login, workspace, enquiries, communication panel JS and CSS. Code merge and test fixtures alone were not used as proof of publication. Restore the prior frontend resources to roll back; no database migration or data deletion is needed. sculpy-chat v51 is ACTIVE. Only the shared release/capability facts changed; all 16 other v50 files, including long-term-memory and model execution code, are preserved byte-for-byte. All 17 deployed files were read back and matched. Final chat/multistep/communication checks: 18/18 pass after the knowledge update. No existing push acceptance status is changed. Desktop screenshot uses fictional data: [attachment staging](screenshots/communication-drop-desktop-20261102.jpg). Native file-manager/WeChat drag behavior on the team’s own devices remains a normal business acceptance check; CI exercises real browser DataTransfer/File objects, not a physical OS drag gesture.


## Prominent top drop frame — 2026-11-02

Follow-up requested a clearly visible drag frame above the text input. Adds a full-width muted green dashed frame with upload icon, “拖拽截图到这里” and a click-to-choose shortcut before the textarea. Existing mobile picker, staging, limits, explicit save and retry guards are retained. Implementation/verification/publication pending.
