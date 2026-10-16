# Next release gate: MEMORA team CRM architecture

This proposal is reviewable but is not applied to production. The user's V3 authorization requires confirmation before a major architecture migration or sensitive permission changes.

## Current state and exact gap

The existing D1 workspace key is a Sites user ID. This enforces owner-private data but cannot represent a business with an owner, manager and multiple staff members. A browser role dropdown or a model's claim is not access control. Converting personal snapshots into shared enterprise records changes the trust boundary and must be staged separately.

## Proposed target

Keep the existing Worker and D1 service. Add `crm_workspaces(id,name,industry,created_by)`, `crm_memberships(workspace_id,user_id,role,active,revision)` and normalized `crm_customers`, `crm_interactions`, `crm_tasks`, `crm_attachments` and `crm_commands` keyed by workspace ID. Roles: owner (membership and full business access), manager (business operations, no membership grants), staff (assigned customers/tasks and own attachments), viewer (explicit scoped reads). Every server query uses the verified Sites user ID and a current membership lookup. No role or workspace supplied by the model/client grants access.

## Safe rollout

1. Build and test the new tables and repository behind a disabled feature flag, including cross-workspace denial, inactive-member denial, staff financial redaction, reassignment and stale-approval tests.
2. Obtain a D1 backup/export and record the existing live Site version. Rehearse restoration in an isolated test database. Do not include real data in public GitHub artifacts.
3. Copy each existing personal snapshot to a new private workspace whose only member is the same owner. Verify counts, relationships, cents-based financial totals and attachments before any cutover. Do not overwrite or delete the original snapshot.
4. Start read comparison with no shared member access. Enable the new read/write repository for the owner after acceptance, then freeze the old snapshot as rollback material.
5. Add real team members only after the owner identifies recipients and confirms their roles; preserve the existing Site audience until that separate sensitive access decision.

## Rollback and risks

Rollback disables the team-repository flag and returns to the untouched personal snapshot. Any writes after cutover must be exported and reconciled before rollback; blindly restoring old data would lose new work. Main risks are inconsistent dual writes, stale membership caches, exposing money/contact information to staff, and attachment URLs bypassing membership. No production schema conversion, team invitation, paid service, or audience change is included in the current candidate.

## Approval needed

Authorize development and staged rollout of this personal-to-team data architecture. The production cutover and actual team grants should follow the verified staging result and named role assignments. This is a separate gate from publishing the current fictional V3 candidate.
