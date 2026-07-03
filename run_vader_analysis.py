#!/usr/bin/env python3
"""
VADER Sentiment Analysis for INFLUENT
Reads posts from twitter_posts and writes sentiment to sentiment_scores
"""

import os
import sys
import psycopg2
from psycopg2.extras import execute_values
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

MAIN_DB_HOST = os.getenv('DB_HOST', 'ep-soft-sunset-a19fvgjt-pooler.ap-southeast-1.aws.neon.tech')
MAIN_DB_NAME = os.getenv('DB_NAME', 'neondb')
MAIN_DB_USER = os.getenv('DB_USER', 'neondb_owner')
MAIN_DB_PASSWORD = os.getenv('DB_PASSWORD')

VADER_DB_HOST = 'ep-solitary-bird-a1nai5q4-pooler.ap-southeast-1.aws.neon.tech'
VADER_DB_NAME = 'neondb'
VADER_DB_USER = 'neondb_owner'
VADER_DB_PASSWORD = 'npg_EIK64thlpmGP'

def get_sentiment_label(compound):
    """Convert VADER compound score to label"""
    if compound >= 0.05:
        return 'positive'
    elif compound <= -0.05:
        return 'negative'
    else:
        return 'neutral'

def main():
    print('[VADER] Connecting to main database...')
    main_conn = psycopg2.connect(
        host=MAIN_DB_HOST,
        database=MAIN_DB_NAME,
        user=MAIN_DB_USER,
        password=MAIN_DB_PASSWORD,
        sslmode='require'
    )
    
    print('[VADER] Connecting to sentiment database...')
    vader_conn = psycopg2.connect(
        host=VADER_DB_HOST,
        database=VADER_DB_NAME,
        user=VADER_DB_USER,
        password=VADER_DB_PASSWORD,
        sslmode='require'
    )
    
    main_cur = main_conn.cursor()
    vader_cur = vader_conn.cursor()
    
    print('[VADER] Initializing VADER analyzer...')
    analyzer = SentimentIntensityAnalyzer()
    
    print('[VADER] Fetching posts from twitter_posts...')
    main_cur.execute("""
        SELECT post_id, user_id, content
        FROM twitter_posts
        WHERE content IS NOT NULL AND content != ''
    """)
    
    posts = main_cur.fetchall()
    print(f'[VADER] Found {len(posts)} posts to analyze\n')
    
    if len(posts) == 0:
        print('[VADER] No posts to analyze!')
        return
    
    post_ids = [p[0] for p in posts]
    print('[VADER] Clearing old sentiment scores...')
    vader_cur.execute("""
        DELETE FROM sentiment_scores
        WHERE post_id = ANY(%s)
    """, (post_ids,))
    vader_conn.commit()
    
    sentiment_data = []
    processed = 0
    
    for post_id, user_id, content in posts:
        scores = analyzer.polarity_scores(content)
        compound = scores['compound']
        
        normalized = (compound + 1) / 2
        
        sentiment_data.append((
            post_id,
            user_id,
            content[:500],  # original_text (truncated)
            content[:500],  # cleaned_text
            None,           # translated_text
            'en',           # detected_lang
            1.0,            # detection_confidence
            compound,       # raw_sentiment
            normalized,     # normalized_sentiment
            get_sentiment_label(compound),  # sentiment_label
            'completed'     # processing_status
        ))
        
        processed += 1
        if processed % 10 == 0:
            print(f'[VADER] Processed {processed}/{len(posts)} posts...')
    
    print(f'\n[VADER] Inserting {len(sentiment_data)} sentiment scores...')
    execute_values(vader_cur, """
        INSERT INTO sentiment_scores (
            post_id, user_id, original_text, cleaned_text, translated_text,
            detected_lang, detection_confidence, raw_sentiment, normalized_sentiment,
            sentiment_label, processing_status
        ) VALUES %s
        ON CONFLICT (post_id) DO UPDATE SET
            raw_sentiment = EXCLUDED.raw_sentiment,
            normalized_sentiment = EXCLUDED.normalized_sentiment,
            sentiment_label = EXCLUDED.sentiment_label,
            processing_status = EXCLUDED.processing_status
    """, sentiment_data)
    
    vader_conn.commit()
    
    vader_cur.execute("""
        SELECT 
            sentiment_label,
            COUNT(*) as count,
            AVG(raw_sentiment) as avg_compound
        FROM sentiment_scores
        GROUP BY sentiment_label
        ORDER BY sentiment_label
    """)
    
    print('\n[VADER] Sentiment Distribution:')
    print('-' * 50)
    for label, count, avg_compound in vader_cur.fetchall():
        print(f'{label.upper().ljust(10)} | {count:4d} posts | avg: {avg_compound:+.3f}')
    print('-' * 50)
    
    main_cur.close()
    main_conn.close()
    vader_cur.close()
    vader_conn.close()
    
    print(f'\n VADER analysis complete! Processed {len(posts)} posts')
    return {"success": True, "posts_analyzed": len(posts)}

if __name__ == '__main__':
    try:
        result = main()
        print(f'\n{result}')
    except Exception as e:
        print(f'\n Error: {str(e)}', file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)