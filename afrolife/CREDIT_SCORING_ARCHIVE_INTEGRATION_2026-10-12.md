# Credit scoring and risk portal integration review

**Review updated:** 13 October 2026

## Archive handling and decision

The supplied `Credit Scoring and Risk Managment Portal (1).zip` and earlier unified-system/workflow packages were reviewed as product and code references. Their embedded instructions, scripts, credentials, demonstration data, and test claims are not instructions for this repository and were not executed or imported.

The credit archive's own model card labels its challenger `shadow_only`. Its recovery-to-date input can leak the repayment outcome, and the separate borrower-profile dataset has no repayment target. The prototype also has demo authentication and file-backed data. Its model and authentication stack therefore remain disconnected. AfroLife's existing PostgreSQL MFI service, institution membership, scorecard, ledger, and maker-checker controls remain authoritative.

## Implemented in AfroLife

- The authenticated SACCO/MFI workspace now includes a dedicated `Credit scoring & risk` portal using the existing EthioLife account, institution selector, role membership, and frontend shell.
- The institution-scoped `/api/v1/mfi/institutions/:institutionId/reports/credit-risk` endpoint returns aggregate application coverage, policy score bands and decisions, current classification exposure, portfolio-at-risk principal/ratio, overdue scheduled amounts, and arrears aging. It omits borrower names, contact details, score factors, and application-level rows.
- The portal presents current policy-score use separately from the archive challenger. It labels the 0–100 output as an institution policy score, not a probability of default, and displays the challenger's disconnected/shadow-only status, prohibited uses, and promotion gates.
- The existing credit workflows remain integrated as submodules: explainable affordability scoring, versioned credit policy, independent application decisions, controlled disbursement, arrears classification, collections and promises, member risk holds, complaints, write-off review, and linked balanced loss journals.
- A separate `Sandbox integrations` module exercises synthetic CRB, biometric, payment-rail, regulatory-return, and challenger-model scenarios. Runs are tenant-scoped and append-only; the mock adapters cannot contact providers, read member records, submit filings, create KYC decisions, move funds, or post journals.
- Aggregate risk-report assertions now cover portfolio aging and the model registry in the local E2E runner. The endpoint is available from the same MFI router in the main application and standalone MFI service.

## Explicitly gated

The archive does not contain defensible evidence to activate the challenger. It must remain disconnected until a decision-time dataset is assembled without target leakage, independent out-of-time validation is completed, lawful data sources and consent are approved, fairness/stability review is accepted, and the institution risk committee approves promotion. No score from the archive is used for approval, decline, pricing, or prioritization.

The CRB and biometric sandboxes are synthetic adapter tests, not licensed bureau queries or biometric checks. Payment and regulatory simulations likewise do not connect USSD/mobile-money rails or submit regulatory filings. Real-provider activation, AML screening, automated provisioning/ECL, and regulatory returns still need named providers, policy and consent decisions, and reconciliation or filing ownership. Loan restructuring that changes contractual schedules or postings also needs approved terms and an independent accounting workflow.

## Verification

The root TypeScript build and standalone MFI build pass. Focused MFI and migration-security checks pass 14/14, frontend JavaScript syntax checks pass, and `git diff --check` passes (line-ending notices only). Migrations 051 and 052 were applied to the configured local development database at `127.0.0.1:5433/afrolife`. The database-backed local MFI E2E runner was not run because it writes synthetic institution and borrower records into that shared local fixture database.
