# AfroLife Agency — Provider Deployment Requirements

**Document type:** Request for technical and commercial proposal
**Provider:** Ethio telecom / TeleCloud
**Prepared:** 19 October 2026
**Purpose:** Obtain a supportable hosting proposal for deploying the AfroLife web platform.

## 1. Request

Please review the requirements below and provide a written technical and commercial proposal. Quote the pilot and production configurations separately. Identify any requirement you cannot meet and propose an equivalent, including its additional cost. Do not treat this document as an order or authorization to provision services.

## 2. Workload summary

AfroLife is a web platform for agency operations, property listings and management, staffing, marketplace workflows, and related user services. It includes a browser-facing web application, a Node.js API, PostgreSQL, and private uploaded documents and media.

| Component | Requirement |
|---|---|
| Operating system | Supported Linux server image with security updates |
| API/runtime | Node.js 22 or later; Nginx reverse proxy or provider-equivalent |
| Database | PostgreSQL 14 or later |
| Web access | One AfroLife-controlled domain and HTTPS origin; public ingress through TCP 443. TCP 80 may be used for redirect and certificate validation. |
| Application port | API listens on port 3000 internally; it must not be publicly reachable. |
| Database port | PostgreSQL listens on port 5432 on a private interface only; no public database access. |
| File storage | Persistent private storage outside the public web root. Initial application limits are 10 MB for worker documents and 100 MB for property/listing media. |
| Administration | SSH access or an equivalent auditable management path. Administrative access must be restrictable to named users and approved source networks/VPN. |

The application currently uses filesystem storage for uploaded files. For a multi-application-server design, provide shared private file storage with documented semantics, or confirm an object-storage service/API that can support an application integration. Do not assume uploads can be placed on ephemeral VM storage.

## 3. Mandatory technical requirements

The proposed service must:

1. Run Node.js 22+ and PostgreSQL 14+ on a supported Linux distribution.
2. Allow installation and operation of Nginx, application services, and PostgreSQL where managed equivalents are not proposed.
3. Provide stable public addressing for the HTTPS edge and private networking or equivalent isolation for application-to-database traffic.
4. Support firewall rules that allow public HTTPS only at the edge. Ports 3000, 5432, administrative ports, and internal service ports must not be open to the public internet.
5. Provide persistent SSD storage for PostgreSQL and a separately sized private file volume. State online expansion limits and charges.
6. Provide automated backups and documented customer restore procedures. A single overwritten weekly copy is not sufficient as the only production backup.
7. State the service availability commitment, support coverage, incident process, maintenance notification, and responsibilities for OS/database administration.
8. Support HTTPS certificate installation and renewal, or identify the included certificate service and renewal process.
9. State bandwidth rate, whether it is symmetric and committed, upload limits/timeouts, egress limits/charges, and any fair-use rules. AfroLife accepts property media up to 100 MB; quote a higher bandwidth option if the listed tier is inadequate.
10. Identify data-center location, data export process, deletion process, and customer data-access controls.

## 4. Configurations to quote

Provide separate itemized pricing for each option. Resource figures are initial planning targets; recommend changes where supported by workload assumptions and explain them.

### Option A — Controlled pilot, one server

- One Linux server with at least 4 vCPU, 16 GB RAM, persistent SSD, and a stable public IP.
- Run the AfroLife application/API and PostgreSQL on the same server.
- PostgreSQL must bind only to localhost/private interface; public access remains through HTTPS at the edge.
- Include persistent private upload storage, firewall controls, automated backup, and monitoring options.
- State the largest upload, storage, and bandwidth limits.

This option is for controlled testing or a limited pilot. It has a single failure domain and is not the preferred production topology.

### Option B — Public production target, separate application and database servers

- **Application/API server:** at least 4 vCPU and 8 GB RAM.
- **PostgreSQL server:** at least 2 vCPU and 16 GB RAM, reachable only over private networking from approved application/service hosts.
- Private network connectivity between the two servers.
- Public HTTPS edge using the provider load balancer/reverse proxy or a documented supported equivalent.
- Persistent SSD for database data and a separate private file-storage service/volume.
- State whether adding a second stateless application node and load balancing is available and provide its incremental price.

## 5. Backup, recovery, and security answers

Please answer each item for Options A and B:

| Topic | Provider response required |
|---|---|
| Backup schedule | Available hourly/daily/weekly schedules and exact retention per schedule |
| Database recovery | Whether PostgreSQL transaction logs and point-in-time recovery are supported; restore granularity and limits |
| File recovery | Whether private uploaded files are included; how database and file recovery can be coordinated |
| Backup protection | Encryption, access control, immutability/deletion protection, location, and cross-site copy options |
| Restore | Customer-initiated procedure, support-assisted procedure, expected restore time, and any restore fees |
| Network security | Firewall/security-group features, VPN, DDoS/WAF availability, monitoring, audit logs, and their prices |
| Secrets and encryption | Available key/secret management, disk/backup encryption, key ownership, and rotation options |
| Administration | Responsibility split for OS patching, PostgreSQL patching, firewall changes, monitoring, and incident response |
| Recovery commitments | Contractual availability, RPO, RTO, and service-credit terms for the proposed services |

AfroLife’s initial planning target is database and private-file recovery to a coordinated point, with **RPO no greater than 15 minutes and RTO no greater than 4 hours** for the core service. These are requirements for quotation and negotiation, not assumed provider commitments. Identify whether they can be met and price any required services.

## 6. Commercial quote format

For each option, itemize the following in ETB and show applicable billing cycles:

- Compute instance(s), vCPU, RAM, OS disk, and data disk.
- Public IPs, private networking, bandwidth tier, and any egress charges.
- Private SSD/file/object storage, capacity, expansion, and transfer charges.
- Backup product, capacity, schedule, retention, restore charges, and cross-site copy.
- Firewall, VPN, WAF/DDoS, load balancer, TLS/certificate service, and monitoring.
- Setup, migration, support, OS/database management, and any one-time charges.
- VAT and total due at checkout; state whether catalog prices include VAT.
- Monthly, quarterly, six-month, and annual prices where available; discounts, renewal price, prepayment, cancellation, refund, and service suspension terms.

The public catalog lists shared Linux hosting annually and cloud-server products semi-annually; the cart separately displays VAT. Please provide account-specific totals and confirm current availability rather than relying solely on public catalog values. [Linux hosting catalog](https://myportal.ethiotelecom.et/cart.php?gid=2) · [Cloud server catalog](https://myportal.ethiotelecom.et/cart.php?gid=35) · [Cart/checkout](https://myportal.ethiotelecom.et/cart.php?a=view)

## 7. Deployment and acceptance checks

Before production handover, demonstrate or provide written confirmation that:

- Node.js 22+ and PostgreSQL 14+ can be installed or are available as managed services.
- The domain resolves to a stable public edge and HTTPS works from an independent network.
- Only approved edge ports are public; PostgreSQL and internal application ports are private.
- PostgreSQL and uploaded files persist across server restart and can be expanded within documented limits.
- A backup completes and a restore procedure is documented; for production, demonstrate a restore of both database and files.
- The chosen bandwidth supports the agreed user and upload expectations.
- Admin, support escalation, monitoring, and incident contacts are documented.
- The quote reflects all recurring charges, VAT, renewals, support, backup, and bandwidth costs.

## 8. AfroLife recommendation for proposal comparison

Use Option A only for a limited pilot that accepts one-server outage risk. Use Option B for a public launch with real user records.

See [ETHIO_TELECOM_CLOUD_REQUIREMENTS.md](./ETHIO_TELECOM_CLOUD_REQUIREMENTS.md) for the broader cloud architecture, application service boundaries, security controls, and production release gates.
