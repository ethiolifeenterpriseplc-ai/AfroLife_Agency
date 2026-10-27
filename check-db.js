const { Client } = require("pg");

const client = new Client({
  host: "127.0.0.1",
  port: 5433,
  database: "testdb",
  user: "dev",
  password: process.env.AFROLIFE_DB_PASSWORD,
  connectionTimeoutMillis: 4000
});

async function run() {
  await client.connect();
  console.log("Connected to PostgreSQL.");

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'user_role'
      ) THEN
        CREATE TYPE user_role AS ENUM (
          'global_admin',
          'super_admin',
          'corporate_business_manager',
          'compliance',
          'finance',
          'finance_manager',
          'master_agent',
          'field_agent',
          'customer',
          'worker',
          'property_owner'
        );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'account_status'
      ) THEN
        CREATE TYPE account_status AS ENUM (
          'pending_verification',
          'active',
          'suspended',
          'deactivated'
        );
      END IF;
    END $$;
  `);

  const result = await client.query(`
    SELECT typname, enumlabel
    FROM pg_type
    JOIN pg_enum ON pg_enum.enumtypid = pg_type.oid
    WHERE typname IN ('user_role', 'account_status')
    ORDER BY typname, enumsortorder;
  `);

  console.table(result.rows);
}

run()
  .catch(err => {
    console.error("Database diagnostic failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => {}));
