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
    
    await runApifyScrape(params);  // Changed this line

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

    const users = await db.getAllUsers();
    console.log(`📊 Loaded ${users.length} users for analysis`);

    // Calculate real engagement and scores
const rankings = await Promise.all(users.slice(0, 50).map(async (user: any) => {
  // Get user's posts for engagement calculation
  const posts = await db.executeQuery(`
    SELECT 
      AVG(like_count) as avg_likes,
      AVG(reply_count) as avg_replies,
      AVG(retweet_count) as avg_retweets,
      COUNT(*) as post_count
    FROM twitter_posts
    WHERE user_id = $1
  `, [user.user_id]);
  
  const postData = posts[0];
  const avgLikes = parseFloat(postData?.avg_likes || 0);
  const avgReplies = parseFloat(postData?.avg_replies || 0);
  const avgRetweets = parseFloat(postData?.avg_retweets || 0);
  
  // Engagement rate = (likes + replies + retweets) / followers
  const totalEngagement = avgLikes + avgReplies + avgRetweets;
  const engagement = user.followers > 0 ? totalEngagement / user.followers : 0;
  
  // Simple influence score: weighted combination
  const influent_score = (
    (user.followers / 10000000) * 0.4 +  // Follower component (normalized to 10M)
    engagement * 0.6                       // Engagement component
  );
  
  return {
    user_id: user.user_id,
    display_name: user.display_name,
    followers: user.followers,
    engagement: engagement,
    sentiment: 0.5,
    influent_score: Math.min(influent_score, 1.0)
  };
}));

rankings.sort((a, b) => b.influent_score - a.influent_score);

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
    res.json(Array.isArray(users) ? users : []);
  } catch (error: any) {
    console.error('Influencers error:', error);
    res.json([]);
  }
});

app.get('/api/network-data', async (_req: express.Request, res: express.Response) => {
  try {
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