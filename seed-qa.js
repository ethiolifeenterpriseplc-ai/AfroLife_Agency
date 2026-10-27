const { Client } = require("pg");
const bcrypt = require("bcrypt");

const client = new Client({
  host: "127.0.0.1",
  port: 5433,
  database: "testdb",
  user: "dev",
  password: process.env.AFROLIFE_DB_PASSWORD,
  connectionTimeoutMillis: 4000
});

const accounts = [
  ["global_admin", "+12025550112"],
  ["super_admin", "+12025550101"],
  ["super_admin", "+12025550102"],
  ["corporate_business_manager", "+12025550103"],
  ["compliance", "+12025550104"],
  ["finance", "+12025550105"],
  ["finance_manager", "+12025550106"],
  ["master_agent", "+12025550107"],
  ["field_agent", "+12025550108"],
  ["customer", "+12025550109"],
  ["worker", "+12025550110"],
  ["property_owner", "+12025550111"]
];

async function run() {
  await client.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        phone VARCHAR(32) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role user_role NOT NULL DEFAULT 'customer',
        status account_status NOT NULL DEFAULT 'active',
        is_phone_verified BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const passwordHash = await bcrypt.hash("AfroLifeQA!2026", 10);
    let inserted = 0;
    let skipped = 0;

    for (const [role, phone] of accounts) {
      const result = await client.query(
        `INSERT INTO users (phone, role, password_hash)
         VALUES ($1, $2::user_role, $3)
         ON CONFLICT (phone) DO NOTHING
         RETURNING phone, role`,
        [phone, role, passwordHash]
      );

      if (result.rowCount === 1) {
        inserted++;
        console.log(`Created: ${role} -> ${phone}`);
      } else {
        skipped++;
        console.log(`Already exists; unchanged: ${phone}`);
      }
    }

    await client.query("COMMIT");

    console.log("\nQA seeding completed.");
    console.log(`New accounts: ${inserted}`);
    console.log(`Existing accounts skipped: ${skipped}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

run()
  .catch(error => {
    console.error("QA seeding failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => {}));
