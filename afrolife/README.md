# አፍሮ - ላይፍ ኤጀንሲ / AfroLife Agency

Same-origin TypeScript/Express API and installable web app for agent operations, workforce onboarding, verified-worker matching, and Super Admin oversight.

## Requirements

- Node.js 22 or newer
- PostgreSQL 14 or newer
- A PostgreSQL database and login with migration privileges to initialize the schema
- Android Studio with the Android SDK to build/install the Android app

## Local setup

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Set up the isolated local PostgreSQL instance and apply the migrations:

   ```powershell
   npm run db:local:setup
   ```

   This initializes PostgreSQL 18 in `%LOCALAPPDATA%\AfroLife\postgresql` on port `5433` without changing the separate Windows PostgreSQL service on port `5432`. It creates the `afrolife` database, enables `pgcrypto`, applies all migrations, and grants the API a non-superuser `afrolife_app` role that does not bypass row-level security. Random credentials and application secrets are stored outside the project in `%LOCALAPPDATA%\AfroLife\afrolife.env`; do not share that file. Database files persist between restarts.

   To use an existing PostgreSQL instance instead, copy `.env.example` to `.env` and configure `DATABASE_URL` for the runtime role and `MIGRATION_DATABASE_URL` for a migration owner. Use distinct, randomly generated `JWT_SECRET` and `MFA_ENC_KEY` values of at least 32 characters. The runtime role must not own tables or have `BYPASSRLS`; apply schema changes with `npm run db:migrate`.

3. Create the first administrator with environment variables; the password is read from the environment and is never printed:

   ```powershell
   $env:SEED_ADMIN_NAME = "AfroLife Administrator"
   $env:SEED_ADMIN_PHONE = "+251911234567"
   $env:SEED_ADMIN_PASSWORD = "use-a-unique-password-of-12-or-more-characters"
   npm run seed:admin
   Remove-Item Env:SEED_ADMIN_PASSWORD
   ```

4. Run `npm run dev`, then open `http://localhost:3000`.

For local workflow testing, run `npm run seed:local-test-users`. This creates
synthetic active accounts for every AfroLife app role (including two Super
Admins for four-eyes workflows). Random passwords are saved in
`%LOCALAPPDATA%\AfroLife\local-test-users.txt`, outside the repository. These
accounts are marked KYC verified to support local workflow testing; never use
them or their credentials outside the isolated local database. Delete the
credential file when finished. SACCO/MFI roles are institution memberships,
not separate login roles; provision those through an institution's staff
workflow.

Before a shared or production launch, provision at least two Super Admin accounts with distinct names and phone numbers using the seed procedure. Repeat the seed command with the second administrator's details; the phone number must be unique. Account setup is deliberately four-eyes: a Super Admin cannot activate an account they created, and cannot reset their own password or MFA. Keep both sets of seed credentials outside the repository and remove them after use.

The initial database migration creates a starter Ethiopia → Addis Ababa → Bole territory path and default pricing/matching rules. Additional territories are managed through the API by a Super Admin.
The `/healthz` endpoint checks PostgreSQL connectivity and returns HTTP 500 if the database is unavailable.

## Languages and public registration

- The sign-in page and implemented agent/admin workflows can be switched between English, Amharic, Afaan Oromo, and Tigrinya. The selected language is saved on the device.
- People can submit worker, customer, or agent registration requests. Staff KYC review and Super Admin activation are required before an applicant can sign in. Field agents must provide an active master agent's phone number and select the same territory.
- Worker applicants can attach a national ID and police-clearance document during registration. The upload token expires after 24 hours; documents are stored privately and must be reviewed by Compliance before KYC can be verified.
- Agent applicants can select Free, Pro, or Enterprise. This records a plan request only: no payment is collected and no subscription is activated. Paid billing requires a payment provider and subscription lifecycle before production use.
- Worker and customer self-service portals are not part of this MVP; approved accounts currently share the operations shell.
- The sign-up page presents AfroLife's proposed worker pension match (5%) and Edir options: ETB 2,000 joining + ETB 200 monthly, optional ETB 5,000 annual ETB 1 million member/spouse life cover, and optional ETB 200 per household for tenant/property-owner fire, accidental-damage and burglary cover. Applicants may record non-binding interests; no contribution is collected and no pension match or insurance is active. Confirm funding, eligibility, licensed insurer/underwriter, policy wording, claims process, and commencement date before accepting money or advertising active cover. Staff can see requested benefits in KYC review.

## Property listings and secure uploads

Agents and Super Admins can create and manage property listings, record unit and rental details, and attach JPEG or PNG property photos (up to 10 MB per image). Listing data and photo metadata are stored in PostgreSQL; the photo files and applicant KYC files are kept in private file storage, not served from the public web directory. Access to photos is checked against the listing owner's permissions, and downloads are marked private and non-cacheable.

Set `FILE_STORAGE_DIR` to a persistent, access-controlled directory outside `public/` before accepting real documents or photos. Back up that directory together with the database, and establish retention/deletion procedures for personal identity documents before production use. Property listing and photo management are available in the responsive operations workspace, including on the Capacitor Android WebView.

## Configurable business rules

Super Admins can review and update operational rules in **Admin & review → Business rules**. Updates are validated, saved to `config_rules`, and recorded in the audit log. The editable values cover contract fees and commissions, Pro/Enterprise display prices, matching weights and thresholds, optional verified reference/certificate requirements, rent due dates and maximum lease duration, invoice payment periods, and refund caps.

Pricing updates reprice contracts that are not yet signed, including contracts awaiting signature. Contracts at or beyond `payment_pending` keep their signed terms; recorded payments and ledger entries are never rewritten. Refund limits remain bounded by amounts actually collected or held. The Pro and Enterprise amounts are displayed on registration, but paid subscription billing is not active yet; the configurable renewal grace period is reserved for that future billing lifecycle.

Authorization and data-isolation safeguards remain fixed: role permissions, row-level security, mandatory identity and police-clearance verification, four-eyes payment approval, and ledger immutability cannot be disabled through the business-rules interface.

## SACCO / MFI operations pilot

See [SACCO_MFI_PILOT_RELEASE.md](./SACCO_MFI_PILOT_RELEASE.md) for the current
release-candidate scope, verification record, and deployment sequence.
See [SACCO_STANDARDS_ALIGNMENT.md](./SACCO_STANDARDS_ALIGNMENT.md) for the
international and local standards references, mapped controls, and release gaps.
See [SACCO_SERVICE_ROLLOUT.md](./SACCO_SERVICE_ROLLOUT.md) for each service's
current release state and the evidence required before it can be marked Live.

The **SACCO / MFI** workspace adds a separate institution-scoped operational area without replacing AfroLife's agency, marketplace, contract, rent, or workforce records. Run `npm run db:migrate` to apply the MFI schema. The workspace is enabled by default; set `MFI_PILOT_ENABLED=0` to hide and disable it. Access remains limited to authorized AfroLife staff with active institution membership, and operations are checked against each user's institution role. A Super Admin can register an institution; the creator becomes its first institution administrator. That administrator can provision existing active AfroLife finance/compliance staff by phone and assign an institution role.

The workspace now presents a service menu across institution governance, members/KYC, products, savings, shares, credit, IFB, payments, wallets, agent/field operations, collections, accounting, treasury, reconciliation, AML/compliance, risk/fraud, regulatory reporting, CRM, digital channels, analytics, documents, staff, audit/security, exceptions, and cooperative governance. Each service is labelled `Pilot`, `Partial`, or `Not live`; selecting a not-live service shows its baseline scope and explicitly does not accept or post activity. Platform Super Admins can access every institution and all currently implemented institution operations/configuration regardless of institution membership; each institution-scoped request is written to that institution's append-only audit trail. Super Admin access does not make unavailable SRS capabilities live. This menu is a capability map, not a claim that every SRS requirement is implemented.

The pilot supports member registration, lifecycle controls and separate-person review; ordinary savings and share accounts; deposits and withdrawals; loan applications with affordability inputs and explainable credit scores; versioned maker-checker credit and delinquency policies; cash-constrained disbursement; principal-only monthly installment schedules and repayments; assigned collection cases, promises to pay and case resolution; independently approved delinquency/NPL classifications; journal activity, audit history, and full transaction reversals. Each institution has tenant-scoped PostgreSQL row-level security, its own chart of accounts and products, ETB amounts stored to two decimal places, balanced double-entry posting, append-only posted journals/audits, per-institution idempotency keys, cash sufficiency checks, and distinct loan originator/approver/disburser controls.

This is a controlled functional pilot, not the complete attached SACCO/MFI baseline or production-ready regulated banking software. Installments and collections allocate principal only; the pilot does not calculate or accrue interest, charges, penalties, provisions, or dividends, nor implement write-off, restructuring, NPL cure, or Islamic finance terms. Credit and delinquency thresholds are institution-configured and require an approved policy; the app does not claim those values establish regulatory compliance. It does not yet provide document-backed member KYC, AML/CFT screening, regulatory or Sharia compliance decisions, deposits insurance, branch/agent operations, treasury/settlement, reconciliation imports, multi-currency, or formal period closing/reopening. Do not use it to accept public deposits or originate interest-bearing credit until those controls, institutional accounting policy, licensing, security review, operational procedures, and independent financial validation are completed. `MFI_PILOT_ENABLED=1` is only a route/workspace switch, not a compliance approval. Posted facts cannot be edited; corrections use a separately authorized full reversal with a reason and appropriate account/cash checks.

## Independent insurance ledger

SACCO/MFI accounting remains in its institution-scoped `mfi_journals` and
`mfi_journal_lines`. Insurance accounting uses the separate
`insurance_ledger_*` tables and never posts to either the SACCO books or
AfroLife's legacy `ledger_entries`. Apply migrations with `npm run db:migrate`.
Insurance ledger accounts are configured by a Super Admin. Finance managers
and Super Admins can submit balanced draft journals; a different authorized
finance manager or Super Admin must approve or reject them. Posted journals
are immutable, idempotent, audited, and correctable only by an independently
approved reversal.

Insurance benefit selections on signup remain non-binding interest only. They
are not premiums, receivables, policies, or claims and are not posted to any
ledger. The new journal is an accounting boundary, not an insurance
enrollment, collection, claims, or regulatory-approval workflow. Do not record
real insurance activity until the insurer, products, accounting policy,
authorization matrix, and operating controls have been approved.

## Android app

The Android app wraps the existing `public/` web UI with Capacitor. From this project directory:

```powershell
npm install
npm run android:add
npm run android:sync
npm run android:open
```

In Android Studio, build or run the `android` project on a device/emulator. To build a debug APK from PowerShell after Android Studio/SDK is installed:

```powershell
npm run android:build
```

The debug APK is written to `%LOCALAPPDATA%\AfroLife\android-build\_app\outputs\apk\debug\app-debug.apk`.

On first launch, enter the deployed AfroLife server's HTTPS origin (the selected hostname is `https://afrolife-agency.duckdns.org`, once claimed and configured). The app stores that origin locally and uses it for API requests; it rejects plain HTTP except for localhost development. Configure the API server with the exact production PWA origin and `https://localhost` so the Android WebView origin is allowed, then restart the API. Keep the Android app and API on HTTPS in production.

For a signed release APK, configure `AFROLIFE_RELEASE_STORE_FILE`,
`AFROLIFE_RELEASE_STORE_PASSWORD`, `AFROLIFE_RELEASE_KEY_ALIAS`, and
`AFROLIFE_RELEASE_KEY_PASSWORD` in the build environment before running
`npm run android:release`. Keep the keystore and passwords outside the
repository and in protected storage; release builds fail when signing values
are missing. Do not distribute APKs built with test or default signing keys.

For Windows Server self-hosting, see the deployment configuration and release
gates in [PRODUCTION_HARDENING.md](./PRODUCTION_HARDENING.md). See
[QUALITY_ASSURANCE.md](./QUALITY_ASSURANCE.md) for automated checks, staging
scenarios, launch evidence, and pilot operations.

## Scripts

- `npm run dev` — run the API and static PWA with automatic TypeScript reload
- `npm run build` — compile the API to `dist/`
- `npm start` — start the compiled API
- `npm run db:local:setup` — initialize local PostgreSQL and apply migrations
- `npm run db:local:start` — start the isolated local PostgreSQL server
- `npm run db:local:stop` — stop the isolated local PostgreSQL server cleanly
- `npm run db:local:status` — check whether the isolated database accepts connections
- `npm run db:migrate` — apply unapplied SQL migrations in filename order
- `npm run seed:admin` — create the first Super Admin from environment values
- `npm run seed:local-test-users` — create synthetic test accounts in the isolated local database
- `npm run test:unit` — run database-independent tests
- `npm run test:mfi:e2e:local` — exercise the SACCO/MFI API journey against the running local app and isolated QA database
- `npm run test:ui:e2e:local` — headless Chrome smoke check for Super Admin login, SACCO forms, responsive layouts, and browser errors; requires local QA accounts and Chrome
- `npm run test:integration` — run API/database tests against a running local instance
- GitHub Actions runs browser syntax/config checks, the TypeScript build, and unit tests on relevant pushes and pull requests.
- `npm run android:add` — generate the Capacitor Android project
- `npm run android:sync` — copy the web app into Android and sync native plugins
- `npm run android:open` — open the Android project in Android Studio
- `npm run android:build` — sync and build a debug APK

The PWA is served by the same-origin Express app. For a separate web host, publish the contents of `public/` at the site root and configure `/api/v1` on the same HTTPS origin to reach the API. Service workers and PWA installation require HTTPS except on localhost; API responses are not cached.

To generate local signing/encryption secrets in PowerShell:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Integration tests need the API running at `http://localhost:3000` (or `API_URL`) and a database that can be safely written to. They use `TEST_DATABASE_URL` (the local setup's migration role) for disposable fixture setup while the running API uses the restricted `DATABASE_URL` role. Runtime commands load `%LOCALAPPDATA%\AfroLife\afrolife.env` when present, otherwise the project `.env`; never point integration tests at production data.

## MVP workflows

- Sign in with phone/password and complete first-login password changes or optional MFA setup.
- Register attributable leads and prospective workers.
- Create property listings, upload private property photos, and review applicant KYC documents.
- Record skills, languages, experience, expected rate, availability, and territory.
- Create service requests from household/business leads.
- Compliance uploads and reviews identity documents; the uploader cannot approve their own document.
- Super Admin ranks verified, available candidates, proposes matches, accepts/declines proposals, and releases reservations when necessary.
- Accepting a match locks the worker as unavailable and marks the request matched in one transaction. A Super Admin can release the reservation, set restored availability, and reopen the request.
- Agent and administrator records are scoped by database row-level security while the API runs each request in a transaction with the authenticated identity.

Agent and property-owner registrations offer Free, Pro, and Enterprise plan requests. The plan selection is not a subscription: no payment is collected and no paid entitlement is activated. Current agent listing workflows are available regardless of the requested plan; the UI does not promise a paid feature gate until billing and activation are implemented. Enterprise team portfolio and performance reporting remain unavailable without an approved, paid Enterprise plan. Worker Enterprise selection records interest in Option A staff service and does not create an employment placement.

The **Contracts** workspace lets agents create and submit contracts and lets Compliance, administrators, and Finance complete their assigned review steps. Finance records the exact invoice amount and another Finance user reconciles it before the contract activates. A contract can be cancelled or rejected only before payment is recorded; after collection, use dispute resolution and the refund caps. Contract cancellation voids an unpaid invoice and returns the lead to the qualified queue when no other live contract remains.

Super Admins and Master Agents can assign agents to Financial Service, Growth & Partnership, or Workforce & Property Management specializations. Master Agents manage their own field-agent team; Super Admins can review all agents and assign services. Specialization records the agent's service focus and leaves the existing agent tools available to every agent: lead generation, property listings, contract facilitation, and private contract document upload. Property listing access is not currently tied to the requested subscription plan. Enterprise portfolio and performance reporting requires an approved paid Enterprise activation and is not available while subscription billing is unconfigured.

After a contract reaches signature review, an agent can upload the party-signed contract as a private PDF, JPEG, or PNG (up to 10 MB). A Super Admin or Corporate Business Manager can review it, upload the company-countersigned copy, and complete the signature step. The system records the countersigned file, signer, and timestamp, then issues the invoice. It does not apply a cryptographic/electronic signature to the uploaded file.

The **Rent & deposits** workspace supports tenant and lease creation, rent receipts, deposit collection, deposit return, and two-person reconciliation. Lease dates run through the day before the calendar-month anniversary. Partial first and final months are prorated by calendar days; full months are billed at the monthly rate. A lease ending early waives future charges, while the current charge is not prorated. Rent and deposit transactions reach the append-only ledger only after a different finance officer reconciles them. A different finance manager or Super Admin may void an incorrect pending receipt with a reason. Deposits are recorded as liabilities, and returns cannot exceed the reconciled amount collected. Contract fee refunds do not claw back earned agent commissions; refunds and commissions remain separate ledger events.

## Deployment notes

- Use HTTPS, a dedicated private PostgreSQL runtime role, encrypted backups, and private durable file storage. `FILE_STORAGE_DIR` must point to a persistent directory outside `public/`.
- In production, apply migrations using a migration-only owner account and run the API as a separate non-owner role with `USAGE` on `public`, DML on the application tables, sequence usage, and execute permission on the `app_*` helper functions. The runtime role must not own the tables or have `BYPASSRLS`; otherwise PostgreSQL row-level security will not protect records.
- Production startup enforces distinct non-placeholder `JWT_SECRET` and `MFA_ENC_KEY` values, mandatory staff MFA, HTTPS-only exact CORS origins, absolute private file storage, trusted proxy configuration, remote PostgreSQL certificate verification, and a non-superuser/non-owner database role without `BYPASSRLS`. It fails startup rather than silently weakening these controls.
- Production login, registration, and signup-document rate limits are stored in PostgreSQL and shared across application instances. Apply every migration (including `021_shared_auth_rate_limits.sql`) before starting the service. Keep webhook integrations disabled until a provider and its replay/reconciliation workflow are ready.
- For example, after creating the migration owner and `afrolife_app` runtime role, grant runtime access while connected as the migration owner:

  ```sql
  GRANT USAGE ON SCHEMA public TO afrolife_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO afrolife_app;
  GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO afrolife_app;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO afrolife_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO afrolife_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO afrolife_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO afrolife_app;
  ```
- The app is same-origin by default. The service worker caches only static shell files and never caches API responses.
- Set `REQUIRE_MFA_FOR_STAFF=1` to require staff MFA. Configure `PAYMENT_WEBHOOK_SECRET` only when a payment provider has been integrated; signed events use the `x-payment-signature` HMAC-SHA256 header.
- Configure `NOTIFY_WEBHOOK_URL` and `NOTIFY_WEBHOOK_SECRET` only for an HTTPS notification receiver. Events are sent with an `x-afrolife-signature` HMAC-SHA256 header.
- Public sign-up creates an inactive account. Compliance must verify KYC and a Super Admin must activate it; agent records are created only as part of successful activation.
- Buyer/customer applicants can browse available property listings and pictures without write access. Property-owner applicants register separately from buyers and agents; after national-ID verification and activation, they can create listings and manage their own units and photos. PostgreSQL row-level security isolates owner/agent data and limits buyers to available listings.
- The Android API origin is entered on-device. Restrict `CORS_ORIGINS` to the app origins you intend to trust; do not use `*`.
- The initial version is a pilot foundation, not a substitute for review of local labor, consumer, privacy, tax, payment, and real-estate requirements. Production payment settlement and personal-ID retention policies need their own implementation and approval.
- Use [PRODUCTION_HARDENING.md](./PRODUCTION_HARDENING.md) as the production release gate and `.env.production.example` as a non-secret configuration template. Replace every example value and keep migration-only credentials out of the API runtime environment.
