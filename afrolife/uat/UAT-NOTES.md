# AfroLife UAT package

The PWA ZIP contains the latest static shell. Deploy its contents under the same HTTPS origin as the AfroLife API, with the API available at `/api/v1`.

Apply all database migrations, including `017_specialist_agents_and_contract_signing.sql`, before using specialist assignments or contract countersigning. Create Corporate Business Manager accounts from the Super Admin workspace. Existing field-agent, Master Agent, Super Admin, Finance, Compliance, lead, listing, and contract workflows remain available according to their existing roles.

The APK in this folder is the earlier debug build from 5 October 2026. The refreshed Android build could not run in this Windows session because Node failed with `uv_os_get_passwd` / `ENOMEM`; do not use that APK to review these latest UI changes.

Contract signing stores a party-signed file, a company-countersigned file, and the identity and timestamp of the authorized signer. The app does not create a cryptographic electronic signature.
