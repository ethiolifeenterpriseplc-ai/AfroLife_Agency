# Platform service subscriptions

The public catalog contains Accounting & Finance, Property Management, Workforce
Management, Super Agent, Edir, Insurance Brokerage, Agent, Landlord, and Seller
Services. Each service costs ETB 1,000 per month. Payment is manual: the subscriber
supplies a payment reference, and a different Finance user confirms or rejects it.
No payment is collected automatically. Apply migration
`082_accounting_finance_subscription.sql` to add Accounting to the shared subscription
lifecycle.

## Deployment prerequisites

1. Apply the core migrations, including `081_platform_service_subscriptions.sql`,
   only after reviewing the database backup and migration plan.
2. Apply Edir migration `afrolife-edir-v26-registration-documents` before enabling
   public Edir document upload and review.
3. Configure `ACCOUNTING_SERVICE_URL` for internal books and
   `ACCOUNTING_SUBSCRIBER_SERVICE_URL` for subscriber books, with distinct matching
   gateway secrets and separate databases. Configure `ACCOUNTING_INGEST_SECRET` for
   internal source events, matching the internal Accounting service's `afrolife_core`
   ingest mapping.
4. Configure `SUBSCRIPTION_ACCOUNTING_SOURCE_ENTITY_ID`,
   `SUBSCRIPTION_ACCOUNTING_CASH_ACCOUNT_CODE`, and
   `SUBSCRIPTION_ACCOUNTING_REVENUE_ACCOUNT_CODE` in the core API. Confirm that the
   entity is active and both source account codes map to the intended cash-clearing
   and subscription-revenue accounts in Accounting.
5. Exercise request, payment submission, independent Finance review, outbox delivery,
   activation, rejection, and duplicate payment-reference behavior in a disposable
   integration database before production enablement.

Finance confirmation fails closed when any Accounting mapping or delivery setting
is missing. A confirmed request remains pending until Accounting acknowledges its
balanced ETB 1,000 journal event; the one-month access period starts only then.
Public subscriptions do not expose the platform's internal Accounting & Finance
Operations app. Mini-app access remains subject to the existing role ceiling and
administrator-assigned app access.
