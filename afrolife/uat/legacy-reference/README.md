# Legacy workbook reference data

These JSON files were copied from the user-supplied
`Continue Developing the EthioLife Website System Project (2).zip` archive.
The matching `(1).zip` archive has identical contents.

They are product-planning references only. They are not loaded by the app,
build, migrations, or tests, and their proposed APIs and workflows are not
implemented or approved for activation in this project. In particular, each
use case is marked `TARGET/PROPOSED`; map and review an item against current
product scope, authorization, data ownership, policy, and operational evidence
before implementing it.

Validation performed before copying:

- `workbook_use_cases.json` parses as JSON and contains 540 unique requirement
  IDs: 90 each for Bright Spaces, DLS, EthioCare, RPM, SKS, and Training Center.
- All 540 use cases are marked `TARGET/PROPOSED` and place unresolved policy
  behind a controlled decision boundary.
- No use-case record has a field name suggesting a password, secret, token,
  national ID, phone, email, or credential.
- `workbook_governance.json` parses as JSON and contains five workbook
  reference sheets: domain capabilities, domain state machines, error codes,
  integrations, and controlled decision gates.

SHA-256 hashes of the source ZIP entries:

| File | SHA-256 |
| --- | --- |
| `workbook_use_cases.json` | `012e25f7cc53551824c2dfa30646d5e7bd55e514e6bbf72799dc13b74d9773e5` |
| `workbook_governance.json` | `9c43a8b6f17ad373f6ac44c3b44cfd69b420545a024526f1d57853b0e28efa7e` |
