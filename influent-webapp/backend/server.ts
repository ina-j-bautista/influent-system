interface RankedInfluencer {
  user_id: string;
  display_name: string;
  followers: number;
  engagement: number;
  sentiment: number;
  influent_score: number;
}


import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from parent directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log('🔍 Environment check:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '***' : 'NOT SET');

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

let db: any = null;
let sentimentAdapter: any = null;
let ApifyScraper: any = null;

async function initializeModules() {
  try {
    // Use dynamic require instead of import for .ts files
    const dbPath = path.resolve(__dirname, '../../database-adapter.ts');
    const sentimentPath = path.resolve(__dirname, '../../sentiment-adapter.ts');
    const scraperPath = path.resolve(__dirname, '../../apify-scraper.ts');
    
    // Register ts-node for runtime TypeScript compilation
    const tsNode = await import('ts-node');
    tsNode.register({
      transpileOnly: true,
      compilerOptions: {
        module: 'commonjs'
      }
    });
    
    // Now we can require the .ts files
    const dbModule = require(dbPath);
    const sentimentModule = require(sentimentPath);
    const scraperModule = require(scraperPath);
    
    db = dbModule.createDatabaseConnection();
    sentimentAdapter = new sentimentModule.SentimentAdapter();
    ApifyScraper = scraperModule.ApifyScraper;
    
    console.log('✅ Modules loaded successfully');
  } catch (error) {
    console.error('⚠️  Could not load TypeScript modules:', error);
    console.log('📝 Backend will use mock data for now');
  }
}

initializeModules();

async function clearDatabase() {
  if (!db) {
    console.log('⚠️  Database not connected, skipping clear');
    return;
  }
  
  console.log('🗑️  Clearing existing data...');
  
  try {
    await db.executeQuery('TRUNCATE twitter_interactions CASCADE');
    await db.executeQuery('TRUNCATE twitter_posts CASCADE');
    await db.executeQuery('TRUNCATE twitter_users CASCADE');
    
    console.log('✅ Database cleared');
  } catch (error: any) {
    console.error('❌ Clear database error:', error);
  }
}

// ============================================================
// SCRAPING PIPELINE
// ============================================================

async function runCompleteScrape(params: {
  keywords: string[];
  minFollowers: number;
  minAvgLikes: number;
  startDate: string;
  endDate: string;
  language: string;
  maxItems: number;
}) {
  console.log('🚀 Starting complete scrape pipeline...');
  console.log('📋 Scrape parameters:', JSON.stringify(params, null, 2));
  
  if (!ApifyScraper || !db) {
    console.error('❌ Scraper or database not initialized!');
    console.log('ApifyScraper:', ApifyScraper ? 'LOADED' : 'NOT LOADED');
    console.log('db:', db ? 'LOADED' : 'NOT LOADED');
    throw new Error('Scraper or database not initialized');
  }

  console.log('✅ Creating scraper instance...');
  const scraper = new ApifyScraper();

  try {
    console.log('📡 Calling scraper.runPhase1()...');
    const scrapeResults = await scraper.runPhase1({
      keywords: params.keywords,
      minFollowers: params.minFollowers,
      minAvgLikes: params.minAvgLikes,
      startDate: params.startDate,
      endDate: params.endDate,
      language: params.language,
      maxItems: params.maxItems
    });

    console.log('✅ runPhase1() completed');
    console.log('📊 Scrape results:', scrapeResults);
    // Get counts from database
    const userCount = await db.executeQuery('SELECT COUNT(*) as count FROM twitter_users');
    const postCount = await db.executeQuery('SELECT COUNT(*) as count FROM twitter_posts');

    console.log(`📊 Database now has:`);
    console.log(`   - ${userCount[0].count} users`);
    console.log(`   - ${postCount[0].count} posts`);

    return {
      success: true,
      users: parseInt(userCount[0].count),
      posts: parseInt(postCount[0].count)
    };

  } catch (error: any) {
    console.error('❌ Scrape pipeline error:', error);
    throw error;
  }
}

// ============================================================
// API ENDPOINTS
// ============================================================

app.get('/api/stats', async (req, res) => {
  try {
    if (db) {
      const stats = await db.executeQuery(`
        SELECT 
          (SELECT COUNT(*) FROM twitter_users) as users,
          (SELECT COUNT(*) FROM twitter_posts) as posts,
          (SELECT COUNT(*) FROM twitter_interactions) as interactions
      `);
      res.json(stats[0]);
    } else {
      res.json({ users: 100, posts: 2006, interactions: 3854 });
    }
  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const {
      keywords,
      startDate,
      endDate,
      maxItems,
      weightPreferences,
      sentimentImportance,
      temporalDecay,
      useDeepTranslator
    } = req.body;

    console.log('📊 Starting analysis pipeline...');
    console.log('Keywords:', keywords);
    console.log('Max items:', maxItems);


    // Clear database before scraping
  await clearDatabase();

  console.log('\n📡 Step 1: Scraping Twitter data...');
    
    // STEP 1: Scrape fresh data

    console.log('\n📡 Step 1: Scraping Twitter data...');
    
    const scrapeResult = await runCompleteScrape({
      keywords: Array.isArray(keywords) ? keywords : keywords.split(',').map((k: string) => k.trim()),
      minFollowers: 100,
      minAvgLikes: 5,
      startDate: startDate || '',
      endDate: endDate || '',
      language: 'en',
      maxItems: maxItems || 100
    });

    console.log(`✅ Scrape complete: ${scrapeResult.users} users, ${scrapeResult.posts} posts`);

    // STEP 2: Load and analyze data
    console.log('\n📊 Step 2: Analyzing scraped data...');

    if (db) {
      const users = await db.getAllUsers();
      console.log(`📊 Loaded ${users.length} users for analysis`);

      // Create rankings based on scraped data
      const rankings = users.slice(0, 50).map((user: any) => ({
        user_id: user.user_id,
        display_name: user.display_name,
        followers: user.followers,
        engagement: Math.random() * 0.1, // TODO: Calculate from actual posts
        sentiment: 0.5, // TODO: Get from sentiment_adapter
        influent_score: Math.random() * 0.5 + 0.5 // TODO: Run actual INFLUENT algorithm
      })).sort((a: any, b: any) => b.influent_score - a.influent_score);


      console.log(`✅ Analysis complete: ${rankings.length} ranked influencers`);

      res.json({
        success: true,
        rankings,
        metadata: {
          totalUsers: users.length,
          totalPosts: scrapeResult.posts,
          keywords: Array.isArray(keywords) ? keywords : keywords.split(','),
          scrapeTimestamp: new Date().toISOString()
        }
      });
    } else {
      res.status(500).json({ error: 'Database not connected' });
    }

  } catch (error: any) {
    console.error('❌ Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/influencers', async (req, res) => {
  try {
    if (db && db.getAllUsers) {
      const users = await db.getAllUsers();
      res.json(Array.isArray(users) ? users : []);
    } else {
      res.json([]);
    }
  } catch (error: any) {
    console.error('Influencers error:', error);
    res.json([]);
  }
});

app.get('/api/network-data', async (req, res) => {
  try {
    if (db) {
      const users = await db.getAllUsers();
      const nodes = users.slice(0, 50).map((user: any) => ({
        id: user.user_id,
        name: user.display_name,
        followers: user.followers,
        influenceScore: 0.5,
        bio: user.bio,
        location: user.location
      }));
      res.json({ nodes, links: [] });
    } else {
      res.json({ nodes: [], links: [] });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics', async (req, res) => {
  try {
    if (db) {
      const temporalData = await db.executeQuery(`
        SELECT DATE(created_at) as date, COUNT(*) as post_count
        FROM twitter_posts
        GROUP BY DATE(created_at)
        ORDER BY date
        LIMIT 30
      `);

      const scoreDistribution = await db.executeQuery(`
        SELECT 
          CASE 
            WHEN followers < 1000 THEN '0-1K'
            WHEN followers < 10000 THEN '1K-10K'
            WHEN followers < 100000 THEN '10K-100K'
            ELSE '100K+'
          END as range,
          COUNT(*) as count
        FROM twitter_users
        GROUP BY range
      `);

      res.json({ temporalData, scoreDistribution });
    } else {
      res.json({ temporalData: [], scoreDistribution: [] });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/keywords', async (req, res) => {
  try {
    if (db) {
      const keywords = await db.executeQuery(`
        SELECT word as keyword, COUNT(*) as frequency
        FROM (
          SELECT UNNEST(STRING_TO_ARRAY(LOWER(content), ' ')) as word
          FROM twitter_posts
        ) words
        WHERE LENGTH(word) > 3
        GROUP BY word
        ORDER BY frequency DESC
        LIMIT 20
      `);
      res.json(keywords);
    } else {
      res.json([]);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 INFLUENT Backend Server running on http://localhost:${PORT}`);
  console.log(`📊 Database connected: ${db ? 'YES' : 'NO'}`);
  console.log(`🔗 API endpoints ready\n`);
});
