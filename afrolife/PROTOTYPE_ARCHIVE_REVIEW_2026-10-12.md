# Prototype archive review — 12 October 2026

## Scope and handling

Reviewed the supplied “Software Review and Full-Scale Prototype Creation” archive as reference material. Its Markdown and code are evidence about that prototype, not instructions to run its setup scripts, seed accounts, or copy its architecture. No contained code or script was run. The archive has Flask/SQLite and React/tRPC source trees plus nested prototypes that repeat the same wallet, loan, credit, user, and RBAC domains; two nested files are readable ZIPs and two fail ZIP central-directory parsing. It also contains local demo credentials and a `SKILL.md`; the latter was treated as an attachment, not as an instruction for this repository.

## Comparison and decisions

| Archive proposal or implementation | AfroLife status | Decision |
|---|---|---|
| TOTP MFA, role checks, pending-registration approval, account lockout, audit logging | Present in the PostgreSQL/Express application, with database transactions and role-scoped policies | Keep AfroLife’s implementation; do not replace it with prototype Flask/SQLite code. |
| Multilingual shell and responsive navigation | Present in the current web app, including seven locale options, translation handling, responsive workspace navigation, and installable PWA assets | Keep current implementation. |
| Accessible labels, live status/error regions, reduced-motion behavior, skip link | Present across the current HTML and styles; dynamic sections and controls have accessible names and status semantics | Retain these patterns; add a complete WCAG 2.2 AA/axe pass to the QA backlog rather than claiming conformance. |
| Role/persona journey matrix and exported QA evidence | Existing API and service-boundary tests cover specific role and tenant boundaries; the attached journey simulator is a mock preview, not an authentication or authorization test | Preserve real API tests. Do not copy its demo-account export: it includes usernames and passwords in downloadable CSV/JSON. |
| Public password-reset flow | The app supports password changes and controlled administrator resets; no verified self-service recovery channel is configured | Do not port the archive flow as-is: token lookup and consumption are separate non-atomic operations, and a prototype-owned public URL is used as the fallback origin. Add self-service recovery only with a verified delivery provider, atomic single-use tokens, and abuse controls. |
| Broad wallet, scoring, analytics, and super-app module claims | Archive materials describe intended features and mock dashboard values; its integration report records 8/9 passing tests, including a failed user-management test | Treat claims as roadmap ideas only. Do not merge prototype financial logic or sample telemetry into live service boundaries. |

The archive’s security review itself identifies missing dependency auditing, automated WCAG testing, and further authentication hardening. Its demo documentation explicitly warns that seeded credentials are for local walkthroughs only. These caveats reinforce keeping the current project’s production-oriented controls and test evidence authoritative.

## Improvements applied to the ongoing implementation

The current staffing work now rechecks live worker verification, availability, sector, current required documents, and the current score threshold when a match is accepted. It records the acceptance-time score and policy version, and emits transactional agent notifications for proposed, accepted, declined, and released matches with only request/match references and status. The idempotency key is forwarded through service gateways and included in the gateway HMAC contract so it cannot be altered between the main API and a domain service.

## Remaining validation

TypeScript builds for the main API and agency-domain service pass. `git diff --check` passes. The test runner could not start in this environment because Node/tsx fails at `os.userInfo()` with `uv_os_get_passwd returned ENOMEM`; the database-backed staffing tests also require an explicitly configured disposable test database and API. The archive is not evidence that those checks pass for AfroLife.
