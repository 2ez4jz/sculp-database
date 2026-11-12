# Cloud operations V1 — local implementation and acceptance

This iteration adds canonical order editing and a minimal authenticated cloud
monthly report. It preserves the existing intake, chat, demo and approval paths.
Implementation and local validation are complete. The new migration and frontend
have not been deployed; real Supabase authentication and two-device acceptance
remain outstanding. Local PostgreSQL is a test environment, not the live project.

## Development

Use Node.js 24 and Python 3. Run `npm ci`; the lockfile pins development/test
dependencies. The static application still has no build step or runtime npm
dependency. Start `python3 -m http.server 4173` from the repository.

- `npm test`: existing unit/contract/PGlite suites and new cloud operations checks.
- `npm run test:postgres`: requires `SCULPY_TEST_DATABASE_URL` pointing to a local
  PostgreSQL server whose test user can create databases and roles. It creates and
  drops uniquely named test databases, never applies migrations to the supplied
  database. Non-loopback hosts are rejected. Authentication is represented by a
  test Auth schema and role/JWT subject, not a real Supabase token.
- `npm run test:recovery`: also requires `SCULPY_TEST_POSTGRES_CONTAINER` naming
  that local PostgreSQL Docker container. It uses pg_dump/psql to restore a newly
  created fictional fixture into another new database, verifies its records,
  audit, functions and grants, then removes both databases. It does not test a
  production backup or recovery policy.
- With the static server running, set `CHROME_PATH` to a usable Chrome binary and
  run `node scripts/cloud-operations.cjs`. The existing nine browser scripts remain
  required. New browser checks use mocked RPC responses; separate PostgreSQL
  tests exercise the real database functions and multi-connection locks.

The CI includes frozen dependency installation, the existing suites, a new
PostgreSQL 17 job, concurrent-write tests and fixture backup/recovery.

To create an ephemeral local PostgreSQL test server (no production data):

```bash
docker run --rm --detach --name sculpy-test-postgres \
  --publish 127.0.0.1:55432:5432 \
  --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17
docker exec sculpy-test-postgres pg_isready -U postgres
export SCULPY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/postgres
export SCULPY_TEST_POSTGRES_CONTAINER=sculpy-test-postgres
npm run test:postgres
npm run test:recovery
docker stop sculpy-test-postgres
```

Wait for pg_isready to succeed before the tests. This passwordless setup is only
for an isolated local test server bound to loopback, with disposable fictional data.

## Migration and permission boundary

Apply the complete existing migration chain followed by
`20261009190000_cloud_order_operations.sql` in a private test Supabase project
first. Do not rename or edit older applied migrations. The full chain is exercised
with realistic Supabase default table/sequence grants in both test backends.

The new migration removes direct browser-role privileges on clients, private
client records, bookings, assignments, service line items, compensation, service
catalogs with prices, venues with internal notes, partners with contacts, invoices,
payments and the two existing financial views. This closes whole-row access to
money and prevents canonical writes bypassing transaction validation. Existing
supported cloud UI accesses these records through role-checked RPCs. Inventory
any external scripts or integrations that relied on direct browser-role table
access before rollout. Profile, preference, conversation, company-rule and
context-memory APIs keep their existing permission model.

Only active `owner` and `operations` profiles can modify orders or request global
reports. Assigned active artists can read the safe order projection and cannot
read amounts, budgets, intake source or editor metadata. Anonymous, unassigned,
disabled, read_only and legacy admin profiles cannot invoke privileged operations.
Operations can read technical change/audit records; owner does not gain that access.

## Order modification

`sculpy_order_detail(booking_id)` adds an administrator-only `edit` snapshot with
a monotonic version, Toronto date/time, optional end date/time, location, service
details and status. Imported sub-minute timestamps survive unrelated edits.
Changing a linked venue's displayed name replaces the venue association with the
explicit free-text location; unchanged venue/location fields retain the link.

The UI shows before/after values and a required change reason. Cancel makes no
write; changing the form invalidates the review. Confirmation calls
`sculpy_confirm_booking_change(request_id, booking_id, expected_version, payload,
reason)`. Money, payment, customer identity, service type and personnel assignment
are deliberately outside this first editing contract. AI pending-change cards
are not automatically connected to canonical writes.

The database checks current active role, explicit confirmation, a strict field
allowlist, actual dates, Toronto DST ambiguity, end/start ordering and potential
same-client/day/service duplicates. Inquiry must become confirmed before completed;
terminal orders must reopen to inquiry before transitioning to another status.
An order row lock and version check prevent stale writes. An advisory lock and
exact request record make lost-response retries idempotent, including two clients
retrying simultaneously. The database transaction preserves reason and before/
after values with the existing audit trigger. Late failures roll back all writes.

The UI keeps uncertain requests frozen for same-request retry and blocks replacing
the editor while the result is uncertain. A known version conflict requires a
fresh order read; it never silently overwrites. Browser closure/logout can still
interrupt a request: reread the order and operations audit before repeating an edit.

## Reporting contract

`sculpy_monthly_report(month)` accepts one YYYY-MM month, 2000–2099, and checks
the administrator role in the database. The cloud workspace exposes a query panel.
Sculpy chat can now call the same RPC through the read-only `query_monthly_report` tool for authenticated owner/operations users. It supports whole calendar months, not channel/client/artist cross-filters. Report-derived turns retain a business-access marker and are hidden after role downgrade. Real-account conversational acceptance remains outstanding.

- All periods use America/Toronto calendar boundaries.
- Service-month order counts distinguish inquiry, confirmed, completed and cancelled.
  Total excludes cancelled. Soft-deleted orders are excluded.
- Completed-order CAD value uses service line totals when available, otherwise an
  explicit booking price. Missing prices increase `unpriced`; they are not invented
  as zero. Non-CAD records are counted and omitted from CAD sums.
- Receipt-month **gross original receipts** use actual paid_at, with succeeded,
  refunded and partially_refunded status. Original amounts remain included after
  refund; the report explicitly says this is not net receipts. Soft-deleted
  invoices/orders are excluded. This is operational reporting, not an accounting
  revenue-recognition or profit figure.
- The current schema has no dated refund amount ledger, so refund deduction/net
  receipt reporting is not implemented. Refund statuses produce a review count.
  Missing paid_at payments are excluded from month allocation and reported as a
  global historical quality warning; created_at is never substituted.
- Integer cents are serialized as strings and formatted using BigInt in the UI,
  avoiding floating-point arithmetic. The returned asOf marks query time.

## Verified locally

- Full migration chain and seven-profile permission matrix, direct table denial,
  source/financial isolation and account deactivation.
- Exact replay, stale edits, rollback, duplicate prevention, unchanged timestamp
  precision, formal status transitions, and reason/before/after audit records.
- Toronto month boundaries, cross-month service/payment, line-item precedence,
  zero/unknown/non-CAD handling, refund limitations and missing payment dates.
- PostgreSQL 17 with two independent connections: one winner for competing edits,
  one write for concurrent identical replay.
- PostgreSQL fictional fixture dump/restore preserved version, change records,
  audit, reporting functions and canonical table grants.
- Browser confirmation/cancel, escaped content, frozen retry, explicit conflict,
  stale report response, role-specific controls, workspace refresh and 390px layout.

## Release acceptance still required

1. Confirm private test project, inventory custom API consumers and apply migration.
2. Sign in with test owner, operations and assigned artist accounts. Create a
   fictional order on device A, query/update on device B, and reread on device A.
3. Exercise real login revocation, direct REST access denial, unauthenticated RPC
   rejection, stale two-tab edit and lost-response retry with actual sessions.
4. Reconcile report fixtures manually. Verify a project backup/restore process
   separately; the local fixture drill does not establish production recovery.
5. Publish the frontend after migration/API acceptance; perform deployed smoke and
   team review before real-data import. Preserve the prior frontend version for
   rollback; do not restore broad financial/table grants to undo a UI problem.

Follow-up iterations: safe service/personnel changes, reviewed Sculpy change
application, payment entry and dated refunds, cloud channels, reminders, real
voice acceptance, private attachments and correctable personal memory.
