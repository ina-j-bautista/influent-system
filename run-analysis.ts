//######## RUN INFLUENT ANALYSIS #########################

/*hello! this is our current working file for our 30% progress.

there is some in-line documentation on the parts of the program;

Our 30% metric:
   - Working Set of Mock Data
   - Mock data is able to be pushed onto the cloud(Neon) via Postgre
   - Program is able to retrieve mock data fetch the data from the cloud
   - Data is able to be read, analyzed and ready for computation
   - (Not in this folder) Feasable progress on API tool to connect users apify 
      account to the system (this is where we will be getting the real data.)

thank you!

- ina, chorong, arki

*/


//#########################################################

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

      // ############# helo these are placeholder keywords until i get the user input working
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

      // ############# helo these are placeholder keywords until i get the user input working
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
    console.log(`Fetched ${data.posts.length} posts`);
    console.log(`Fetched ${data.interactions.length} interactions\n`);

    // ######### SHOW USERS ################################
    if (data.users.length > 0) {
      console.log('Users:');
      data.users.slice(0, data.users.length).forEach(user => {
        console.log(`   - ${user.display_name} (@${user.user_id})`);
        console.log(`     Followers: ${user.followers.toLocaleString()} | Verified: ${user.is_verified ? '✓' : '✗'}`);
      });
      console.log();
    }

    // ################# POSTS #####################################
    if (data.posts.length > 0) {
      console.log('Posts:');
      data.posts.slice(0, data.posts.length).forEach(post => {
        const preview = post.content.length > 80 
          ? post.content.substring(0, 80) + '...' 
          : post.content;
        console.log(`   - ${preview}`);
        console.log(`     Likes: ${post.like_count} | Replies: ${post.reply_count} | Retweets: ${post.retweet_count}`);
      });
      console.log();
    }

    // ######## !!!!!!!! PLACEHOLDER IT DOENST DO STUFF YET #############
    console.log('Computing INFLUENT scores for top users...\n');
    
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
        console.log(`${user.display_name} (@${user.user_id})`);
        console.log(`   Sentiment: ${score.sentiment_component.toFixed(3)}`);
        console.log(`   Engagement: ${score.engagement_component.toFixed(3)}`);
        console.log(`   Connection: ${score.connection_component.toFixed(3)}`);
        console.log(`     INFLUENT Score: ${score.influent_score.toFixed(3)}\n`);
      }
    }


    await db.close();

  } catch (error) {
    console.error('\nError during analysis:', error);
    await db.close();
  }
}

runAnalysis();
