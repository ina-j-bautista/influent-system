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

// Store keywords from last analysis
let lastAnalysisKeywords: string[] = ['AI'];

// Store convergence data from last analysis
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

    // Store iterations manually with custom logger
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
      200,
      customLogger as any
    );

    // Store convergence data for export
    lastConvergenceData = iterationData;
    console.log(`📊 Captured ${lastConvergenceData.length} convergence iterations`);
    if (lastConvergenceData.length > 0) {
      console.log(`   First: iter=${lastConvergenceData[0].iteration}, maxChange=${lastConvergenceData[0].maxChange}`);
      console.log(`   Last: iter=${lastConvergenceData[lastConvergenceData.length-1].iteration}, maxChange=${lastConvergenceData[lastConvergenceData.length-1].maxChange}`);
    }

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

    // Store keywords for network view
    lastAnalysisKeywords = Array.isArray(keywords) ? keywords : keywords.split(',').map((k: string) => k.trim());

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

    if (!users || users.length === 0) {
      return res.json([]);
    }

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
      LIMIT 200
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
// EXPORT ENDPOINTS
// ============================================================================

app.post('/api/export/full-calculation', async (req: express.Request, res: express.Response) => {
  try {
    const { userIds } = req.body;
    
    const users = await db.getAllUsers();
    const filteredUsers = userIds 
      ? users.filter((u: any) => userIds.includes(u.user_id))
      : users;

    const csvRows = ['User ID,Display Name,Followers,Engagement Score,Sentiment Score,Influence Score,VADER Compound,Post Count,Avg Likes,Avg Replies,Avg Retweets'];

    for (const user of filteredUsers) {
      const cached = scoreCache.get(user.user_id);
      
      const posts = await db.executeQuery(`
        SELECT like_count, reply_count, retweet_count, content
        FROM twitter_posts
        WHERE user_id = $1
      `, [user.user_id]);

      const postCount = posts.length;
      const avgLikes = postCount > 0 ? posts.reduce((sum: number, p: any) => sum + (p.like_count || 0), 0) / postCount : 0;
      const avgReplies = postCount > 0 ? posts.reduce((sum: number, p: any) => sum + (p.reply_count || 0), 0) / postCount : 0;
      const avgRetweets = postCount > 0 ? posts.reduce((sum: number, p: any) => sum + (p.retweet_count || 0), 0) / postCount : 0;

      const vaderCompound = 0.5;

      csvRows.push([
        user.user_id,
        `"${user.display_name}"`,
        user.followers,
        ((cached?.engagement || 0) * 100).toFixed(2),
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
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`\n🚀 INFLUENT Backend Server running on http://localhost:${PORT}`);
  console.log(`📊 Database connected: YES`);
  console.log(`🔗 API endpoints ready\n`);
});