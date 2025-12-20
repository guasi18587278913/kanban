import 'dotenv/config';
import { db } from '../src/core/db';
import { sql } from 'drizzle-orm';

async function checkTables() {
  const result = await db().execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log('Existing tables:');
  console.log(result);
}

checkTables().catch(console.error).finally(() => process.exit(0));
