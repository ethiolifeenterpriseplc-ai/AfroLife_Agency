# V7 release acceptance record

This is a working release record. Blank fields are not accepted evidence. Do not mark release accepted until the evidence belongs to the exact release candidate and an accountable person has signed it.

## Release candidate

| Field | Value |
|---|---|
| Release/version and source commit | Not set |
| Environment and hosting region | Not set |
| Release operator and date | Not set |
| Migration range and checksum | Not set |
| Enabled product/provider features | Not set |
| Data classification and test-data statement | Not set |

## Gate evidence

Supplemental synthetic-only results from 14 October 2026 are recorded in [V7_MOCK_ACCEPTANCE_EVIDENCE_2026-10-14.md](V7_MOCK_ACCEPTANCE_EVIDENCE_2026-10-14.md). Mock evidence does not close production gates.

| Gate | Evidence to attach or link | Owner | State |
|---|---|---|---|
| Build, unit, API and regression checks | CI run tied to release commit; list exclusions | Engineering | Open |
| Full-surface tenant/party isolation | Mock suite: 45/46 API/supply checks; broad local insurance-ledger UPDATE privilege flagged. Full route/resource inventory and production-equivalent negative evidence still required. See mock evidence report. | Security/Engineering | Partial — production gate open |
| Performance/capacity | 50,000 synthetic leads were seeded; authenticated lead-list load attempt produced no usable report. Prior health-only smoke: 500 requests, concurrency 25, p95 105.3 ms/p99 172.3 ms. See mock evidence report. | Product/IT | Partial — production gate open |
| Recovery and rollback | Synthetic database plus file restore passed with matching control totals/hash in 18.2 seconds. Proposed RPO/RTO, PITR, target infrastructure, backup protection and rollback remain unverified. See mock evidence report. | IT/Operations | Partial — production gate open |
| Accessibility/localisation | Automated browser checks reached the final role sweep; harness reported two unexpected 401 background responses. Manual accessibility, Amharic/English/calendar and physical-device review remain. See mock evidence report. | Product/UX | Partial — production gate open |
| Provider integrations | Provider name, contract/sandbox, data-processing and transfer review, secrets/callback controls, duplicate/timeout/reconciliation evidence, operational owner | Integration owner | Open |
| Legal and policy controls | Engineering defaults are recorded in `V7_RELEASE_BASELINES_AND_POLICY.md`; signed owner policy/source/effective dates for privacy, retention, labour, lease/signature/notices, accounting/tax, payments and AI/screening remain outstanding. | Legal/Privacy/HR/Finance owners | Defaults implemented; approvals open |
| Migration and cutover | Mock database migrated through 061; restored clone accepted no-op migration rerun and matching control totals. Source inventory/mapping, business trial, freeze/delta plan, rollback and reconciliation remain. See mock evidence report. | Data owner/IT | Partial — production gate open |
| Operations | Initial incident/service-identity rotation/recovery/release procedure is documented in `PRODUCTION_OPERATIONS_RUNBOOK.md`. Monitoring dashboard, alert routing, named on-call, support targets, provider-specific exercises, maintenance windows and training still require evidence. | Operations | Partial — production gate open |
| Business UAT | Synthetic role flows exercised locally; no business participant or release candidate signed. Role-title placeholders pending names are retained below. See mock evidence report. | Business owners | Mock exercise only — sign-off open |

## Business UAT signatures

| Business area | Named owner | Work email | Scenarios/release | Result | Signed date |
|---|---|---|---|---|---|
| Property and leasing | Property/Leasing owner (name pending) | Pending | Unassigned | Not run | — |
| Finance and reconciliation | Finance owner (name pending) | Pending | Unassigned | Not run | — |
| Workforce and staffing | HR/Workforce owner (name pending) | Pending | Unassigned | Not run | — |
| Privacy and compliance | Privacy/Compliance owner (name pending) | Pending | Unassigned | Not run | — |
| Operations/support | Operations owner (name pending) | Pending | Unassigned | Not run | — |
| Product/sponsor | Product sponsor (name pending) | Pending | Unassigned | Not run | — |

## Provider activation checklist

For each provider, record `Disabled` until all fields are complete.

| Provider/use | Decision / environment | Credentials stored outside repo | Legal/data review | Contract/failure tests | Reconciliation owner | State |
|---|---|---|---|---|---|---|
| Ethiopian e-invoicing/MoR | Unselected | No | Open | Simulator only | Unassigned | Disabled |
| Bank/mobile-money/payment | Unselected | No | Open | Simulator only | Unassigned | Disabled |
| Identity/screening | Unselected | No | Open | Synthetic only | Unassigned | Disabled |
| SMS/email/push | Unselected | No | Open | Not evidenced | Unassigned | Disabled |
| Payroll | External boundary and format unselected | No | Open | Not evidenced | Unassigned | Disabled |
| Electronic signature | Unselected | No | Open | Evidence-upload flow only | Unassigned | Disabled |

## Release decision

- [ ] All V7 Must requirements have evidence or approved, scoped exceptions.
- [ ] Critical/high security findings are resolved or signed by the authorized risk owner with compensating controls.
- [ ] Applicable legal, privacy, tax, accounting, labour and signature policies are approved and effective-dated.
- [ ] All Section 9.3 acceptance gates are passed.

**Decision:** Not accepted. Local checks and synthetic evidence supplement the requirement crosswalk; they do not satisfy production acceptance or named-owner sign-off.
