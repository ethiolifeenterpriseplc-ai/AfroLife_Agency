# EthioLife local build artifacts — 13 October 2026

- `EthioLife-Agency-PWA-2026-10-13-final.zip` is the static web app from `public/`. Upload its contents to an HTTPS host. It does not contain the API, database, or operational secrets. Configure the API at the same origin under `/api/v1` and allow the deployed site origin in the API's CORS/origin policy before inviting users.
- `EthioLife-Agency-1.0-debug-2026-10-13.apk` is an internally testable Android debug build. It is not release-signed and is not suitable for public distribution. Test it on a device against an explicitly configured test server.

Both artifacts include the refreshed EthioLife E-and-spark mark across the web header, browser icon, PWA install icons, Android launcher, and splash screen, plus mock-only integrations. No production provider was activated. These builds do not establish production deployment, regulatory approval, physical-device acceptance, or a signed release.

The previously selected server URL is `https://afrolife-agency.duckdns.org`. DNS resolves to `196.189.145.142`, but the HTTPS endpoint did not accept connections when checked on 13 October 2026. The current local API remains on loopback and is not available to a phone through that hostname. The Android server-address field now suggests the saved hostname; sign-in will work only after HTTPS ingress is deployed and the API is reachable. The same-Wi-Fi preview also requires the setup script to run in an elevated PowerShell window so it can install its subnet-limited firewall rule.

## SHA-256 checksums

- PWA ZIP: `4DEB9E284F61159AA64EBF7251906DF2CC55A4C1B03C258B0D491B8D10DF1E9D`
- Android debug APK: `2D826909F41DE2E430285CBD4F6194A91C460D316E679BC0E2CE1E059AAE3DE9`
