# AfroLife quality and release workflow

This workflow separates repeatable code checks from the operational evidence
needed to accept real users, identity documents, or financial activity.

## Automated checks

The `AfroLife quality checks` GitHub Actions workflow runs on pushes and pull
requests that touch `afrolife/`. It installs the locked dependencies, checks
browser JavaScript syntax and application JSON configuration, compiles the
TypeScript API, and runs the database-independent unit suite. A green workflow
is necessary for a change; it does not establish production readiness.

For local role-based workflow checks, `npm run seed:local-test-users` creates
synthetic accounts for every AfroLife app role and stores random credentials
outside the repository under `%LOCALAPPDATA%\AfroLife\local-test-users.txt`.
The script refuses databases other than the isolated local `afrolife` database
on port 5433. These accounts are marked active and KYC verified for testing;
never seed or use them in staging or production. Delete the credential file
when local testing is complete. Institution-specific SACCO/MFI roles must be
assigned through the chosen institution's staff workflow.

With the local server running, `npm run test:mfi:e2e:local` runs a full SACCO/MFI
API journey using those accounts. It creates synthetic institution, member,
staff membership, account, loan, audit, and ledger data in the isolated local
database. It covers member suspend/reactivate, credit-policy maker-checker
approval, affordability scoring and teller redaction, principal installment
allocation, repayment reversal, configured delinquency bands, independent NPL
approval, assigned collections and promises to pay, idempotent posting,
withdrawal reversal, cash-constrained disbursement, balanced journals, and
role denials. It also verifies that non-administrator credit/finance roles
cannot list institution staff or submit credit-policy configuration.

When Google Chrome is installed, `npm run test:ui:e2e:local` starts an isolated
headless browser profile and verifies Super Admin sign-in, SACCO tab visibility,
member/staff, credit policy, loan affordability, collections and NPL forms, and
mobile/tablet/desktop horizontal overflow. Set
`AFROLIFE_CHROME_PATH` if Chrome is installed at a non-default path.
The SACCO workspace shows service submodules, readiness and accountable roles;
administrator-only configuration shortcuts are presented only to administrators.

The browser smoke check does not establish accessibility conformance. Use
`SACCO_STANDARDS_ALIGNMENT.md` as the release checklist for a version-pinned
OWASP ASVS assessment, WCAG 2.2 AA review, consumer-protection review, AML/CFT
applicability, accounting validation, and jurisdiction-specific regulatory
mapping. Record independent reviewer, scope, findings, remediation, and retest
evidence for the actual deployment.

Integration tests write to a database. Run them only against an isolated,
disposable database, never production or a shared user-data database. Provision
the test database and API runtime separately, then follow the integration test
setup in the README. Save the migration result and test output with the release
record.

## Release evidence

For each release candidate, record the commit or source archive checksum, build
version, migration set, operator, date, and results below. Do not mark a gate
complete from a local development check alone.

- [ ] CI checks pass for the exact release source.
- [ ] All migrations apply to a fresh staging database and an upgrade copy of
  the prior schema; schema version and migration logs are recorded.
- [ ] Integration scenarios pass against disposable staging data, including
  sign-up/activation, role boundaries, RLS isolation, four-eyes approval,
  contract and rent ledger flows, refunds, private upload authorization, and
  MFI transaction reversal.
- [ ] A second user/role cannot access another agent's or institution's data;
  check API responses as well as database RLS using the runtime role.
- [ ] HTTPS, CORS, proxy trust, staff MFA, rate limits, secret storage, and
  security headers are checked at the deployed ingress.
- [ ] Database and private files are backed up together. A restore rehearsal
  confirms records and files can be recovered and that permissions remain
  private.
- [ ] Personal-data retention periods and deletion triggers are approved by
  legal/privacy owners, implemented, and exercised. Do not accept real KYC
  documents until this gate is complete.
- [ ] English, Amharic, Afaan Oromoo, Tigrinya, Somali, Arabic, and Kiswahili
  signup, plan, benefits, errors, and core operational workflows are reviewed
  by fluent speakers. Record known untranslated areas and resolve high-risk
  money, coverage, consent, and security wording before launch.
- [ ] Marketplace and plan descriptions match API behavior. Test Free, Pro,
  Enterprise, agent, property-owner, and staff roles against the release.
- [ ] Android release is signed with protected release credentials and tested
  on a physical device for server setup, sign-in, uploads, reconnect, and
  upgrade behavior. A debug APK is not a release artifact.
- [ ] Product, financial, consumer, labor, privacy, and regulated-finance
  reviews are complete for the markets and activities enabled in this release.

## Safe pilot and business operations

Start with staff and a small invited cohort. Use synthetic data until storage,
access, retention, support, and recovery procedures have been proven. Assign a
named owner and escalation contact to each queue: KYC, listing review, worker
matching, contracts, finance reconciliation, disputes, rent, and incidents.

Review a short weekly operations scorecard: registration-to-activation time,
KYC queue age, listing review time, qualified-request-to-match time, contract
cycle time, unreconciled receipts, overdue rent, unresolved disputes, failed
notifications, and support incidents. Set target values only after collecting a
baseline; investigate queue growth and stale work rather than optimizing raw
account or transaction counts.

When a financial, identity, or access-control incident occurs, pause the
affected workflow, preserve audit and transaction records, notify the named
incident owner, and reconcile any downstream ledger or customer impact before
resuming. Posted financial facts are corrected through the system's authorized
reversal workflow, not by editing database rows.
