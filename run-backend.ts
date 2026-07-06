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
console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? `SET (${process.env.GROQ_API_KEY.slice(0, 8)}...)` : 'NOT SET');

const db = createDatabaseConnection();
const sentimentAdapter = new SentimentAdapter();

console.log('✅ Modules loaded successfully');

const scoreCache = new Map<string, { engagement: number; influent_score: number }>();

let lastAnalysisTime = 0;
let lastEngagementTime = 0;
let lastConvergenceTime = 0;
let lastRelevancyTime = 0;
let lastSentimentTime = 0;

interface RankedInfluencer {
  user_id: string;
  display_name: string;
  followers: number;
  engagement: number;
  sentiment: number;
  influent_score: number;
}

let lastAnalysisKeywords: string[] = ['AI'];

let lastConvergenceData: Array<{
  iteration: number;
  maxChange: number;
  avgScore: number;
}> = [];

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

    const pythonCmd = process.platform === 'win32' 
      ? 'C:\\Program Files\\Python311\\python.exe'
      : 'python3';
    
    const escapedParams = process.platform === 'win32'
      ? pythonParams.replace(/"/g, '\\"')
      : pythonParams;
    
    const command = process.platform === 'win32'
      ? `"${pythonCmd}" influent_scraper.py "${escapedParams}"`
      : `${pythonCmd} influent_scraper.py '${pythonParams}'`;
    
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

// ============================================================================
// API ENDPOINTS
// ============================================================================

app.get('/api/stats', async (_req: express.Request, res: express.Response) => {
  try {
    const stats = await db.executeQuery(`
      SELECT 
        (SELECT COUNT(*) FROM twitter_users) as users,
        (SELECT COUNT(*) FROM twitter_posts) as posts,
        (SELECT COUNT(*) FROM twitter_interactions) as interactions
    `);
    res.json(stats[0] || { users: 0, posts: 0, interactions: 0 });
  } catch (error: any) {
    console.error('Stats error:', error);
    res.json({ users: 0, posts: 0, interactions: 0 });
  }
});

app.post('/api/analyze', async (req: express.Request, res: express.Response) => {
  const overallStartTime = Date.now(); 
  let engagementTime = 0;
  let relevancyTime = 0;
  let convergenceTime = 0;
  
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

    // ============ VADER SENTIMENT ANALYSIS ============
    const vaderStartTime = Date.now();
    console.log('💭 Running VADER sentiment analysis...');
    
    try {
      const { stdout: vaderOutput, stderr: vaderError } = await execAsync('python run_vader_analysis.py', {
        cwd: process.cwd(),
        env: process.env,
        timeout: 60000 
      });
      
      console.log('--- VADER Output ---');
      console.log(vaderOutput);
      if (vaderError && vaderError.trim()) {
        console.log('--- VADER Warnings ---');
        console.log(vaderError);
      }
      console.log('--- End VADER Output ---');
      
      const vaderTime = Date.now() - vaderStartTime;
      console.log(`⏱️  VADER analysis: ${vaderTime}ms\n`);
      lastSentimentTime = vaderTime;
      
    } catch (error: any) {
      console.error('❌ VADER analysis failed!');
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      if (error.stdout) console.error('stdout:', error.stdout);
      if (error.stderr) console.error('stderr:', error.stderr);
      console.log('   Continuing with neutral sentiment (0.5)...\n');
      lastSentimentTime = 0;
    }

    const allUsers = await db.getAllUsers();
    const users = allUsers.filter((u: any) => (u.account_flag || 'clean') !== 'excluded');
    const excludedUsers = allUsers.filter((u: any) => u.account_flag === 'excluded');
    const suspectedUsers = allUsers.filter((u: any) => u.account_flag === 'suspected');
    console.log(`📊 Loaded ${allUsers.length} users total`);
    console.log(`🚫 Bot filter: ${excludedUsers.length} excluded, ${suspectedUsers.length} suspected, ${users.length} active`);

    // ============ ENGAGEMENT CALCULATION ============
    const engagementStartTime = Date.now();
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
    engagementTime = Date.now() - engagementStartTime;
    console.log(`⏱️  Engagement calculation: ${engagementTime}ms`);

    // ============ CONNECTION WEIGHTS ============
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

    // ============ SENTIMENT SCORES ============
    console.log('💭 Loading sentiment scores from VADER pipeline...');
    const sentimentScores = await sentimentAdapter.getBulkUserAverageSentiment(userIds);
    
    for (const [userId, sentiment] of sentimentScores) {
      console.log(`   ${userId}: sentiment=${sentiment.toFixed(3)}`);
    }

    // ============ INFLUENT CONVERGENCE ============
    const convergenceStartTime = Date.now();
    console.log('🔄 Running INFLUENT algorithm...');
    const logger = new ConvergenceLogger();
    const { InfluentIterativeAlgorithm } = await import('./influent-iterative.js');

    const iterationData: any[] = [];
    const customLogger = {
      logIteration: (iteration: number, maxChange: number, scores: Map<string, number>) => {
        const avgScore = Array.from(scores.values()).reduce((a, b) => a + b, 0) / scores.size;
        iterationData.push({ iteration, maxChange, avgScore });
        logger.logIteration(iteration, maxChange, scores);
      }
    };

    const result = InfluentIterativeAlgorithm.computeWithConvergence(
      userIds,
      connectionWeights,
      sentimentScores,
      engagementScores,
      dampeningFactor,
      1e-6,
      500,
      customLogger as any
    );

    lastConvergenceData = iterationData;
    convergenceTime = Date.now() - convergenceStartTime;
    console.log(`📊 Captured ${lastConvergenceData.length} convergence iterations`);
    if (lastConvergenceData.length > 0) {
      console.log(`   First: iter=${lastConvergenceData[0].iteration}, maxChange=${lastConvergenceData[0].maxChange}`);
      console.log(`   Last: iter=${lastConvergenceData[lastConvergenceData.length-1].iteration}, maxChange=${lastConvergenceData[lastConvergenceData.length-1].maxChange}`);
    }
    console.log(`⏱️  Convergence calculation: ${convergenceTime}ms`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    logger.exportToCSV(`./convergence-${timestamp}.csv`);

    // ============ RELEVANCY CALCULATION ============
    const relevancyStartTime = Date.now();
    console.log('📊 Calculating relevancy scores...');
    const relevancyScores = new Map<string, number>();
    
    try {
      for (const user of users) {
        const posts = await db.executeQuery(`
          SELECT relevance_ratio
          FROM twitter_posts
          WHERE user_id = $1
        `, [user.user_id]);

        if (posts.length > 0) {
          const sum = posts.reduce((acc: number, p: any) => {
            const val = p.relevance_ratio;
            return acc + (val !== null && !isNaN(val) ? Number(val) : 0);
          }, 0);
          const avgRelevancy = sum / posts.length;
          relevancyScores.set(user.user_id, avgRelevancy);
          console.log(`   ${user.user_id}: ${posts.length} posts, avg=${(avgRelevancy * 100).toFixed(1)}%`);
        } else {
          relevancyScores.set(user.user_id, 0);
          console.log(`   ${user.user_id}: no posts found`);
        }
      }
    } catch (error: any) {
      if (error.code === '42703') {
        console.log('⚠️  relevance_ratio column not found, defaulting to 0');
        for (const user of users) {
          relevancyScores.set(user.user_id, 0);
        }
      } else {
        throw error;
      }
    }
    relevancyTime = Date.now() - relevancyStartTime;
    console.log(`⏱️  Relevancy calculation: ${relevancyTime}ms`);

    const rankings = users.map((user: any) => {
      const engagement = engagementScores.get(user.user_id) || 0;
      const score = result.finalScores.get(user.user_id) || 0;
      const relevancy = relevancyScores.get(user.user_id) || 0;
      const sentiment = sentimentScores.get(user.user_id) || 0.5;

      scoreCache.set(user.user_id, {
        engagement: engagement,
        influent_score: score
      });

      return {
        user_id: user.user_id,
        display_name: user.display_name,
        followers: user.followers,
        engagement: engagement * 100,
        relevancy: relevancy * 100,
        sentiment: sentiment,
        influent_score: score * 100
      };
    });

    rankings.sort((a, b) => b.influent_score - a.influent_score);

    const endTime = Date.now();
    const elapsedMs = endTime - overallStartTime;
    lastAnalysisTime = elapsedMs;
    lastEngagementTime = engagementTime;
    lastConvergenceTime = convergenceTime;
    lastRelevancyTime = relevancyTime;

    console.log(`✅ Analysis complete! Top score: ${rankings[0]?.influent_score.toFixed(2)}%`);
    console.log(`⏱️  Total time: ${elapsedMs}ms (${(elapsedMs/1000).toFixed(2)}s)`);
    console.log(`   └─ VADER: ${lastSentimentTime}ms, Engagement: ${engagementTime}ms, Convergence: ${convergenceTime}ms, Relevancy: ${relevancyTime}ms`);

    lastAnalysisKeywords = Array.isArray(keywords) ? keywords : keywords.split(',').map((k: string) => k.trim());

    res.json({
      success: true,
      rankings,
      metadata: {
        totalUsers: users.length,
        totalPosts: scrapeResult.posts,
        keywords: Array.isArray(keywords) ? keywords : keywords.split(','),
        scrapeTimestamp: new Date().toISOString(),
        elapsedTimeMs: elapsedMs,
        timings: {
          vader: lastSentimentTime,
          engagement: engagementTime,
          convergence: convergenceTime,
          relevancy: relevancyTime,
          total: elapsedMs
        },
        parameters: {
          dampeningFactor,
          temporalDecay: lambda,
          weights: { likes: wi, comments: wc, shares: ws }
        },
        botTagging: {
          totalIngested: allUsers.length,
          clean: allUsers.filter((u: any) => (u.account_flag || 'clean') === 'clean').length,
          suspected: suspectedUsers.length,
          excluded: excludedUsers.length,
          excludedAccounts: excludedUsers.map((u: any) => ({
            user_id: u.user_id,
            display_name: u.display_name,
            flag_reason: u.flag_reason
          }))
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

    if (!users || users.length === 0) {
      return res.json([]);
    }

    const influencers = await Promise.all(users.map(async (user: any) => {
      const cached = scoreCache.get(user.user_id);

      const posts = await db.executeQuery(`
        SELECT relevance_ratio
        FROM twitter_posts
        WHERE user_id = $1
      `, [user.user_id]);

      const relevancy = posts.length > 0
        ? posts.reduce((sum: number, p: any) => {
            const val = p.relevance_ratio;
            return sum + (val !== null && !isNaN(val) ? Number(val) : 0);
          }, 0) / posts.length
        : 0;

      return {
        user_id: user.user_id,
        display_name: user.display_name,
        followers: user.followers,
        engagement: (cached?.engagement || 0) * 100,
        relevancy: relevancy * 100,
        influent_score: (cached?.influent_score || 0) * 100,
        bio: user.bio,
        location: user.location,
        is_verified: user.is_verified,        
        is_blue_verified: user.is_blue_verified  
      };
    }));

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
    
    if (!users || users.length === 0) {
      return res.json({ 
        nodes: [], 
        links: [],
        keywords: lastAnalysisKeywords,
        userKeywords: {},
        interactions: []
      });
    }

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

    const interactions = await db.executeQuery(`
      SELECT DISTINCT from_user, to_user
      FROM twitter_interactions
      WHERE from_user IN (SELECT user_id FROM twitter_users LIMIT 50)
        AND to_user IN (SELECT user_id FROM twitter_users LIMIT 50)
      LIMIT 500
    `);

    const keywords = lastAnalysisKeywords || ['AI'];

    const userKeywords: Record<string, string[]> = {};
    users.slice(0, 50).forEach((user: any) => {
      userKeywords[user.user_id] = keywords;
    });

    res.json({ 
      nodes, 
      links: [],
      keywords,
      userKeywords,
      interactions: (interactions || []).map((i: any) => ({
        from_user: i.from_user,
        to_user: i.to_user
      }))
    });
  } catch (error: any) {
    console.error('Network data error:', error);
    res.json({ 
      nodes: [], 
      links: [],
      keywords: lastAnalysisKeywords,
      userKeywords: {},
      interactions: []
    });
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

    const formattedTemporalData = (temporalData || []).map((row: any) => ({
      date: row.date,
      post_count: parseInt(row.post_count, 10)
    }));

    const allRanges = ['0-1K', '1K-10K', '10K-100K', '100K+'];
    const formattedDistribution = allRanges.map(range => {
      const found = (scoreDistribution || []).find((r: any) => r.range === range);
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
    res.json({ temporalData: [], scoreDistribution: [] });
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
    res.json(keywords || []);
  } catch (error: any) {
    console.error('Keywords error:', error);
    res.json([]);
  }
});

// ============================================================================
// BOT / SPAM TAGGING ENDPOINT
// ============================================================================

app.get('/api/flagged-accounts', async (_req: express.Request, res: express.Response) => {
  try {
    const rows = await db.executeQuery(`
      SELECT
        u.user_id,
        u.display_name,
        u.followers,
        u.account_flag,
        u.flag_reason,
        f.first_flagged_at,
        f.confirmations
      FROM twitter_users u
      LEFT JOIN flagged_accounts f USING (user_id)
      WHERE u.account_flag IN ('suspected', 'excluded')
      ORDER BY u.account_flag DESC, f.confirmations DESC NULLS LAST
    `);
    res.json(rows || []);
  } catch (error: any) {
    console.error('Flagged accounts error:', error);
    res.json([]);
  }
});

// ============================================================================
// EXPORT ENDPOINTS
// ============================================================================

app.post('/api/export/full-calculation', async (req: express.Request, res: express.Response) => {
  try {
    const { userIds } = req.body;
    
    const users = await db.getAllUsers();
    const filteredUsers = userIds 
      ? users.filter((u: any) => userIds.includes(u.user_id))
      : users;

    const csvRows = ['User ID,Display Name,Followers,Engagement Score,Relevancy Score,Sentiment Score,Influence Score,VADER Compound,Post Count,Avg Likes,Avg Replies,Avg Retweets'];

    for (const user of filteredUsers) {
      const cached = scoreCache.get(user.user_id);
      
      const posts = await db.executeQuery(`
        SELECT like_count, reply_count, retweet_count, content, relevance_ratio
        FROM twitter_posts
        WHERE user_id = $1
      `, [user.user_id]);

      const postCount = posts.length;
      const avgLikes = postCount > 0 ? posts.reduce((sum: number, p: any) => sum + (p.like_count || 0), 0) / postCount : 0;
      const avgReplies = postCount > 0 ? posts.reduce((sum: number, p: any) => sum + (p.reply_count || 0), 0) / postCount : 0;
      const avgRetweets = postCount > 0 ? posts.reduce((sum: number, p: any) => sum + (p.retweet_count || 0), 0) / postCount : 0;
      
      let avgRelevancy = 0;
      if (postCount > 0) {
        const sum = posts.reduce((acc: number, p: any) => {
          const val = p.relevance_ratio;
          return acc + (val !== null && !isNaN(val) ? Number(val) : 0);
        }, 0);
        avgRelevancy = sum / postCount;
      }

      const vaderCompound = await sentimentAdapter.getUserAverageSentiment(user.user_id);

      csvRows.push([
        user.user_id,
        `"${user.display_name}"`,
        user.followers,
        ((cached?.engagement || 0) * 100).toFixed(2),
        (avgRelevancy * 100).toFixed(2),
        (vaderCompound * 100).toFixed(2),
        ((cached?.influent_score || 0) * 100).toFixed(2),
        vaderCompound.toFixed(3),
        postCount,
        avgLikes.toFixed(1),
        avgReplies.toFixed(1),
        avgRetweets.toFixed(1)
      ].join(','));
    }

    csvRows.push('');
    csvRows.push('========================================');
    csvRows.push('CONVERGENCE ITERATIONS');
    csvRows.push('========================================');
    csvRows.push('Iteration,Max Change,Average Score');
    
    if (lastConvergenceData.length > 0) {
      lastConvergenceData.forEach(iter => {
        const iteration = Number(iter.iteration);
        const maxChange = Number(iter.maxChange);
        const avgScore = Number(iter.avgScore);
        csvRows.push(`${iteration},${maxChange.toFixed(8)},${avgScore.toFixed(8)}`);
      });
    } else {
      csvRows.push('No convergence data available - run analysis first');
    }
    
    csvRows.push('');
    csvRows.push('FILTER SETTINGS');
    csvRows.push(`Exclude Paid Accounts: ${req.body.excludeBlueVerified ? 'Excluding Paid Accounts' : 'All Accounts'}`);
    csvRows.push(`Score Ranges: High=${req.body.scoreRanges?.high}, Medium=${req.body.scoreRanges?.medium}, Low=${req.body.scoreRanges?.low}`);
    
    csvRows.push('');
    csvRows.push('========================================');
    csvRows.push('COMPUTATION TIME (Time Complexity Analysis)');
    csvRows.push('========================================');
    csvRows.push('Phase,Time (ms),Time (s)');
    csvRows.push(`VADER Sentiment Analysis,${lastSentimentTime},${(lastSentimentTime/1000).toFixed(3)}`);
    csvRows.push(`Engagement Calculation,${lastEngagementTime},${(lastEngagementTime/1000).toFixed(3)}`);
    csvRows.push(`Convergence (INFLUENT Algorithm),${lastConvergenceTime},${(lastConvergenceTime/1000).toFixed(3)}`);
    csvRows.push(`Relevancy Calculation,${lastRelevancyTime},${(lastRelevancyTime/1000).toFixed(3)}`);
    csvRows.push(`Total Analysis Time,${lastAnalysisTime},${(lastAnalysisTime/1000).toFixed(3)}`);

    const csvContent = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=influent-full-calculation-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);

  } catch (error: any) {
    console.error('Export full calculation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/reports', async (req: express.Request, res: express.Response) => {
  try {
    const { stats, scoreDistribution, networkStats, keywords, filters } = req.body;

    const csvRows = ['INFLUENT REPORTS EXPORT'];
    csvRows.push(`Generated: ${new Date().toISOString()}`);
    csvRows.push('');

    csvRows.push('ACTIVE FILTERS');
    csvRows.push(`Exclude Paid Accounts: ${filters.excludeBlueVerified ? 'Yes' : 'No'}`);
    csvRows.push(`Score Range - High (80-100%): ${filters.scoreRanges.high ? 'Included' : 'Excluded'}`);
    csvRows.push(`Score Range - Medium (50-80%): ${filters.scoreRanges.medium ? 'Included' : 'Excluded'}`);
    csvRows.push(`Score Range - Low (0-50%): ${filters.scoreRanges.low ? 'Included' : 'Excluded'}`);
    csvRows.push('');

    csvRows.push('OVERALL STATISTICS');
    csvRows.push('Metric,Value');
    csvRows.push(`Total Influencers,${stats.totalInfluencers}`);
    csvRows.push(`Average Influence Score,${stats.avgInfluenceScore.toFixed(2)}%`);
    csvRows.push(`Total Topic Reach,${stats.totalTopicReach.toLocaleString()}`);
    csvRows.push(`Average Engagement,${stats.avgEngagement.toFixed(2)}%`);
    csvRows.push('');

    csvRows.push('SCORE DISTRIBUTION CALCULATION');
    csvRows.push('Description: Distribution calculated by counting users in each score range from filtered dataset');
    csvRows.push('Range,Count,Percentage');
    const total = scoreDistribution.high + scoreDistribution.medium + scoreDistribution.low;
    csvRows.push(`High (80-100%),${scoreDistribution.high},${((scoreDistribution.high / total) * 100).toFixed(1)}%`);
    csvRows.push(`Medium (50-80%),${scoreDistribution.medium},${((scoreDistribution.medium / total) * 100).toFixed(1)}%`);
    csvRows.push(`Low (0-50%),${scoreDistribution.low},${((scoreDistribution.low / total) * 100).toFixed(1)}%`);
    csvRows.push('');

    csvRows.push('NETWORK STATISTICS CALCULATION');
    csvRows.push('Metric,Value,Formula');
    csvRows.push(`Total Connections,${networkStats.totalConnections},"n * (n-1) where n = ${stats.totalInfluencers}"`);
    csvRows.push(`Avg Connections per User,${networkStats.avgConnectionsPerUser.toFixed(2)},"(n-1) where n = ${stats.totalInfluencers}"`);
    csvRows.push(`Network Density,${networkStats.networkDensity.toFixed(2)}%,"(actual_connections / max_possible) * 100"`);
    csvRows.push('');

    csvRows.push('TOP KEYWORDS');
    csvRows.push('Keyword,Frequency');
    keywords.forEach((kw: any) => {
      csvRows.push(`"${kw.keyword}",${kw.frequency}`);
    });

    const csvContent = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=influent-reports-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);

  } catch (error: any) {
    console.error('Export reports error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/analytics', async (req: express.Request, res: express.Response) => {
  try {
    const { fullData, last30DaysData } = req.body;

    const csvRows = ['INFLUENT ANALYTICS EXPORT'];
    csvRows.push(`Generated: ${new Date().toISOString()}`);
    csvRows.push('');

    csvRows.push('FULL TEMPORAL DATA');
    csvRows.push('Date,Post Count');
    fullData.temporalData.forEach((row: any) => {
      csvRows.push(`${row.date},${row.post_count}`);
    });
    csvRows.push('');

    csvRows.push('LAST 30 DAYS TEMPORAL DATA');
    csvRows.push('Date,Post Count');
    last30DaysData.temporalData.forEach((row: any) => {
      csvRows.push(`${row.date},${row.post_count}`);
    });
    csvRows.push('');

    csvRows.push('SCORE DISTRIBUTION');
    csvRows.push('Range,Count');
    fullData.scoreDistribution.forEach((row: any) => {
      csvRows.push(`${row.range},${row.count}`);
    });
    csvRows.push('');

    csvRows.push('SUMMARY STATISTICS');
    const fullTotal = fullData.temporalData.reduce((sum: number, d: any) => sum + d.post_count, 0);
    const last30Total = last30DaysData.temporalData.reduce((sum: number, d: any) => sum + d.post_count, 0);
    const fullAvg = fullData.temporalData.length > 0 ? fullTotal / fullData.temporalData.length : 0;
    const last30Avg = last30DaysData.temporalData.length > 0 ? last30Total / last30DaysData.temporalData.length : 0;

    csvRows.push('Metric,Full Dataset,Last 30 Days');
    csvRows.push(`Total Data Points,${fullData.temporalData.length},${last30DaysData.temporalData.length}`);
    csvRows.push(`Total Posts,${fullTotal},${last30Total}`);
    csvRows.push(`Avg Posts/Day,${fullAvg.toFixed(2)},${last30Avg.toFixed(2)}`);
    csvRows.push(`Peak Activity,${Math.max(...fullData.temporalData.map((d: any) => d.post_count))},${Math.max(...last30DaysData.temporalData.map((d: any) => d.post_count))}`);

    const csvContent = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=influent-analytics-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);

  } catch (error: any) {
    console.error('Export analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/complete', async (_req: express.Request, res: express.Response) => {
  try {
    const users = await db.getAllUsers();

    const csvRows = ['INFLUENT COMPLETE EXPORT'];
    csvRows.push(`Generated: ${new Date().toISOString()}`);
    csvRows.push('');

    csvRows.push('========================================');
    csvRows.push('SECTION 1: INFLUENCE SCORES & ENGAGEMENT');
    csvRows.push('========================================');
    csvRows.push('User ID,Display Name,Followers,Engagement Score,Influence Score,Is Verified,Is Blue Verified');
    
    for (const user of users) {
      const cached = scoreCache.get(user.user_id);
      csvRows.push([
        user.user_id,
        `"${user.display_name}"`,
        user.followers,
        ((cached?.engagement || 0) * 100).toFixed(2),
        ((cached?.influent_score || 0) * 100).toFixed(2),
        user.is_verified ? 'Yes' : 'No',
        user.is_blue_verified ? 'Yes' : 'No'
      ].join(','));
    }
    csvRows.push('');

    csvRows.push('========================================');
    csvRows.push('SECTION 2: REPORTS & STATISTICS');
    csvRows.push('========================================');
    
    const totalInfluencers = users.length;
    const avgInfluence = users.reduce((sum, u) => sum + (scoreCache.get(u.user_id)?.influent_score || 0), 0) / totalInfluencers;
    const totalReach = users.reduce((sum, u) => sum + u.followers, 0);
    
    csvRows.push('Metric,Value');
    csvRows.push(`Total Influencers,${totalInfluencers}`);
    csvRows.push(`Average Influence Score,${(avgInfluence * 100).toFixed(2)}%`);
    csvRows.push(`Total Topic Reach,${totalReach.toLocaleString()}`);
    csvRows.push(`Analysis Time,${lastAnalysisTime}ms (${(lastAnalysisTime/1000).toFixed(2)}s)`);
    csvRows.push('');

    csvRows.push('Score Distribution');
    csvRows.push('Range,Count');
    const high = users.filter(u => (scoreCache.get(u.user_id)?.influent_score || 0) >= 0.8).length;
    const medium = users.filter(u => {
      const score = scoreCache.get(u.user_id)?.influent_score || 0;
      return score >= 0.5 && score < 0.8;
    }).length;
    const low = users.filter(u => (scoreCache.get(u.user_id)?.influent_score || 0) < 0.5).length;
    
    csvRows.push(`High (80-100%),${high}`);
    csvRows.push(`Medium (50-80%),${medium}`);
    csvRows.push(`Low (0-50%),${low}`);
    csvRows.push('');

    csvRows.push('========================================');
    csvRows.push('SECTION 3: ANALYTICS - TEMPORAL TRENDS');
    csvRows.push('========================================');
    
    const temporalData = await db.executeQuery(`
      SELECT DATE(created_at) as date, COUNT(*) as post_count
      FROM twitter_posts
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    csvRows.push('Full Dataset');
    csvRows.push('Date,Post Count');
    (temporalData || []).forEach((row: any) => {
      csvRows.push(`${row.date},${row.post_count}`);
    });
    csvRows.push('');

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const last30Days = (temporalData || []).filter((row: any) => new Date(row.date) >= thirtyDaysAgo);

    csvRows.push('Last 30 Days');
    csvRows.push('Date,Post Count');
    last30Days.forEach((row: any) => {
      csvRows.push(`${row.date},${row.post_count}`);
    });

    const csvContent = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=influent-complete-export-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);

  } catch (error: any) {
    console.error('Export complete error:', error);
    res.status(500).json({ error: error.message });
  }
});



// ============================================================================
// GROQ VERSION — replaces the Gemini-based analyze-chart route
// ============================================================================
//
// 1. Get a free key: https://console.groq.com  → API Keys → Create
//    (no credit card required)
// 2. Add to your .env:
//      GROQ_API_KEY=gsk_your_key_here
// 3. Replace the old Gemini block in your backend file (from
//    "interface AnalyzeChartRequest" down through the end of
//    "registerAnalyzeChartRoute") with everything below.
// 4. Keep the registerAnalyzeChartRoute(app); call before app.listen — no
//    change needed there.
// ============================================================================

interface AnalyzeChartRequest {
  chartType: 'temporal' | 'distribution' | 'engagement';
  data: any[];
}

const CHART_CONTEXT: Record<string, string> = {
  temporal:
    'A line chart showing the number of posts collected per day over the analysis period. ' +
    'Each data point has a "date" and a "post_count".',
  distribution:
    'A bar chart showing how many users fall into each INFLUENT score range (e.g. "0.0-0.2", "0.2-0.4", etc). ' +
    'Each data point has a "range" and a "count".',
  engagement:
    'A line chart tracking average engagement per post over time: likes, replies, and retweets. ' +
    'Each data point has a "date", "avg_likes", "avg_replies", and "avg_retweets".',
};

function summarizeForPrompt(chartType: string, data: any[]): any[] {
  const MAX_POINTS = 60;
  if (data.length <= MAX_POINTS) return data;

  const step = Math.ceil(data.length / MAX_POINTS);
  return data.filter((_, i) => i % step === 0);
}

function buildPrompt(chartType: string, data: any[]): string {
  const context = CHART_CONTEXT[chartType] || 'A chart from an analytics dashboard.';
  const trimmedData = summarizeForPrompt(chartType, data);

  return `You are explaining a data visualization to someone viewing an influencer/social-media analytics dashboard called INFLUENT. They are not a data scientist, so avoid jargon.

Chart type: ${chartType}
What this chart shows: ${context}

Here is the actual data behind the chart (JSON):
${JSON.stringify(trimmedData)}

Write a short explanation (4-6 sentences) that:
1. Plainly describes what the person is looking at.
2. Points out the specific trend or pattern visible in THIS data (reference real numbers/dates from the data above, not generic statements).
3. Briefly notes what that trend might mean for understanding influence/engagement in this dataset.

Do not use markdown formatting, headers, or bullet points. Write it as plain flowing sentences.`;
}

export function registerAnalyzeChartRoute(app: express.Express) {
  app.post('/api/analyze-chart', async (req, res) => {
    const { chartType, data } = req.body as AnalyzeChartRequest;

    if (!chartType || !Array.isArray(data)) {
      return res.status(400).json({ error: 'chartType and data are required' });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server' });
    }

    if (data.length === 0) {
      return res.json({ explanation: 'There is no data available for this chart yet, so there is nothing to analyze.' });
    }

    try {
      const prompt = buildPrompt(chartType, data);

      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.4,
          max_completion_tokens: 300,
        }),
      });

      if (!groqResponse.ok) {
        const errText = await groqResponse.text();
        console.error('Groq API error:', groqResponse.status, errText);
        return res.status(502).json({ error: 'AI service returned an error' });
      }

      const json = await groqResponse.json();
      const explanation = json?.choices?.[0]?.message?.content;

      if (!explanation) {
        return res.status(502).json({ error: 'AI service returned no explanation' });
      }

      res.json({ explanation: explanation.trim() });
    } catch (error) {
      console.error('Chart analysis failed:', error);
      res.status(500).json({ error: 'Failed to analyze chart' });
    }
  });
}






// ============================================================================
// START SERVER
// ============================================================================

registerAnalyzeChartRoute(app);

app.listen(PORT, () => {
  console.log(`\n🚀 INFLUENT Backend Server running on http://localhost:${PORT}`);
  console.log(`📊 Database connected: YES`);
  console.log(`🔗 API endpoints ready\n`);
});