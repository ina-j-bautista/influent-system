//######## SENTIMENT INTEGRATION - FETCH FROM VADER PIPELINE #########################
import { Pool } from 'pg';
export class SentimentAdapter {
    constructor() {
        // WRITE branch where sentiment_scores table lives
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
    /**
     * Fetch all sentiment scores from the sentiment_scores table
     */
    async getAllSentimentScores() {
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
    /**
     * Get sentiment scores for specific users
     */
    async getSentimentByUsers(userIds) {
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
        // Group by user_id
        const sentimentMap = new Map();
        for (const row of result.rows) {
            if (!sentimentMap.has(row.user_id)) {
                sentimentMap.set(row.user_id, []);
            }
            sentimentMap.get(row.user_id).push(row);
        }
        return sentimentMap;
    }
    /**
     * Get average sentiment for a specific user
     * Returns normalized sentiment averaged across all their posts
     */
    async getUserAverageSentiment(userId) {
        const query = `
      SELECT AVG(normalized_sentiment) as avg_sentiment
      FROM sentiment_scores
      WHERE user_id = $1
      AND normalized_sentiment IS NOT NULL
    `;
        const result = await this.pool.query(query, [userId]);
        if (result.rows.length === 0 || result.rows[0].avg_sentiment === null) {
            return 0.5; // Neutral default
        }
        return parseFloat(result.rows[0].avg_sentiment);
    }
    /**
     * Get average sentiment for multiple users in bulk
     */
    async getBulkUserAverageSentiment(userIds) {
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
        const sentimentMap = new Map();
        // Initialize all users with neutral default
        for (const userId of userIds) {
            sentimentMap.set(userId, 0.5);
        }
        // Update with actual averages
        for (const row of result.rows) {
            sentimentMap.set(row.user_id, parseFloat(row.avg_sentiment));
        }
        return sentimentMap;
    }
    /**
     * Get sentiment statistics
     */
    async getSentimentStatistics() {
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
    /**
     * Check if sentiment data exists for given posts
     */
    async checkSentimentCoverage(postIds) {
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
    /**
     * Close the connection pool
     */
    async close() {
        await this.pool.end();
    }
}
