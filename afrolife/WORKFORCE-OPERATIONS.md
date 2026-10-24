# Workforce operations

Migration `095_workforce_workflows.sql` adds shifts, attendance events, time corrections, leave and availability requests, policy versions, and payroll handoff records. Apply the migration through the deployment's normal migration process before enabling the Workforce Management UI or routes.

## Encrypted payroll exports

Payroll export generation is disabled until both settings are configured:

- `WORKFORCE_PAYROLL_EXPORT_KEY`: exactly 64 hexadecimal characters representing a randomly generated 32-byte AES-256 key.
- `WORKFORCE_PAYROLL_EXPORT_KEY_ID`: a non-secret identifier for the key version, such as a secret-manager version or rotation label.

Generate the key in a trusted administrative environment (for example, with Node's `crypto.randomBytes(32).toString('hex')`) and store it directly in the deployment secret manager. Never commit the key, paste it into source control, or place it in a shared log. The application encrypts CSV exports with AES-256-GCM; the database keeps encrypted payloads in a separate table from worker-visible export status metadata.

Keep each key version available to the authorized payroll consumer for as long as exports encrypted with that version must remain readable. During rotation, deploy the new key and key ID together; do not overwrite or destroy an older key while its exports still need to be decrypted.

Generating an export does not file payroll or confirm payment. The handoff status is an audited record of a reported external handoff result only.

## Worker offline clock events

Clock events recorded while disconnected are retained in the worker's browser storage and submitted in capture order when connectivity returns. A failed sync leaves the unsent events queued and displays an error; do not clear browser storage to recover a queue. Offline queue contents are device-local, so workers should use a device they control and report a device failure to support rather than editing the stored events.
