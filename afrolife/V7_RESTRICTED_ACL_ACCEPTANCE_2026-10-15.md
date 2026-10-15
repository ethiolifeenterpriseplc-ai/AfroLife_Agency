# V7 restricted-runtime acceptance — 15 October 2026

## Scope and environment

This is local synthetic engineering evidence for the existing AfroLife
platform. It is not staging or production acceptance, external-owner approval,
or evidence of provider/legal authorization.

- PostgreSQL 18 ran on loopback in a fresh disposable cluster and database.
- Migrations 001–067 were applied in sequence using a migration-only owner.
- The runtime role was non-superuser, non-owner, and did not have `BYPASSRLS`.
- The one-time base runtime grants were applied before migrations, following
  the bootstrap sequence in `README.md`. No blanket grant was applied after
  migrations; migration 039's Insurance ledger restrictions remained in force.
- The disposable database, cluster, API process, and temporary credentials
  were removed after the checks.

## Results

| Check | Result | Boundary |
|---|---|---|
| Runtime ACL checker | Pass. Runtime role safety, central Insurance ledger table/sequence ACLs, and `auth_sessions` ACLs verified. | The checker covers these explicit privileges; it is not a complete privilege inventory for every table and service. |
| API and supply integration tests | 49/49 passed against the migrated schema using the restricted API runtime role. | Core API/supply synthetic integration only; not exhaustive route/resource isolation or standalone service UAT. |
| Unit tests | 178/178 passed in the current working tree, including the production-template regression test. | CI result for an exact release candidate remains required. |
| Main and domain builds | Main API, Insurance, Edir, MFI, Workforce Management, Staffing, Property Management, and Marketplace builds passed in the current working tree. | Does not prove deployed-host behavior. |
| Production dependency audit | `npm audit --omit=dev --audit-level=high`: zero reported vulnerabilities. | Point-in-time dependency audit; does not replace SBOM and independent security review. |

The API/supply integration, runtime-ACL, and dependency-audit runs were
performed against application source commit `037f84d`; the later uncommitted
changes in this working tree only remove premature Insurance gateway values
from example production configuration, add a test for that config, and update
acceptance documentation.

The previous 14 October mock's broad Insurance `UPDATE` observation was
introduced by applying the local-development blanket grants after migration
039. This rehearsal applied the one-time grants before migrations; migration
039 then narrowed the ACL and the runtime ACL checker passed. The earlier
mock's other open findings remain open.

## Remaining release gates

- Run the same checks against the exact release candidate and its target
  staging database/runtime role; retain CI and migration evidence.
- Complete negative authorization tests for every domain API, file, report,
  export, background job, and integration. The 49 tests are not exhaustive.
- Complete representative capacity, target-infrastructure backup/restore,
  private-file recovery, rollback, accessibility/localisation, and supported
  device acceptance.
- Obtain named Legal/Privacy, Finance/Tax, HR/Workforce, licensed-institution
  Compliance, provider, Operations, and release-owner decisions and UAT.
- Keep Insurance, MFI/SACCO, Edir, payment, screening, payroll, signature, and
  other regulated/provider-dependent activity behind their existing
  environment and owner-approval gates.

**Disposition:** Useful restricted-runtime local evidence recorded. The
platform remains **not accepted for general production**.
