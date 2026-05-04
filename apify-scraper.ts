// INFLUENT - Keyword-based Twitter Scraper (Using Actor: 61RPP7dywgiy0JPD0)

import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import { createDatabaseConnection } from './database-adapter.ts';

interface ScrapeConfig {
  keywords: string[];
  minFollowers: number;
  minAvgLikes: number;
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

export async function runApifyScrape(config: ScrapeConfig): Promise<void> {
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    throw new Error('APIFY_API_TOKEN not found in .env file');
  }

  const client = new ApifyClient({ token: apiToken });
  const db = createDatabaseConnection();

  console.log('\n🔍 INFLUENT Keyword Search Scraper');
  console.log('=====================================');
  console.log(`Keywords: ${config.keywords.join(', ')}`);
  console.log(`Language: ${config.language}`);
  console.log(`Min followers: ${config.minFollowers}`);
  console.log(`Min avg likes: ${config.minAvgLikes}`);
  console.log(`Max items: ${config.maxItems}`);
  console.log('=====================================\n');

  try {
    // Build search terms from keywords
    const searchTerms = config.keywords.map(keyword => keyword.trim());

    const actorInput = {
      searchTerms: searchTerms,
      maxItems: config.maxItems,
      language: config.language,
      conversationDepth: 1,
      minimumFavorites: config.minAvgLikes,
      minimumRetweets: 0,
      onlyImage: false,
      onlyQuote: false,
      onlyTwitterBlue: false,
      onlyVerifiedUsers: false,
      onlyVideo: false
    };

    console.log('📊 Apify Actor Input:');
    console.log(JSON.stringify(actorInput, null, 2));
    console.log('\n⏳ Starting scrape...\n');

    // Call the Tweet Scraper actor
    const run = await client.actor('61RPP7dywgiy0JPD0').call(actorInput, {
      waitSecs: 300 // Wait up to 5 minutes
    });

    if (run.status !== 'SUCCEEDED' || !run.defaultDatasetId) {
      throw new Error(`Scrape failed with status: ${run.status}`);
    }

    // Fetch results from dataset
    const dataset = client.dataset(run.defaultDatasetId);
    const { items } = await dataset.listItems();

    console.log(`✅ Scraped ${items.length} tweets\n`);

    // Process and filter results
    const users: ApifyAuthor[] = [];
    const posts: ApifyPost[] = [];
    const interactions: any[] = [];
    const scrapedAt = new Date().toISOString();
    const seenUsers = new Set<string>();

    for (const item of items as unknown as ApifyPost[]) {
      const author = item.author;

      // Filter by follower count
      if (author && author.followers < config.minFollowers) {
        continue;
      }

      // Store unique users (use user ID)
      if (author?.id && !seenUsers.has(author.id)) {
        users.push(author);
        seenUsers.add(author.id);
      }

      // Store posts
      posts.push(item);

      const fromUser = author?.id;
      const postId = item.id;
      const createdAt = item.createdAt;

      if (!fromUser || !postId) continue;

      // Extract interactions
      // 1. Replies
      if (item.isReply && item.inReplyToUsername) {
        interactions.push({
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
        const toUser = item.retweet?.author?.id;
        if (toUser) {
          interactions.push({
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
          interactions.push({
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

    console.log(`📊 Results:`);
    console.log(`   ${users.length} unique users`);
    console.log(`   ${posts.length} posts`);
    console.log(`   ${interactions.length} interactions\n`);

    // Insert into database
    console.log('💾 Inserting into database...\n');

    // 1. Insert users
    for (const user of users) {
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
        user.id, user.name, user.isVerified, user.isBlueVerified,
        user.description, user.location, user.followers, user.following, scrapedAt,
        user.mediaCount, user.profilePicture, user.statusesCount, user.favouritesCount
      ]);
    }
    console.log(`✓ Inserted ${users.length} users`);

    // 2. Insert stub users for interaction targets
    const scrapedUserIds = new Set(users.map(u => u.id));
    const stubUserIds = new Set(
      interactions
        .map(i => i.to_user)
        .filter(u => !scrapedUserIds.has(u))
    );

    for (const userId of stubUserIds) {
      await db.executeQuery(`
        INSERT INTO twitter_users (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId]);
    }
    console.log(`✓ Inserted ${stubUserIds.size} stub users`);

// 3. Insert posts
for (const post of posts) {
  // Skip posts without author ID
  if (!post.author?.id) {
    console.log(`⚠️  Skipping post ${post.id} - no author ID`);
    continue;
  }
  
  await db.executeQuery(`
    INSERT INTO twitter_posts (
      post_id, user_id, content, created_at,
      like_count, reply_count, retweet_count, scraped_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (post_id) DO NOTHING
  `, [
    post.id, post.author.id, post.fullText, post.createdAt,
        post.likeCount, post.replyCount, post.retweetCount, scrapedAt
      ]);
    }
    console.log(`✓ Inserted ${posts.length} posts`);

    // 4. Insert interactions
    for (const interaction of interactions) {
      await db.executeQuery(`
        INSERT INTO twitter_interactions (
          from_user, to_user, post_id, interaction_type, created_at
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [
        interaction.from_user, interaction.to_user, interaction.post_id,
        interaction.interaction_type, interaction.created_at
      ]);
    }
    console.log(`✓ Inserted ${interactions.length} interactions\n`);

    await db.close();
    console.log('🎉 Scraping complete!\n');

  } catch (error: any) {
    console.error('❌ Scrape error:', error);
    await db.close();
    throw error;
  }
}