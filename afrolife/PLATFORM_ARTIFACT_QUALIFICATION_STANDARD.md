# Platform artifact qualification standard

**Status:** engineering and operations baseline
**Applies to:** every independently configurable item in AfroLife, from a mini-app down to one role grant, field, form rule, recommendation rule, integration credential reference, report metric, or uploaded document type.

“Nano-level artifact” means the smallest item that can be configured, authorized, released, audited, or used to make a business decision. A record is not production-qualified merely because it exists in the database or appears in the UI.

## Qualification record

Every artifact must have a stable key and a qualification record containing:

| Attribute | Required evidence |
| --- | --- |
| Identity | Stable key, display name, artifact type, owning mini-app/service, business owner, technical owner |
| Purpose and scope | Intended users, business outcome, tenant/territory scope, data classification, excluded use |
| Lifecycle | Draft, reviewed, active, suspended, or retired; effective dates; version; prior-version reference |
| Access | Allowed roles and actions, least-privilege rationale, maker/checker separation for sensitive changes |
| Data contract | Authoritative source, fields, validation, retention, correction/deletion path, and API/database owner |
| Evidence | Required documents or acceptance evidence, source, verification status, reviewer, timestamp, and reason |
| Operations | Dependencies, failure behavior, support owner, monitoring/reporting signal, rollback or retirement path |
| Change control | Change reason, before/after values, actor, independent approver when material, audit event |

An item stays in **draft** if a mandatory attribute is missing. It may become **active** only after the applicable checks below pass. Production release also requires a release identifier and an accountable owner.

## Qualification gates by artifact type

### Mini-apps, APIs, and databases

- Name the service owner and authoritative database/schema. Use a versioned API contract with authentication, authorization, input validation, idempotency where writes may be retried, error semantics, and audit expectations.
- Enforce tenant and user scope server-side. A client-supplied role, tenant, or ownership identifier is never sufficient authorization.
- Keep secrets outside application configuration records; store only a secret-manager reference and rotation evidence. Fail closed when required service credentials or dependencies are unavailable.
- Document migration ordering, compatibility window, reconciliation, backup/restore, health/readiness, and rollback. Do not call a service independently data-owned until its own schema, role grants, migrations, and reconciliation have been verified.
- Publish a mini-app only when its navigation, API permissions, subscription/access rule, data owner, help/error state, and accessibility basics agree.

### Roles, permissions, products, and pricing

- Use a named template with stable key, scope, role category, allowed activities, owner, and version. Grant only required actions; make elevated access time-bounded and reviewable.
- Keep role creation separate from role assignment. Super Admin and delegated Business Admin authority must be constrained to their approved scope; neither may grant permissions beyond their own delegation.
- Store price with currency, billing interval, tax treatment, effective date, and approval evidence. Price changes must be versioned and must not silently rewrite existing contracts or paid subscriptions.
- Keep draft configuration separate from published configuration. Require independent approval before changes that alter access, KYC, price, eligibility, or external integrations become effective.

### Workflows, matching, recommendations, reports, and decisions

- State the eligible population, inputs, exclusions, ordering/ranking rules, owner, and expected outcome. Validate that recommendations do not bypass consent, qualification, tenant scope, or human approval requirements.
- Provide a reason code or human-readable explanation for material recommendations and decisions. Preserve the rule/model version and relevant evidence used at decision time.
- Reports must identify their source, refresh timestamp, metric definition, access classification, and reconciliation status. Cross-tenant reporting uses minimized aggregates and read-only access.
- Define measurable acceptance criteria, exception handling, duplicate/retry behavior, and a route to correct erroneous data or decisions.

### Forms, uploaded documents, and extracted data

- A form must identify its owner, user purpose, mandatory/optional fields, validation, consent/legal basis where applicable, retention rule, error/recovery path, and destination API.
- Document types must state who supplies them, which roles/workflows require them, accepted formats and size limits, expiry/renewal rules, access policy, retention/deletion, and reviewer decision states.
- Validate uploads by content as well as claimed MIME type; scan files before use; store them privately; authorize every read/download; prevent public URL exposure; record uploader, checksum, size, type, time, and review history.
- Treat OCR/extraction output as unverified evidence. Record extraction method/version, field-level confidence and source location when available, then require human confirmation for identity, legal, financial, eligibility, or other consequential fields.
- Preserve the original file and distinguish extracted values from confirmed values. Corrections must record who changed the value, why, and the source evidence; never silently overwrite the original.

### External integrations and block/allow decisions

- Register the provider, business purpose, service owner, data exchanged, legal/consent basis, endpoint environment, credential reference, scopes, expiry, rate limits, timeout/retry behavior, and incident contact.
- Test with sandbox credentials and synthetic data before production. Require independent approval for activation, credential rotation, scope expansion, and production endpoint changes.
- Store API keys only in a managed secret vault. Rotation evidence records the reference and completion evidence, never the key itself.
- Allow/block lists must have a typed subject, normalized value, scope, reason, source, effective dates, requester, independent approver, and appeal/correction path. Avoid exposing list membership to unauthorized callers; log each enforcement decision.

## Lifecycle and approval model

1. **Draft:** creator supplies the qualification record and evidence.
2. **Validation:** automated schema, ownership, access-scope, dependency, and document checks run.
3. **Independent review:** a different authorized person checks evidence and material changes; the creator cannot approve their own work.
4. **Activation:** the authorized publisher records the reason, version, and effective time. Sensitive identity onboarding retains separate document review, KYC decision, and account-activation actors.
5. **Monitoring:** owner reviews usage, exceptions, expiry, and access at a defined interval.
6. **Change or retirement:** create a new version or retire with reason, effective time, dependency checks, and a rollback or archival plan.

## Required controls added in this release

- Marketplace configuration now has authenticated read and role-gated write APIs. Each entry is schema-validated, duplicate keys in one change are rejected, and before/after values are audited. Business Managers may only change commerce taxonomy scopes; Super Admin and Global Admin may manage platform scopes.
- Global System Admin owns shared service, package, tenant, role, pricing, identity, and catalog templates. Global Admin can use and govern the central administration tools previously limited to Super Admin.
- Tenant Super Admin access is explicitly assigned by Global System Admin. The current tenant delegation grants only deployment-reference registration for assigned tenants; the tenant package and service set are visible as centrally configured and cannot be changed by the tenant administrator. Deployment verification and activation remain Global Admin actions.
- Self-onboarded account records retain separate KYC decision and activation review evidence. Final KYC approval must be by someone other than the document reviewer; activation must be by a Super Admin other than the KYC reviewer. Both decisions require a recorded reason.
- Service identity records continue to store vault references and rotation evidence only; credential values must never be entered into the app.

## Known qualification gaps to close before claiming full maturity

- Several mini-app APIs are independently runnable but still use shared identity, legacy tables, or compatibility routers. See [SERVICE_BOUNDARIES.md](SERVICE_BOUNDARIES.md); independent deployment is not the same as independent database ownership. Tenant-specific authorization has not yet been propagated through every operational service/data API.
- Full delegated Business Admin maker-account provisioning, reusable role-template authoring, product price versioning/approval, generalized allow/block enforcement, and document OCR with field-level provenance are not fully implemented by this release.
- No deployment provider, production secret vault, external identity provider, or third-party key exchange was configured as part of these code changes. Configure those per environment before production use.

## Operational checklist

Before publishing any new artifact, retain its completed qualification record, validation output, independent approval, migration/API version, deployment/release reference, and rollback instructions. Review active artifacts when their owner, provider, data purpose, access scope, pricing, or legal requirements change, and at least annually.
