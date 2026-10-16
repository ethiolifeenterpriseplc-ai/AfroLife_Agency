# Insurance Agent Referral Workflow

## Current scope

The Insurance mini-app supports customer information requests, Insurance-staff responses, existing organization accounting records, and an optional consent-based referral to one AfroLife Agent. The referral is limited to contact follow-up and referral back to the Insurance service team. It does not create or imply a broker appointment, insurance advice, quote, application, coverage, policy, premium payment, commission, or claims decision.

The separate Insurance brokerage lifecycle training sandbox models needs assessment and disclosures, non-advice review, synthetic product comparison and quote, proposal/submission/issuance and servicing, notices, premium and commission events, claims, and complaints. It accepts synthetic training data only, is available only when explicitly enabled outside production, persists append-only scenario events, and has no insurer, payment, notification, or claims-provider integration. Simulated issuance, notices, receipts, settlements, and claims decisions have no legal, coverage, accounting, or payment effect. This training sandbox does not grant Agents brokerage capabilities.

Agent access is limited to the assigned Agent and their direct Master Agent. Agents receive only the customer's name, phone number, selected topic, and referral status. The customer's free-text information request is not exposed to Agents. The customer can submit the existing Insurance information request without opting into Agent sharing.

The referral lifecycle is:

1. Customer submits an Insurance information request and separately opts in to Agent follow-up.
2. Authorized Insurance staff assign the referral to an active Master Agent or Field Agent, recording a controlled assignment reason.
3. The assigned Agent may record a contact attempt, refer the customer back to the Insurance service team, or record that the customer declined.
4. The customer may withdraw Agent-sharing consent; the referral is then hidden from the Agent hierarchy while its audit record is retained.
5. Insurance staff continue to own and close the underlying information request.

Referral and assignment changes are audited. Referral records cannot be deleted. No live Agent workflow for recommendations, product comparison, quotations, proposal acceptance, binding, policy changes, premium handling, commission settlement, or claims adjudication is enabled. The sandbox-only simulated counterparts are not a substitute for live provider integrations or regulatory approvals.

## Regulatory and external approval gate

The National Bank of Ethiopia lists [SIB/62/2026, Licensing of Insurance Broker](https://nbe.gov.et/files/sib-62-2026/) (published March 25, 2026), as well as the earlier [SIB/31/2010, Licensing of Insurance Broker](https://nbe.gov.et/files/sib-31-2010-licensing-of-insurance-broker/) and [SIB/9/1995, Insurance Brokers Code of Conduct](https://nbe.gov.et/wp-content/uploads/2023/04/INSURANCE-BROKERS-CODE-OF-CONDUCT.pdf). The applicable current requirements, transition/repeal effect, license status, and permitted activities must be confirmed against the complete official instruments by Ethiopian counsel and the responsible regulator before a brokerage operation is enabled.

The NBE's [May 15, 2026 consultation notice](https://nbe.gov.et/nbe_news/nbe-hosts-consultative-discussion-on-draft-insurance-proclamation/) describes a draft Insurance Proclamation consultation; this notice is not treated here as enacted law. Related official references include [Insurance Business Proclamation No. 746/2004](https://justice.gov.et/wp-content/uploads/2025/02/አዋጅ-ቁጥር-746-2004.pdf) and [NBE search results for the 2019 Insurance Business Proclamation amendment](https://nbe.gov.et/wp-json/wp/v2/search?search=Insurance%20Business%20Proclamation%20Amendment%201163-2019&per_page=10).

Before adding regulated brokerage operations, record approval for:

- the licensed brokerage legal entity, current license scope/status, and appointed responsible officers;
- each insurer/provider agreement, product authorization, and legally approved customer disclosures;
- per-Agent qualifications, appointment, training, supervision, and permitted activity;
- advice/suitability requirements, quote and proposal controls, policy issuance/servicing ownership, and insurer-side evidence;
- premium collection and reconciliation design, customer-money safeguards, commission/tax/accounting policy, and independent finance acceptance;
- claims, complaints, disputes, cancellations, renewals, privacy/retention, and incident handling;
- release-owner, legal/compliance, provider, finance, operations, and DR approvals.

This document is an engineering scope and control record, not legal advice or a statement that AfroLife or any Agent is licensed. Production acceptance remains conditional on those external approvals and tested partner integrations.
