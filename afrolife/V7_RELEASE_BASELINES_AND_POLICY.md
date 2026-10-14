# V7 pilot release baselines and policy defaults

**Status:** Engineering defaults for a controlled pilot, recorded 14 October 2026. These settings make the implementation testable; they are not legal opinions, regulator approvals, or evidence that production infrastructure meets them. Where applicable law or a signed customer/owner policy is stricter, that source controls. Do not enable the gated integrations or real-data workflows until their named owners complete the release record.

The policy rules below are target behavior. Existing code enforces some of them; use the V7 traceability matrix for what is implemented versus still open. This document alone is not proof that every route, record type, or operator follows each rule.

## Pilot service targets

These are proposed starter targets so local and staging evidence can be measured. They are deliberately separated from provider latency and require a capacity run on representative infrastructure before production acceptance.

| Control | Pilot target | Evidence / implementation rule |
|---|---|---|
| API response time | First-party interactive API p95 ≤ 500 ms and p99 ≤ 1,500 ms under the approved workload; exclude user upload time and third-party provider wait, but report those separately. | `npm run perf:v7:local` is a bounded loopback smoke tool. A staging report must identify endpoint mix, data volume, concurrency, host size, warm-up and duration. |
| Initial capacity profile | 25 concurrent sessions, 1,000 synthetic users and 50,000 representative business records; test twice the expected peak when Product/IT supplies that forecast. | This is a pilot baseline, not a forecast or a demonstrated capacity claim. Any requirement above it needs a measured plan. |
| Availability | 99.5% monthly for the pilot, excluding published maintenance; critical journey availability and API availability are reported separately. | Requires production-grade monitoring, incident ownership and agreed maintenance rules; local health checks do not prove this target. |
| Recovery | Proposed RPO ≤ 15 minutes and RTO ≤ 4 hours for the core database and private files as one recovery set. | Requires point-in-time recovery or an equivalent transaction-log strategy, encrypted backups, access separation, monitoring, and a witnessed restore. Current local restore evidence is not this drill. |
| Backup handling | Encrypted, access-controlled database and private-file backups; immutable/off-host copy; daily recovery point plus transaction-log capture; proposed 35-day rolling operational retention, subject to the approved record-class schedule and legal holds. | Restore database and files together; verify checksums and access controls. Deletion requests must account for backup expiry and must not promise immediate removal from immutable backups. |
| Accessibility | WCAG 2.2 Level AA for critical public and authenticated journeys. | Automated checks are a screen; keyboard, screen reader, zoom/reflow, contrast and language review need human evidence. W3C recommends the latest WCAG version. The local browser smoke now checks document language, one visible main heading, accessible names, and image alternatives at login and the Super Admin overview. |
| Browser/device support | Current and previous major Chrome, Edge, Firefox and Safari desktop releases; current and previous major Android Chrome and iOS Safari/WebView releases. | Publish actual versions at each release and test the signed mobile artifact on physical devices. |

## Privacy, security, and legal-risk defaults

The Ministry of Justice lists Ethiopia's Personal Data Protection Proclamation No. 1321/2024 and Labour Proclamation No. 1156/2019 as in force. Its Electronic Signature Regulations No. 582/2025 are also listed as in force. This establishes source documents to use for review, not that any particular AfroLife workflow is compliant. See the primary sources linked below.

- Collect only fields needed for a declared service purpose. Record purpose, data class, source, lawful basis, recipient and retention class before production collection; do not treat a general signup checkbox as consent for unrelated purposes.
- Treat identity/KYC, financial, lease, screening, precise-location, biometric, authentication and security-event data as restricted. Deny external AI/provider transmission by default. Do not enable a cross-border transfer until the controller records the recipient, purpose, safeguards and applicable transfer basis.
- Use least-privilege roles, MFA for privileged staff, access audit, encrypted transport/storage, scoped file downloads, and security review of logs. Logs must not contain credentials, full identity-document contents, payment secrets, or unnecessary sensitive payloads.
- Accept a data-rights request as a case requiring identity verification and policy review. Do not automatically erase financial, audit, safety or legal-hold records. Record the decision, scope, response and execution evidence; assign a human case owner.
- For a suspected personal-data or security incident, preserve evidence, contain affected access, assess scope promptly, and escalate to the designated privacy/security owner. A human must determine regulator/data-subject notification obligations and timing from current law; the application must not claim a report was made merely because an incident case was saved.
- Keep screening, e-invoice clearance, payments, owner distributions, electronic execution, biometric attendance, and statutory payroll calculations disabled unless the provider/policy and intended legal effect have been documented. Simulated outcomes must remain labelled as simulations.
- Labour rules are effective-dated and configurable by jurisdiction, worker class and agreement. The frequently cited 8-hour/day and 48-hour/week values must not be presented as a universal hard block. Until a qualified owner approves the applicable rule, show a warning and preserve the recorded/scheduled/approved times separately; do not silently reject or alter time.
- Lease document uploads remain evidence attachments only. They do not assert identity proof, qualified signature, statutory service, contract enforceability, or termination. Before enabling a signature vendor, map its trust/service status and evidentiary requirements against the 2025 Electronic Signature Regulations and applicable lease formalities.
- Tax/accounting values, e-invoice state transitions and official invoice IDs must be derived from an approved Ethiopian tax/accounting policy and authoritative provider contract. Do not infer a successful clearance from a timeout or a mock response.

## Provider boundary

The production design must use explicit provider adapters with secret-manager credentials, TLS, signature verification, correlation/idempotency keys, bounded retry/backoff, durable receipt, unknown-outcome reconciliation, operator-visible failures, and contract tests. The production MFI pilot now defaults off and production templates set `MFI_PILOT_ENABLED=0`; enabling it requires an explicit opt-in plus a separate service URL and unique secret. The currently available synthetic MFI adapters and payment webhook path are not integrations with a real CRB, identity/biometric provider, mobile-money rail, bank, payroll system, SMS provider or Ministry of Revenue service. No funds, legal invoice clearance, screening result, identity verification or notice delivery may be implied by a simulation.

Until the provider is selected and credentials/test environment are supplied, production provider flags remain off and the sandbox remains the only runnable integration evidence. Provider onboarding requires named service owner, data-processing terms, permitted data classes, region/transfer basis, callback verification, reconciliation owner and failure runbook.

## Policy authority register

| Area | Policy default / design rule | Approval still required |
|---|---|---|
| Data protection | Data minimisation, purpose-specific use, restricted data, access audit, human review of rights requests, incident escalation. | Controller/processor roles, record-class retention/deletion, cross-border transfers and legal notification decisions. |
| Labour and workforce | Effective-dated configurable rules, warnings before policy approval, preserved raw/corrected/approved time and human approval. | Applicable worker classes, overtime/leave/pension/holiday values and payroll mapping. |
| Lease/e-signature/notices | Versioned workflow evidence; uploaded document/notice receipt has no implied legal effect. | Signature provider and enforceability, service method/deadlines, occupancy, renewal and termination rules. |
| Finance/tax/payments | Balanced immutable journals and safe idempotency; real clearance/settlement adapters disabled. | Chart of accounts, accounting basis, tax/MoR lifecycle, payment methods/refunds, owner funds and distribution policy. |
| AI/screening | Advisory/synthetic only; no final adverse decisions and no external personal-data transmission. | Use-case risk approval, lawful source/provider, data class, human review and monitoring owner. |

## Primary references checked 14 October 2026

- [Ethiopia Ministry of Justice: Personal Data Protection Proclamation No. 1321/2024](https://justice.gov.et/am/law/personal-data-protection-proclamation/)
- [Ethiopia Ministry of Justice: Labour Proclamation No. 1156/2019](https://justice.gov.et/en/law/labour-proclamation/)
- [Ethiopia Ministry of Justice: Electronic Signature Regulations No. 582/2025](https://justice.gov.et/en/law/%E1%8B%A8%E1%8A%A4%E1%88%8B%E1%8A%AD%E1%89%B5%E1%88%AE%E1%8A%92%E1%8A%AD%E1%88%B5-%E1%8D%8A%E1%88%AD%E1%88%9B-%E1%8B%B0%E1%8A%95%E1%89%A5-%E1%89%81%E1%8C%A5%E1%88%AD-582-2018regulation-no-582/)
- [W3C Recommendation: Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/)
