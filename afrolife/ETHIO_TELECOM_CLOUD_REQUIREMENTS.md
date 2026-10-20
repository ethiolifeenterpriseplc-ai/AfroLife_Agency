# AfroLife on Ethio telecom Cloud — Infrastructure Requirements

**Document status:** Procurement and architecture baseline; provider capabilities and prices must be confirmed in a written quote before purchase.
**Reviewed:** 19 October 2026
**Target provider:** Ethio telecom Cloud / TeleCloud
**Scope:** Web/PWA, central API gateway, PostgreSQL, private documents/media, optional domain services, security, backup, and disaster recovery.

## 1. Executive recommendation

Use Ethio telecom Cloud **CPU-Optimized Cloud Server** for the Node.js application/gateway and **RAM-Optimized Cloud Server** for PostgreSQL. Keep the database private. Put public HTTPS traffic through the Cloud Firewall or another verified reverse-proxy/load-balancer service, and use private SSD storage for database files and uploaded documents.

For an initial controlled pilot, the public catalogue currently shows these two useful starting profiles:

| Component | Catalogue profile | Catalogue resources | Displayed price |
|---|---|---|---:|
| Application/API | `CSCPUOPT09`, 8 Mbps option | 4 vCPU, 8 GB RAM, 30 GB OS SSD, 50 GB SSD data, dedicated public IP, SSH/RDP access, one overwritten weekly backup | ETB 75,113.26 / six months |
| PostgreSQL | `CSRAMOPT03`, 8 Mbps option | 2 vCPU, 16 GB RAM, 30 GB OS SSD, 25 GB SSD data, dedicated public IP, SSH/RDP access, one overwritten weekly backup | ETB 77,302.41 / six months |

The displayed server subtotal is **ETB 152,415.67 per six months** before added storage, stronger backup, firewall, support, and any checkout taxes or adjustments. The catalogue lists 2, 4, and 8 Mbps variants. Confirm the current quote, VAT treatment, subscription term, and public-IP/network charges in the customer portal before ordering. [Cloud server catalogue](https://myportal.ethiotelecom.et/cart.php?gid=35)

This is a **pilot sizing baseline, not a high-availability production design**. The 50 GB/25 GB data disks are not adequate assumptions for long-term uploads or a growing PostgreSQL database. Add separately sized SSD storage, and do not rely on the catalogue's single weekly overwritten copy as the only backup.

For a production service, require a second stateless application node behind a load balancer, a PostgreSQL managed/replicated or primary/standby arrangement, storage that is durable and accessible to all application nodes, a separate recovery site, and a contracted recovery objective. The current application stores uploads on a filesystem; horizontal application scaling therefore requires a shared private filesystem or an application change to use compatible object storage.

### Cost optimization options

The lowest-risk savings are to keep the first deployment small, buy only services needed for the pilot, and use a longer billing term only after the service and support terms are confirmed. Public catalogue prices are indicative and must be rechecked in the account cart before purchase.

| Option | Indicative cost effect | Tradeoff / when to use |
|---|---:|---|
| Consolidate app and PostgreSQL on one RAM-optimized VM for a controlled pilot | The public catalogue lists `CSRAMOPT06` (4 vCPU, 32 GB RAM, 30 GB OS SSD, 50 GB SSD data, 8 Mbps) at ETB 116,215.08 / six months. That is ETB 36,200.59 (about 24%) below the two-VM pilot subtotal above. | Suitable for synthetic-data UAT or a limited pilot only. It creates one failure domain and couples database and app resource use; split tiers before production or when monitoring shows contention. Keep DB and app access controls separate on the host and keep PostgreSQL off the public interface. |
| Use the cheaper CPU-optimized server only for development or very small UAT | `CSCPUOPT09` is listed at ETB 75,113.26 / six months. | Its 8 GB RAM is a tight shared app/database budget. Do not choose it for a co-located PostgreSQL workload without measurement. |
| Defer HA and optional modules until release gates pass | Avoids paying for standby compute, extra environments, analytics, and domain services before they are in active use. | Keep staging isolated and retain the required backups, access controls, and restore capability. Do not defer production HA where an outage is unacceptable. |
| Ask for the advertised longer-term discount | The public catalogue advertises 10% quarterly, 15% semiannual, and 25% annual discounts. | Request an annual quote showing the undiscounted base, eligible products, VAT, renewal price, and early-termination/refund terms. Prepay annually only if service availability, support, and budget are approved. [Catalogue](https://myportal.ethiotelecom.et/cart.php?gid=21) |
| Compare storage and backup line items | The public catalogue lists 500 GB HDD storage at ETB 2,000/month and 1 TB at ETB 4,000/month; its 500 GB weekly backup product is listed at ETB 2,760/month. | HDD can suit infrequently accessed archives if private access and restore speed are adequate. Do not put PostgreSQL data or hot uploads on HDD. Compare the backup service's retention, restore workflow, and consistency against separately priced storage. [HDD storage](https://myportal.ethiotelecom.et/cart.php?gid=26), [backup service](https://myportal.ethiotelecom.et/cart.php?gid=24) |
| Avoid duplicate firewall charges | Ask whether the selected server/network package already includes the required firewall, VPN, and load-balancer functions before adding the separately priced Cloud Firewall. | Keep default-deny network controls and the public HTTPS edge. Do not remove a security control until the provider confirms equivalent protections and responsibilities in writing. [Cloud Firewall](https://myportal.ethiotelecom.et/cart.php?gid=41) |
| Reduce large-upload bandwidth pressure | Compress and resize images in the client and use realistic upload limits; request a higher bandwidth tier if real users need large originals. | At 8 Mbps, a 100 MB upload takes around 100 seconds in ideal conditions. Preserve document quality where required and test actual upload time before reducing limits. |

For a cost-conscious launch, obtain quotes for both the single `CSRAMOPT06` pilot and the two-VM profile above, plus the exact backup and storage required. Prefer the single VM only while data is synthetic or the business has explicitly accepted its outage risk. Move to separate app and database tiers with tested backups before storing material real-user, financial, identity, or contract data. Public Cloud offerings and discounts are listed in the [server catalogue](https://myportal.ethiotelecom.et/cart.php?gid=35); verify all amounts, term discounts, taxes, and availability with Ethio telecom before committing.

## 2. Evidence and assumptions

Ethio telecom's public cloud material lists CPU- and RAM-optimized cloud servers, bare metal, HDD/SSD storage described as file, block, or object storage, scheduled backup options, Cloud Firewall with load balancing and VPN features, and remote-access/site-to-site VPN. The exact service APIs, storage protocols, SLA, encryption controls, and recovery terms are not established by those descriptions. [Ethio telecom cloud services](https://www.ethiotelecom.et/partnership-cloud-solutions/)

The public cloud server catalogue currently exposes 2/4/8 Mbps server profiles and the specifications/prices above. A catalogue page also lists a 500 GB weekly backup product with four weekly copies, overwritten weekly, at ETB 2,760/month. This is useful as an additional restore layer, but it does not establish application-consistent PostgreSQL recovery or a low RPO. [Cloud server catalogue](https://myportal.ethiotelecom.et/cart.php?gid=35), [backup catalogue](https://myportal.ethiotelecom.et/cart.php?gid=24)

The supplied client-area URL did not return account-specific content to the research browser. This document therefore uses public catalogue listings, not a private account cart, negotiated rate, or order confirmation. Have Ethio telecom confirm availability and current terms through the account team or customer portal.

The repository documents Node.js 22+, PostgreSQL 14+, a central same-origin API/PWA, Linux systemd and Nginx deployment templates, and private filesystem uploads. It does not contain a complete Ethio telecom provisioning configuration, Terraform project, or production compose stack. Cloud resources and production topology are not yet deployed or independently verified.

## 3. Application-specific requirements

### 3.1 Runtime and service topology

- Linux server image with a supported, security-maintained distribution and Node.js 22 or newer. Confirm the exact supported image and PostgreSQL package/version with Ethio telecom; the application requires PostgreSQL 14 or newer.
- The public application is one origin: PWA/static assets and `/api/v1` go through the central AfroLife API gateway. The gateway is the only public application origin.
- Nginx or a verified Cloud Firewall/load-balancer terminates TLS and proxies to the main API on private port 3000. Do not expose 3000, PostgreSQL 5432, or service ports to the public internet.
- Services use private network addresses and signed gateway assertions. Do not create public subdomains that bypass the central gateway.
- The app uses PostgreSQL sessions and shared database-backed rate limits, which support multiple API instances, but production sizing must set the Node/PostgreSQL connection limits for the selected instance count.
- Deploy using the repository's Linux systemd templates initially. A managed container service is optional only if Ethio telecom confirms availability, persistent storage semantics, health checks, private networking, secrets integration, and support for the required Node/PostgreSQL versions.

### 3.2 Service readiness and database boundaries

Do not provision every code-level service as if it were already production independent. The current repository marks several service boundaries as transitional:

| Capability | Cloud deployment requirement / release constraint |
|---|---|
| Core AfroLife API, PWA, identity, agency operations | Deploy first behind the central gateway and a restricted PostgreSQL runtime role. Apply migrations using a separate migration-only identity. |
| AfroLife Edir | Separate service and database; enable only after schema, gateway secrets, backup/restore, and service health have been verified. |
| Insurance | Separate service/database and signed gateway are required for production cutover. Information-request records still use a restricted central-identity database connection pending explicit migration. Keep cutover blocked until reconciliation and rollback are approved. |
| SACCO/MFI | Feature defaults disabled. Its extracted service currently reuses the central restricted database and private file store; treat as a supervised pilot, not as an independently owned data plane. Obtain finance, legal, regulatory, KYC/AML, and independent review before enabling. |
| Workforce, Staffing, Property Management, Marketplace | Separate processes exist, but full service-owned schemas/data migration/reconciliation are incomplete. Keep integrated routing until each service's migration, authorization, parity, backup/restore, and rollback gates pass. |
| Accounting | Separate service and migration gates apply. Use private port 3301 for internal Accounting and 3302 for the separate subscriber instance when co-located; MFI uses 3300. Keep all three private behind the central gateway. |
| Global BI | Keep disabled until its separate read-only analytics database, approved projectors, hourly replay controls, and retention are deployed and reconciled. |
| Payments, external settlement, active pension/insurance products | Not a baseline infrastructure dependency. Do not expose a payment callback or enable a financial provider until its integration and reconciliation controls are approved. |

See [SERVICE_BOUNDARIES.md](./SERVICE_BOUNDARIES.md), [PRODUCTION_HARDENING.md](./PRODUCTION_HARDENING.md), and [PRODUCTION_OPERATIONS_RUNBOOK.md](./PRODUCTION_OPERATIONS_RUNBOOK.md) for the current cutover and release gates.

### 3.3 Storage and uploaded documents

- `FILE_STORAGE_DIR` must be an absolute, persistent private path outside the public web root. Use a separately mounted private SSD volume for production; do not put uploads on an ephemeral VM disk.
- Workforce document, property-photo, marketplace-media, lease-signature, Edir, and MFI document storage must remain private and role-authorized. Encrypt disks and backups. Separate environments and restrict access using service identities and filesystem permissions.
- The API accepts worker documents up to 10 MB and property/listing media up to 100 MB. Configure reverse-proxy and firewall upload limits, request timeouts, and bandwidth for these actual limits.
- The current storage adapter is filesystem based. For two or more API nodes, provision a shared private filesystem with documented POSIX locking/consistency behavior or implement and verify an object-storage adapter. Ethio telecom advertises file/block/object storage, but API compatibility, mount protocol, private access, encryption, and lifecycle controls must be confirmed first.
- Set initial storage capacity only after measuring the local database and private-file footprint. Require online expansion, monitoring/alerts at 70%, 80%, and 90%, and a documented growth estimate. Keep database, uploaded files, logs, and backup capacity independently visible.
- Approve retention, deletion, legal hold, and access-review periods for national-ID, police-clearance, property, and contract documents before accepting real personal data.

## 4. Network and security requirements

### Public edge

- Use a registered domain owned by AfroLife. `afrolife-agency.duckdns.org` is a pilot alias; the repo says `ethiolife.life` ownership has not been verified. Do not treat either hostname as production-ready until domain control and DNS are confirmed.
- Assign a stable public IP to the edge only. Configure authoritative DNS, HTTPS certificate issuance and automated renewal, HTTP-to-HTTPS redirection, and an independent-network acceptance check.
- Allow inbound TCP 443 to the reverse proxy/load balancer. Allow TCP 80 only for HTTP-to-HTTPS redirect and certificate validation if the chosen certificate workflow needs it. Do not expose SSH/RDP, 3000, 3100–3403, or 5432 publicly.
- Require Cloud Firewall rules with default deny, managed administrative VPN, network segmentation, traffic monitoring, and provider-confirmed load balancing. Ethio telecom describes Cloud Firewall options with IPSec/WireGuard VPN and load balancing; confirm the selected plan includes the needed throughput and protections. [Cloud Firewall catalogue](https://myportal.ethiotelecom.et/cart.php?gid=41)
- Ask explicitly whether Web Application Firewall rules, DDoS mitigation, TLS policy/cipher management, health-based failover, public-IP failover, and central security logging are included. Do not assume these from the Cloud Firewall product name.

### Private application and data networks

- Separate production, staging/UAT, management, database, and backup/DR network segments or equivalent security groups.
- Permit app-to-database traffic only from the application/service subnet. Permit gateway-to-service traffic only on the configured private service ports. Restrict outbound egress to approved DNS, time, OS updates, monitoring, and explicitly approved provider integrations.
- Administrators connect through VPN and a controlled bastion or provider console. Disable password-based root/SSH login; require named accounts, key/MFA policy, auditable access, and short-lived access where supported.
- Use PostgreSQL TLS with certificate verification for any remote database connection (`sslmode=verify-full`). Run the API with a restricted, non-superuser, non-owner role without `BYPASSRLS`; use a separate migration owner for DDL.
- Store database URLs, JWT/MFA keys, and unique inter-service gateway secrets in a provider secret manager or an approved encrypted secret system. Confirm a native key-management/secrets service or provide a separately operated equivalent. Never put secrets in source, VM images, shell history, user data, or logs.
- Require encrypted-at-rest volumes and backups; confirm who controls encryption keys, key rotation, deletion, and recovery access.

## 5. Sizing and bandwidth

### Pilot procurement profile

Use the CPU-optimized 4-vCPU/8-GB app SKU and RAM-optimized 2-vCPU/16-GB PostgreSQL SKU shown in Section 1 as the initial **single-node-per-tier** quote request. Keep PostgreSQL private even if its catalogue SKU includes a public IP. Add separate SSD capacity for PostgreSQL and private files. This baseline is suitable for controlled, synthetic-data validation after a load check; it is not HA and does not establish a production capacity commitment.

### Production profile to quote

Request a separate priced proposal for:

1. Two stateless API/gateway nodes, each initially 4 vCPU / 8 GB RAM, behind a health-checked load balancer.
2. A PostgreSQL primary plus a standby/managed HA option, initially at least 2 vCPU / 16 GB RAM per node, with SSD sized from the measured database and growth forecast. Confirm supported replication and failover behavior.
3. Private shared file storage or object storage that all API nodes can use without public access. If neither has suitable semantics/API, budget the application changes needed for object storage before adding API nodes.
4. A separate staging/UAT environment with its own DNS, database, storage, encryption keys, and credentials. Never seed local QA accounts in production.
5. A separate recovery site or provider-supported cross-site replication and restore target.

These are planning floors, not final capacity. Before production sizing, measure peak simultaneous users, CPU and memory, PostgreSQL connections/IOPS, database size and growth, daily upload volume, concurrent 100 MB uploads, egress, and report/matching job durations. Load-test the target shape and apply a 30% headroom target at forecast peak until a service owner approves a different margin.

### Bandwidth and user experience

The public catalogue listings examined show 2, 4, and 8 Mbps uplink/downlink profiles. At an ideal 8 Mbps, a 100 MB upload takes roughly 100 seconds before protocol overhead; simultaneous users divide the available bandwidth. Ask for a symmetric bandwidth commitment sized from load testing, preferably a package above the visible 8 Mbps options for media-heavy use. If Ethio telecom cannot provide the tested target, reduce file limits or defer large-media workflows rather than treating a 100 MB limit as an acceptable upload experience.

Request written confirmation of bandwidth measurement, committed/sustained rate, burst behavior, egress caps/charges, latency to Addis Ababa and international networks, and how the firewall/load balancer affects throughput.

## 6. Backup, availability, and recovery

- Obtain PostgreSQL-consistent backups plus WAL/point-in-time recovery, encrypted off-host and preferably cross-site. Back up the private-file volume in a coordinated manner so file metadata and binary contents can be restored together.
- The catalogue's weekly single overwritten backup is not sufficient as the only recovery mechanism. Public product material describes hourly, daily, weekly, and monthly schedules, while the public cart listing examined exposes a weekly product; request an exact quote for hourly/daily retention, restore points, immutable protection, and cross-site copy. [Ethio telecom cloud services](https://www.ethiotelecom.et/partnership-cloud-solutions/), [backup catalogue](https://myportal.ethiotelecom.et/cart.php?gid=24)
- Proposed minimum planning target for approval: **RPO ≤ 15 minutes** and **RTO ≤ 4 hours** for the core service, with stricter targets for approved financial ledgers if the Finance Controller requires them. Treat these as AfroLife requirements to negotiate, not as Ethio telecom commitments.
- Ethio telecom's 2025/26 public performance report describes a dual-site data-center design and a 15-minute recovery time; this is a corporate infrastructure statement, not a customer SLA. Obtain the contractual service-specific recovery commitment and evidence. [Ethio telecom 2025/26 performance report](https://www.ethiotelecom.et/2025-26-budget-year-annual-business-performance-report/)
- Require a restore rehearsal at least quarterly before general availability and after material storage/DB changes. Demonstrate recovery of PostgreSQL, uploaded files, secrets/configuration from the secret manager, DNS/TLS, and gateway routes. Record measured RPO/RTO and financial control totals.
- Define a production monthly availability target and support response/restore SLAs with the provider. Suggested planning target: 99.9% monthly for the public application, subject to service-owner approval and a matching provider contract.

## 7. Operations and observability

- Run services as unprivileged systemd users with automatic restart, hardened service units, resource limits, release directories, and a documented roll-forward/rollback procedure. Repository templates under `deploy/linux/` provide a starting point; adapt and review them for the selected cloud image.
- Build an immutable release artifact in CI. Promote the same artifact from staging to production. Apply database migrations as a separate controlled job using migration-only credentials; never start schema migration concurrently from every API replica.
- Centralize Nginx, application, PostgreSQL, firewall, VPN, backup, and provider audit logs. Restrict log access and retention. Do not log passwords, session tokens, national-ID content, uploaded documents, or unnecessary contact data.
- The app's API request/failure metrics are in-memory and reset at restart. Provision durable external metrics/alerting for uptime/readiness, latency, 5xx, authentication lockouts, database saturation, storage, upload failures, backup age/results, replication lag, certificate expiry, and service-gateway failures.
- Provide independent probes for `/healthz`, `/readyz` if implemented, the database, and configured private services. Alert on unhealthy state; do not use a successful HTTP response alone as production readiness evidence.
- Confirm provider 24/7 support scope, incident severity handling, maintenance notification windows, escalation contacts, and whether support includes the guest OS/PostgreSQL or only underlying cloud infrastructure.

## 8. Environments and access model

| Environment | Purpose | Isolation requirements |
|---|---|---|
| Development | Engineering only | No public ingress; synthetic data; developer credentials only. |
| Staging/UAT | Release and workflow verification | Separate VM/network, PostgreSQL, file store, secrets, DNS, and role fixtures. Restrict access using VPN or approved IP allowlist. Never copy production passwords/MFA/document binaries. |
| Production | Real users and business records | Separate account/project, network, secrets, database roles, private files, backups, logging, monitoring, and access roster. Use named staff accounts with MFA and least privilege. |
| DR | Recovery from site/service failure | Separate failure domain with restricted access, replicated/encrypted backups, tested DNS/network cutover and documented recovery owner. |

## 9. Ethio telecom questions required before purchase

Get written answers and attach the quote/response to the release record:

1. Which TeleCloud account/region and Linux images are offered? Can the selected Ubuntu LTS image run Node 22 and PostgreSQL 14+ with security updates?
2. Are the displayed CPU/RAM SKUs and 2/4/8 Mbps rates still orderable? Can bandwidth exceed 8 Mbps, and is it symmetric and committed? Are IPs dedicated, static, and firewall-controlled?
3. Is there managed PostgreSQL with TLS `verify-full`, minor/major version policy, HA failover, backups/WAL/PITR, monitoring, and connection limits? If not, which VM/storage/replication model is supported?
4. What SSD block/file/object storage is offered, what are the API/protocols, consistency semantics, expansion limits, encryption/key controls, snapshot behavior, and pricing? Is private object access compatible with an S3 API, or is application integration required?
5. Can the Cloud Firewall product provide the required L4/L7 load balancing, WAF, DDoS mitigation, TLS certificate handling, health checks, VPN, throughput, and audit logs? Which are included vs paid add-ons?
6. What backup frequencies, retention, immutability, cross-site copies, restore granularity, restore time, and customer-initiated restore workflow are contractually supported? Can PostgreSQL WAL and private files be recovered to a coordinated point?
7. Which sites constitute primary and DR? What are customer-specific availability, RPO, RTO, maintenance, incident response, and data-durability commitments?
8. Where is customer data physically stored and replicated? Who can access it? What are deletion, data export, contract termination, breach notification, and key-custody terms?
9. What are the recurring and one-time charges for server, storage, backup, IP, bandwidth, firewall, VPN, support, VAT, setup, egress, snapshots, and DR capacity? Confirm in ETB and the selected term.
10. Is there an API/CLI or supported automation interface for provisioning, firewall rules, backups, snapshots, and recovery? If not, define approved change records and operator procedures.

## 10. Go-live acceptance gates

Do not accept production traffic until all are evidenced:

- [ ] Registered domain, static public IP, DNS, HTTPS, renewal, firewall, and external reachability are verified.
- [ ] Only edge ports are public; app, service, database, and management ports are private.
- [ ] Production/staging/DR boundaries and named admin/service identities are in place; MFA and secret rotation are verified.
- [ ] Database runtime ACL/RLS check passes with the exact restricted production runtime role; migration role is separate.
- [ ] Private document/media storage is persistent, encrypted, capacity monitored, inaccessible directly from the internet, and covered by retention/deletion approval.
- [ ] Backup policy meets approved RPO; a coordinated database + file restore has passed and measured RTO meets the approved target.
- [ ] The selected throughput passes the peak-load and upload-experience test; storage and database have at least 30% forecast headroom.
- [ ] Service cutovers pass data reconciliation, authorization, route parity, backup/restore, health, and rollback gates; disabled modules remain disabled.
- [ ] Logs, alerts, dashboards, incident owners, provider escalation, and on-call coverage are active.
- [ ] Legal, privacy, finance, security, operations, and release-owner sign-offs are attached as required by the production runbook.

## References

- Ethio telecom [Partnership Cloud Solutions](https://www.ethiotelecom.et/partnership-cloud-solutions/)
- Ethio telecom [Cloud Server catalogue](https://myportal.ethiotelecom.et/cart.php?gid=35)
- Ethio telecom [Cloud Firewall catalogue](https://myportal.ethiotelecom.et/cart.php?gid=41)
- Ethio telecom [Backup Service catalogue](https://myportal.ethiotelecom.et/cart.php?gid=24)
- Ethio telecom [2025/26 Annual Business Performance Report](https://www.ethiotelecom.et/2025-26-budget-year-annual-business-performance-report/)
- AfroLife [Production hardening](./PRODUCTION_HARDENING.md)
- AfroLife [Production operations runbook](./PRODUCTION_OPERATIONS_RUNBOOK.md)
- AfroLife [Service boundaries](./SERVICE_BOUNDARIES.md)
