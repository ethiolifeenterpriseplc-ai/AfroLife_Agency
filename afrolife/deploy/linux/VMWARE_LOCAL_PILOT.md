# VMware Workstation local AfroLife pilot

This procedure installs AfroLife in the prepared Ubuntu Server VM on the
Windows development computer. The VM uses VMware NAT networking: it can make
outbound connections, and the Windows host can reach it, but it is not a
publicly hosted server. Do not configure VMware NAT port forwarding, Windows
port proxies, router forwarding, or public firewall access for this pilot.

Use synthetic accounts and data only. This HTTP-only local pilot is not
approved for real identity documents, deposits, lending, insurance payments,
or other sensitive production use. The mobile-hotspot DuckDNS address points
to the changing public egress address, not to this NAT guest.

## 1. Install Ubuntu in the VM

The VM configuration and ISO are stored under:

```text
%USERPROFILE%\Documents\Virtual Machines\AfroLife-Ubuntu
```

Open `AfroLife-Ubuntu.vmx` in VMware Workstation. Start the VM and install
Ubuntu Server 24.04 LTS to the VM's virtual disk. During the private guest
setup:

- Create a non-root administrator account and a unique local password.
- Enable OpenSSH Server only if remote shell access from the Windows host is
  needed; prefer SSH keys and keep the private key on the host.
- Do not enable bridged networking or configure router/firewall forwarding.
- Remove the installer ISO from the virtual CD/DVD device after installation,
  then reboot from the VM's virtual disk.

Never paste the guest password or private SSH key into chat or commit them.

## 2. Prepare the guest

Use VMware's VM console to sign in. Find the guest's NAT address with
`ip -4 addr`; it normally appears on `ens33`. From the guest:

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y ca-certificates curl git nginx postgresql postgresql-contrib ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.0.0/16 to any port 22 proto tcp
sudo ufw allow from 172.16.0.0/12 to any port 22 proto tcp
sudo ufw allow from 10.0.0.0/8 to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw --force enable
```

These firewall rules are inside the VM; do not add host, router, or VMware
port-forwarding rules. Install Node.js 22 or later for Ubuntu x64 from an
official/verified source. Create separate restricted `afrolife` runtime and
`afrolife-deploy` release accounts, plus `/var/lib/afrolife/private-files` and
`/var/log/afrolife`. Keep PostgreSQL bound to loopback.

For database bootstrap, role setup, and the environment split, follow the
PostgreSQL and secrets sections of
[ORACLE_ALWAYS_FREE.md](./ORACLE_ALWAYS_FREE.md). For this VM only, use
`DATABASE_URL=postgresql://<runtime-role>:<password>@127.0.0.1:5432/<database>`
and `TRUST_PROXY=loopback`. Generate separate `JWT_SECRET` and `MFA_ENC_KEY`
inside the guest with a cryptographic random generator; protect
`/etc/afrolife/runtime.env` as `root:afrolife` mode `0640`, and keep
`MIGRATION_DATABASE_URL` only in a separate deploy-account migration file.

## 3. Build and run

Clone a reviewed commit (not an uncommitted development worktree) into
`/opt/afrolife/app` and follow the build/migration steps in
[ORACLE_ALWAYS_FREE.md](./ORACLE_ALWAYS_FREE.md). Install the service unit
`afrolife.service` as `/etc/systemd/system/afrolife.service`, enable the
service, and install
`nginx-afrolife-production.conf` as `/etc/nginx/sites-available/afrolife`.
Enable the Nginx site, disable the default site, validate with `nginx -t`, and
reload Nginx. The service unit binds Node to loopback; Nginx listens on the VM
network interfaces.

From the Windows host, browse to `http://<VM_NAT_IPV4>/`. The NAT guest address
is not routed to other LAN clients by this setup. For LAN use, first select
and secure an appropriate LAN deployment model; do not switch to bridged
networking or open host firewall ports without explicitly reviewing that
exposure.

Use only dummy data over HTTP. Public-domain production deployment requires a
separately provisioned public host, TLS, DNS pointing at that host, external
reachability checks, reviewed backups, and all production gates in
[PRODUCTION_HARDENING.md](../../PRODUCTION_HARDENING.md).
