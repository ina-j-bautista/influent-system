//######## RUN INFLUENT ANALYSIS WITH ALGORITHM #########################

import 'dotenv/config';
import { 
  InfluentCoreController,
  TargetInput,
} from './influent-core';
import { createDatabaseConnection } from './database-adapter';
import { collectAnalysisParameters } from './parameter-input';
import { InfluentAlgorithm } from './influent-algorithm';

async function runAnalysisWithAlgorithm() {
  console.log('INFLUENT Analysis System\n');

  const db = createDatabaseConnection();
  const controller = new InfluentCoreController(db);

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
      return;
    }

    // ===== ALGORITHM IMPLEMENTATION =====

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   COMPUTING INFLUENT SCORES                        ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    const currentDate = new Date();

    // Step 1: Compute engagement scores for all posts
    console.log('[1/5] Computing engagement scores with temporal decay...');
    const engagementScores = data.posts.map(post => 
      InfluentAlgorithm.computeEngagementScore(
        post,
        analysisParams.weightPreferences,
        analysisParams.temporalDecay,
        currentDate
      )
    );
    console.log(`      Computed ${engagementScores.length} engagement scores\n`);

    // Step 2: Build interaction graph and compute connection weights
    console.log('[2/5] Building interaction graph and computing connection weights...');
    const connectionMap = InfluentAlgorithm.buildInteractionGraph(
      data.users,
      data.interactions,
      analysisParams.timeWindow
    );
    
    const totalConnections = Array.from(connectionMap.values())
      .reduce((sum, connections) => sum + connections.length, 0);
    console.log(`      Built graph with ${totalConnections} weighted connections\n`);

    // Step 3: Aggregate scores per user
    console.log('[3/5] Aggregating user-level components...');
    const userScores = data.users.map(user => {
      const engagement = InfluentAlgorithm.aggregateUserEngagement(
        user.user_id,
        engagementScores
      );
      
      const connection = InfluentAlgorithm.aggregateUserConnections(
        user.user_id,
        connectionMap
      );
      
      const sentiment = InfluentAlgorithm.demoSentimentComponent(user.user_id);
      
      return {
        user_id: user.user_id,
        display_name: user.display_name,
        followers: user.followers,
        engagement,
        connection,
        sentiment
      };
    });
    console.log(`      Aggregated scores for ${userScores.length} users\n`);

    // Step 4: Normalize components
    console.log('[4/5] Normalizing component scores...');
    const sentiments = userScores.map(u => u.sentiment);
    const engagements = userScores.map(u => u.engagement);
    const connections = userScores.map(u => u.connection);

    const normalizedSentiments = InfluentAlgorithm.normalizeScores(sentiments);
    const normalizedEngagements = InfluentAlgorithm.normalizeScores(engagements);
    const normalizedConnections = InfluentAlgorithm.normalizeScores(connections);
    console.log('      Components normalized to [0, 1] range\n');

    // Step 5: Compute final INFLUENT scores
    console.log('[5/5] Computing final INFLUENT scores...');
    
    // Component weights (different from engagement weights)
    // Default: equal importance to all three components
    const componentWeights = {
      ws: 0.33,  // Sentiment
      wc: 0.34,  // Connection
      wi: 0.33   // Engagement (Interaction)
    };

    const influentScores = userScores.map((user, index) => 
      InfluentAlgorithm.computeInfluentScore(
        user.user_id,
        normalizedSentiments[index],
        normalizedEngagements[index],
        normalizedConnections[index],
        componentWeights
      )
    );

    // Sort by INFLUENT score
    const rankedUsers = influentScores
      .map((score, index) => ({
        ...score,
        display_name: userScores[index].display_name,
        followers: userScores[index].followers
      }))
      .sort((a, b) => b.influent_score - a.influent_score);

    console.log(`      Computed and ranked ${rankedUsers.length} users\n`);

    // ===== DISPLAY RESULTS =====

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║   TOP 10 INFLUENCERS                               ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    const top10 = rankedUsers.slice(0, 10);
    
    top10.forEach((user, index) => {
      console.log(`${index + 1}. ${user.display_name} (@${user.user_id})`);
      console.log(`   Followers: ${user.followers.toLocaleString()}`);
      console.log(`   Sentiment Component:   ${user.sentiment_component.toFixed(4)}`);
      console.log(`   Engagement Component:  ${user.engagement_component.toFixed(4)}`);
      console.log(`   Connection Component:  ${user.connection_component.toFixed(4)}`);
      console.log(`   ═══════════════════════════════════════════════`);
      console.log(`   INFLUENT Score:        ${user.influent_score.toFixed(4)}\n`);
    });

    // Show comparison with follower ranking
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║   INFLUENT vs FOLLOWER RANKING COMPARISON          ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    const followerRanked = rankedUsers
      .slice()
      .sort((a, b) => b.followers - a.followers)
      .slice(0, 10);

    console.log('INFLUENT Ranking          |  Follower Ranking');
    console.log('─────────────────────────────────────────────────────');
    
    for (let i = 0; i < 10; i++) {
      const influentUser = top10[i];
      const followerUser = followerRanked[i];
      
      const influentName = influentUser.display_name.substring(0, 20).padEnd(20);
      const followerName = followerUser.display_name.substring(0, 20).padEnd(20);
      
      console.log(`${i+1}. ${influentName} | ${i+1}. ${followerName}`);
    }

    console.log('\nAnalysis complete!\n');

    await db.close();

  } catch (error) {
    console.error('\nError during analysis:', error);
    await db.close();
  }
}

runAnalysisWithAlgorithm();
