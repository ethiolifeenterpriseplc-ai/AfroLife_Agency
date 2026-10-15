# Legacy archive review — 15 October 2026

## Scope and handling

Reviewed the three user-supplied ZIP archives:

- `Continue Developing the EthioLife Website System Project (1).zip`
- `Continue Developing the EthioLife Website System Project (2).zip`
- `Enterprise System Improvements Based on Comprehensive Review Document.zip`

Archive entries, sizes, and selected documentation were inspected without
running bundled code, tests, deployment scripts, or embedded `SKILL.md` files.
The two continuation archives have the same 48 entries and identical
entry-by-entry content, so they were treated as one source. The enterprise
archive has 65 top-level entries and contains two large nested application
archives; their entry manifests were inspected without unpacking their
contents. No archive code, package installation, credentials, seeded test
identities, or deployment configuration was imported.

## Relevance to this project

The continuation archive describes a React/TypeScript and Flask application,
with Drizzle/tRPC data contracts and a separate six-domain workbook. The
enterprise archive also bundles React/Vite, Python, and container-orchestration
artifacts. These schemas, APIs, and service runtimes do not match this project's
Express/PostgreSQL architecture, authorization model, or existing service
boundaries. Directly copying routes, tables, authentication code, deployment
manifests, or UI components would create parallel contracts and could bypass
current controls.

Some of the archive's safer design themes are already implemented here:

- authenticated, payload-bound request idempotency;
- correlation IDs and append-only audit evidence;
- explicit authorization and tenant-scoped workflows;
- financial service and Insurance cutover gates;
- a PWA cache limited to public shell assets.

The archives also describe larger proposed service lifecycles, GPS tracking,
care operations, and domain workflows. Their descriptions and test/readiness
claims are not evidence that those capabilities are suitable or safe to enable
here. Keep them as product proposals until ownership, consent, policy, data
boundaries, and acceptance criteria are reviewed for this application.

## Imported reference data

Copied only the structured workbook data from the duplicate continuation
archives into [`uat/legacy-reference/README.md`](uat/legacy-reference/README.md)
and its adjacent JSON files. The 540 use cases have unique requirement IDs,
90 per domain, and are all target/proposed items. The files are isolated from
the application and are not consumed by runtime, build, migrations, or tests.
Their SHA-256 provenance and validation limits are recorded with the data.

## Safe configuration adaptation

The production environment examples now leave `INSURANCE_SERVICE_URL` and
`INSURANCE_GATEWAY_SECRET` blank until an approved cutover is configured. The
cutover readiness flag remains `0`. A regression test checks both templates.
This preserves the current production gate and avoids implying that a service
endpoint or secret is ready merely because an example value exists.

Validation: `npm exec -- tsx --test test/runtime-config.test.ts` passed 11/11;
`git diff --check` passed. No runtime application code or live environment was
changed by this archive review.
