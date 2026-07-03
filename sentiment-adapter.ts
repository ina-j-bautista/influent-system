//######## SENTIMENT INTEGRATION - FETCH FROM VADER PIPELINE #########################

import { Pool } from 'pg';

export interface SentimentScore {
  post_id: string;
  user_id: string;
  original_text: string;
  cleaned_text: string;
  translated_text: string | null;
  detected_lang: string;
  detection_confidence: number;
  raw_sentiment: number;
  normalized_sentiment: number;
  sentiment_label: 'positive' | 'neutral' | 'negative';
  processing_status: string;
  processed_at: Date;
}

export class SentimentAdapter {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: 'ep-solitary-bird-a1nai5q4-pooler.ap-southeast-1.aws.neon.tech',
      port: 5432,
      database: 'neondb',
      user: 'neondb_owner',
      password: 'npg_EIK64thlpmGP',
      ssl: {
        rejectUnauthorized: false
      }
    });
  }


  async getAllSentimentScores(): Promise<SentimentScore[]> {
    const query = `
      SELECT 
        post_id,
        user_id,
        original_text,
        cleaned_text,
        translated_text,
        detected_lang,
        detection_confidence,
        raw_sentiment,
        normalized_sentiment,
        sentiment_label,
        processing_status,
        processed_at
      FROM sentiment_scores
      WHERE normalized_sentiment IS NOT NULL
      ORDER BY processed_at DESC
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }


  async getSentimentByUsers(userIds: string[]): Promise<Map<string, SentimentScore[]>> {
    const query = `
      SELECT 
        post_id,
        user_id,
        original_text,
        cleaned_text,
        translated_text,
        detected_lang,
        detection_confidence,
        raw_sentiment,
        normalized_sentiment,
        sentiment_label,
        processing_status,
        processed_at
      FROM sentiment_scores
      WHERE user_id = ANY($1)
      AND normalized_sentiment IS NOT NULL
      ORDER BY processed_at DESC
    `;

    const result = await this.pool.query(query, [userIds]);
    
    const sentimentMap = new Map<string, SentimentScore[]>();
    
    for (const row of result.rows) {
      if (!sentimentMap.has(row.user_id)) {
        sentimentMap.set(row.user_id, []);
      }
      sentimentMap.get(row.user_id)!.push(row);
    }

    return sentimentMap;
  }

  async getUserAverageSentiment(userId: string): Promise<number> {
    const query = `
      SELECT AVG(normalized_sentiment) as avg_sentiment
      FROM sentiment_scores
      WHERE user_id = $1
      AND normalized_sentiment IS NOT NULL
    `;

    const result = await this.pool.query(query, [userId]);
    
    if (result.rows.length === 0 || result.rows[0].avg_sentiment === null) {
      return 0.5; 
    }

    return parseFloat(result.rows[0].avg_sentiment);
  }

  async getBulkUserAverageSentiment(userIds: string[]): Promise<Map<string, number>> {
    const query = `
      SELECT 
        user_id,
        AVG(normalized_sentiment) as avg_sentiment,
        COUNT(*) as post_count
      FROM sentiment_scores
      WHERE user_id = ANY($1)
      AND normalized_sentiment IS NOT NULL
      GROUP BY user_id
    `;

    const result = await this.pool.query(query, [userIds]);
    
    const sentimentMap = new Map<string, number>();
    
    for (const userId of userIds) {
      sentimentMap.set(userId, 0.5);
    }
    
    for (const row of result.rows) {
      sentimentMap.set(row.user_id, parseFloat(row.avg_sentiment));
    }

    return sentimentMap;
  }


  async getSentimentStatistics(): Promise<{
    total: number;
    positive: number;
    neutral: number;
    negative: number;
    avgSentiment: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral,
        SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative,
        AVG(normalized_sentiment) as avg_sentiment
      FROM sentiment_scores
      WHERE normalized_sentiment IS NOT NULL
    `;

    const result = await this.pool.query(query);
    const row = result.rows[0];

    return {
      total: parseInt(row.total),
      positive: parseInt(row.positive),
      neutral: parseInt(row.neutral),
      negative: parseInt(row.negative),
      avgSentiment: parseFloat(row.avg_sentiment) || 0.5
    };
  }


  async checkSentimentCoverage(postIds: string[]): Promise<{
    total: number;
    withSentiment: number;
    coverage: number;
  }> {
    const query = `
      SELECT COUNT(*) as count
      FROM sentiment_scores
      WHERE post_id = ANY($1)
    `;

    const result = await this.pool.query(query, [postIds]);
    const withSentiment = parseInt(result.rows[0].count);

    return {
      total: postIds.length,
      withSentiment,
      coverage: postIds.length > 0 ? (withSentiment / postIds.length) * 100 : 0
    };
  }


  async close(): Promise<void> {
    await this.pool.end();
  }
}
