//######## DATABASE DIAGNOSTIC SCRIPT #########################

import 'dotenv/config';
import { createDatabaseConnection } from './database-adapter';

async function diagnoseDatabase() {
  console.log('Diagnosing Database...\n');

  const db = createDatabaseConnection();

  try {
    const isConnected = await db.testConnection();
    if (!isConnected) {
      console.error('Failed to connect');
      return;
    }
    console.log();

    console.log('Checking current schema...');
    const currentSchema = await db.executeQuery('SELECT current_schema()');
    console.log(`   Current schema: ${currentSchema[0].current_schema}\n`);

    const searchPath = await db.executeQuery('SHOW search_path');
    console.log(`   Search path: ${searchPath[0].search_path}\n`);

    console.log('Available schemas:');
    const schemas = await db.executeQuery(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY schema_name
    `);
    schemas.forEach((s: any) => console.log(`   - ${s.schema_name}`));
    console.log();

    console.log('Tables by schema:');
    const allTables = await db.executeQuery(`
      SELECT table_schema, table_name, 
             (SELECT COUNT(*) FROM information_schema.columns 
              WHERE columns.table_schema = tables.table_schema 
              AND columns.table_name = tables.table_name) as column_count
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY table_schema, table_name
    `);

    if (allTables.length === 0) {
      console.log('   No tables found!\n');
    } else {
      let currentSchema = '';
      for (const table of allTables) {
        if (table.table_schema !== currentSchema) {
          currentSchema = table.table_schema;
          console.log(`\n   Schema: ${currentSchema}`);
        }
        console.log(`     - ${table.table_name} (${table.column_count} columns)`);
      }
      console.log();
    }

    console.log('Checking for twitter_users specifically:');
    const twitterUsersCheck = await db.executeQuery(`
      SELECT table_schema, table_name
      FROM information_schema.tables 
      WHERE table_name = 'twitter_users'
    `);

    if (twitterUsersCheck.length === 0) {
      console.log('   twitter_users table NOT FOUND in any schema\n');
    } else {
      twitterUsersCheck.forEach((t: any) => {
        console.log(`   Found in schema: ${t.table_schema}\n`);
      });
    }

    console.log('Attempting to query with explicit schema:');
    try {
      const publicUsers = await db.executeQuery('SELECT COUNT(*) FROM public.twitter_users');
      console.log(`   public.twitter_users has ${publicUsers[0].count} rows\n`);
    } catch (err: any) {
      console.log(`   public.twitter_users: ${err.message}\n`);
    }

    console.log('📊 Attempting to query without schema prefix:');
    try {
      const users = await db.executeQuery('SELECT COUNT(*) FROM twitter_users');
      console.log(`   twitter_users has ${users[0].count} rows\n`);
    } catch (err: any) {
      console.log(`   twitter_users: ${err.message}\n`);
    }

    console.log('DIAGNOSIS COMPLETE\n');

    await db.close();

  } catch (error) {
    console.error('Error during diagnosis', error);
  }
}

diagnoseDatabase();
