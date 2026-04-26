//######## RUN INFLUENT ANALYSIS #########################

/*
hello just a note; despite the name of this file, this is NOT our
current working file. this is the file we are continuing to make progress
in post 30% completion, however while working on it further some things are broken.

this file also does not have any in-line documentation as of yet.

our system progress is in the run-analysys.ts file.

thank you!

-ina, chorong, arki

*/



//###########################################################

import 'dotenv/config';
import { 
  InfluentCoreController,
  TargetInput,
  AnalysisParameters 
} from './influent-core';
import { createDatabaseConnection } from './database-adapter';

async function runAnalysis() {
  console.log('Starting Influent Analysis...\n');

  const db = createDatabaseConnection();
  const controller = new InfluentCoreController(db);

  try {
    const isConnected = await db.testConnection();
    if (!isConnected) {
      console.error('Database connection failed');
      return;
    }
    console.log();

    console.log('Checking database contents...');
    const stats = await db.executeQuery(`
      SELECT 
        (SELECT COUNT(*) FROM twitter_users) as users,
        (SELECT COUNT(*) FROM twitter_posts) as posts,
        (SELECT COUNT(*) FROM twitter_interactions) as interactions,
        (SELECT COUNT(*) FROM sentiment_scores) as sentiments
    `);
    
    console.log(`   Users: ${stats[0].users}`);
    console.log(`   Posts: ${stats[0].posts}`);
    console.log(`   Interactions: ${stats[0].interactions}`);
    console.log(`   Sentiment Scores: ${stats[0].sentiments}\n`);

    if (stats[0].users === '0') {
      console.log('No data in database. Run insert-sample-data.ts first or import your data.\n');
      await db.close();
      return;
    }

    const targetInput: TargetInput = {
      keywords: ['tech', 'blockchain', 'developer'],
      hashtags: ['#TechTwitter'],
      industrySector: 'Technology',
      communityOrRegion: 'Philippines'
    };

    const analysisParams: AnalysisParameters = {
      timeWindow: {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31')
      },
      topicKeywords: ['blockchain', 'nft', 'github', 'python', 'javascript'],
      regionAudience: 'Philippines',
      weightPreferences: {
        ws: 0.3,  
        wc: 0.4,  
        wi: 0.3   
      },
      sentimentImportance: 0.85,
      temporalDecay: 0.5
    };

    console.log('Validating parameters...');
    const validation = await controller.initializeAnalysis(targetInput, analysisParams);

    if (!validation.readyForProcessing) {
      console.log('\nValidation failed:');
      console.log('Errors:', validation.validationResult.errors);
      console.log('Warnings:', validation.validationResult.warnings);
      await db.close();
      return;
    }

    console.log('Parameters validated!\n');

    if (validation.validationResult.warnings.length > 0) {
      console.log('Warnings:');
      validation.validationResult.warnings.forEach(w => console.log(`   - ${w}`));
      console.log();
    }

    console.log('Fetching relevant data...');
    const data = await controller.fetchRelevantData(targetInput, analysisParams);
    
    console.log(`Fetched ${data.users.length} users`);
    console.log(`Fetched ${data.posts.length} relevant posts`);
    console.log(`Fetched ${data.interactions.length} interactions\n`);

    // ######### SHOW USERS ################################
    if (data.users.length > 0) {
      console.log('Top 5 Users:');
      data.users.slice(0, 5).forEach(user => {
        console.log(`   - ${user.display_name} (@${user.user_id})`);
        console.log(`     Followers: ${user.followers.toLocaleString()} | Verified: ${user.is_verified ? '✓' : '✗'}`);
      });
      console.log();
    }

    // ################# RELEVANT POSTS #####################################
    if (data.posts.length > 0) {
      console.log('Sample Relevant Posts (matched keywords):');
      data.posts.slice(0, 3).forEach(post => {
        const preview = post.content.length > 80 
          ? post.content.substring(0, 80) + '...' 
          : post.content;
        console.log(`   - ${preview}`);
        console.log(`     Likes: ${post.like_count} | Replies: ${post.reply_count} | Retweets: ${post.retweet_count}`);
      });
      console.log();
    }

    // ################# NON-RELEVANT POSTS SAMPLE #####################################
    console.log('Sample Non-Relevant Posts (did NOT match keywords):');
    const allPostsSample = await db.executeQuery(`
      SELECT post_id, user_id, content, created_at, like_count, reply_count, retweet_count
      FROM twitter_posts
      WHERE created_at >= $1 AND created_at <= $2
      ORDER BY RANDOM()
      LIMIT 20
    `, [analysisParams.timeWindow.startDate, analysisParams.timeWindow.endDate]);
    
    const relevantPostIds = new Set(data.posts.map(p => p.post_id));
    const nonRelevantPosts = allPostsSample.filter((p: any) => !relevantPostIds.has(p.post_id)).slice(0, 5);
    
    if (nonRelevantPosts.length > 0) {
      nonRelevantPosts.forEach((post: any) => {
        const preview = post.content.length > 80 
          ? post.content.substring(0, 80) + '...' 
          : post.content;
        console.log(`   - ${preview}`);
        console.log(`     Likes: ${post.like_count} | Replies: ${post.reply_count} | Retweets: ${post.retweet_count}`);
      });
    } else {
      console.log('   (All sampled posts matched keywords)');
    }
    console.log();

    // ######## INFLUENT SCORES #############
    console.log('Computing INFLUENT scores for top 5 users...\n');
    
    const topUsers = data.users
      .sort((a, b) => b.followers - a.followers)
      .slice(0, 5);

    for (const user of topUsers) {
      const score = await db.computeInfluentScore(
        user.user_id,
        analysisParams.weightPreferences.ws,
        analysisParams.weightPreferences.wc,
        analysisParams.weightPreferences.wi
      );

      if (score) {
        console.log(`   ${user.display_name} (@${user.user_id})`);
        console.log(`   Sentiment: ${score.sentiment_component.toFixed(3)}`);
        console.log(`   Engagement: ${score.engagement_component.toFixed(3)}`);
        console.log(`   Connection: ${score.connection_component.toFixed(3)}`);
        console.log(`    INFLUENT Score: ${score.influent_score.toFixed(3)}\n`);
      }
    }

    console.log('✨ Analysis complete!\n');

    await db.close();

  } catch (error) {
    console.error('\nError during analysis:', error);
    await db.close();
  }
}

runAnalysis();