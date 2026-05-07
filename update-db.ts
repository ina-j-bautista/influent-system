import 'dotenv/config';
import { createDatabaseConnection } from './database-adapter';

const db = createDatabaseConnection();

async function checkRelevancyColumn() {
  try {
    console.log('🔍 Checking relevance_ratio column...\n');
    
    // 1. Check if column exists and its type
    const columnInfo = await db.executeQuery(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'twitter_posts' 
        AND column_name = 'relevance_ratio'
    `);
    
    if (columnInfo.length === 0) {
      console.log('❌ Column relevance_ratio DOES NOT EXIST in twitter_posts table!');
      console.log('\nRun this to add it:');
      console.log('npx tsx update-db.ts\n');
      process.exit(1);
    }
    
    console.log('✅ Column exists:');
    console.log(`   Type: ${columnInfo[0].data_type}`);
    console.log(`   Nullable: ${columnInfo[0].is_nullable}`);
    console.log(`   Default: ${columnInfo[0].column_default || 'none'}\n`);
    
    // 2. Check sample data
    const sampleData = await db.executeQuery(`
      SELECT user_id, relevance_ratio, content
      FROM twitter_posts
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log('📊 Sample data (last 10 posts):');
    console.log('─'.repeat(80));
    sampleData.forEach((post: any) => {
      const ratio = post.relevance_ratio !== null ? post.relevance_ratio : 'NULL';
      console.log(`${post.user_id.padEnd(20)} | ${String(ratio).padEnd(10)} | ${post.content.substring(0, 40)}...`);
    });
    console.log('─'.repeat(80));
    
    // 3. Check counts
    const stats = await db.executeQuery(`
      SELECT 
        COUNT(*) as total_posts,
        COUNT(relevance_ratio) as posts_with_relevancy,
        COUNT(*) - COUNT(relevance_ratio) as posts_without_relevancy,
        AVG(relevance_ratio) as avg_relevancy
      FROM twitter_posts
    `);
    
    console.log('\n📈 Statistics:');
    console.log(`   Total posts: ${stats[0].total_posts}`);
    console.log(`   Posts WITH relevancy: ${stats[0].posts_with_relevancy}`);
    console.log(`   Posts WITHOUT relevancy (NULL): ${stats[0].posts_without_relevancy}`);
    console.log(`   Average relevancy: ${stats[0].avg_relevancy || 'N/A'}\n`);
    
    // 4. Check per-user averages
    const userAvgs = await db.executeQuery(`
      SELECT 
        user_id,
        COUNT(*) as post_count,
        COUNT(relevance_ratio) as posts_with_ratio,
        AVG(relevance_ratio) as avg_relevancy
      FROM twitter_posts
      GROUP BY user_id
      ORDER BY post_count DESC
      LIMIT 5
    `);
    
    console.log('👥 Top 5 users by post count:');
    console.log('─'.repeat(60));
    userAvgs.forEach((user: any) => {
      const avg = user.avg_relevancy !== null ? (user.avg_relevancy * 100).toFixed(1) + '%' : 'NULL';
      console.log(`${user.user_id.padEnd(20)} | ${user.post_count} posts | ${user.posts_with_ratio} with ratio | avg: ${avg}`);
    });
    console.log('─'.repeat(60));
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

checkRelevancyColumn();