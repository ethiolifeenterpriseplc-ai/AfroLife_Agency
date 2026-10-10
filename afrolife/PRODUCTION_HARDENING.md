# AfroLife production hardening checklist

This is a release gate, not evidence that the listed operational work has already
been completed. Use `.env.production.example` as a template only; do not deploy
with its example host, placeholder credentials, or placeholder keys. The API
now rejects unsafe production configuration at startup, requires the restricted
database runtime role to avoid superuser/BYPASSRLS/table-owner privileges, and
stores production authentication rate limits in PostgreSQL. Apply all schema
migrations before starting a production release.

## Self-hosting on Windows Server or Windows 11

Use a supported Windows Server release or Windows 11 Pro for the self-hosted
deployment. Do not expose an end-of-support Windows release to the public
internet. The host preparation script refuses Windows 10 and requires
Microsoft-signed IIS URL Rewrite and ARR installers:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\windows\Initialize-AfroLifeIis.ps1 `
  -UrlRewriteMsi C:\Installers\rewrite_amd64_en-US.msi `
  -ArrMsi C:\Installers\requestRouter_amd64.msi
```

Download the x64 installers from the official IIS pages. These PowerShell
commands use the Microsoft download URLs currently linked from those pages:

```powershell
New-Item -ItemType Directory -Force C:\Installers | Out-Null
Invoke-WebRequest `
  -Uri 'https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi' `
  -OutFile C:\Installers\rewrite_amd64_en-US.msi
Invoke-WebRequest `
  -Uri 'https://go.microsoft.com/fwlink/?LinkID=615136' `
  -OutFile C:\Installers\requestRouter_amd64.msi
```

The script verifies each installer's Authenticode signature and Microsoft
publisher before running it. It installs IIS features, enables ARR proxy mode,
stops the default IIS site, and disables IIS's HTTP/HTTPS/QUIC inbound firewall
rules. It does not create a production site or open inbound access. If Windows
requests a restart, reboot and rerun the script.

The repository includes Windows-specific starting configuration:

- `.env.production.windows.example` — runtime environment template. Copy it to
  `C:\ProgramData\AfroLife\runtime.env`, replace every example value, and
  restrict the file to the AfroLife service account and administrators.
- `deploy/windows/afrolife-service.xml` — WinSW service definition template.
  Review its install paths and install a verified WinSW release alongside the
  renamed wrapper executable before installing or starting the service.
- `deploy/windows/web.config` — IIS URL Rewrite / ARR reverse-proxy rules.

Recommended single-server layout:

- Application release: `C:\AfroLife\app`
- Runtime secrets: `C:\ProgramData\AfroLife\runtime.env`
- Private uploads: `C:\ProgramData\AfroLife\private-files`
- Service logs: `C:\ProgramData\AfroLife\logs`
- API listener: `127.0.0.1:3000` only; IIS terminates HTTPS and proxies locally.

Production startup requires distinct non-placeholder `JWT_SECRET` and
`MFA_ENC_KEY` values (each at least 32 characters), `REQUIRE_MFA_FOR_STAFF=1`,
exact HTTPS `CORS_ORIGINS`, an absolute private `FILE_STORAGE_DIR`, a valid
`TRUST_PROXY` hop count or subnet, and a runtime database URL. Remote
PostgreSQL must use `sslmode=verify-full`; loopback PostgreSQL may be used for
single-host deployment. Startup fails if the database role is superuser, has
`BYPASSRLS`, or owns an RLS-protected table. Do not use the migration account
for the running service. `SESSION_IDLE_TIMEOUT_MINUTES` defaults to 30 and must
be set to an integer from 5 to 480. Authenticated requests update a server-side
session record; sessions that exceed this inactivity window, are revoked, or
reach their eight-hour absolute token expiry are rejected. The PWA/native
workspace also signs out locally after inactivity and sends a heartbeat while
the user is active. Apply migration `040_auth_sessions.sql` before deploying
this version; all previously issued tokens lack a server session ID and require
users to sign in again.

`MFI_PILOT_ENABLED` defaults to `1` in production so authorized AfroLife staff
can access the institution-scoped workspace. Set it to `0` to disable the MFI
API and workspace. The default only exposes the controlled pilot; it does not
certify compliance or make MFI operations suitable for public deposits or
regulated lending. Institution roles remain enforced; platform Super Admins
have an audited cross-institution override for all available pilot operations.
Do not use it for public deposits or regulated lending until the regulatory,
accounting, member-KYC, AML/CFT, security, and independent financial-review
gates below have been satisfied.

### DuckDNS and HTTPS

The requested hostname is `afrolife-agency.duckdns.org`. As of 10 October
2026, its A record matches this network's current public egress address, and
the saved DuckDNS updater credential successfully updated the record. External
TCP ports 80 and 443 remain unreachable. The host is behind a private LAN
gateway; Windows Firewall has no enabled inbound allow rule for those ports.
WSL Nginx and the API listen only on loopback ports 8080 and 3000, respectively.
Local Windows IIS serves its stock landing page on HTTP, and no HTTPS binding
is configured. DNS is therefore working, but the host is neither routed nor
configured to serve the AfroLife app publicly.

If this Windows host is to be used, confirm the gateway has a reachable public
IPv4 address and configure inbound routing for TCP 80/443 to the host; if the
ISP uses CGNAT or blocks inbound web traffic, use a public server or managed
tunnel instead. Configure a reverse proxy to the app and trusted TLS before
allowing public access. Use `deploy/windows/Set-DuckDnsCredential.ps1` to store
the DuckDNS token protected by Windows DPAPI for the current Windows account,
and `deploy/windows/Update-DuckDns.ps1` as the updater. Run the updater's
scheduled task as that same account. Do not put the DuckDNS token in a
repository, deployment environment file, command-line argument, or chat.

On the server, sign in as the dedicated AfroLife service account, then run
PowerShell and configure the account secret (the token prompt is hidden):

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\windows\Set-DuckDnsCredential.ps1 -Domain afrolife-agency.duckdns.org
.\deploy\windows\Update-DuckDns.ps1
```

In Task Scheduler, create a task named `AfroLife-DuckDNS` using that same
account, configured to run whether the account is logged on or not. Add a
repeating trigger every 5 minutes and an action that starts
`powershell.exe -NoProfile -NonInteractive -File
C:\AfroLife\app\deploy\windows\Update-DuckDns.ps1`. Do not put the token in
the task arguments. Confirm
`%LOCALAPPDATA%\AfroLife\logs\duckdns-update.log` for the task account records
a successful update before proceeding.

After confirming that the hostname resolves to the server's public IP and external TCP ports 80 and 443 reach the host:

1. Configure a fixed public IPv4 address or a router/firewall forward for TCP
   80 and 443 to the Windows host. Do not forward 3000 or 5432. If the ISP
   uses CGNAT or blocks inbound 80/443, HTTP-01 validation and direct hosting
   will not work; use a public server/reverse tunnel or a DNS provider that
   supports automated DNS-01 instead.
2. Run `deploy/windows/Initialize-AfroLifeIis.ps1`, then create an IIS site
   rooted at `C:\AfroLife\app\public` and bound to
   `afrolife-agency.duckdns.org` on HTTP port 80 and HTTPS port 443. Deploy
   `deploy/windows/web.config` as the site's configuration. Keep the
   `.well-known\acme-challenge` path available for HTTP-01 validation and
   renewal; other HTTP requests redirect to HTTPS and application requests
   proxy to the loopback API.
3. Install a verified current win-acme release from its official site, run
   `wacs.exe` elevated, select the IIS site/hostname, request a Let's Encrypt
   certificate using HTTP-01 validation, and install it into the IIS HTTPS
   binding. Keep the win-acme renewal scheduled task enabled and verify renewal
   before relying on the host. Never export or commit the private key.
4. Test renewal and external access from a different network. A trusted
   certificate requires public validation; a DNS name by itself is not enough.

DuckDNS has a subdomain free-of-charge model and Let's Encrypt certificates
are free, but both depend on public reachability and the respective service
terms. The selected name is not confirmed active until it has been claimed.

Before deployment, install a supported Node.js 22+ runtime and PostgreSQL 14+.
Configure IIS ARR as a proxy, bind a publicly trusted TLS certificate to the
production hostname, and redirect HTTP to HTTPS. Keep ports 3000 and 5432
unavailable from external networks. With HTTP-01 certificate validation,
allow inbound TCP 80 for the challenge and HTTP-to-HTTPS redirect, as well as
TCP 443; DNS-01 can avoid exposing port 80 if supported by the DNS provider and
renewal tooling. If PostgreSQL is on another host, require TLS with certificate
verification and allow access only from the application server.

## Local Ubuntu on Windows (WSL2)

Ubuntu on the development PC is Ubuntu 26.04 LTS running in WSL2. It is a
local staging environment, not an independently hosted public Linux server.
It can run the app and a separate PostgreSQL instance for validation, but
public deployment still requires a reachable host and network, durable
service startup, backups, and trusted TLS.

The local staging stack is installed under `/opt/afrolife/app`; PostgreSQL
listens only on `127.0.0.1:5432`, the Node API only on `127.0.0.1:3000`, and
the local Nginx proxy only on `127.0.0.1:8080`. The generated runtime secrets
are stored in `/etc/afrolife/runtime.env`, readable only by root and the
restricted `afrolife` service group. Eight schema migrations are applied to
the separate `afrolife_linux` database.

Linux deployment templates are in `deploy/linux/`:

- `afrolife.service` runs Node as the restricted `afrolife` system account.
- `nginx-afrolife-local.conf` listens only on loopback port 8080 for local
  staging checks. It is not a public or TLS ingress configuration.

The `AfroLife-Ubuntu-Staging` Windows Scheduled Task starts Ubuntu at the
current user's logon and keeps WSL alive so its enabled systemd services can
run. The local staging URL is `http://localhost:8080`; it is not HTTPS and
must not be used for public traffic or real identity documents.

The Linux database has not been seeded with a Super Admin. When ready, open
Ubuntu and run `sudo bash /opt/afrolife/app/deploy/linux/Seed-AfroLifeAdmin.sh`.
It prompts locally for the administrator name, phone, and password; the
password input is hidden and is not stored in the runtime environment file.

Keep PostgreSQL bound to `127.0.0.1`; do not expose WSL ports 3000 or 5432 or
configure Windows port proxies. Do not point the Linux app at the Windows
development database. For public production, migrate this deployment to a
supported VPS or cloud VM, configure DNS and firewall routing there, and test
trusted TLS before accepting real user traffic.

## Oracle Cloud Always Free ARM64 VM

For a public pilot on an eligible free VM, see
[deploy/linux/ORACLE_ALWAYS_FREE.md](./deploy/linux/ORACLE_ALWAYS_FREE.md).
Oracle documents an Always Free Ampere A1 compute allowance, but capacity is
region-dependent and idle instances can be reclaimed. Compute eligibility does
not guarantee that the public IP or every networking/storage resource is free;
check the complete estimate and stop if any charge is shown. The account owner
must create the cloud resources; this repository does not provision them. The
runbook keeps PostgreSQL and the Node listener loopback-only, exposes only
SSH/HTTP/HTTPS, and retains the database, TLS, release, and production-readiness
gates.

## VMware Workstation local pilot

For a host-only local pilot in the existing Windows VMware Workstation
installation, see [deploy/linux/VMWARE_LOCAL_PILOT.md](./deploy/linux/VMWARE_LOCAL_PILOT.md).
This is NAT-only, HTTP-only test hosting with synthetic data; it does not make
the DuckDNS hostname public and must not be used for real identity documents,
deposits, or regulated financial workflows.

Build a clean release on the server or in a trusted build pipeline:

```powershell
Set-Location C:\AfroLife\app
npm ci
npm run build
npm prune --omit=dev
```

Run database migrations as a one-off operation using a separate, restricted
migration environment file. Do not put `MIGRATION_DATABASE_URL` in the runtime
environment file or service configuration. Create the initial Super Admin
through the documented seed procedure, then remove the temporary seed
credentials from the environment. Start the Windows service only after the
service account has read access to the application and runtime environment and
modify access only to the private-files and logs directories.

For staging, verify `https://<production-hostname>/healthz`, authentication,
uploads, file privacy, backup/restore, and access from the Android app on a
physical device. A development LAN address or self-signed certificate is not a
production HTTPS endpoint. This configuration does not provision DNS, a public
IP, a certificate, a Windows service account, or PostgreSQL backups; those are
server-owner tasks.

## Application and database

Use [QUALITY_ASSURANCE.md](./QUALITY_ASSURANCE.md) for the automated change
checks, staging scenarios, release evidence, pilot operations, and scorecard.
CI success is one release input; it does not replace staging or operational
evidence.

- [ ] Apply all migrations, including `007_property_owner_listings.sql`, to a
  staging database first; verify the migration record and run the unit and
  integration suites against staging.
- [ ] Keep `INSURANCE_SERVICE_URL` unset until a historical-data migration has
  completed, legacy and service balances have been reconciled, rollback and
  recovery procedures have been rehearsed, and an independent accounting owner
  has approved the cutover. The schema migration provisions an empty ledger;
  `INSURANCE_SERVICE_CUTOVER_READY=1` is an operator attestation, not an
  automated readiness check.
- [ ] Apply migrations `021_shared_auth_rate_limits.sql` and
  `036_auth_rate_limit_runtime_access.sql` before production startup. Verify
  the runtime role has the explicit bucket-table permissions and that all three
  authentication rate-limit namespaces increment and reset across separate
  API instances. Keep the API on one instance until this shared store has been
  load-tested for the intended traffic profile.
- [ ] Apply migrations `032_privacy_requests_and_incidents.sql` and
  `037_global_admin_privacy_access.sql` before enabling the privacy workspace.
  Verify requesters see only their own personal-data requests, while Compliance,
  Super Admin, and Global Admin users can perform their authorized case review
  through the non-owner runtime role.
- [ ] Apply `038_global_admin_insurance_access.sql` when deploying the central
  Insurance ledger. Verify Global Admin access through the runtime role while
  preserving organization scoping for all non-platform users and independent
  journal review controls.
- [ ] Apply `039_insurance_ledger_runtime_grants.sql` and verify the restricted
  central runtime role has only the account, journal, line, audit, and identity
  sequence privileges needed by the central Insurance routes. Do not rely on
  database-owner or default-privilege grants.
- [ ] Run `npm run db:check-runtime-acls` with migration-owner and runtime
  connection URLs aimed at the same staging database. It checks the effective
  ACLs (including inherited/default grants), role safety, and RLS table ownership.
- [ ] Apply `040_auth_sessions.sql` before deploying session-enforcement code.
  Verify login, idle expiry, absolute expiry, logout revocation, password/MFA
  reauthentication, and runtime-role permissions using a disposable database.
- [ ] Provision PostgreSQL with TLS and a dedicated runtime account. Keep the
  migration owner separate from the API runtime account; the runtime account
  must not own tables and must not have `BYPASSRLS`.
- [ ] Confirm row-level security isolation for agents, property owners, and
  staff using the runtime account. Do not run the service as a database
  superuser.
- [ ] Back up PostgreSQL and private file storage, encrypt backups, set retention,
  and perform a restore rehearsal before launch.
- [ ] Run migrations as a one-off deployment job with migration-only credentials;
  do not provide `MIGRATION_DATABASE_URL` to the long-running API service.

## Secrets, identity, and access

- [ ] Store `DATABASE_URL`, `JWT_SECRET`, and `MFA_ENC_KEY` in the hosting
  platform's secret manager. Generate unique random keys; never reuse the sample
  values, commit secrets, or expose them in logs.
- [ ] Keep `REQUIRE_MFA_FOR_STAFF=1`; enroll and test at least two Super Admins
  and a documented recovery process before launch. Verify Global Admin
  promotion requires two different active, MFA-enabled Super Admins and that
  neither Global Admin access nor the promotion workflow bypasses financial
  maker-checker controls.
- [ ] Keep the role-gated MFI workspace enabled with `MFI_PILOT_ENABLED=1` only
  for authorized staff and controlled pilot use. Any controlled MFI pilot must
  have a named institution, invited users, approved accounting and safeguarding
  procedures, and its own regulatory/security sign-off. The flag is not a
  substitute for those approvals; set it to `0` to disable the module.
- [ ] Review the initial Super Admin seed procedure and remove seed credentials
  from deployment logs and shell history.
- [ ] Limit CORS to the exact HTTPS PWA host and the Android WebView origin
  required by the installed app. Never use `*`. Set `TRUST_PROXY` only to the
  actual trusted proxy hop count or trusted subnet configuration.

## Private uploads and personal data

- [ ] Set `FILE_STORAGE_DIR` to a durable, access-controlled location outside
  the web root. Restrict filesystem access to the application identity.
- [ ] Enable encryption at rest for the storage volume and backups. Test backup
  restore, file-to-metadata consistency, and recovery from a missing file.
- [ ] Approve a KYC and listing-photo retention/deletion policy that meets local
  privacy and regulatory requirements; implement and test scheduled deletion
  before accepting real identity documents.
- [ ] Confirm upload size/type validation, private non-cacheable downloads, and
  access logging in the production hosting environment.

## Network, operations, and release

- [ ] Terminate TLS at a maintained ingress/reverse proxy, redirect or reject
  plaintext external traffic, and verify security headers in staging.
- [ ] For Windows self-hosting, bind the Node API to loopback, proxy through IIS
  ARR, expose only HTTPS externally, and use a restricted Windows service
  account. Review the templates in `deploy/windows/`.
- [ ] Configure production `CORS_ORIGINS`, health monitoring for `/healthz`,
  alerting, log retention, and incident response. Avoid logging credentials,
  tokens, identity data, or full upload contents.
- [ ] Confirm the startup guard accepts the production runtime role and rejects
  superuser, `BYPASSRLS`, and RLS-table-owner roles. Verify the exact proxy
  trust configuration and forwarded client IP from outside the server.
- [ ] Load-test expected traffic and set database connection limits, backups,
  disk alarms, and storage capacity alerts.
- [ ] Keep payment and notification webhook secrets unset until the corresponding
  provider integration, signature verification, replay handling, and operational
  reconciliation are tested.
- [ ] Build and test the Android app with the supported Android SDK on a clean
  build machine. Supply release signing credentials from protected environment
  variables, never repository defaults; verify HTTPS server configuration and
  test installation, login, uploads, and reconnect behavior on a physical
  device. A release APK produced with a sample/default signing key must not be
  distributed.
- [ ] Complete legal review for real-estate, consumer, privacy, labor, and tax
  obligations in every launch jurisdiction.
- [ ] Run a staged pilot with support and rollback procedures. Promote to general
  production only after all boxes above have an owner and evidence.
