import '../../src/env.js';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

const migrationUrl=process.env.ACCOUNTING_MIGRATION_DATABASE_URL;
const runtimeRole=process.env.ACCOUNTING_RUNTIME_DB_ROLE;
if(!migrationUrl)throw new Error('ACCOUNTING_MIGRATION_DATABASE_URL must be configured');
if(!runtimeRole||!/^[a-z_][a-z0-9_]*$/i.test(runtimeRole))throw new Error('ACCOUNTING_RUNTIME_DB_ROLE must be a restricted SQL role name');
const client=new pg.Client({connectionString:migrationUrl}); await client.connect();
try{
  await client.query('BEGIN');
  await client.query(`CREATE TABLE IF NOT EXISTS accounting_service_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`);
  for(const [version,file] of [
    ['accounting-v1-hierarchical-ledger','001_accounting.sql'],
    ['accounting-v2-business-workflows','002_accounting_workflows.sql'],
    ['accounting-v3-direct-entity-access','003_accounting_entity_access.sql'],
    ['accounting-v4-transaction-controls','004_accounting_transaction_controls.sql'],
    ['accounting-v5-subscriber-owned-businesses','005_accounting_subscriber_ownership.sql'],
  ]){
    const already=await client.query('SELECT 1 FROM accounting_service_migrations WHERE version=$1',[version]);
    if(already.rowCount)continue;
    let sql:string;
    try{sql=await readFile(new URL(`./${file}`,import.meta.url),'utf8');}
    catch{sql=await readFile(new URL(`../../../services/accounting/${file}`,import.meta.url),'utf8');}
    await client.query(sql.replaceAll('"{{role}}"',`"${runtimeRole}"`));
    await client.query('INSERT INTO accounting_service_migrations(version) VALUES($1)',[version]);
    console.log(`Applied ${version}`);
  }
  await client.query('COMMIT');
}catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
