# SACCO service rollout and backlog register

Reviewed 8 October 2026. This register reflects the current service catalog in
`public/mfi.js`. “Live” means the complete named service is implemented,
permission-checked, institution-isolated, audited, tested end to end, and
approved for the target institution and jurisdiction. A limited pilot workflow
does not make its entire service live.

The SACCO workspace presents service areas as submodules with a workflow
summary, accountable role, and readiness state. Existing policy and staff
configuration links are separated from day-to-day work. Only the institution
administrator (and audited platform Super Admin) can open administration,
product configuration, staff-role, and credit-policy settings; other roles keep
their role-appropriate member, teller, credit review, collection, and audit
workflows. API authorization applies the same restriction.

## Current service state

| Service | Current state | Work required before Live |
| --- | --- | --- |
| Overview | Pilot | Production monitoring, operational ownership, and validated reconciliation of balances |
| Institution & governance | Partial | Verified institutional/legal profile, branches and tills, approval matrix, resolutions and voting |
| Members & KYC | Partial | Document-backed KYC cases, risk screening, lifecycle/dormancy/exit/deceased settlement, retention and deletion policy |
| Products | Partial | Versioned product setup, price/limit/effective-date rules, four-eyes publishing and GL mappings |
| Savings & deposits | Partial | Approved product terms, transaction limits/receipts, holds, term/compulsory savings and any required accruals |
| Shares & capital | Partial | Share register/classes, allotments/transfers/redemptions, approved dividend and patronage rules |
| Credit & lending | Partial | Product pricing, amortization and disclosure, offer acceptance, collateral/guarantor and external bureau integrations where applicable |
| Islamic finance (IFB) | Planned | Sharia governance, product contracts, segregation, profit distribution and independently validated accounting |
| Payments & transfers | Planned | Provider integration, authorization, settlement/reversals, replay handling, reconciliation and end-to-end certification |
| Digital wallet | Planned | Wallet lifecycle/KYC tiers, limits/freezes, transfer rails, settlement and reconciliation |
| Agent & field operations | Planned | SACCO-specific agent onboarding, float, transaction controls, field receipts and offline synchronization |
| Collections & recovery | Partial | Arrears queues/notices, hardship and fair-contact controls, guarantor/collateral/legal workflows, restructuring and post-write-off recovery |
| Accounting & journals | Partial | Configurable chart/dimensions, subledger reconciliation, suspense, period lock/close/reopen, financial statements and independent accounting validation |
| Treasury & liquidity | Planned | Bank/cash position, dual controls, forecast/stress tests, investment and FX workflows |
| Settlement & reconciliation | Planned | Statement ingestion, matching, exception ownership, settlement state, aging reports and reconciliation evidence |
| AML/CFT & compliance | Partial | Institution risk assessment, applicable CDD/sanctions screening, monitoring, investigations, filing evidence and independent testing |
| Credit policy & NPL | Partial | Approved impairment methodology, provision postings, non-accrual, model governance, restructuring/write-off and recovery lifecycle |
| Regulatory reporting | Planned | Current jurisdiction/license-specific returns, validation, approvals, submission evidence and change monitoring |
| CRM & member service | Planned | Complaint intake, case ownership/escalation/redress, consent preferences and communication history |
| Digital channels | Planned | Member authentication, session controls, self-service, USSD/mobile flows, and API parity with staff limits and approvals |
| Data & analytics | Planned | Governed portfolio/liquidity reporting, model validation, access controls, retention, and reconciled source data |
| Documents & communications | Planned | Approved offer/contract/statements/certificates, member acceptance/signatures, consent-aware delivery and retention |
| Institution staff | Partial | Delegated permission administration, access reviews, sensitive-action step-up authentication and deprovisioning controls |
| Audit & security | Partial | Complete security/financial event coverage, searchable/exportable evidence, privileged access review and independent assessment |
| Exceptions & suspense | Planned | Case state machine, ownership, SLA/aging, investigation, closure, bulk prevalidation and rollback evidence |
| Cooperative governance | Planned | Member eligibility, proxy/quorum rules, auditable elections/votes/resolutions and due-process controls |

## Release promotion gates

Promote a service to **Live** only after all of the following evidence exists
for the actual release candidate and institution:

1. Requirements and policy owner approved; legal/regulatory applicability and
   member-facing terms reviewed for the institution's license and markets.
2. API and UI workflows implement every advertised action, including denied,
   duplicate, stale, reversed, failed-provider, and recovery paths.
3. Tenant isolation, least-privilege roles, maker-checker controls, audit
   history, data retention, and privacy behavior pass negative as well as
   positive tests.
4. Financial flows reconcile to balanced journals and member subledgers;
   independent accounting examples prove rounding, cutoffs, reversals, and
   period treatment.
5. Accessibility, localization, security assessment, dependency review,
   operational monitoring, backup restore, incident response, and support
   runbooks have owners and evidence appropriate to the service risk.
6. Staging end-to-end results and an accountable business owner approve the
   precise service scope. Update the service catalog only after those checks.

## Next implementation and assurance sequence

1. Keep the current SACCO/MFI in controlled pilot status while the Very High
   and High SRS requirements are mapped to an approved first-release scope.
   Prioritize balanced accounting, ledger/subledger reconciliation, period
   controls, member and product lifecycle, maker-checker, tenant isolation,
   session security, and idempotent financial actions.
2. Implement the domain workflows not currently in the application before
   enabling their screens or accepting deposits, lending, payment, or
   compliance cases. The table above is the backlog; Planned/Partial is not a
   service availability claim.
3. For the exact release candidate, complete independent ASVS-based security
   verification, WCAG 2.2 AA assessment, applicable jurisdiction/licensing and
   accounting approval, recovery rehearsal, and production-like end-to-end
   tests. These activities require named external or institutional reviewers
   and evidence; source changes alone cannot satisfy them.

## Release status

The existing extended SACCO pilot is locally validated. It has not been
deployed as a public production service; the release record states that no public
host, production restore rehearsal, independent security review, or regulatory
approval has been completed. Therefore the application catalog remains
Pilot/Partial/Planned, and there is no honest way to mark every service Live
from the current source alone. The rollout register makes the remaining work
explicit and prevents placeholder screens from being presented as operating
financial services.
