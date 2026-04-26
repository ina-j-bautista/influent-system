//######## APIFY SCRAPER INTEGRATION FOR INFLUENT #########################

import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import { createDatabaseConnection } from './database-adapter';

interface ScrapeConfig {
  keywords: string[];
  minFollowers: number;
  minAvgLikes: number;
  startDate?: string;
  endDate?: string;
  language: string;
  maxItems: number;
  maxTweets?: number;
  maxProfiles?: number;
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

export class ApifyScraper {
  private client: ApifyClient;
  private db: ReturnType<typeof createDatabaseConnection>;
  
  constructor(apiToken: string) {
    this.client = new ApifyClient({ token: apiToken });
    this.db = createDatabaseConnection();
  }

  private isKeywordRelevant(text: string, keywords: string[]): boolean {
    const textLower = text.toLowerCase();
    return keywords.some(keyword => textLower.includes(keyword.toLowerCase()));
  }

  /**
   * Phase 1: Initial keyword search to find candidate users
   */
  async phaseOneSearch(config: ScrapeConfig): Promise<string[]> {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║   PHASE 1: KEYWORD SEARCH                          ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    
    console.log(`Keywords: ${config.keywords.join(', ')}`);
    console.log(`Min followers: ${config.minFollowers}`);
    console.log(`Min avg likes: ${config.minAvgLikes}`);
    console.log(`Language: ${config.language}\n`);

    const actorInput = {
      searchTerms: config.keywords,
      start: config.startDate || '',
      end: config.endDate || '',
      includeUserInfo: true,
      maxItems: config.maxItems,
      tweetsDesired: config.maxTweets || config.maxItems,
      profilesDesired: config.maxProfiles || config.maxItems,
      withReplies: false,
      sort: 'Top',
      tweetLanguage: config.language,
      proxyConfig: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] }
    };

    console.log('Starting Apify scrape...');
    const run = await this.client.actor('61RPP7dywgiy0JPD0').call({ input: actorInput });

    if (run.status !== 'SUCCEEDED' || !run.defaultDatasetId) {
      throw new Error(`Phase 1 scrape failed with status: ${run.status}`);
    }

    const topHandles = new Set<string>();
    const scrapedAt = new Date().toISOString();
    let processedItems = 0;

    const dataset = this.client.dataset(run.defaultDatasetId);
    const { items } = await dataset.listItems();
    
    for (const item of items as unknown as ApifyPost[]) {
      processedItems++;
      
      const author = item.author;
      if (!author?.userName) continue;

      const followers = author.followers || 0;
      const likes = item.likeCount || 0;
      const text = item.fullText || '';

      if (this.isKeywordRelevant(text, config.keywords) && 
          followers >= config.minFollowers && 
          likes >= config.minAvgLikes) {
        topHandles.add(author.userName);
      }
    }

    console.log(`✓ Processed ${processedItems} items`);
    console.log(`✓ Found ${topHandles.size} candidate users\n`);

    return Array.from(topHandles);
  }

  /**
   * Phase 2: Comprehensive scrape of top handles
   */
  async phaseTwoComprehensive(handles: string[]): Promise<{
    users: ApifyAuthor[];
    posts: ApifyPost[];
    interactions: any[];
  }> {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   PHASE 2: COMPREHENSIVE SCRAPE                    ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log(`Scraping ${handles.length} users in depth...\n`);

    const actorInput = {
      twitterHandles: handles,
      maxItems: handles.length * 20,
      tweetsDesired: handles.length * 20,
      profilesDesired: handles.length,
      withReplies: true,
      sort: 'Top',
      tweetLanguage: 'en',
      includeUserInfo: true
    };

    const run = await this.client.actor('61RPP7dywgiy0JPD0').call({ input: actorInput });

    if (!run.defaultDatasetId) {
      throw new Error('Phase 2 scrape failed - no dataset ID');
    }

    const users: ApifyAuthor[] = [];
    const posts: ApifyPost[] = [];
    const interactions: any[] = [];
    const scrapedAt = new Date().toISOString();
    const seenUsers = new Set<string>();

    const dataset = this.client.dataset(run.defaultDatasetId);
    const { items } = await dataset.listItems();

    for (const item of items as unknown as ApifyPost[]) {
      const author = item.author;
      
      // Store unique users
      if (author?.userName && !seenUsers.has(author.userName)) {
        users.push(author);
        seenUsers.add(author.userName);
      }

      // Store posts
      posts.push(item);

      const fromUser = author?.userName;
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
        const toUser = item.retweet?.author?.userName;
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

    console.log(`✓ Collected ${users.length} unique users`);
    console.log(`✓ Collected ${posts.length} posts`);
    console.log(`✓ Collected ${interactions.length} interactions\n`);

    return { users, posts, interactions };
  }

  /**
   * Insert scraped data into Neon database
   */
  async insertToDatabase(data: {
    users: ApifyAuthor[];
    posts: ApifyPost[];
    interactions: any[];
  }): Promise<void> {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   INSERTING DATA TO DATABASE                       ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    const scrapedAt = new Date().toISOString();

    try {
      // 1. Insert users (full data)
      console.log('Inserting users...');
      for (const user of data.users) {
        await this.db.executeQuery(`
          INSERT INTO twitter_users (
            user_name, display_name, user_id, is_verified, is_blue_verified,
            bio, location, followers, following, scraped_at,
            media_count, profile_picture, statuses_count, favourites_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (user_id) DO UPDATE SET
            followers = EXCLUDED.followers,
            following = EXCLUDED.following,
            bio = EXCLUDED.bio,
            scraped_at = EXCLUDED.scraped_at
        `, [
          user.userName, user.name, user.id, user.isVerified, user.isBlueVerified,
          user.description, user.location, user.followers, user.following, scrapedAt,
          user.mediaCount, user.profilePicture, user.statusesCount, user.favouritesCount
        ]);
      }
      console.log(`✓ Inserted/updated ${data.users.length} users\n`);

      // 2. Insert stub users (interaction targets not in scraped users)
      const scrapedUsernames = new Set(data.users.map(u => u.userName));
      const stubUsernames = new Set(
        data.interactions
          .map(i => i.to_user)
          .filter(u => !scrapedUsernames.has(u))
      );

      console.log('Inserting stub users...');
      for (const username of stubUsernames) {
        await this.db.executeQuery(`
          INSERT INTO twitter_users (user_name, user_id)
          VALUES ($1, $2)
          ON CONFLICT (user_name) DO NOTHING
        `, [username, username]);
      }
      console.log(`✓ Inserted ${stubUsernames.size} stub users\n`);

      // 3. Insert posts
      console.log('Inserting posts...');
      for (const post of data.posts) {
        await this.db.executeQuery(`
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
      console.log(`✓ Inserted ${data.posts.length} posts\n`);

      // 4. Insert interactions
      console.log('Inserting interactions...');
      for (const interaction of data.interactions) {
        await this.db.executeQuery(`
          INSERT INTO twitter_interactions (
            from_user, to_user, post_id, interaction_type, created_at
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT DO NOTHING
        `, [
          interaction.from_user, interaction.to_user, interaction.post_id,
          interaction.interaction_type, interaction.created_at
        ]);
      }
      console.log(`✓ Inserted ${data.interactions.length} interactions\n`);

      console.log('✅ All data successfully inserted to database!\n');

    } catch (error) {
      console.error('❌ Error inserting data:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

/**
 * Run complete scraping workflow
 */
export async function runApifyScrape(config: ScrapeConfig): Promise<void> {
  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    throw new Error('APIFY_API_TOKEN not found in .env file');
  }

  const scraper = new ApifyScraper(apiToken);

  try {
    // Phase 1: Find candidate users
    const topHandles = await scraper.phaseOneSearch(config);

    if (topHandles.length === 0) {
      console.log('No users found matching criteria. Try adjusting filters.\n');
      await scraper.close();
      return;
    }

    // Phase 2: Comprehensive scrape
    const data = await scraper.phaseTwoComprehensive(topHandles);

    // Insert to database
    await scraper.insertToDatabase(data);

    await scraper.close();
    console.log('Scraping workflow complete! ✅\n');

  } catch (error) {
    console.error('Error during scrape:', error);
    await scraper.close();
    throw error;
  }
}
