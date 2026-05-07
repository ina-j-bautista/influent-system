#!/usr/bin/env python3
"""
INFLUENT Twitter Scraper - Standalone Script
Converted from ICARUS_SCRAPER__2_.ipynb
Accepts command-line arguments instead of interactive input
"""

import sys
import json
import re
from datetime import datetime
from apify_client import ApifyClient
import psycopg2
from psycopg2.extras import execute_values
import os

def is_keyword_relevant(text, keywords):
    """Checks if any of the keywords are present in the text (case-insensitive)."""
    text_lower = text.lower()
    for keyword in keywords:
        if keyword.lower() in text_lower:
            return True
    return False

def main():
    # Parse command-line arguments
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing arguments"}))
        sys.exit(1)
    
    try:
        params = json.loads(sys.argv[1])
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON input"}))
        sys.exit(1)
    
    # Extract parameters
    keywords = params.get('keywords', [])
    min_followers = params.get('minFollowers', 0)
    min_avg_likes = params.get('minAvgLikes', 0)
    max_accounts = params.get('maxAccounts', 20)
    tweets_per_account = params.get('tweetsPerAccount', 20)
    language = params.get('language', 'en')
    max_items = params.get('maxItems', 100)
    start_date = params.get('startDate', '')
    end_date = params.get('endDate', '')
    
    # Get API tokens from environment
    API_TOKEN = os.getenv('APIFY_API_TOKEN')
    NEON_CONNECTION_STRING = os.getenv('NEON_CONNECTION_STRING')
    
    # If NEON_CONNECTION_STRING not set, build it from parts
    if not NEON_CONNECTION_STRING:
        db_host = os.getenv('DB_HOST')
        db_name = os.getenv('DB_NAME')
        db_user = os.getenv('DB_USER')
        db_password = os.getenv('DB_PASSWORD')
        
        if db_host and db_name and db_user and db_password:
            NEON_CONNECTION_STRING = f"postgresql://{db_user}:{db_password}@{db_host}/{db_name}?sslmode=require"
    
    if not API_TOKEN or not NEON_CONNECTION_STRING:
        print(json.dumps({"error": "Missing environment variables"}))
        sys.exit(1)
    
    client = ApifyClient(API_TOKEN)
    twitter_data = {
        'users': [],
        'posts': [],
        'interactions': []
    }
    
    print(f"\\n[SEARCH] INFLUENT Two-Phase Scraper")
    print(f"Keywords: {', '.join(keywords)}")
    print(f"Max items: {max_items}")
    print(f"Max accounts: {max_accounts}\\n")
    
    # ============================================================
    # PHASE 1 — Keyword Search + Filter Relevant Accounts
    # ============================================================
    
    actor_input = {
        "searchTerms": keywords,
        "start": start_date,
        "end": end_date,
        "includeUserInfo": True,
        "maxItems": max_items,
        "tweetsDesired": max_items,
        "profilesDesired": max_items,
        "withReplies": False,
        "sort": "Top",
        "tweetLanguage": language,
        "proxyConfig": {"useApifyProxy": True, "apifyProxyGroups": ["RESIDENTIAL"]}
    }
    
    print("[PHASE] PHASE 1: Finding relevant accounts...")
    top_handles = set()
    
    try:
        run = client.actor("61RPP7dywgiy0JPD0").call(run_input=actor_input)
        if run['status'] == 'SUCCEEDED' and "defaultDatasetId" in run:
            current_scrape_time = datetime.now().isoformat()
            for item in client.dataset(run["defaultDatasetId"]).iterate_items():
                author_info = item.get('author', {})
                username = author_info.get('userName')
                if not username:
                    continue
                
                author_info['scraped_at'] = current_scrape_time
                
                # Add user if not already in list
                if not any(u.get('userName') == username for u in twitter_data['users']):
                    twitter_data['users'].append(author_info)
                
                item['scraped_at'] = current_scrape_time
                twitter_data['posts'].append(item)
                
                # Check if relevant for Phase 2
                if is_keyword_relevant(item.get('fullText', ''), keywords):
                    if author_info.get('followers', 0) >= min_followers and item.get('likeCount', 0) >= min_avg_likes:
                        top_handles.add(username)
        else:
            print(json.dumps({"error": f"Phase 1 failed: {run['status']}"}))
            sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Phase 1 error: {str(e)}"}))
        sys.exit(1)
    
    top_handles = list(top_handles)[:max_accounts]  # Limit to max_accounts
    print(f"[OK] Phase 1 complete: {len(top_handles)} relevant accounts found\\n")
    
    # ============================================================
    # PHASE 2 — Deep Scrape Relevant Accounts
    # ============================================================
    
    user_relevance_ratios = {}  # Initialize here for use in database section
    
    if top_handles:
        print(f"[PHASE] PHASE 2: Deep scraping {len(top_handles)} accounts...")
        
        actor_input_phase2 = {
            "twitterHandles": top_handles,
            "maxItems": len(top_handles) * tweets_per_account,
            "tweetsDesired": len(top_handles) * tweets_per_account,
            "profilesDesired": len(top_handles),
            "withReplies": True,
            "sort": "Top",
            "tweetLanguage": language
        }
        
        try:
            run_phase2 = client.actor("61RPP7dywgiy0JPD0").call(run_input=actor_input_phase2)
            
            if "defaultDatasetId" in run_phase2:
                all_phase2_items = []
                author_post_counts = {}
                author_keyword_hits = {}
                current_scrape_time = datetime.now().isoformat()
                
                for item in client.dataset(run_phase2["defaultDatasetId"]).iterate_items():
                    all_phase2_items.append(item)
                    author = item.get('author', {}).get('userName')
                    if not author:
                        continue
                    
                    # Count posts per author
                    author_post_counts[author] = author_post_counts.get(author, 0) + 1
                    
                    # Check if post contains keywords
                    post_text = item.get('fullText', '')
                    if is_keyword_relevant(post_text, keywords):
                        author_keyword_hits[author] = author_keyword_hits.get(author, 0) + 1
                    
                    from_user = author
                    post_id = item.get('id')
                    created_at = item.get('createdAt')
                    if not from_user or not post_id:
                        continue
                    
                    # Add post to twitter_data
                    item['scraped_at'] = current_scrape_time
                    if not any(p.get('id') == post_id for p in twitter_data['posts']):
                        twitter_data['posts'].append(item)
                    
                    # Process interactions
                    # 1. Replies
                    if item.get('isReply') and item.get('inReplyToUsername'):
                        twitter_data['interactions'].append({
                            'from_user': from_user,
                            'to_user': item['inReplyToUsername'],
                            'post_id': post_id,
                            'interaction_type': 'reply',
                            'created_at': created_at,
                            'scraped_at': current_scrape_time
                        })
                    
                    # 2. Retweets
                    if item.get('isRetweet') or 'RT @' in (item.get('fullText') or ''):
                        to_user = item.get('retweet', {}).get('author', {}).get('userName')
                        if not to_user and 'RT @' in item.get('fullText', ''):
                            match = re.search(r'RT @(\w+):', item.get('fullText', ''))
                            if match:
                                to_user = match.group(1)
                        
                        if to_user:
                            twitter_data['interactions'].append({
                                'from_user': from_user,
                                'to_user': to_user,
                                'post_id': post_id,
                                'interaction_type': 'retweet',
                                'created_at': created_at,
                                'scraped_at': current_scrape_time
                            })
                    
                    # 3. Mentions
                    for mention in item.get('entities', {}).get('user_mentions', []):
                        if mention.get('screen_name'):
                            twitter_data['interactions'].append({
                                'from_user': from_user,
                                'to_user': mention['screen_name'],
                                'post_id': post_id,
                                'interaction_type': 'mention',
                                'created_at': created_at,
                                'scraped_at': current_scrape_time
                            })
                
                # Calculate relevance ratios AFTER processing all items
                user_relevance_ratios = {}
                for author, total in author_post_counts.items():
                    hits = author_keyword_hits.get(author, 0)
                    ratio = (hits / total * 100) if total > 0 else 0
                    user_relevance_ratios[author] = round(ratio, 1)
                
                print(f"[RELEVANCY] Calculated for {len(user_relevance_ratios)} users")
                for author, ratio in user_relevance_ratios.items():
                    print(f"  @{author}: {ratio}% ({author_keyword_hits.get(author, 0)}/{author_post_counts.get(author, 0)} posts)")
                
                print(f"[OK] Phase 2 complete: {len(all_phase2_items)} tweets scraped\\n")
        except Exception as e:
            print(json.dumps({"error": f"Phase 2 error: {str(e)}"}))
            sys.exit(1)
    
    # ============================================================
    # INSERT INTO DATABASE
    # ============================================================
    
    print("[DB] Writing to database...")
    
    # Format data for database
    formatted_users = []
    for user in twitter_data['users']:
        username = user.get('userName')
        if not username:
            continue
        formatted_users.append({
            'user_id': username,  # Use username as user_id (handle)
            'display_name': user.get('name'),
            'is_verified': user.get('isVerified', False),
            'is_blue_verified': user.get('isBlueVerified', False),
            'bio': user.get('description', ''),
            'location': user.get('location', ''),
            'followers': user.get('followers', 0),
            'following': user.get('following', 0),
            'scraped_at': user.get('scraped_at'),
            'media_count': user.get('mediaCount', 0),
            'profile_picture': user.get('profilePicture', ''),
            'statuses_count': user.get('statusesCount', 0),
            'favourites_count': user.get('favouritesCount', 0)
        })
    
    formatted_posts = []
    for post in twitter_data['posts']:
        author_username = post.get('author', {}).get('userName')
        if not author_username:
            continue
        
        # Get relevance ratio for this user (calculated in Phase 2)
        relevance_ratio = user_relevance_ratios.get(author_username, 0) / 100  # Convert to decimal 0-1
        
        formatted_posts.append({
            'post_id': post.get('id'),
            'user_id': author_username,  # Use username as user_id
            'content': post.get('fullText', ''),
            'created_at': post.get('createdAt'),
            'like_count': post.get('likeCount', 0),
            'reply_count': post.get('replyCount', 0),
            'retweet_count': post.get('retweetCount', 0),
            'relevance_ratio': relevance_ratio,
            'scraped_at': post.get('scraped_at')
        })
    
    formatted_interactions = twitter_data['interactions']
    
    # Write to database
    conn = psycopg2.connect(NEON_CONNECTION_STRING)
    cursor = conn.cursor()
    
    try:
        # 1. Insert twitter_users
        if formatted_users:
            execute_values(cursor, """
                INSERT INTO twitter_users (
                    user_id, display_name, is_verified, is_blue_verified,
                    bio, location, followers, following, scraped_at,
                    media_count, profile_picture, statuses_count, favourites_count
                ) VALUES %s
                ON CONFLICT (user_id) DO UPDATE SET
                    followers = EXCLUDED.followers,
                    following = EXCLUDED.following,
                    bio = EXCLUDED.bio,
                    scraped_at = EXCLUDED.scraped_at
            """, [(
                u['user_id'], u['display_name'], u['is_verified'],
                u['is_blue_verified'], u['bio'], u['location'], u['followers'],
                u['following'], u['scraped_at'], u['media_count'],
                u['profile_picture'], u['statuses_count'], u['favourites_count']
            ) for u in formatted_users])
            print(f"[+] Inserted {len(formatted_users)} users")
        
        # 2. Insert stub users
        scraped_usernames = {u['user_id'] for u in formatted_users}
        stub_usernames = {
            i['to_user'] for i in formatted_interactions
            if i['to_user'] not in scraped_usernames
        }
        if stub_usernames:
            execute_values(cursor, """
                INSERT INTO twitter_users (user_id)
                VALUES %s
                ON CONFLICT (user_id) DO NOTHING
            """, [(handle,) for handle in stub_usernames])
            print(f"[+] Inserted {len(stub_usernames)} stub users")
        
        # 3. Insert twitter_posts
        if formatted_posts:
            execute_values(cursor, """
                INSERT INTO twitter_posts (
                    post_id, user_id, content, created_at,
                    like_count, reply_count, retweet_count, relevance_ratio, scraped_at
                ) VALUES %s
                ON CONFLICT (post_id) DO NOTHING
            """, [(
                p['post_id'], p['user_id'], p['content'], p['created_at'],
                p['like_count'], p['reply_count'], p['retweet_count'], p['relevance_ratio'], p['scraped_at']
            ) for p in formatted_posts])
            print(f"[+] Inserted {len(formatted_posts)} posts")
        
        # 4. Insert twitter_interactions
        if formatted_interactions:
            execute_values(cursor, """
                INSERT INTO twitter_interactions (
                    from_user, to_user, post_id, interaction_type, created_at
                ) VALUES %s
                ON CONFLICT DO NOTHING
            """, [(
                i['from_user'], i['to_user'], i['post_id'],
                i['interaction_type'], i['created_at']
            ) for i in formatted_interactions])
            print(f"[+] Inserted {len(formatted_interactions)} interactions")
        
        conn.commit()
        print("[OK] All data committed successfully\\n")
        
        # Output result
        result = {
            "success": True,
            "users": len(formatted_users),
            "posts": len(formatted_posts),
            "interactions": len(formatted_interactions)
        }
        print(json.dumps(result))
        
    except Exception as e:
        conn.rollback()
        print(json.dumps({"error": f"Database error: {str(e)}"}))
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    main()