import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { createDatabaseConnection } from './database-adapter.ts';
import { SentimentAdapter } from './sentiment-adapter.ts';
import { runApifyScrape } from './apify-scraper.ts';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

console.log('🔍 Environment check:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '***' : 'NOT SET');

const db = createDatabaseConnection();
const sentimentAdapter = new SentimentAdapter();

console.log('✅ Modules loaded successfully');

// Store scores in memory cache
const scoreCache = new Map<string, { engagement: number; influent_score: number }>();

interface RankedInfluencer {
  user_id: string;
  display_name: string;
  followers: number;
  engagement: number;
  sentiment: number;
  influent_score: number;
}

async function clearDatabase() {
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

  try {
    console.log('📡 Scraping Twitter data...');
    
    await runApifyScrape(params);

    console.log(`✅ Scrape completed`);

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

// API ENDPOINTS

app.get('/api/stats', async (_req: express.Request, res: express.Response) => {
  try {
    const stats = await db.executeQuery(`
      SELECT 
        (SELECT COUNT(*) FROM twitter_users) as users,
        (SELECT COUNT(*) FROM twitter_posts) as posts,
        (SELECT COUNT(*) FROM twitter_interactions) as interactions
    `);
    res.json(stats[0]);
  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze', async (req: express.Request, res: express.Response) => {
  try {
    const {
      keywords,
      startDate,
      endDate,
      maxItems
    } = req.body;

    console.log('📊 Starting analysis pipeline...');
    
    await clearDatabase();
    scoreCache.clear(); // Clear score cache

    const scrapeResult = await runCompleteScrape({
      keywords: Array.isArray(keywords) ? keywords : keywords.split(',').map((k: string) => k.trim()),
      minFollowers: 0,
      minAvgLikes: 0,
      startDate: startDate || '',
      endDate: endDate || '',
      language: 'en',
      maxItems: maxItems || 100
    });

    console.log(`✅ Scrape complete: ${scrapeResult.users} users, ${scrapeResult.posts} posts`);

    const users = await db.getAllUsers();
    console.log(`📊 Loaded ${users.length} users for analysis`);

    // 1. Calculate engagement scores
    console.log('🧮 Computing engagement scores...');
    const engagementScores = new Map<string, number>();
    
    for (const user of users) {
      const posts = await db.executeQuery(`
        SELECT AVG(like_count + reply_count + retweet_count) as avg_engagement
        FROM twitter_posts
        WHERE user_id = $1
      `, [user.user_id]);
      
      const avgEng = parseFloat(posts[0]?.avg_engagement || '0');
      engagementScores.set(user.user_id, avgEng);
    }

    // 2. Build connection weights (simplified - full mesh)
    const userIds = users.map((u: any) => u.user_id);
    const connectionWeights = new Map<string, Map<string, number>>();
    
    for (const userId of userIds) {
      const connections = new Map<string, number>();
      for (const otherId of userIds) {
        if (userId !== otherId) {
          connections.set(otherId, 1.0);
        }
      }
      connectionWeights.set(userId, connections);
    }

    // 3. Sentiment scores (neutral baseline)
    const sentimentScores = new Map<string, number>();
    for (const userId of userIds) {
      sentimentScores.set(userId, 0.5);
    }

    // 4. Run INFLUENT iterative algorithm
    console.log('🔄 Running INFLUENT algorithm...');
    const { InfluentIterativeAlgorithm } = await import('./influent-iterative.js');
    
    const result = InfluentIterativeAlgorithm.computeWithConvergence(
      userIds,
      connectionWeights,
      sentimentScores,
      engagementScores,
      0.85,   // dampening factor
      1e-5,   // convergence threshold
      50      // max iterations
    );

    // 5. Build rankings with real scores
    const rankings = users.map((user: any) => {
      const engagement = engagementScores.get(user.user_id) || 0;
      const score = result.finalScores.get(user.user_id) || 0;
      
      // Store in cache
      scoreCache.set(user.user_id, {
        engagement: engagement,
        influent_score: score
      });
      
      return {
        user_id: user.user_id,
        display_name: user.display_name,
        followers: user.followers,
        engagement: engagement,
        sentiment: 0.5,
        influent_score: score
      };
    });

    rankings.sort((a, b) => b.influent_score - a.influent_score);
    
    console.log(`✅ Analysis complete! Top score: ${rankings[0]?.influent_score.toFixed(4)}`);

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

  } catch (error: any) {
    console.error('❌ Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/influencers', async (_req: express.Request, res: express.Response) => {
  try {
    const users = await db.getAllUsers();
    
    // Build response with cached scores
    const influencers = users.map((user: any) => {
      const cached = scoreCache.get(user.user_id);
      
      return {
        user_id: user.user_id,
        display_name: user.display_name,
        followers: user.followers,
        engagement: cached?.engagement || 0,
        influent_score: cached?.influent_score || 0,
        bio: user.bio,
        location: user.location
      };
    });
    
    // Sort by score
    influencers.sort((a, b) => b.influent_score - a.influent_score);
    
    res.json(influencers);
  } catch (error: any) {
    console.error('Influencers error:', error);
    res.json([]);
  }
});

app.get('/api/network-data', async (_req: express.Request, res: express.Response) => {
  try {
    const users = await db.getAllUsers();
    const nodes = users.slice(0, 50).map((user: any) => {
      const cached = scoreCache.get(user.user_id);
      
      return {
        id: user.user_id,
        name: user.display_name,
        followers: user.followers,
        influenceScore: cached?.influent_score || 0,
        bio: user.bio,
        location: user.location
      };
    });
    res.json({ nodes, links: [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analytics', async (_req: express.Request, res: express.Response) => {
  try {
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/keywords', async (_req: express.Request, res: express.Response) => {
  try {
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
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 INFLUENT Backend Server running on http://localhost:${PORT}`);
  console.log(`📊 Database connected: YES`);
  console.log(`🔗 API endpoints ready\n`);
});
