# Ethiopian market release decisions and approval gates

**Decision date:** 14 October 2026  
**Scope:** AfroLife Agency and its existing platform domains, including property,
workforce, marketplace, insurance, SACCO/MFI and Edir.  
**Decision type:** Conservative engineering and operational defaults for
implementation planning. This is not legal advice, a regulator determination,
provider approval, or production release authorization.

## Executive decision

Adopt an evidence-first launch policy for Ethiopia:

1. Keep digital signatures and lease notices as operational evidence only until
   Ethiopian counsel approves the applicable law, contract terms, identity
   assurance and delivery method.
2. Disable external tenant, worker, applicant and financial KYC/screening
   provider calls by default. Keep human-reviewed, purpose-limited workflows;
   enable a provider only after lawful basis, provider due diligence, data
   protection and regulated-institution approval are recorded.
3. Keep tax invoice issuance, regulated financial activity and provider
   settlement claims disabled until Finance/Tax and the relevant licensed
   institution confirm the applicable accounting, tax, licensing and
   reconciliation rules.
4. Require a registered owner, least privilege, short-lived identity where
   available, and audited rotation/revocation for every machine identity.
5. Use WCAG 2.2 AA, OWASP ASVS 5.0.0, NIST security/identity guidance, and
   measurable SRE-style service objectives as engineering baselines. These are
   voluntary design references unless a contract or applicable law makes them
   binding.
6. Make no general-production release until recovery, capacity, security,
   accessibility, incident exercises, financial reconciliation and named
   release-owner evidence pass on the deployment being released.

These are defaults for the existing AfroLife platform and its current
workflows; they do not authorize a new regulated service or imply that the
current deployment already meets the controls.

## Ethiopia applicability and evidence boundary

The Ministry of Justice publicly lists the Electronic Signature Proclamation
Amendment, Proclamation No. 1358/2024, the Personal Data Protection
Proclamation No. 1321/2024, and Electronic Signature Regulations No. 582/2025,
with official-document links. These primary government references establish
that the subjects require legal review; this decision record does not analyze
every operative provision, commencement detail, implementing directive, or
application to AfroLife's particular roles and contracts. Ethiopian counsel
must review the Gazette text and amendments before a legal conclusion is made.

The National Bank of Ethiopia (NBE) publishes microfinance business directives
and describes its supervisory role. Applicability depends on the operator,
license, product and activity. A software platform, SACCO, MFI, insurer, agent
or payment provider must not be treated as interchangeable. The relevant
licensed institution's compliance owner must identify the current directives
for its own license and obtain any required supervisory approval.

Current ERCA e-invoice/tax requirements, the precise Ethiopian tenancy notice
rules, and the current approved screening/signature-provider status were not
verified sufficiently in this review to make a product-level legal claim.
Before enabling those paths, owners must verify the official current texts,
implementation dates and provider status directly with the responsible
authority and counsel. No dates or legal service periods are hard-coded by this
decision.

## Adopted platform defaults and required gates

| Area | AfroLife decision/default | Required evidence before enabling the gated activity | Accountable approval |
|---|---|---|---|
| E-signatures and electronic records | Keep uploaded files, hashes, signer-entered names and audit events labelled as evidence only. Do not represent them as a verified identity, qualified signature, enforceable execution or proof of consent. Do not change lease status solely because files were uploaded. | Counsel's review of the principal Electronic Signature Proclamation and amendments, contract formation, signer identity method, record retention and dispute process; provider security/data-processing review; tested envelope, timestamp, tamper evidence, download and revocation behavior. | Ethiopian Legal + Leasing/Product; Security approves technical controls. |
| Lease notice and service | Keep the current notice receipt operational and append-only. Record channel, destination/recipient evidence, timestamps, source, operator and delivery result separately from legal effect. Never mark notice legally served, terminate a lease, or calculate a legal deadline automatically from the current record-only endpoint. | Counsel approves each contract's notice clause, permissible channel, service/effective-time rule, proof, exceptions and escalation. Run UAT for failed delivery, disputed receipt, wrong address and duplicate notice. | Ethiopian Legal + Leasing Operations. |
| Personal data and screening | Default third-party screening integrations to off. Permit collection only for a documented purpose and minimum fields. Obtain affirmative, purpose-specific consent for optional third-party checks unless Legal records another lawful basis; consent is not treated as a blanket cure. Use human review, correction/dispute path and adverse-action reason. Do not scrape social media, use biometric matching, infer sensitive attributes or query a credit bureau by default. | Data inventory and impact assessment; Legal-approved lawful basis, notices, retention/deletion, access/correction/objection, cross-border transfer and processor terms; provider identity, source accuracy, security, breach notice and subprocessor due diligence; institution-specific CDD/AML rules where applicable; bias/false-positive UAT. | Privacy/Legal + the relevant institution's Compliance owner; Product accepts user journey. |
| KYC and regulated checks | AfroLife supplies workflow and evidence controls only; the regulated customer retains responsibility for its own customer due diligence, decisions, escalation and regulatory reporting. Do not claim AfroLife is an approved KYC, credit-bureau, AML or sanctions provider. | A documented institution/license/activity applicability map; approved provider contract and written evidence of any required authorization; model/data source and human-override acceptance. | Institution Compliance/MLRO + Legal; regulator-facing approvals where required. |
| Accounting and tax | Keep each domain ledger separate. Use balanced, immutable posted journal facts, unique idempotency keys, maker-checker for material adjustments, and correction by reversal rather than editing. Reconcile bank, cash, payment-provider settlement and subledger totals independently. No tax determination or tax-invoice claim is inferred from a receipt or PDF. | Entity chart of accounts, accounting basis, cut-off/close, tax treatment, invoice lifecycle, retention and reconciliation rules approved by the entity's Ethiopian accountant and tax counsel; ERCA confirmation of current e-invoice applicability/accreditation; independently prepared expected results and period-close UAT. | Entity Finance Controller + Tax/Legal; licensed institution CFO/Compliance for regulated books. |
| Payment and settlement providers | Keep payment credentials and settlement calls unset until the provider is selected and verified. A successful webhook or client receipt alone does not count as cash reconciliation. Use signed webhook verification, replay protection, settlement matching, suspense/exception queue and controlled refund/reversal. | Provider legal status and contract, fee/refund/chargeback rules, currency/settlement account, reconciliation file/API and outage process tested end to end. | Finance + Legal + provider owner; regulated entity Compliance as applicable. |
| Service accounts and rotation | No shared human credentials for services. Every machine identity has a named business and technical owner, purpose, scope, environment, expiry/review date, and audit trail. Prefer workload identity or short-lived asymmetric credentials; prohibit interactive login. Store secrets in a managed secret store, keep them out of source/control logs, and alert on unexpected use. | Inventory of all service principals and database roles; proof of least privilege and non-interactive use; automated rotation/revocation test, expiry alert and emergency break-glass procedure. For unavoidable static secrets, rotate at least every 90 days and immediately on suspected disclosure, owner departure or service retirement. | Service owner + Security; Database owner for database principals. |
| Availability and observability | Match the existing V7 pilot baselines: 99.5% monthly availability, first-party interactive API p95 no greater than 500 ms and p99 no greater than 1,500 ms, excluding upload time and third-party wait but reporting them separately. Define measurement, exclusions, sampling, dashboards and alert routing before claiming an SLO. Do not treat health endpoint success as service availability or performance evidence. | Product/IT approve traffic profile and maintenance definition; test 25 concurrent sessions, 1,000 synthetic users and 50,000 representative records, then twice the expected peak when Product/IT supplies that forecast. Demonstrate alerts, ownership, dashboards and incident paging. | Product/Business owner + IT/SRE. |
| Recovery and backups | Match the existing V7 pilot baseline: proposed RPO no greater than 15 minutes and RTO no greater than 4 hours for the core database and private files as one recovery set. Use encrypted, access-controlled and immutable/off-host backups with daily recovery points plus transaction-log capture; the proposed 35-day rolling retention remains subject to the approved record-class schedule and legal holds. Do not claim these targets are sufficient for regulated activity without the institution's approval. | Sponsor/IT ratify numeric objectives; demonstrate point-in-time recovery or equivalent, quarterly witnessed restore with database and files, integrity/control totals, access controls and measured recovery; perform an annual end-to-end disaster scenario and prove migration/rollback/roll-forward procedures. A local synthetic restore is not production acceptance. | Sponsor + IT/Operations; Finance/Compliance accepts ledger recovery and reconciliation. |
| Accessibility and localisation | Adopt WCAG 2.2 AA as the product's engineering target for public and staff core journeys. It is an engineering target here, not a claim about Ethiopian statutory accessibility obligations. Review every shipped language and money/security/consent text with fluent reviewers. | Automated plus manual audit for keyboard-only use, focus order/visibility, screen reader, reflow/zoom, contrast, labels/errors and core mobile workflows; no unresolved critical A/AA blocker; record supported browser/device matrix and retest. | Product owner + Accessibility reviewer; local-language business reviewers. |
| Incident handling | Classify incidents P1–P4. P1 includes suspected personal-data or financial-data exposure, unauthorized ledger change, material identity compromise, or a core service outage affecting many users. Contain the affected feature, preserve evidence, notify the incident commander and relevant security/privacy/finance/legal owners, and reconcile financial impact before resumption. Never delete evidence or silently repair posted records. | Named rota/contact tree; data/financial incident, provider outage, credential compromise and restore playbooks; regulator, affected-person and partner notification decisions/timelines validated by Legal/Compliance (not guessed in code); tabletop exercise at least quarterly during pilot and after material incidents; tracked remediation and retest. | Incident Commander + Security; Legal/Privacy/Compliance determines notification obligations. |
| Production release | Require one named Business/Product release owner and one named Technical release owner. A regulated workflow additionally requires the responsible Finance/Compliance/Legal approver. A technical green build is not policy approval. | Exact-source CI/build, migration and ACL evidence; role-isolation UAT; backup/restore and rollback plan; open-risk list with accepted owners; monitoring/support readiness; staged pilot evidence; signed go/no-go and rollback authority. No release owner may self-approve a control they authored for a high-risk regulated change. | Business/Product + Engineering/Operations; Legal, Finance or Compliance by affected scope. |

The service, recovery, rotation and exercise targets above are AfroLife's
proposed engineering defaults, aligned to
[V7_RELEASE_BASELINES_AND_POLICY.md](V7_RELEASE_BASELINES_AND_POLICY.md), not
Ethiopian statutory numbers. They become release criteria only when their
named owners approve them and the target environment demonstrates them. Until
then, the associated gates remain blocked.

## Approval record required

For each gate, retain a versioned record containing: decision ID, affected
domain and launch country, approver name/role, decision and rationale, source
version reviewed, effective date, expiry/review date, rejected alternatives,
conditions, evidence links, and accountable operator. A Slack/chat statement,
test pass or code comment is not a substitute for this approval record.

| Approval ID | Required record | Status at decision date |
|---|---|---|
| ETH-LEGAL-01 | E-signature enforceability, identity assurance and retention opinion | Open; record-only evidence stays in effect |
| ETH-LEGAL-02 | Lease notice/service rules by contract and delivery channel | Open; legal effect stays disabled |
| ETH-PRIV-01 | Personal-data lawful bases, notices, rights, retention and transfer assessment | Open; external screening remains disabled |
| ETH-PROVIDER-01 | Due diligence and written authorization/status for each screening, e-sign and payment provider | Open; no provider inferred or approved |
| ETH-FIN-01 | Entity accounting/tax/invoice policy and ERCA applicability | Open; tax invoice capability not accepted |
| ETH-FIN-02 | Ledger, settlement and period-close reconciliation sign-off per domain | Open; regulated live activity remains gated |
| ETH-IAM-01 | Service identity inventory, ownership, rotation and revocation evidence | Open; no complete lifecycle evidenced |
| ETH-OPS-01 | SLO, forecast demand, capacity/load and alert acceptance | Open; no production SLO claim |
| ETH-DR-01 | Business-approved RPO/RTO and witnessed target-environment recovery | Open |
| ETH-A11Y-01 | WCAG 2.2 AA and supported-device acceptance | Open |
| ETH-IR-01 | Incident contacts/playbooks, notification decision tree and exercise report | Open |
| ETH-REL-01 | Named business and technical release owners plus signed go/no-go | Open |

## Implementation sequence

1. Preserve the existing lease evidence-only and legacy production safety
   controls. Do not expand digital notice effects or represent evidence files
   as verified signatures.
2. Keep external screening, tax-invoice issuance, live regulated payment/MFI
   activity and unapproved provider integrations behind disabled-by-default
   configuration.
3. Have Legal, Privacy, Finance, institution Compliance and Product complete
   the approval records above for the actual launch entity, contract and
   provider.
4. Implement approved policies as versioned, effective-dated configuration
   with explicit approver, scope and audit event. Do not bury legal policy
   thresholds in code.
5. Execute API, database-role, provider-sandbox, accessibility, load, incident
   and recovery acceptance in staging with synthetic data; retain outputs
   against the exact release commit.
6. Run a time-bounded invited pilot with a named support/release owner. Expand
   only after all applicable gates are approved and observed targets pass.

## Source register

### Ethiopian primary or regulator sources

- Ethiopia Ministry of Justice, [Electronic Signature Proclamation Amendment
  Proclamation No. 1358/2024](https://justice.gov.et/am/law/electronic-signature-proclamation-amendment-proclamation-no-1358-2024/)
  (official page links the PDF at
  [1358.pdf](https://justice.gov.et/wp-content/uploads/2025/08/1358.pdf)).
  The full legal effect must be checked against the official Gazette text and
  the principal proclamation by Ethiopian counsel.
- Ethiopia Ministry of Justice, [Personal Data Protection Proclamation
  No. 1321/2024](https://justice.gov.et/am/law/personal-data-protection-proclamation/)
  and [Personal Data Protection in Ethiopian
  Law](https://justice.gov.et/am/article/personal-data-protection-in-ethiopian-law/).
  The official law page links the enacted document; counsel must still review
  the complete text and amendments for applicability.
- Ethiopia Ministry of Justice, [Electronic Signature Regulations No.
  582/2025](https://justice.gov.et/en/law/%E1%8B%A8%E1%8A%A4%E1%88%8B%E1%8A%AD%E1%89%B5%E1%88%AE%E1%8A%92%E1%8A%AD%E1%88%B5-%E1%8D%8A%E1%88%AD%E1%88%9B-%E1%8D%8A%E1%88%AD%E1%88%9B-%E1%8B%B0%E1%8A%95%E1%89%A5-%E1%89%81%E1%8C%A5%E1%88%AD-582-2018regulation-no-582/).
  The official PDF is also available directly from the
  [Ministry](https://justice.gov.et/wp-content/uploads/2026/06/ደንብ-ቁጥር-582-2018.pdf).
- National Bank of Ethiopia, [Microfinance Business directives](https://nbe.gov.et/directives/microfinance-business/)
  and [NBE](https://nbe.gov.et/). Confirm the currently applicable directive
  against the institution's precise license and activity.
- ERCA: verify current tax/e-invoicing rules and accreditation requirements
  directly with the Ethiopian Revenue and Customs Authority and tax counsel
  before enabling invoice or tax workflows. This review did not validate a
  current ERCA directive or applicability date.

### Industry baselines (not Ethiopian law by themselves)

- [NIST Cybersecurity Framework 2.0](https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20)
  and [NIST SP 800-53 Rev. 5, Update 1](https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final)
  for risk ownership and security/privacy control design.
- [NIST SP 800-63-4](https://pages.nist.gov/800-63-4/) for digital identity
  assurance concepts; do not equate a NIST assurance level with Ethiopian
  signature validity.
- [OWASP ASVS 5.0.0](https://owasp.org/projects/asvs) for version-pinned
  application-security verification.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) for accessibility acceptance.
- [Google SRE Book](https://sre.google/sre-book/) for measurable service
  objectives, error budgets and operational learning.
