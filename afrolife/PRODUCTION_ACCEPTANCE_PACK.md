# AfroLife production acceptance pack

This pack consolidates the operational readiness, incident response, and approval evidence needed before a production release decision for the existing AfroLife Agency and property platform. It is intentionally conservative: local engineering evidence supports the implementation, but it does not establish legal, provider, finance, or regulated product approval.

## 1. Executive decision

The current platform remains in a guarded production-readiness state rather than a full production-authorized state. The implementation is hardened for the existing platform, its legacy flow remains protected, and regulated or legal-effect features stay disabled until named owners sign off on the applied policy and evidence.

The approval gate includes these areas:
- legal validity of notices and electronic-signature evidence
- provider legal basis, data-processing, and KYC / screening approval
- finance and accounting policy sign-off and reconciliation evidence
- service-account lifecycle, rotation, and secret-manager governance
- resilience, observability, accessibility, capacity, and DR acceptance
- incident playbooks and named release-owner sign-off

## 2. Named approval matrix

| Area | Primary owner | Secondary owner | Required evidence | Decision status |
|---|---|---|---|---|
| Legal / notice validity | Ethiopian Legal | Leasing/Product | counsel review, contract clause review, signed approval record | Pending named sign-off |
| Provider legal basis and KYC | Compliance Lead | Legal + provider owner | lawful-basis review, contract, data flow, retention assessment | Pending named sign-off |
| Finance/accounting policy | Finance Controller | Tax counsel / CFO | chart of accounts, close checklist, reconciliation evidence | Pending named sign-off |
| Service identities | Security Lead | Platform Ops | inventory, rotation, expiry, revocation record | Pending named sign-off |
| Disaster recovery and backups | IT / Operations | Security + Finance | restore rehearsal, target RPO/RTO, evidence record | Pending named sign-off |
| Release ownership | Business/Product Release Owner | Technical Release Owner | go/no-go record, open-risk list, rollback plan | Pending named sign-off |
| Incident management | Incident Commander | Security/Privacy | severity matrix, contact tree, drill record | Pending named sign-off |

The actual approver names must be recorded in the running release package; the repository itself should not assume that they are the same person or a current role holder.

## 3. Operational readiness checklist

### Platform and access
- [ ] Ownership and role matrix are current for every platform area.
- [ ] Super-admin and global-admin escalation is documented and approved.
- [ ] MFA and machine-identity controls are in place for human and service accounts.
- [ ] Database roles, file access, and runtime permissions remain least privilege.

### Finance and ledger integrity
- [ ] Ledger boundaries remain separated and balanced by domain.
- [ ] Period-close checks are recorded and reviewed by Finance.
- [ ] Owner statements are read-only and reconciled against the current ledger.
- [ ] Journal corrections use the approved reversal workflow and are not direct edits.

### Service and recovery hardening
- [ ] Backups are encrypted, access-controlled, and retained per policy.
- [ ] Restore rehearsal has been performed on a dedicated disposable target and compared to control totals.
- [ ] Monitoring and alerting cover core service degradation, failed backup, and ledger anomalies.
- [ ] RTO / RPO objectives are document-controlled and approved by the accountable owner.

### Privacy, legal, and provider controls
- [ ] All external provider integrations remain disabled unless a lawful basis and approval record exist.
- [ ] Document retention, deletion, access, and correction pathways are reviewed.
- [ ] Incident notification, regulator, and affected-person decision paths are documented and assigned.

## 4. Incident playbook summary

The incident playbook is defined in [PRODUCTION_OPERATIONS_RUNBOOK.md](PRODUCTION_OPERATIONS_RUNBOOK.md). The core sequence is:
1. Record the incident with a unique reference and timeline.
2. Assign the Incident Commander, Technical Lead, Security/Privacy owner, and domain lead.
3. Contain the feature or provider without destroying evidence.
4. Assess privacy, finance, and legal impact before resumption.
5. Communicate verified facts only.
6. Resume only after the Release Owner accepts the containment and reconciliation evidence.

Severity guidance:
- P1: potential privacy or credential exposure; unauthorized journal change; major outage; suspected data loss or identity compromise.
- P2: confirmed high-impact degradation or isolated exposure with uncertain scope.
- P3: limited defect with safe workaround.
- P4: low-impact issue with no security or financial impact.

## 5. Evidence package checklist

This evidence should be retained in the release package or controlled evidence store:
- final build and migration evidence
- restore rehearsal output with control totals and checksum / hash references
- finance period-close sign-off and owner statement reconciliation evidence
- service-identity inventory and rotation records
- legal/provider approval references or explicit waiver / deferred decision memo
- incident playbook and release-owner approval route
- open-risk register and ownership list

## 6. Hardening status by service area

This is a gate/status summary, not a claim that every Appendix A criterion has
passed. The current implementation and its stated limitations are detailed in
`V7_REQUIREMENT_TRACEABILITY_2026-10-14.md` and
`IMPROVEMENT_IMPLEMENTATION_STATUS_2026-10-13.md`.

| Service / module | Implemented controls | Remaining hardening / acceptance gate | Production posture |
|---|---|---|---|
| Workforce management | Existing worker profiles, matching, role checks, and workforce service boundary. | Verified worker self-claim/account binding; complete engagement booking-to-completion lifecycle; credential scope/expiry/revocation; dispute/safeguarding separation; approved labour rules; privacy review for attendance/location/biometrics; leave/payroll hand-off reconciliation. | Partial; do not represent as full HR/payroll or licensed credential verification. |
| Staffing | Request matching and idempotent request creation; shared supply integration tests and service boundary. | Disposable DB/API E2E against the same migrated schema; booking and fulfillment lifecycle; cancellation/reschedule, completion proof, customer confirmation, disputes, SLA and spend controls. | Partial; no automatic payroll or payment settlement. |
| Insurance | Separate ledger/service boundary and a guarded service gateway; request workflow is not an insurance application or policy. | Licensed insurer/provider selection and contract; legal basis and disclosures; policy/claims lifecycle; premium/commission reconciliation; production cutover and runtime ACL review. | Gated; production in-process ledger disabled until the separate service cutover is accepted. |
| SACCO / MFI | Institution isolation, role controls, maker-checker, balanced journals, reversals, KYC review controls, and synthetic sandbox; production pilot defaults off. | Institution/license-specific legal and accounting approval; verified member KYC/AML process and authorized providers; interest/fees/ECL, restructuring, collateral, regulatory returns, deposits and settlement remain outside the validated principal-only pilot; recovery, security and UAT acceptance. | Supervised principal-only pilot boundary only; not production banking, public-deposit, or general lending authorization. |
| Edir | Existing Edir service and ledger boundary, institution/organization scope, member lifecycle, cap and transaction controls, role and approval checks. | Named cooperative/legal operating model; approved membership, contribution/share/benefit rules; accounting and financial validation; complaints and hardship paths; privacy/retention; member-facing disclosures; settlement provider and recovery acceptance. | Pilot/controlled workflow only; no claim of statutory Edir compliance or approved benefits. |
| Property and tenancy | Lease draft and independent workflow, evidence-only signature uploads and notices, owner-scoped statements, and period-close checks. | Legal review of notice/e-signature rules, amendments/renewals, Finance-approved accounting policy, full restore/capacity and owner UAT. | Operational evidence only; no legal-effect claim or closed books. |
| Marketplace | Role-scoped listing and seller review workflows. | Seller/business verification policy, consumer terms, fulfillment, complaint/refund policy, privacy retention and payment/settlement reconciliation. | Partial; no provider settlement or consumer-law sign-off implied. |
| Shared platform / agency | Authentication/session controls, role/activity authorization, audit, service identities, security defaults and migration/test evidence. | Exhaustive cross-domain object/file/export/job isolation; access recertification/recovery; representative load and SLO; manual accessibility/localisation; witnessed production DR; named release owners. | Not generally production-accepted. |

### Module evidence capture

The Admin workspace records readiness evidence in the shared database, tied
to the module, category, environment, signed-in recorder, and a reference to
the controlled evidence store. Entries are append-only. `evidence_recorded`
means only that a reference was recorded; it does not validate an external
signature, provider approval, legal opinion, or release authorization. Do not
put credentials, personal data, or confidential document contents in notes.

## 7. Final approval conclusion

This package is a production-readiness record, not a legal or provider
permission statement. Individual modules have different readiness and approval
gates; approval of one module does not authorize another. The implementation
does not satisfy general production authorization until the named owners above
sign the release decision and evidence references are attached to the release
package.
