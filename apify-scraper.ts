//######## APIFY SCRAPER - WORKING VERSION #########################

import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import { createDatabaseConnection } from './database-adapter.js';

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

export class ApifyScraper {
  private client: ApifyClient;
  private db: ReturnType<typeof createDatabaseConnection>;
  
  constructor(apiToken: string) {
    this.client = new ApifyClient({ token: apiToken });
    this.db = createDatabaseConnection();
  }

  async phaseOneSearch(config: ScrapeConfig): Promise<string[]> {
    console.log('\n🔍 PHASE 1: Finding relevant accounts...\n');

    const keywordHandles: { [key: string]: string[] } = {
      'ai': ['OpenAI', 'AnthropicAI', 'googleai', 'DeepMind'],
      'tech': ['TechCrunch', 'TheVerge', 'WIRED'],
      'startup': ['ycombinator', 'a16z'],
      'tesla': ['tesla', 'elonmusk'],
      'crypto': ['VitalikButerin', 'coinbase'],
      'default': ['elonmusk', 'OpenAI']
    };

    let handles: string[] = [];
    for (const keyword of config.keywords) {
      handles.push(...(keywordHandles[keyword.toLowerCase()] || keywordHandles['default']));
    }
    handles = Array.from(new Set(handles));

    console.log(`📌 Scraping: ${handles.join(', ')}`);

    const run = await this.client.actor('quacker~twitter-scraper').call({
      handles,
      tweetsDesired: config.maxItems
    }, { waitSecs: 120 });

    if (run.status !== 'SUCCEEDED' || !run.defaultDatasetId) {
      throw new Error(`Scrape failed: ${run.status}`);
    }

    const dataset = this.client.dataset(run.defaultDatasetId);
    const { items } = await dataset.listItems();
    
    const candidates = new Set<string>();
    
    for (const item of items as any[]) {
      const twitterUser = item.user;
      const userName = twitterUser?.screen_name || twitterUser?.username;
      if (userName) {
        candidates.add(userName);
      }
    }

    console.log(`✅ Found ${candidates.size} unique users\n`);
    return Array.from(candidates);
  }

  async phaseTwoComprehensive(handles: string[]): Promise<{
    users: ApifyAuthor[];
    posts: any[];
    interactions: any[];
  }> {
    console.log(`\n📊 PHASE 2: Deep scraping ${handles.length} users...\n`);
    
    const now = new Date().toISOString();

    const run = await this.client.actor('quacker~twitter-scraper').call({
      handles,
      tweetsDesired: handles.length * 20
    }, { waitSecs: 180 });

    if (!run.defaultDatasetId) throw new Error('No dataset');

    const dataset = this.client.dataset(run.defaultDatasetId);
    const { items } = await dataset.listItems();

    const users: ApifyAuthor[] = [];
    const posts: any[] = [];
    const interactions: any[] = [];
    const seen = new Set<string>();

    console.log(`📦 Processing ${items.length} items...\n`);

    for (const item of items as any[]) {
      // Skip errors
      if (item.error || !item.text || !item.user) continue;
      
      const twitterUser = item.user;
      const userName = twitterUser.screen_name || twitterUser.username;
      
      if (!userName) continue;

      
      
      // Add user once
      if (!seen.has(userName)) {
          console.log(`🔍 User: userName="${userName}", id_str="${twitterUser.id_str}"`);  // ADD THIS LINE

        users.push({
          userName: userName,
          name: twitterUser.name || userName,
          id: twitterUser.id_str || userName,
          isVerified: twitterUser.verified || false,
          isBlueVerified: twitterUser.is_blue_verified || false,
          description: twitterUser.description || '',
          location: twitterUser.location || '',
          followers: twitterUser.followers_count || 0,
          following: twitterUser.friends_count || 0,
          mediaCount: twitterUser.media_count || 0,
          profilePicture: twitterUser.profile_image_url_https || '',
          statusesCount: twitterUser.statuses_count || 0,
          favouritesCount: twitterUser.favourites_count || 0
        });
        seen.add(userName);

        
      }
      

      // Add post
      posts.push({
        id: item.id_str || item.id,
        author: {
          id: twitterUser.id_str || userName,
          userName: userName
        },
        fullText: item.full_text || item.text,
        createdAt: item.created_at || now,
        likeCount: item.favorite_count || 0,
        replyCount: item.reply_count || 0,
        retweetCount: item.retweet_count || 0
      });
    }

    console.log(`✅ ${users.length} users, ${posts.length} posts\n`);
    return { users, posts, interactions };
  }

  async insertToDatabase(data: {
    users: ApifyAuthor[];
    posts: any[];
    interactions: any[];
  }): Promise<void> {
    console.log('💾 Inserting to database...\n');

    const now = new Date().toISOString();

    for (const user of data.users) {
      await this.db.executeQuery(`
        INSERT INTO twitter_users (
          user_id, display_name, bio, location, profile_picture,
          followers, following, statuses_count, media_count, favourites_count,
          is_verified, is_blue_verified, scraped_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (user_id) DO UPDATE SET
          followers = EXCLUDED.followers,
          bio = EXCLUDED.bio,
          scraped_at = EXCLUDED.scraped_at
      `, [
        user.userName, user.name, user.description, user.location, user.profilePicture,
        user.followers, user.following, user.statusesCount, user.mediaCount, user.favouritesCount,
        user.isVerified, user.isBlueVerified, now
      ]);
    }

    for (const post of data.posts) {
      await this.db.executeQuery(`
        INSERT INTO twitter_posts (
        post_id, user_id, content, created_at,
          like_count, reply_count, retweet_count, scraped_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (post_id) DO NOTHING
      `, [
        post.id, post.author.id, post.fullText, post.createdAt,
        post.likeCount, post.replyCount, post.retweetCount, now
      ]);
    }

    console.log('✅ Data inserted!\n');
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

export async function runApifyScrape(config: ScrapeConfig): Promise<void> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN missing');

  const scraper = new ApifyScraper(token);

  try {
    const handles = await scraper.phaseOneSearch(config);
    if (handles.length === 0) {
      console.log('⚠️  No users found\n');
      await scraper.close();
      return;
    }

    const data = await scraper.phaseTwoComprehensive(handles);
    await scraper.insertToDatabase(data);
    await scraper.close();
    
    console.log('🎉 Scraping complete!\n');
  } catch (error) {
    console.error('❌ Error:', error);
    await scraper.close();
    throw error;
  }
}
