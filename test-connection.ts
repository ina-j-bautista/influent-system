
import 'dotenv/config';
import { createDatabaseConnection } from './database-adapter';
import { InfluentCoreController } from './influent-core';

async function testConnection() {
  console.log('Testing Influent System Connection...\n');

  try {
    const db = createDatabaseConnection();
    
    console.log('📡 Connecting to database...');
    const isConnected = await db.testConnection();
    
    if (!isConnected) {
      console.error('Failed to connect to database');
      console.error('Check your .env file and make sure DB credentials are correct');
      return;
    }

    console.log('Database connected successfully!\n');

    console.log('Testing database query...');
    const result = await db.executeQuery('SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = \'public\'');
    console.log(`Found ${result[0].table_count} tables in your database\n`);

    console.log('Your database tables:');
    const tables = await db.executeQuery(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    tables.forEach((table: any) => {
      console.log(`   - ${table.table_name}`);
    });

    console.log('\nEverything is working');


    await db.close();

  } catch (error) {
    console.error('\nError', error);
  }
}

testConnection();
