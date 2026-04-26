//######## RUN INFLUENT WITH ITERATIVE CONVERGENCE #########################

import 'dotenv/config';
import { 
  InfluentCoreController,
  TargetInput,
} from './influent-core';
import { createDatabaseConnection } from './database-adapter';
import { collectAnalysisParameters } from './parameter-input';
import { InfluentAlgorithm } from './influent-algorithm';
import { InfluentIterativeAlgorithm } from './influent-iterative-enhanced';
import { SentimentAdapter } from './sentiment-adapter';

async function runIterativeAnalysis() {
  console.log('INFLUENT Analysis System - Iterative Convergence Mode\n');

  const db = createDatabaseConnection();
  const controller = new InfluentCoreController(db);
  const sentimentAdapter = new SentimentAdapter();

  try {
    // Test connection
    const isConnected = await db.testConnection();
    if (!isConnected) {
      console.error('Database connection failed');
      return;
    }
    console.log();

    // Check database contents
    console.log('Checking database contents...');
    const stats = await db.executeQuery(`
      SELECT 
        (SELECT COUNT(*) FROM twitter_users) as users,
        (SELECT COUNT(*) FROM twitter_posts) as posts,
        (SELECT COUNT(*) FROM twitter_interactions) as interactions
    `);
    
    console.log(`   Users: ${stats[0].users}`);
    console.log(`   Posts: ${stats[0].posts}`);
    console.log(`   Interactions: ${stats[0].interactions}`);

    if (stats[0].users === '0') {
      console.log('\nNo data in database. Please import data first.\n');
      await db.close();
      return;
    }

    // Collect analysis parameters interactively
    const analysisParams = await collectAnalysisParameters();

    const targetInput: TargetInput = {
      keywords: analysisParams.topicKeywords,
      hashtags: ['#TechTwitterPH'],
      industrySector: 'Technology',
      communityOrRegion: 'Philippines'
    };

    console.log('\nValidating parameters...');
    const validation = await controller.initializeAnalysis(targetInput, analysisParams);

    if (!validation.readyForProcessing) {
      console.log('\nValidation failed:');
      console.log('Errors:', validation.validationResult.errors);
      await db.close();
      return;
    }

    console.log('Parameters validated!\n');

    console.log('Fetching relevant data...');
    const data = await controller.fetchRelevantData(targetInput, analysisParams);
    
    console.log(`Fetched ${data.users.length} users`);
    console.log(`Fetched ${data.posts.length} relevant posts`);
    console.log(`Fetched ${data.interactions.length} interactions\n`);

    if (data.users.length === 0) {
      console.log('No users found. Try adjusting your parameters.\n');
      await db.close();
      await sentimentAdapter.close();
      return;
    }

    // Check sentiment coverage
    console.log('Checking sentiment pipeline coverage...');
    const postIds = data.posts.map(p => p.post_id);
    const coverage = await sentimentAdapter.checkSentimentCoverage(postIds);
    console.log(`   Sentiment coverage: ${coverage.withSentiment}/${coverage.total} posts (${coverage.coverage.toFixed(1)}%)`);
    
    if (coverage.coverage < 50) {
      console.log(`   ⚠️  Warning: Less than 50% sentiment coverage. Run Deep_Translator.ipynb and Vader_Pipeline.ipynb first!\n`);
    } else {
      console.log(`   ✓ Sentiment coverage is good!\n`);
    }

    const sentimentStats = await sentimentAdapter.getSentimentStatistics();
    console.log(`   Total sentiment scores: ${sentimentStats.total}`);
    console.log(`   Positive: ${sentimentStats.positive} | Neutral: ${sentimentStats.neutral} | Negative: ${sentimentStats.negative}`);
    console.log(`   Average sentiment: ${sentimentStats.avgSentiment.toFixed(4)}\n`);

    // ===== PREPARE COMPONENTS FOR ITERATIVE ALGORITHM =====

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   PREPARING ALGORITHM COMPONENTS                   ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    const currentDate = new Date();

    // Step 1: Compute engagement scores
    console.log('[1/4] Computing engagement scores with temporal decay...');
    const engagementScores = data.posts.map(post => 
      InfluentAlgorithm.computeEngagementScore(
        post,
        analysisParams.weightPreferences,
        analysisParams.temporalDecay,
        currentDate
      )
    );
    console.log(`      Computed ${engagementScores.length} engagement scores\n`);

    // Step 2: Build connection graph
    console.log('[2/4] Building interaction graph...');
    const connectionMap = InfluentAlgorithm.buildInteractionGraph(
      data.users,
      data.interactions,
      analysisParams.timeWindow
    );
    console.log(`      Built graph with connections for ${connectionMap.size} users\n`);

    // Step 3: Aggregate per-user scores
    console.log('[3/4] Aggregating user-level components...');
    const userEngagementMap = new Map<string, number>();
    const userSentimentMap = new Map<string, number>();
    const userDisplayNames = new Map<string, string>();
    
    // Fetch real VADER sentiment scores in bulk
    const userIds = data.users.map(u => u.user_id);
    const bulkSentiment = await sentimentAdapter.getBulkUserAverageSentiment(userIds);
    console.log(`      Fetched sentiment scores for ${bulkSentiment.size} users from VADER pipeline`);
    
    for (const user of data.users) {
      const engagement = InfluentAlgorithm.aggregateUserEngagement(
        user.user_id,
        engagementScores
      );
      userEngagementMap.set(user.user_id, engagement);
      
      // Use real VADER sentiment (normalized to [0, 1])
      const sentiment = bulkSentiment.get(user.user_id) || 0.5;
      userSentimentMap.set(user.user_id, sentiment);
      
      userDisplayNames.set(user.user_id, user.display_name);
    }
    console.log(`      Aggregated components for ${data.users.length} users\n`);

    // Step 4: Prepare connection weight matrix for iteration
    console.log('[4/4] Preparing connection weight matrix...');
    const connectionWeightMatrix = new Map<string, Map<string, number>>();
    
    for (const [userId, connections] of connectionMap) {
      const userConnections = new Map<string, number>();
      for (const conn of connections) {
        userConnections.set(conn.to_user, conn.connection_weight);
      }
      connectionWeightMatrix.set(userId, userConnections);
    }
    console.log(`      Matrix prepared for ${connectionWeightMatrix.size} users\n`);

    // ===== RUN ITERATIVE CONVERGENCE =====

    // userIds already declared on line 138
    
    const convergenceResult = InfluentIterativeAlgorithm.computeWithConvergence(
      userIds,
      userDisplayNames,
      connectionWeightMatrix,
      userSentimentMap,
      userEngagementMap,
      0.85,    // Dampening factor (d)
      1e-5,    // Convergence threshold (ε)
      100      // Max iterations
    );

    // ===== DISPLAY RESULTS =====

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   FINAL INFLUENT RANKINGS                          ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // Get final rankings
    const finalRankings = Array.from(convergenceResult.finalScores.entries())
      .map(([user_id, score]) => ({
        user_id,
        display_name: userDisplayNames.get(user_id) || user_id,
        influent_score: score,
        sentiment: userSentimentMap.get(user_id) || 0,
        engagement: userEngagementMap.get(user_id) || 0,
        connections: connectionWeightMatrix.get(user_id)?.size || 0,
        followers: data.users.find(u => u.user_id === user_id)?.followers || 0
      }))
      .sort((a, b) => b.influent_score - a.influent_score);

    // Display top 10
    const top10 = finalRankings.slice(0, 10);
    
    console.log(`Rank | User                     | INFLUENT Score | Sentiment | Engagement | Connections | Followers`);
    console.log(`─────────────────────────────────────────────────────────────────────────────────────────────────────`);
    
    top10.forEach((user, index) => {
      const rank = (index + 1).toString().padStart(4);
      const name = user.display_name.substring(0, 24).padEnd(24);
      const score = user.influent_score.toFixed(6);
      const sentiment = user.sentiment.toFixed(4);
      const engagement = user.engagement.toFixed(4);
      const connections = user.connections.toString().padStart(11);
      const followers = user.followers.toLocaleString().padStart(9);
      
      console.log(`${rank} | ${name} | ${score}     | ${sentiment}  | ${engagement}   | ${connections} | ${followers}`);
    });

    console.log(`─────────────────────────────────────────────────────────────────────────────────────────────────────\n`);

    // Display convergence statistics
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   CONVERGENCE STATISTICS                           ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    
    console.log(`Total Iterations: ${convergenceResult.iterations}`);
    console.log(`Converged: ${convergenceResult.converged ? 'Yes' : 'No'}`);
    console.log(`Final Max Delta: ${convergenceResult.convergenceLog[convergenceResult.convergenceLog.length - 1].maxDelta.toExponential(6)}`);
    console.log(`Mean Final Score: ${convergenceResult.convergenceLog[convergenceResult.convergenceLog.length - 1].meanScore.toFixed(6)}`);
    
    console.log('\n✓ Convergence logs saved to ./logs/ directory\n');
    
    console.log('Analysis complete!\n');

    await db.close();
    await sentimentAdapter.close();

  } catch (error) {
    console.error('\nError during analysis:', error);
    await db.close();
    await sentimentAdapter.close();
  }
}

runIterativeAnalysis();