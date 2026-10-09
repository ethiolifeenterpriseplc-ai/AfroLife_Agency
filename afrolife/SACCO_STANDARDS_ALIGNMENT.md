# SACCO standards and good-practice alignment

Reviewed 8 October 2026 against the SACCO/MFI pilot source, migrations, and
available local validation. This is a design and gap-assessment record. It is
not an audit, certification, legal opinion, or claim of conformance.

## Standards used as design references

| Reference | Application to this product | Current evidence | Remaining gate |
| --- | --- | --- | --- |
| NIST Cybersecurity Framework 2.0 | Governance, asset and risk ownership, protection, detection, response, and recovery | Production configuration checks, MFA requirement, shared auth rate limits, database role checks, institution scoping, audit history, and deployment/recovery checklist exist | Institution must create a risk profile, assign control owners, exercise incident response and restore, and monitor the deployed environment |
| OWASP ASVS 5.0.0 | Verifiable web application security requirements | Parameterized database queries, request validation, role checks, RLS, security headers, rate limits, MFA support, and local role-based workflow checks exist | Map and test a defined ASVS level on the deployed system; independent penetration test and remediation evidence are not present |
| WCAG 2.2 | Accessible browser and mobile workflows | Responsive UI smoke checks cover viewport overflow; fields use labels and status/error regions in reviewed forms | No full WCAG 2.2 AA audit, screen-reader testing, keyboard-only assessment, contrast measurement, or assistive-technology sign-off has been completed |
| G20/OECD High-Level Principles on Financial Consumer Protection (2022) | Fair treatment, clear information, privacy, responsible credit, complaints and redress | Configurable transparent score factors, documented principal-only schedules, independent decisions, and sensitive data masking are present | Member disclosures, affordability methodology validation, adverse-decision notices, hardship and fair-collection policy, complaint/redress workflow, and vulnerable-member review need institutional approval and implementation |
| FATF Recommendations (current version) | Risk-based AML/CFT and proliferation-financing controls where the institution and jurisdiction are in scope | No AML screening or transaction-monitoring claim is made by the pilot | Institution risk assessment, CDD/beneficial ownership where applicable, sanctions screening, monitoring, escalation/reporting, record retention, and independent testing are not implemented |
| IFRS 9, if adopted by the institution's reporting framework | Impairment classification and expected-credit-loss measurement | Pilot records policy-based delinquency categories only; it does not calculate impairment or provisions | Confirm the applicable accounting framework and implement a validated, governed ECL methodology and ledger postings if required |
| National Bank of Ethiopia directives, where applicable to a licensed MFI | Local licensing, prudential, IT management, product approval, risk, and reporting obligations | MFI deployment is explicitly labelled a controlled pilot; policy thresholds are not silently hard-coded | Counsel and the institution's compliance owner must identify the current directives that apply to its exact license and activity, then map each requirement to an owner, control, test, and evidence |

The NIST CSF is a risk-management framework, OWASP ASVS is a testable
application-security standard, WCAG is a web-accessibility standard, and the
OECD principles are financial-consumer-protection guidance. Their inclusion
does not make the application compliant. Applicability of FATF, IFRS, and NBE
requirements depends on the institution, license, jurisdiction, and accounting
framework. A cooperative/SACCO is not automatically subject to every MFI rule.

## Controls reflected in the pilot

- Institution-scoped authorization and PostgreSQL row-level security protect
  tenant data. Operational authorization is checked in the API as well as the
  database.
- High-impact decisions separate maker and reviewer for membership, credit
  policy, loan approval, reversals, and NPL classification. Posted ledger facts
  are corrected through reversal events.
- Credit score inputs and policy versions are explicit and auditable. Scores
  are decision support, not an automated guarantee of fair lending or a credit
  bureau result.
- Loan lists omit declared income, debt, purpose, and score factors from teller
  responses. The general member list now omits phone and email for teller and
  other roles without an approved servicing, compliance, or audit need.
- Financial amounts use decimal strings and integer cents; journal posting is
  balanced and idempotent. Pilot installments and collections allocate
  principal only.
- Credit/delinquency rules are versioned and independently approved. Their
  values can be proposed only by institution administrators, then must be
  independently approved and checked against local obligations. Non-admin
  roles cannot list staff or submit policy changes through the API.

## Release gates before real member or regulated financial use

1. Complete a jurisdiction-specific legal, licensing, accounting, privacy, and
   consumer-protection applicability assessment. Approve retention, correction,
   access, consent, and complaint/redress policies.
2. Commission an independent authorization, tenant-isolation, API, dependency,
   infrastructure, and penetration assessment against a defined OWASP ASVS
   5.0.0 verification level. Retest resolved findings and retain the evidence.
3. Complete WCAG 2.2 AA review of core workflows using automated checks,
   keyboard-only navigation, screen readers, zoom/reflow, focus visibility,
   contrast, and physical mobile devices. Fix and retest findings.
4. Approve and test member-facing product terms, full cost and repayment
   disclosures, credit-decision explanations, hardship accommodations, fair
   collections, and an independent complaint and redress process.
5. If AML/CFT duties apply, implement the risk-based program, screening,
   monitoring, case investigation, reporting, retention, and role separation;
   test false-positive handling and auditability.
6. If the institution uses IFRS 9 or another impairment standard, obtain
   independent accounting approval for staging, delinquency/default definitions,
   forward-looking inputs, model governance, overlays, and journal mappings.
7. Approve product pricing and accounting treatment before enabling interest,
   fees, penalties, savings returns, provisions, write-offs, or restructuring.
   Validate all calculations, disclosures, reversals, and month-end reports
   against independently prepared examples.
8. Rehearse production backup restoration, outage and incident response,
   reconciliation, privileged-account recovery, and change rollback; record
   accountable owners and dated evidence.

## Official reference material

- [NIST Cybersecurity Framework 2.0](https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20)
- [OWASP Application Security Verification Standard](https://owasp.org/projects/asvs) (use a pinned version; this review references 5.0.0)
- [W3C Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- [G20/OECD High-Level Principles on Financial Consumer Protection 2022](https://www.oecd.org/en/publications/g20-oecd-high-level-principles-on-financial-consumer-protection-2022_48cc3df0-en.html)
- [FATF Recommendations](https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html)
- [IFRS 9 Financial Instruments](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-9-financial-instruments/)
- [National Bank of Ethiopia Microfinance Business directives](https://nbe.gov.et/directives/microfinance-business/)
