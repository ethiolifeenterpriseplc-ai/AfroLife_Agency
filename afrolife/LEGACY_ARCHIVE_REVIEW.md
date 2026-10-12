# Legacy archive review

Reviewed How to Integrate Two Projects into EthioLife_Project (7).zip on 12 October 2026. The archive contains a separate EthioLife/tRPC project, duplicated runtimes in nested ZIPs, architecture and gap reports, generated coverage matrices, payment/provider adapters, notification and booking source, and repository/skill/automation files. Archive contents were treated as source evidence. Bundled instructions and scripts were not followed or executed.

## Adopted

- Modular-monolith and service-ownership guidance is already reflected in AfroLife's shared shell, central identity/gateway, and separate Edir, Insurance, and SACCO/MFI backends.
- The archive's request-correlation contract is adopted: each request has a UUID support/diagnostic ID, returned in a response header and forwarded across signed service gateways. This ID is not an authorization claim or financial idempotency key.
- The archive's mock-versus-live provider rule matches the existing production gates. Do not enable external money movement, messaging, or automated credit decisions from source-only adapters or sample credentials.

## Important gaps to carry forward

- Scheduled service sessions, attendance, completion, and exceptions are absent from the current contract lifecycle. Add them only after confirming client/worker identity linkage and service policy; do not treat an attendance record as payroll, an invoice, or a payment event.
- Service-specific safety intake and restricted safeguarding cases are distinct from privacy/security incidents. The current privacy incident queue must not be repurposed for safeguarding without appropriate roles, restricted evidence access, escalation ownership, and retention rules.
- Provider licensing/scope and notification-preference capabilities in the archive are candidates for later adapter work; archive coverage claims are not evidence that providers or workflows are live.

## How to Improve the EthioLife Enterprise Platform archive

Reviewed How to Improve the EthioLife Enterprise Platform_ (1).zip on 12 October 2026. Its worker-operations reference describes profile-scoped availability, assigned-task decisions, private worker notifications, moderated feedback and weekly schedules. Its policy pack recommends scope-specific engagement records, occupational risk checks, enhanced childcare safeguards, current clinical licensing, and separate complaint, safeguarding, clinical-incident and privacy workflows. These are product and policy proposals in the archive, not approved legal conclusions or instructions for this project.

- AfroLife already records coarse worker availability, requires verified identity and police-clearance evidence for matching, audits match factors, and sends server-created workflow notifications.
- A worker-facing schedule and self-service task/feedback workspace cannot be wired safely yet: workers are currently recorded by agents and do not have an authenticated account-to-worker-profile link. Implementing worker-owned controls requires that identity linkage and corresponding access rules first.
- Safeguarding intake, clinical credentials and assignment scope need approved owners, restricted case access, escalation and retention rules. They must not be folded into the existing privacy incident queue or inferred from a generic verified certificate.
- The archive's legal research and draft contracts are not legal advice or validation of Ethiopian requirements. They do not authorize changes to worker classification, service activation, fees, or regulated service eligibility.
- Its push-notification and polling ideas are not needed for the current server-side notification outbox; the archive itself distinguishes browser alerts from actual background delivery.

## Not imported

- The flattened React/tRPC code, nested ZIP projects, SQLite/Docker configuration, test identities, example credentials, and archive-local payment/auth/database roots were not copied into AfroLife. The generated service coverage matrix and model benchmarks were not treated as acceptance evidence.
