// INFLUENT - Two-Phase Twitter Scraper (Based on Original Notebook)
// Phase 1: Keyword search → Filter by relevance + engagement → Extract handles
// Phase 2: Deep scrape those handles for full data

import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import { createDatabaseConnection } from './database-adapter.ts';

interface ScrapeConfig {
  keywords: string[];
  minFollowers: number;
  minAvgLikes: number;
  maxAccounts?: number;
  tweetsPerAccount?: number;
  startDate?: string;
  endDate?: string;
  language: string;
  maxItems: number;
}

interface ApifyAuthor {
  userName: string;
  name: string;
  id: string;
  isVerified: boolean;
  isBlueVerified: boolean;
  description: string;
  location: string;
  followers: number;
  following: number;
  mediaCount: number;
  profilePicture: string;
  statusesCount: number;
  favouritesCount: number;
}

interface ApifyPost {
  id: string;
  author: ApifyAuthor;
  fullText: string;
  createdAt: string;
  likeCount: number;
  replyCount: number;
  retweetCount: number;
  isReply: boolean;
  inReplyToUsername?: string;
  isRetweet: boolean;
  retweet?: {
    author?: ApifyAuthor;
  };
  entities?: {
    user_mentions?: Array<{ screen_name: string }>;
  };
}

/**
 * Check if tweet text contains any of the keywords (case-insensitive)
 */
function isKeywordRelevant(text: string, keywords: string[]): boolean {
  const textLower = text.toLowerCase();
  return keywords.some(keyword => textLower.includes(keyword.toLowerCase()));
}

export async function runApifyScrape(config: ScrapeConfig): Promise<void> {
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    throw new Error('APIFY_API_TOKEN not found in .env file');
  }

  const client = new ApifyClient({ token: apiToken });
  const db = createDatabaseConnection();
  const scrapedAt = new Date().toISOString();

  console.log('\n🔍 INFLUENT Two-Phase Keyword Scraper');
  console.log('=====================================');
  console.log(`Keywords: ${config.keywords.join(', ')}`);
  console.log(`Language: ${config.language}`);
  console.log(`Min followers: ${config.minFollowers}`);
  console.log(`Min avg likes: ${config.minAvgLikes}`);
  console.log(`Max items: ${config.maxItems}`);
  console.log('=====================================\n');

  try {
    const searchTerms = config.keywords.map(k => k.trim());

    // ============================================================
    // PHASE 1: Keyword Search + Engagement Filtering
    // ============================================================
    console.log('📍 PHASE 1: Finding relevant accounts...\n');

    const phase1Input = {
      searchTerms: searchTerms,
      start: config.startDate || '',
      end: config.endDate || '',
      includeUserInfo: true,
      maxItems: config.maxItems,
      tweetsDesired: config.maxItems,
      profilesDesired: config.maxItems,
      withReplies: false,
      sort: 'Top',  // CRITICAL: Get popular tweets with engagement!
      tweetLanguage: config.language,
      proxyConfig: {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL']
      }
    };

    console.log('📊 Phase 1 Actor Input:');
    console.log(JSON.stringify(phase1Input, null, 2));
    console.log('');

    const topHandles = new Set<string>();
    const phase1Posts: ApifyPost[] = [];

    // Use the specific working build from the notebook (April 2026)
    const run1 = await client.actor('61RPP7dywgiy0JPD0').call(phase1Input, {
      build: '31elnP638AwzJf2cm',
      waitSecs: 300
    });

    if (run1.status === 'SUCCEEDED' && run1.defaultDatasetId) {
      const dataset1 = client.dataset(run1.defaultDatasetId);
      const { items: items1 } = await dataset1.listItems();

      console.log(`✅ Phase 1: Scraped ${items1.length} tweets\n`);

      for (const item of items1 as unknown as ApifyPost[]) {
        const author = item.author;
        const userName = author?.userName;
        
        if (!userName) continue;

        phase1Posts.push(item);

        // Filter by keyword relevance, followers, and engagement
        if (isKeywordRelevant(item.fullText || '', searchTerms)) {
          if (author.followers >= config.minFollowers && 
              (item.likeCount || 0) >= config.minAvgLikes) {
            topHandles.add(userName);
          }
        }
      }

      console.log(`📊 Phase 1 Results:`);
      console.log(`   ${topHandles.size} relevant accounts found`);
      console.log(`   Handles: ${Array.from(topHandles).slice(0, 10).join(', ')}${topHandles.size > 10 ? '...' : ''}\n`);
    } else {
      throw new Error(`Phase 1 scrape failed with status: ${run1.status}`);
    }

    if (topHandles.size === 0) {
      console.log('⚠️  No relevant accounts found. Try adjusting filters.');
      await db.close();
      return;
    }

    // Limit to maxAccounts
    const maxAccountsToAnalyze = config.maxAccounts || 20;
    const limitedHandles = Array.from(topHandles).slice(0, maxAccountsToAnalyze);
    
    console.log(`📊 Limiting to top ${limitedHandles.length} accounts for Phase 2\n`);

    // ============================================================
    // PHASE 2: Deep Scrape Relevant Accounts
    // ============================================================
    console.log('📍 PHASE 2: Deep scraping relevant accounts...\n');

    const tweetsPerAcct = config.tweetsPerAccount || 20;
    const phase2Input = {
      handles: limitedHandles,
      tweetsDesired: tweetsPerAcct,
      proxyConfig: {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL']
      }
    };

    console.log(`📊 Phase 2: Scraping ${limitedHandles.length} accounts...`);
    console.log(`   Tweets per account: ${tweetsPerAcct}\n`);

    const run2 = await client.actor('61RPP7dywgiy0JPD0').call(phase2Input, {
      build: '31elnP638AwzJf2cm',
      waitSecs: 300
    });

    const allUsers: ApifyAuthor[] = [];
    const allPosts: ApifyPost[] = [];
    const allInteractions: any[] = [];
    const seenUserIds = new Set<string>();
    const seenPostIds = new Set<string>();

    if (run2.status === 'SUCCEEDED' && run2.defaultDatasetId) {
      const dataset2 = client.dataset(run2.defaultDatasetId);
      const { items: items2 } = await dataset2.listItems();

      console.log(`✅ Phase 2: Scraped ${items2.length} tweets\n`);

      // Combine Phase 1 + Phase 2 posts (use ALL data - already paid for it!)
      const allItems = [...phase1Posts, ...(items2 as unknown as ApifyPost[])];

      for (const item of allItems) {
        const author = item.author;
        
        if (!author?.userName) continue;

        // Store unique users
        if (!seenUserIds.has(author.userName)) {
          allUsers.push(author);
          seenUserIds.add(author.userName);
        }

        // Store unique posts
        if (!seenPostIds.has(item.id)) {
          allPosts.push(item);
          seenPostIds.add(item.id);
        }

        const fromUser = author.userName;
        const postId = item.id;
        const createdAt = item.createdAt;

        if (!fromUser || !postId) continue;

        // Extract interactions
        // 1. Replies
        if (item.isReply && item.inReplyToUsername) {
          allInteractions.push({
            from_user: fromUser,
            to_user: item.inReplyToUsername,
            post_id: postId,
            interaction_type: 'reply',
            created_at: createdAt,
            scraped_at: scrapedAt
          });
        }

        // 2. Retweets
        if (item.isRetweet) {
          const toUser = item.retweet?.author?.userName;
          if (toUser) {
            allInteractions.push({
              from_user: fromUser,
              to_user: toUser,
              post_id: postId,
              interaction_type: 'retweet',
              created_at: createdAt,
              scraped_at: scrapedAt
            });
          }
        }

        // 3. Mentions
        const mentions = item.entities?.user_mentions || [];
        for (const mention of mentions) {
          if (mention.screen_name) {
            allInteractions.push({
              from_user: fromUser,
              to_user: mention.screen_name,
              post_id: postId,
              interaction_type: 'mention',
              created_at: createdAt,
              scraped_at: scrapedAt
            });
          }
        }
      }

      console.log(`📊 Final Results:`);
      console.log(`   ${allUsers.length} unique users`);
      console.log(`   ${allPosts.length} total posts`);
      console.log(`   ${allInteractions.length} interactions\n`);
    } else {
      throw new Error(`Phase 2 scrape failed with status: ${run2.status}`);
    }

    // ============================================================
    // DATABASE INSERTION
    // ============================================================
    console.log('💾 Inserting into database...\n');

    // 1. Insert users (use userName as user_id for now - we'll fix this)
    for (const user of allUsers) {
      await db.executeQuery(`
        INSERT INTO twitter_users (
          user_id, display_name, is_verified, is_blue_verified,
          bio, location, followers, following, scraped_at,
          media_count, profile_picture, statuses_count, favourites_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (user_id) DO UPDATE SET
          followers = EXCLUDED.followers,
          following = EXCLUDED.following,
          bio = EXCLUDED.bio,
          scraped_at = EXCLUDED.scraped_at
      `, [
        user.userName,  // Use actual Twitter handle!
        user.name,
        user.isVerified,
        user.isBlueVerified,
        user.description,
        user.location,
        user.followers,
        user.following,
        scrapedAt,
        user.mediaCount,
        user.profilePicture,
        user.statusesCount,
        user.favouritesCount
      ]);
    }
    console.log(`✓ Inserted ${allUsers.length} users`);

    // 2. Insert stub users for interaction targets
    const scrapedUsernames = new Set(allUsers.map(u => u.userName));
    const stubUsernames = new Set(
      allInteractions
        .map(i => i.to_user)
        .filter(u => !scrapedUsernames.has(u))
    );

    for (const username of stubUsernames) {
      await db.executeQuery(`
        INSERT INTO twitter_users (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
      `, [username]);
    }
    console.log(`✓ Inserted ${stubUsernames.size} stub users`);

    // 3. Insert posts
    for (const post of allPosts) {
      if (!post.author?.userName) {
        console.log(`⚠️  Skipping post ${post.id} - no author username`);
        continue;
      }

      await db.executeQuery(`
        INSERT INTO twitter_posts (
          post_id, user_id, content, created_at,
          like_count, reply_count, retweet_count, scraped_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (post_id) DO NOTHING
      `, [
        post.id,
        post.author.userName,  // Use username as user_id
        post.fullText,
        post.createdAt,
        post.likeCount || 0,
        post.replyCount || 0,
        post.retweetCount || 0,
        scrapedAt
      ]);
    }
    console.log(`✓ Inserted ${allPosts.length} posts`);

    // 4. Insert interactions
    for (const interaction of allInteractions) {
      await db.executeQuery(`
        INSERT INTO twitter_interactions (
          from_user, to_user, post_id, interaction_type, created_at
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [
        interaction.from_user,
        interaction.to_user,
        interaction.post_id,
        interaction.interaction_type,
        interaction.created_at
      ]);
    }
    console.log(`✓ Inserted ${allInteractions.length} interactions\n`);

    await db.close();
    console.log('🎉 Scraping complete!\n');

  } catch (error: any) {
    console.error('❌ Scrape error:', error);
    await db.close();
    throw error;
  }
}