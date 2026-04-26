//######## TEST getAllUsers METHOD #########################

import 'dotenv/config';
import { createDatabaseConnection } from './database-adapter';

async function testGetAllUsers() {
  console.log('Testing getAllUsers method...\n');

  const db = createDatabaseConnection();

  try {
    const isConnected = await db.testConnection();
    if (!isConnected) {
      console.error('Connection failed');
      return;
    }
    console.log();

    console.log('Calling getAllUsers(10)...');
    const users = await db.getAllUsers(10);
    
    console.log(`Retrieved ${users.length} users\n`);
    
    if (users.length > 0) {
      console.log('Sample users:');
      users.forEach(user => {
        console.log(`   - ${user.display_name} (@${user.user_id}) - ${user.followers} followers`);
      });
    } else {
      console.log('No users returned!');
    }

    await db.close();

  } catch (error) {
    console.error('Error:', error);
  }
}

testGetAllUsers();
