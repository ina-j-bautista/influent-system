//######## INFLUENT DATABASE ADAPTER - PostgreSQL (Neon Compatible) #########################

import { Pool, PoolClient, QueryResult } from 'pg';
import {
  TwitterUser,
  TwitterPost,
  TwitterInteraction,
  EngagementFeatures,
  SentimentScore,
  ReciprocityStats,
  ConnectionWeight,
  InfluentDataSource,
  TimeWindow,
  InteractionType
} from './influent-core';

//######## DATABASE CONNECTION CONFIGURATION #########################

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | object;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

//######## POSTGRESQL ADAPTER CLASS #########################

export class PostgreSQLAdapter implements InfluentDataSource {
  private pool: Pool;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl || { rejectUnauthorized: false }, 
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });

    this.pool.on('connect', async (client) => {
      try {
        await client.query('SET search_path TO public');
      } catch (err) {
        console.error('Error setting search_path:', err);
      }
    });
  }

  //######## USER QUERIES #########################

  async getUserById(userId: string): Promise<TwitterUser | null> {
    const query = `
      SELECT 
        user_id,
        display_name,
        bio,
        location,
        profile_picture,
        followers,
        following,
        statuses_count,
        media_count,
        favourites_count,
        is_verified,
        is_blue_verified,
        scraped_at
      FROM twitter_users
      WHERE user_id = $1
    `;

    try {
      const result = await this.pool.query(query, [userId]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapToTwitterUser(result.rows[0]);
    } catch (error) {
      console.error('Error fetching user by ID:', error);
      throw error;
    }
  }

  async getUsersByHandles(handles: string[]): Promise<TwitterUser[]> {
    if (handles.length === 0) {
      return [];
    }

    const query = `
      SELECT 
        user_id,
        display_name,
        bio,
        location,
        profile_picture,
        followers,
        following,
        statuses_count,
        media_count,
        favourites_count,
        is_verified,
        is_blue_verified,
        scraped_at
      FROM twitter_users
      WHERE user_id = ANY($1)
    `;

    try {
      const result = await this.pool.query(query, [handles]);
      return result.rows.map(row => this.mapToTwitterUser(row));
    } catch (error) {
      console.error('Error fetching users by handles:', error);
      throw error;
    }
  }

  async getAllUsers(limit: number = 100): Promise<TwitterUser[]> {
    const query = `
      SELECT 
        user_id,
        display_name,
        bio,
        location,
        profile_picture,
        followers,
        following,
        statuses_count,
        media_count,
        favourites_count,
        is_verified,
        is_blue_verified,
        scraped_at
      FROM twitter_users
      ORDER BY followers DESC
      LIMIT $1
    `;

    try {
      const result = await this.pool.query(query, [limit]);
      return result.rows.map(row => this.mapToTwitterUser(row));
    } catch (error) {
      console.error('Error fetching all users:', error);
      throw error;
    }
  }

  //######## POST QUERIES #########################

  async getPostsByTimeWindow(startDate: Date, endDate: Date): Promise<TwitterPost[]> {
    const query = `
      SELECT 
        post_id,
        user_id,
        content,
        created_at,
        like_count,
        reply_count,
        retweet_count,
        scraped_at
      FROM twitter_posts
      WHERE created_at >= $1 AND created_at <= $2
      ORDER BY created_at DESC
    `;

    try {
      const result = await this.pool.query(query, [startDate, endDate]);
      return result.rows.map(row => this.mapToTwitterPost(row));
    } catch (error) {
      console.error('Error fetching posts by time window:', error);
      throw error;
    }
  }

  async getPostsByKeywords(keywords: string[], timeWindow: TimeWindow): Promise<TwitterPost[]> {
    if (keywords.length === 0) {
      return this.getPostsByTimeWindow(timeWindow.startDate, timeWindow.endDate);
    }

    const keywordPatterns = keywords.map(k => `%${k.toLowerCase()}%`);
    
    const conditions = keywords.map((_, i) => `LOWER(content) LIKE $${i + 3}`).join(' OR ');

    const query = `
      SELECT 
        post_id,
        user_id,
        content,
        created_at,
        like_count,
        reply_count,
        retweet_count,
        scraped_at
      FROM twitter_posts
      WHERE created_at >= $1 
        AND created_at <= $2
        AND (${conditions})
      ORDER BY created_at DESC
    `;

    try {
      const params = [timeWindow.startDate, timeWindow.endDate, ...keywordPatterns];
      const result = await this.pool.query(query, params);
      return result.rows.map(row => this.mapToTwitterPost(row));
    } catch (error) {
      console.error('Error fetching posts by keywords:', error);
      throw error;
    }
  }

  //######## INTERACTION QUERIES #########################

  async getInteractionsByTimeWindow(startDate: Date, endDate: Date): Promise<TwitterInteraction[]> {
    const query = `
      SELECT 
        from_user,
        to_user,
        post_id,
        interaction_type,
        created_at
      FROM twitter_interactions
      WHERE created_at >= $1 AND created_at <= $2
      ORDER BY created_at DESC
    `;

    try {
      const result = await this.pool.query(query, [startDate, endDate]);
      return result.rows.map(row => this.mapToTwitterInteraction(row));
    } catch (error) {
      console.error('Error fetching interactions:', error);
      throw error;
    }
  }

  //######## FEATURE QUERIES #########################

  async getEngagementFeatures(fromUser: string, toUser: string): Promise<EngagementFeatures | null> {
    const query = `
      SELECT 
        from_user,
        to_user,
        total_likes,
        total_replies,
        total_retweets,
        avg_sentiment,
        last_interaction
      FROM engagement_features
      WHERE from_user = $1 AND to_user = $2
    `;

    try {
      const result = await this.pool.query(query, [fromUser, toUser]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapToEngagementFeatures(result.rows[0]);
    } catch (error) {
      console.error('Error fetching engagement features:', error);
      throw error;
    }
  }

  async getSentimentScores(postIds: string[]): Promise<SentimentScore[]> {
    if (postIds.length === 0) {
      return [];
    }

    const query = `
      SELECT 
        post_id,
        user_id,
        raw_sentiment,
        norm_sentiment,
        analyzed_at
      FROM sentiment_scores
      WHERE post_id = ANY($1)
    `;

    try {
      const result = await this.pool.query(query, [postIds]);
      return result.rows.map(row => this.mapToSentimentScore(row));
    } catch (error) {
      console.error('Error fetching sentiment scores:', error);
      throw error;
    }
  }

  async getReciprocityStats(userA: string, userB: string): Promise<ReciprocityStats | null> {
    const query = `
      SELECT 
        user_a,
        user_b,
        a_to_b,
        b_to_a,
        reciprocity
      FROM reciprocity_stats
      WHERE (user_a = $1 AND user_b = $2) OR (user_a = $2 AND user_b = $1)
    `;

    try {
      const result = await this.pool.query(query, [userA, userB]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapToReciprocityStats(result.rows[0]);
    } catch (error) {
      console.error('Error fetching reciprocity stats:', error);
      throw error;
    }
  }

  async getConnectionWeights(userId: string): Promise<ConnectionWeight[]> {
    const query = `
      SELECT 
        from_user,
        to_user,
        weight,
        computed_at
      FROM connection_weights
      WHERE from_user = $1 OR to_user = $1
      ORDER BY weight DESC
    `;

    try {
      const result = await this.pool.query(query, [userId]);
      return result.rows.map(row => this.mapToConnectionWeight(row));
    } catch (error) {
      console.error('Error fetching connection weights:', error);
      throw error;
    }
  }

  //######## ADDITIONAL HELPER QUERIES #########################

  async getOutgoingConnectionWeights(userId: string): Promise<ConnectionWeight[]> {
    const query = `
      SELECT 
        from_user,
        to_user,
        weight,
        computed_at
      FROM connection_weights
      WHERE from_user = $1
      ORDER BY weight DESC
    `;

    try {
      const result = await this.pool.query(query, [userId]);
      return result.rows.map(row => this.mapToConnectionWeight(row));
    } catch (error) {
      console.error('Error fetching outgoing connection weights:', error);
      throw error;
    }
  }

  async computeInfluentScore(
    userId: string,
    alpha: number = 0.33,
    beta: number = 0.33,
    gamma: number = 0.34
  ): Promise<{
    user_id: string;
    sentiment_component: number;
    engagement_component: number;
    connection_component: number;
    influent_score: number;
  } | null> {
    const query = `
      SELECT * FROM compute_influent_score($1, $2, $3, $4)
    `;

    try {
      const result = await this.pool.query(query, [userId, alpha, beta, gamma]);
      if (result.rows.length === 0) {
        return null;
      }
      return result.rows[0];
    } catch (error) {
      console.error('Error computing influent score:', error);
      throw error;
    }
  }

  async refreshDerivedTables(): Promise<void> {
    try {
      await this.pool.query('SELECT refresh_derived_tables()');
    } catch (error) {
      console.error('Error refreshing derived tables:', error);
      throw error;
    }
  }

  //######## ROW MAPPING FUNCTIONS #########################

  private mapToTwitterUser(row: any): TwitterUser {
    return {
      user_id: row.user_id,
      display_name: row.display_name,
      bio: row.bio,
      location: row.location,
      profile_picture: row.profile_picture,
      followers: row.followers,
      following: row.following,
      statuses_count: row.statuses_count,
      media_count: row.media_count,
      favourites_count: row.favourites_count,
      is_verified: row.is_verified,
      is_blue_verified: row.is_blue_verified,
      scraped_at: new Date(row.scraped_at)
    };
  }

  private mapToTwitterPost(row: any): TwitterPost {
    return {
      post_id: row.post_id,
      user_id: row.user_id,
      content: row.content,
      created_at: new Date(row.created_at),
      like_count: row.like_count,
      reply_count: row.reply_count,
      retweet_count: row.retweet_count,
      scraped_at: new Date(row.scraped_at)
    };
  }

  private mapToTwitterInteraction(row: any): TwitterInteraction {
    return {
      from_user: row.from_user,
      to_user: row.to_user,
      post_id: row.post_id,
      interaction_type: row.interaction_type as InteractionType,
      created_at: new Date(row.created_at)
    };
  }

  private mapToEngagementFeatures(row: any): EngagementFeatures {
    return {
      from_user: row.from_user,
      to_user: row.to_user,
      total_likes: row.total_likes,
      total_replies: row.total_replies,
      total_retweets: row.total_retweets,
      avg_sentiment: row.avg_sentiment,
      last_interaction: new Date(row.last_interaction)
    };
  }

  private mapToSentimentScore(row: any): SentimentScore {
    return {
      post_id: row.post_id,
      user_id: row.user_id,
      raw_sentiment: row.raw_sentiment,
      norm_sentiment: row.norm_sentiment,
      analyzed_at: new Date(row.analyzed_at)
    };
  }

  private mapToReciprocityStats(row: any): ReciprocityStats {
    return {
      user_a: row.user_a,
      user_b: row.user_b,
      a_to_b: row.a_to_b,
      b_to_a: row.b_to_a,
      reciprocity: row.reciprocity
    };
  }

  private mapToConnectionWeight(row: any): ConnectionWeight {
    return {
      from_user: row.from_user,
      to_user: row.to_user,
      weight: row.weight,
      computed_at: new Date(row.computed_at)
    };
  }

  //######## CONNECTION MANAGEMENT #########################

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT NOW()');
      console.log('Database connection successful:', result.rows[0].now);
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    console.log('Database connection pool closed');
  }

  async executeQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    try {
      const result = await this.pool.query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('Error executing query:', error);
      throw error;
    }
  }
}

//######## CONNECTION FACTORY #########################

export function createDatabaseConnection(config?: Partial<DatabaseConfig>): PostgreSQLAdapter {
  const dbConfig: DatabaseConfig = {
    host: config?.host || process.env.DB_HOST || 'localhost',
    port: config?.port || parseInt(process.env.DB_PORT || '5432'),
    database: config?.database || process.env.DB_NAME || 'influent_db',
    user: config?.user || process.env.DB_USER || 'postgres',
    password: config?.password || process.env.DB_PASSWORD || '',
    ssl: config?.ssl !== undefined ? config.ssl : { rejectUnauthorized: false },
    max: config?.max || parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    idleTimeoutMillis: config?.idleTimeoutMillis || parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: config?.connectionTimeoutMillis || parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000')
  };

  return new PostgreSQLAdapter(dbConfig);
}
