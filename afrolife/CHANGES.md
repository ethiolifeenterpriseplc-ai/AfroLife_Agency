# AfroLife Agency – review notes and changes

## 1. What was in the upload
All 20 "photos" (`IMG_2026…jpg`) are TypeScript source files saved with an image extension and a timestamp name.
They are restored here under names inferred from their imports (`src/…`, `test/…`). Two of them were byte-identical copies of `core.ts`.
The test files' names are guesses; rename freely.

**Not in the original source snapshot:** SQL schema + row-level-security policies, `notify.ts`, `webhooks.ts`, `dispatch.ts`,
`files.ts`, `storage.ts`, package/build configuration, and the PWA. The MVP implementation now restores these pieces as detailed below. CSV export and container orchestration remain outside this MVP scope.

## 2. Fixed in this package
| File | Fix | Why |
|---|---|---|
| `server.ts` | removed duplicate `import { fileURLToPath }` | duplicate bindings are a compile error in TypeScript/esbuild |
| `server.ts` | `TRUST_PROXY` setting | behind a proxy all users shared one IP, so the login rate limit hit everyone at once |
| `server.ts` | Postgres `22P02` → 400; dispatch loop can't overlap; graceful shutdown; warning when webhook secret is unset; one tidy static-files loop | malformed UUID in a URL returned 500; two timers could double-send |
| `admin.ts` | lockout counter restarts after a lock expires | it stayed at 5, so one typo after the 15 minutes re-locked the account |
| `admin.ts` | dummy bcrypt compare for unknown phones | response time revealed which numbers have accounts |
| `admin.ts` | `POST /users/:id/mfa/reset` (super admin, not self, audited) | lost phone = permanent lockout for staff when `REQUIRE_MFA_FOR_STAFF=1` |
| `admin.ts` | password length caps (200 / 72 bytes) | bcrypt reads only 72 bytes |
| `core.ts` | per-request check that the account is still active; role read from DB; JWT pinned to HS256 | deactivated users and role changes took up to 8 hours to apply |
| `phone.ts`, `validators.ts` | phones normalised to +E.164 everywhere (leads, workers, tenants, users, login) | `0911…` vs `+251911…` bypassed the duplicate-lead rule that protects commission attribution |
| `security.ts` | `MFA_ENC_KEY` (HKDF) with the old JWT-derived key as fallback | rotating `JWT_SECRET` would have made every stored 2FA secret unreadable |
| `security.ts` | unbiased `randomPassword` | `byte % 57` favours the first 28 characters |
| `totp.ts` | issuer defaults to "AfroLife Agency" (`MFA_ISSUER`) | authenticator apps showed "Agent Platform" |
| `ops.ts` | advisory lock around refund-limit check | two disputes on one contract could both pass and over-refund |
| `ops.ts` | `FOR UPDATE` on the unit when creating a lease | two agents could lease the same vacant unit at once |
| `ops.ts` | maintenance unit must belong to the property; refund amounts rounded to cents | data integrity |
| `supply.ts` | accepting a match locks and reserves the worker; a Super Admin can explicitly release the reservation, restore the worker's chosen availability, and reopen the request | stops accepted workers remaining on the market and prevents concurrent double-booking without permanently stranding workers |
| `domain.ts` | missing `config_rules` keys throw a clear error | they became `NaN` and were written to contracts/ledger |
| tests | fixtures use valid Ethiopian numbers (old ones had 10 digits); tests cover phone formats, lockout, MFA key rotation, password bias, and accepted-match reservation and release | |
| `public/icon.svg` | new icon: title, gold "master" node, inside the maskable safe zone | original `icon-1.svg` also carries a ~7 KB embedded C2PA provenance block, which a web icon doesn't need |

## 3. Verified vs. not verified
* The uploaded snapshot previously passed `phone`, `rent-refunds`, `matching`, `totp`, and `security` unit tests under Node 22; every `.ts` file parsed.
* After the match-reservation change, `src/supply.ts` and `test/supply.test.ts` pass Node 22 syntax checks. The focused test runner could not resolve the repository's `.js`-to-`.ts` imports because this snapshot has no `package.json`/TypeScript loader configuration.
* **Not run:** integration tests (need Postgres + running API) and a full `tsc` build. Run the project's configured `npm run test:integration` and build before deploying.
* Existing rows keep their old phone format. Before enabling normalisation in production, look for collisions:
  `SELECT right(regexp_replace(phone,'\D','','g'),9) t, count(*) FROM leads GROUP BY 1 HAVING count(*)>1;` (same for `workers`, `tenants`, `users`), then normalise with `normalizePhone`. Login already tries both forms.

## 4. Decisions for you (not changed on purpose)
1. **Contracts have no way out.** No `reject`/`cancel`/`request_changes` transition, and the lead stays `converted` forever, so a failed KYC permanently burns the lead and the agent's commission.
2. **Refunds don't claw back commission.** Nothing in these files sets a commission to `reversed` after a fee refund.
3. **Rent payments** (`/charges/:id/pay`) have no ledger entry, no amount check, no unique reference and no second person – the opposite of how contract payments work.
4. **Staff accounts skip KYC and need only one super admin** to create and activate (another super admin included). Same person can then reset that user's password and MFA.
5. **Mid-month leases:** first rent is due on the 5th of the *start* month (before the lease starts, so it is overdue on day one) and the last month is billed in full. A test encodes this; confirm it is intended. Deposits are stored but never posted or returned.
6. **Compliance review requires a different officer than the uploader** in the API. Keep direct database access restricted so this workflow cannot be bypassed operationally.
7. **TOTP codes can be replayed** inside their 90-second window; store the last accepted step per user.
8. **Matching:** free-text skills/languages ("cooking" ≠ "ምግብ ማብሰል"); no must-have filters; accepting a match now reserves the worker, but no contract association exists in the supplied schema.
9. **Time zone:** `current_date` follows the DB time zone; rent "overdue" should use Africa/Addis_Ababa. Consider showing Ethiopian-calendar dates in the PWA.
10. National IDs are stored in plain text; check what Ethiopia's personal-data rules require for retention and encryption.
11. `bcryptjs` (pure JS) at cost 12 is slow under load; native `bcrypt` or `argon2` is a drop-in upgrade.

## 5. Full-stack MVP implementation

- Restored Node 22 / TypeScript package and build configuration, missing server support modules, an environment template, a migration runner, and an environment-based first-admin seed.
- Added a PostgreSQL schema for agent accounts, territories, attributed leads, workers, document verification, service requests and matching, contracts, invoices, payments, the ledger, commissions, properties, leases, disputes, maintenance, notifications, and audit history.
- Added database row-level policies, non-owner runtime-role guidance, KYC activation gating, and deferred ledger balancing.
- Built an installable responsive same-origin PWA for sign-in, mandatory password change, MFA setup, agent intake, private document upload, compliance review, candidate matching, reservations, and user administration.
- Matching now requires both identity and police-clearance documents to remain verified and unexpired at candidate ranking and at acceptance time; direct SQL match inserts also enforce the same evidence requirements.
- Fixed match reservation/release, compliance uploader-reviewer separation, RLS-scoped invoice/commission reads, and trusted webhook service identity.
- Syntax checks passed for TypeScript, browser JavaScript, and the PWA manifest. A dependency install, TypeScript build, automated unit/integration run, and PostgreSQL migration remain unverified in this environment.

## 6. Finalization follow-up

The review items above describe the earlier snapshot. The follow-up implementation now adds audited contract rejection/cancellation before payment, invoice voiding and lead reopening, exact rent receipts with independent reconciliation and balanced ledger posting, reasoned voiding of incorrect pending receipts, deposit liability collection and capped return, calendar-day proration of partial lease months, TOTP replay prevention, and four-eyes Super Admin account activation/password/MFA recovery. See `README.md` for the chosen workflow policy. The local TypeScript build and migrations were verified; integration suites and production deployment remain release gates.
