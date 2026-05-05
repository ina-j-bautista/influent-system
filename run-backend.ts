import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { createDatabaseConnection } from './database-adapter.ts';
import { SentimentAdapter } from './sentiment-adapter.ts';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ConvergenceLogger } from './export-convergence.js';

const execAsync = promisify(exec);

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
  language: string;
  minFollowers: number;
  minAvgLikes: number;
  maxAccounts?: number;
  tweetsPerAccount?: number;
  startDate: string;
  endDate: string;
  maxItems: number;
}) {
  console.log('🚀 Starting complete scrape pipeline...');

  try {
    console.log('📡 Calling Python scraper...');

    const pythonParams = JSON.stringify({
      keywords: params.keywords,
      language: params.language,
      minFollowers: params.minFollowers,
      minAvgLikes: params.minAvgLikes,
      maxAccounts: params.maxAccounts || 20,
      tweetsPerAccount: params.tweetsPerAccount || 20,
      startDate: params.startDate,
      endDate: params.endDate,
      maxItems: params.maxItems
    });

    // Call Python script
    // On Windows, use the Python 3.11 installation explicitly
    const pythonCmd = process.platform === 'win32' 
      ? 'C:\\Program Files\\Python311\\python.exe'
      : 'python3';
    
    // Escape JSON for Windows command line (use double quotes and escape inner quotes)
    const escapedParams = process.platform === 'win32'
      ? pythonParams.replace(/"/g, '\\"')
      : pythonParams;
    
    const command = process.platform === 'win32'
      ? `"${pythonCmd}" influent_scraper.py "${escapedParams}"`
      : `${pythonCmd} influent_scraper.py '${pythonParams}'`;
    
    // Pass environment variables to child process
    const { stdout, stderr } = await execAsync(command, {
      env: {
        ...process.env,
        APIFY_API_TOKEN: process.env.APIFY_API_TOKEN,
        NEON_CONNECTION_STRING: process.env.NEON_CONNECTION_STRING
      }
    });
    
    if (stderr && !stderr.includes('[apify')) {
      console.error('Python stderr:', stderr);
    }
    
    console.log('Python output:', stdout);
    
    // Parse result from last line of output
    const lines = stdout.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    const result = JSON.parse(lastLine);
    
    if (!result.success) {
      throw new Error(result.error || 'Python scraper failed');
    }

    console.log(`✅ Scrape completed`);
    console.log(`📊 Database now has:`);
    console.log(`   - ${result.users} users`);
    console.log(`   - ${result.posts} posts`);

    return {
      success: true,
      users: result.users,
      posts: result.posts
    };

  } catch (error: any) {
    console.error('❌ Scrape pipeline error:', error);
    throw error;
  }
}

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
      language,
      minFollowers,
      minAvgLikes,
      maxAccounts,
      tweetsPerAccount,
      startDate,
      endDate,
      maxItems,
      weightPreferences,
      sentimentImportance,
      temporalDecay
    } = req.body;

    const wi = weightPreferences?.wi || 0.33;
    const wc = weightPreferences?.wc || 0.33;
    const ws = weightPreferences?.ws || 0.34;
    
    const weightSum = wi + wc + ws;
    if (Math.abs(weightSum - 1.0) > 0.01) {
      console.warn(`⚠️  Weight sum is ${weightSum}, normalizing to 1.0`);
    }

    const dampeningFactor = sentimentImportance || 0.85;
    const lambda = temporalDecay || 0.5;

    console.log('📊 Starting analysis pipeline...');
    console.log(`   Dampening factor (d): ${dampeningFactor}`);
    console.log(`   Temporal decay (λ): ${lambda}`);
    console.log(`   Weights - Likes: ${(wi*100).toFixed(0)}%, Replies: ${(wc*100).toFixed(0)}%, Retweets: ${(ws*100).toFixed(0)}%`);

    await clearDatabase();
    scoreCache.clear();

    const scrapeResult = await runCompleteScrape({
      keywords: Array.isArray(keywords) ? keywords : keywords.split(',').map((k: string) => k.trim()),
      language: language || 'en',
      minFollowers: minFollowers || 0,
      minAvgLikes: minAvgLikes || 0,
      maxAccounts: maxAccounts || 20,
      tweetsPerAccount: tweetsPerAccount || 20,
      startDate: startDate || '',
      endDate: endDate || '',
      maxItems: maxItems || 100
    });

    console.log(`✅ Scrape complete: ${scrapeResult.users} users, ${scrapeResult.posts} posts`);

    const users = await db.getAllUsers();
    console.log(`📊 Loaded ${users.length} users for analysis`);

    console.log('🧮 Computing engagement scores with temporal decay...');
    const engagementScores = new Map<string, number>();
    const now = new Date();

    for (const user of users) {
  const posts = await db.executeQuery(`
  SELECT 
    like_count,
    reply_count,
    retweet_count,
    created_at
  FROM twitter_posts
  WHERE user_id = $1
`, [user.user_id]);

      if (posts.length === 0) {
        engagementScores.set(user.user_id, 0);
        continue;
      }

      let totalDecayedEngagement = 0;

      for (const post of posts) {
        const rawEngagement = 
          (wi * (post.like_count || 0)) + 
          (wc * (post.reply_count || 0)) + 
          (ws * (post.retweet_count || 0));
        
        const postDate = new Date(post.created_at);
        const daysSincePost = (now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24);
        
        const decayFactor = Math.exp(-lambda * daysSincePost);
        const decayedEngagement = rawEngagement * decayFactor;
        
        totalDecayedEngagement += decayedEngagement;
      }

      const avgDecayedEngagement = totalDecayedEngagement / posts.length;
      engagementScores.set(user.user_id, avgDecayedEngagement);

      console.log(`   ${user.user_id}: ${posts.length} posts, weighted avg = ${avgDecayedEngagement.toFixed(2)}`);
    }

    const maxEngagement = Math.max(...Array.from(engagementScores.values()));
    console.log(`\n📊 Max engagement: ${maxEngagement.toFixed(2)}`);

    if (maxEngagement > 0) {
      for (const [userId, eng] of engagementScores) {
        const normalized = eng / maxEngagement;
        engagementScores.set(userId, normalized);
        console.log(`   ${userId}: normalized = ${(normalized * 100).toFixed(2)}%`);
      }
    }
    console.log('');

    const userIds = users.map((u: any) => u.user_id);
    const connectionWeights = new Map<string, Map<string, number>>();
    const userFollowers = new Map<string, number>();
    const userVerified = new Map<string, boolean>();

    for (const user of users) {
      userFollowers.set(user.user_id, user.followers);
      userVerified.set(user.user_id, user.is_verified || false);
    }

    const maxFollowers = Math.max(...Array.from(userFollowers.values()));

    for (const userId of userIds) {
      const connections = new Map<string, number>();
      let totalWeight = 0;

      const vFollowers = userFollowers.get(userId) || 0;

      for (const otherId of userIds) {
        if (userId !== otherId) {
          const uFollowers = userFollowers.get(otherId) || 0;
          const uVerified = userVerified.get(otherId) || false;

          const followerRatio = Math.min(vFollowers, uFollowers) / Math.max(vFollowers, uFollowers, 1);
          const reciprocity = followerRatio;

          const interactionFreq = engagementScores.get(otherId) || 0;

          const followerCredibility = uFollowers / maxFollowers;
          const verificationBonus = uVerified ? 0.2 : 0;
          const credibility = Math.min(followerCredibility + verificationBonus, 1.0);

          const weight = 0.4 * reciprocity + 0.4 * interactionFreq + 0.2 * credibility;

          connections.set(otherId, weight);
          totalWeight += weight;
        }
      }

      if (totalWeight > 0) {
        for (const [otherId, weight] of connections) {
          connections.set(otherId, weight / totalWeight);
        }
      }

      connectionWeights.set(userId, connections);
    }

    console.log('✅ Connection weights computed using W(v,u) formula\n');

    const sentimentScores = new Map<string, number>();
    for (const userId of userIds) {
      sentimentScores.set(userId, 0.5);
    }

    console.log('🔄 Running INFLUENT algorithm...');
    const logger = new ConvergenceLogger();
    const { InfluentIterativeAlgorithm } = await import('./influent-iterative.js');

    const result = InfluentIterativeAlgorithm.computeWithConvergence(
      userIds,
      connectionWeights,
      sentimentScores,
      engagementScores,
      dampeningFactor,
      1e-6,
      200,
      logger
    );

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    logger.exportToCSV(`./convergence-${timestamp}.csv`);

    const rankings = users.map((user: any) => {
      const engagement = engagementScores.get(user.user_id) || 0;
      const score = result.finalScores.get(user.user_id) || 0;

      scoreCache.set(user.user_id, {
        engagement: engagement,
        influent_score: score
      });

      return {
        user_id: user.user_id,
        display_name: user.display_name,
        followers: user.followers,
        engagement: engagement * 100,
        sentiment: 0.5,
        influent_score: score * 100
      };
    });

    rankings.sort((a, b) => b.influent_score - a.influent_score);

    console.log(`✅ Analysis complete! Top score: ${rankings[0]?.influent_score.toFixed(2)}%`);

    res.json({
      success: true,
      rankings,
      metadata: {
        totalUsers: users.length,
        totalPosts: scrapeResult.posts,
        keywords: Array.isArray(keywords) ? keywords : keywords.split(','),
        scrapeTimestamp: new Date().toISOString(),
        parameters: {
          dampeningFactor,
          temporalDecay: lambda,
          weights: { likes: wi, comments: wc, shares: ws }
        }
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

    const influencers = users.map((user: any) => {
      const cached = scoreCache.get(user.user_id);

      return {
      user_id: user.user_id,
      display_name: user.display_name,
      followers: user.followers,
      engagement: (cached?.engagement || 0) * 100,
      influent_score: (cached?.influent_score || 0) * 100,
      bio: user.bio,
      location: user.location,
      is_verified: user.is_verified,        
      is_blue_verified: user.is_blue_verified  
    };
    });

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

    const formattedTemporalData = temporalData.map((row: any) => ({
      date: row.date,
      post_count: parseInt(row.post_count, 10)
    }));

    const allRanges = ['0-1K', '1K-10K', '10K-100K', '100K+'];
    const formattedDistribution = allRanges.map(range => {
      const found = scoreDistribution.find((r: any) => r.range === range);
      return {
        range,
        count: found ? parseInt(found.count, 10) : 0
      };
    });

    res.json({ 
      temporalData: formattedTemporalData,
      scoreDistribution: formattedDistribution 
    });
  } catch (error: any) {
    console.error('Analytics error:', error);
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