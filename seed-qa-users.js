import pg from 'pg';
import bcrypt from 'bcrypt';

const pool = new pg.Pool({
  host: '127.0.0.1',
  port: 5433,
  database: 'testdb',
  user: 'dev',
  password: process.env.AFROLIFE_DB_PASSWORD || 'devpass',
});

const testAccounts = [
  { role: 'global_admin', phone: '+12025550112' },
  { role: 'super_admin', phone: '+12025550101' },
  { role: 'super_admin', phone: '+12025550102' },
  { role: 'corporate_business_manager', phone: '+12025550103' },
  { role: 'compliance', phone: '+12025550104' },
  { role: 'finance', phone: '+12025550105' },
  { role: 'finance_manager', phone: '+12025550106' },
  { role: 'master_agent', phone: '+12025550107' },
  { role: 'field_agent', phone: '+12025550108' },
  { role: 'customer', phone: '+12025550109' },
  { role: 'worker', phone: '+12025550110' },
  { role: 'property_owner', phone: '+12025550111' },
];

const RAW_PASSWORD = 'AfroLifeQA!2026';

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🔄 Hashing test password and seeding QA accounts...');
    const hashedPassword = await bcrypt.hash(RAW_PASSWORD, 10);

    for (const acc of testAccounts) {
      // Adjust table name and column names if your schema differs (e.g. users / phone / role / password_hash)
      const query = 
        INSERT INTO users (phone, role, password_hash, updated_at)
        VALUES (\, \, \, NOW())
        ON CONFLICT (phone) 
        DO UPDATE SET role = EXCLUDED.role, password_hash = EXCLUDED.password_hash, updated_at = NOW();
      ;
      await client.query(query, [acc.phone, acc.role, hashedPassword]);
      console.log(✅ Activated: [] -> );
    }

    console.log('\n🎉 All local QA test accounts successfully seeded and activated!');
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
