# Production operations and incident runbook

This runbook supports the engineering controls described in
[V7_RELEASE_BASELINES_AND_POLICY.md](V7_RELEASE_BASELINES_AND_POLICY.md) and
[ETHIOPIAN_MARKET_RELEASE_DECISIONS_2026-10-14.md](ETHIOPIAN_MARKET_RELEASE_DECISIONS_2026-10-14.md).
It is an operator procedure, not a substitute for an approved incident
notification policy, legal advice, provider-specific instructions, or a
tested recovery environment.

## Roles to assign before a release

| Role | Minimum responsibility | Named primary / backup |
|---|---|---|
| Incident Commander (IC) | Own severity, priorities, timeline, coordination and closure | Release record |
| Technical Lead | Diagnose, contain, restore and preserve technical evidence | Release record |
| Security/Privacy Lead | Scope identity/data exposure, access containment and evidence | Release record |
| Finance/Domain Controller | Assess ledger, settlement and reconciliation impact | Release record |
| Legal/Compliance Lead | Decide legal, regulator, affected-person and partner notifications | Release record |
| Communications Owner | Send approved internal/customer/provider communications | Release record |
| Release Owner | Approve pause, rollback, resume and customer-impact decisions | Release record |

One person may temporarily fill multiple roles in a small pilot, but the IC must
name the role assignments at incident start. The person deciding notification
obligations must have the relevant legal/compliance authority.

## Final release-owner sign-off matrix

The local implementation and disposable-environment evidence are useful for
engineering readiness, but they do not replace the required named approval
records below. Before a production release decision, the responsible owners
must record a named sign-off for each relevant standard and keep the evidence
reference with the release package.

| Control area | Required owner(s) | Evidence to retain | Status |
|---|---|---|---|
| Legal validity of notices and e-signatures | Ethiopian Legal + Leasing/Product | Counsel review, contract clause, test evidence, dispute handling | Gate: pending named sign-off |
| Provider legal basis and KYC / screening | Compliance + Legal + provider owner | Data basis, processor agreement, source review, adverse-action process | Gate: pending named sign-off |
| Finance / accounting policy | Finance Controller + Tax/Legal | Chart of accounts, close checklist, reconciliation evidence, sign-off memo | Gate: pending named sign-off |
| Service account lifecycle and rotation | Security + Platform Ops | Secret-manager inventory, rotation evidence, expiry review | Gate: pending named sign-off |
| Resilience, observability, DR / restore | IT/Operations + Security | Backup retention, restore rehearsal, log retention, blackout plan | Gate: pending named sign-off |
| Incident playbooks and release authority | Incident Commander + Release Owner | Role roster, severity decision tree, rehearsal report, go/no-go record | Gate: pending named sign-off |

No project delivery or release package should be treated as production-accepted
without the responsible owner filling the control record and attaching their
evidence reference.

## Cross-module production boundaries

Use the module-specific status table in
[PRODUCTION_ACCEPTANCE_PACK.md](PRODUCTION_ACCEPTANCE_PACK.md) when planning a
release. Workforce, Insurance, MFI/SACCO, Edir, property, marketplace, and
agency changes have distinct owners and legal/accounting/provider dependencies.
Do not infer one module's approval from another's, and do not enable a pilot
provider or regulated financial path through a configuration workaround.

## Severity and response

| Priority | Trigger examples | Initial handling |
|---|---|---|
| P1 — Critical | Suspected personal-data or credential exposure; unauthorized financial posting or ledger integrity concern; broad authentication/access failure; core service outage with material user impact; uncontrolled provider callbacks | Page the IC and Security/Privacy immediately. Freeze unrelated releases and pause the affected workflow or integration. Preserve evidence. Convene Finance and Legal/Compliance when relevant. |
| P2 — High | Confirmed degradation of a critical journey; isolated tenant/role exposure; payment or notification reconciliation backlog; failed recovery control with no confirmed data loss | Notify the IC and responsible service owner immediately. Contain within the affected boundary, monitor impact, and agree escalation to P1 if scope or integrity is uncertain. |
| P3 — Moderate | Limited defect with a safe workaround; isolated non-critical integration delay; accessibility blocker in a non-financial workflow | Create an owned incident/ticket, set a review time, and prevent unsafe manual workarounds. Escalate if risk or affected users grow. |
| P4 — Low | Cosmetic or low-impact operational issue with no security, privacy, legal, financial or availability risk | Track in the normal queue with owner and due date. |

If severity is uncertain and exposure or money integrity could be involved, start
at P1/P2 until evidence narrows the scope.

## First response checklist

1. Open a uniquely identified incident record. Capture reporter, discovery time,
   affected service/domain, observed symptoms, severity, current owner and
   correlation IDs. Do not put passwords, tokens, identity-document contents,
   or unnecessary personal data in the incident summary.
2. Name the IC and technical lead. Start a timestamped event log and keep
   decisions, actors, evidence references and state changes in the approved
   incident record or restricted evidence store.
3. Stop risky change: pause deployments and configuration edits not needed for
   containment. Avoid destructive cleanup, log rotation or database edits that
   could destroy evidence.
4. Bound the incident. Identify affected domains, roles, users, data classes,
   time window, provider callbacks, releases and database/file stores. Treat
   missing evidence as uncertainty, not as proof that no exposure occurred.
5. Contain narrowly. Disable or isolate only the affected endpoint, credential,
   provider or workflow using its approved operator control. Preserve safe
   read-only access where possible. Do not turn on a gated provider or legacy
   route as a workaround.
6. For a suspected compromised machine identity, revoke/rotate it using the
   service-account procedure below. For a suspected data exposure, restrict
   access and preserve relevant access/audit records. Do not copy exposed data
   into email, chat or an unapproved evidence location.
7. For a financial concern, stop the affected posting/settlement path, preserve
   journal and provider evidence, and reconcile from authoritative records.
   Correct posted facts only through the approved reversal workflow; do not
   update ledger rows directly.
8. For a privacy or legal incident, immediately involve Security/Privacy and
   Legal/Compliance. The authorized Legal/Compliance owner determines whether,
   when and to whom notification is required; engineering must not invent a
   deadline or mark a notification complete merely because an incident record
   exists.
9. Communicate verified facts, user impact, mitigations and next update time
   through the Communications Owner. Do not speculate on cause, legal effect,
   exposure count or restoration time.
10. Resume only after the Release Owner and responsible domain owner accept
    evidence that the cause is contained, access is safe, financial effects are
    reconciled, and monitoring is healthy.

## Machine identity and secret rotation

Apply this procedure to application credentials, database runtime roles,
service-gateway secrets, webhook secrets, signing keys and deployment
credentials. The hosting platform's secret manager and identity system remain
authoritative; this application does not store or rotate production secrets.

### Planned rotation

1. Confirm the identity has a named service owner, purpose, environment, scope,
   expiry/review date, current dependants and rollback contact.
2. Create a replacement credential in the approved secret manager. Do not
   print it, paste it into a ticket, command-line argument, source file or
   deployment log.
3. Deploy the replacement to a non-production environment. Verify
   authentication, least-privilege authorization, audit identity, expected
   failure behavior and monitoring.
4. Deploy to production using an approved change window. Where provider or
   platform semantics allow, overlap old/new credentials only for the shortest
   tested cutover window.
5. Verify the new identity is used by every instance and background worker.
   Check expected access and a denied out-of-scope operation.
6. Revoke the old credential immediately after successful verification. For
   database credentials, update connection pools/restart only through the
   approved service deployment; never grant extra table or RLS-bypass
   privileges to make rotation succeed.
7. Confirm no old credential use, record completion time and evidence
   reference, and update the inventory and next review/rotation date.
8. If verification fails, restore only the previously approved credential
   through the secret manager, keep the incident/change open, and investigate.
   Never extend an expired credential silently.

### Suspected exposure, owner departure or service retirement

- Treat exposure as an incident and rotate/revoke immediately; do not wait for
  the planned 90-day review.
- Revoke the identity, invalidate dependent sessions/tokens where supported,
  inspect audit use since the earliest plausible exposure, and restrict access
  while the new credential is verified.
- Remove retired principals and credentials from secret managers and
  deployment configuration. Preserve the access-control and revocation
  evidence according to the approved retention policy.
- Human administrative identities require MFA and individual attribution.
  Machine identities must not be used for interactive login or shared between
  unrelated applications/environments.

The 90-day review/rotation interval for unavoidable static secrets is a
proposed AfroLife engineering control, not a legal requirement. Prefer
short-lived workload identity and automated rotation when the hosting provider
supports them.

## Recovery and financial integrity

Do not start a production restore from this checklist alone. The IC, Technical
Lead, Database/Storage Owner and Finance/Domain Controller must approve the
target and recovery point. Use the target environment's tested restore
procedure and preserve the pre-recovery state for investigation.

1. Declare the recovery event and record the last known good time, affected
   services, proposed recovery point and accountable approvers.
2. Stop or isolate writes to affected systems. Coordinate all domains that use
   the shared writable database; do not recover one service to a different
   logical point without a documented reconciliation plan.
3. Restore the database and private files as one recovery set, using encrypted,
   access-controlled backups and the approved point-in-time recovery method.
4. Verify schema/migration version, database control totals, critical ledger
   invariants, file counts/hashes, permissions, RLS/runtime-role behavior and
   service health. Do not use a superuser-only check as proof of runtime access
   safety.
5. Finance/Domain Controller reconciles journal/subledger balances, bank or
   provider settlements, idempotency/replay state and queued callbacks before
   financial writes resume.
6. Technical Lead validates authentication, authorization, core API journeys,
   backups and alerting. Release Owner approves traffic restoration.
7. Record measured RPO/RTO, missing/duplicated transactions, discrepancies,
   customer impact, decisions and follow-up actions. Any missed approved
   recovery objective remains a release blocker until risk is accepted by the
   authorized owner.

## Release and rollback decision

Before deploying, record the exact source commit, migration range, operator,
maintenance window, enabled feature/provider flags, health/monitoring links,
backup reference, rollback owner and go/no-go approvers in
[V7_RELEASE_ACCEPTANCE_RECORD.md](V7_RELEASE_ACCEPTANCE_RECORD.md).

- Do not enable real screening, e-invoicing, payments, signature effect,
  external data transfer or regulated-finance behavior solely because code or
  a sandbox test exists. Require the applicable signed approval and provider
  evidence first.
- Apply schema changes with migration-only credentials. For non-backward
  compatible data migrations, use a reviewed roll-forward or restore plan;
  rolling back application binaries alone may corrupt compatibility.
- After deployment, verify health/readiness, error rates, latency, authentication,
  domain authorization, queue age, notification outcomes and finance
  reconciliation. Health endpoint success alone is insufficient.
- Pause or roll back when a P1 occurs, an integrity/security check fails, an
  approved SLO breach persists, or the responsible domain owner withdraws
  approval. The IC manages incident containment; only the Release Owner
  authorizes resumption.

## Post-incident review and exercises

Within five business days after a P1/P2 closes, the IC schedules a blameless
review with the service owner and affected domain/security/finance/legal
owners. Record a factual timeline, impact, detection/containment gaps,
contributing conditions, what worked, actions with accountable owners/dates,
and verification method. Do not include raw secrets or unnecessary personal
data. Review whether policies, controls, tests, service objectives, provider
contracts or training need revision.

During an invited pilot, exercise at least quarterly:

- compromised machine credential and revocation;
- provider timeout/duplicate callback and settlement reconciliation;
- privacy/data-exposure triage and legal notification decision path;
- database plus private-file restore and financial reconciliation;
- failed release/rollback and recovery from a partial migration.

Keep participant list, scenario, measured outcomes, decision log, issues and
retest evidence with the release record. A tabletop is not a restore test; a
restore test is not a production failover certification.
