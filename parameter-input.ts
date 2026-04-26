//######## INFLUENT PARAMETER INPUT SYSTEM #########################

import 'dotenv/config';
import * as readline from 'readline';
import { 
  AnalysisParameters,
  WeightPreferences,
  TimeWindow,
  TargetInput
} from './influent-core';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify question function
function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function getWeightPreferences(): Promise<WeightPreferences> {
  console.log('\n=== ENGAGEMENT WEIGHT PREFERENCES ===');
  console.log('Configure how much each engagement type contributes to the engagement score.');
  console.log('The three weights must sum to 100% (or 1.0).\n');

  let weights: WeightPreferences | null = null;
  let useDefaults = false;

  // Ask if user wants default equal weights
  const defaultChoice = await question('Use default equal weights (33.3% each)? (y/n): ');
  
  if (defaultChoice.toLowerCase() === 'y') {
    weights = {
      ws: 0.333, // shares/retweets
      wc: 0.334, // comments/replies  
      wi: 0.333  // likes
    };
    useDefaults = true;
  } else {
    // Manual input with validation
    let valid = false;
    while (!valid) {
      const sharesInput = await question('Weight for SHARES/RETWEETS (0-100): ');
      const commentsInput = await question('Weight for COMMENTS/REPLIES (0-100): ');
      const likesInput = await question('Weight for LIKES (0-100): ');

      const shares = parseFloat(sharesInput) / 100;
      const comments = parseFloat(commentsInput) / 100;
      const likes = parseFloat(likesInput) / 100;

      const sum = shares + comments + likes;

      if (Math.abs(sum - 1.0) < 0.001) {
        weights = { ws: shares, wc: comments, wi: likes };
        valid = true;
        console.log(`✓ Weights validated: ${(shares*100).toFixed(1)}% + ${(comments*100).toFixed(1)}% + ${(likes*100).toFixed(1)}% = 100%\n`);
      } else {
        console.log(`✗ Weights must sum to 100%. Current sum: ${(sum*100).toFixed(1)}%`);
        console.log('Please try again.\n');
      }
    }
  }

  return weights!;
}

async function getSentimentImportance(): Promise<number> {
  console.log('\n=== SENTIMENT IMPORTANCE ===');
  console.log('How heavily should sentiment affect engagement scoring?');
  console.log('0 = sentiment has no effect');
  console.log('1 = sentiment has maximum effect\n');

  let valid = false;
  let importance = 0;

  while (!valid) {
    const input = await question('Sentiment importance (0.0 - 1.0, default 0.85): ');
    
    if (input.trim() === '') {
      importance = 0.85;
      valid = true;
      console.log('Using default: 0.85\n');
    } else {
      importance = parseFloat(input);
      if (importance >= 0 && importance <= 1) {
        valid = true;
        console.log(`✓ Sentiment importance set to: ${importance}\n`);
      } else {
        console.log('✗ Value must be between 0.0 and 1.0\n');
      }
    }
  }

  return importance;
}

async function getTemporalDecay(): Promise<number> {
  console.log('\n=== TEMPORAL DECAY (λ) ===');
  console.log('Controls how quickly older interactions lose weight.');
  console.log('λ = 0: All interactions weighted equally regardless of age');
  console.log('λ = 0.5: Moderate decay (recommended)');
  console.log('λ = 1.0: Aggressive decay, recent interactions heavily favored\n');

  let valid = false;
  let lambda = 0;

  while (!valid) {
    const input = await question('Temporal decay λ (0.0 - 2.0, default 0.5): ');
    
    if (input.trim() === '') {
      lambda = 0.5;
      valid = true;
      console.log('Using default: 0.5\n');
    } else {
      lambda = parseFloat(input);
      if (lambda >= 0 && lambda <= 2.0) {
        valid = true;
        console.log(`✓ Temporal decay set to: ${lambda}\n`);
      } else {
        console.log('✗ Value must be between 0.0 and 2.0\n');
      }
    }
  }

  return lambda;
}

async function getTimeWindow(): Promise<TimeWindow> {
  console.log('\n=== TIME WINDOW ===');
  console.log('Define the date range for data analysis.\n');

  const startInput = await question('Start date (YYYY-MM-DD, default 2026-01-01): ');
  const endInput = await question('End date (YYYY-MM-DD, default 2026-01-31): ');

  const startDate = startInput.trim() === '' ? new Date('2026-01-01') : new Date(startInput);
  const endDate = endInput.trim() === '' ? new Date('2026-01-31') : new Date(endInput);

  const durationMs = endDate.getTime() - startDate.getTime();
  const durationDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));

  console.log(`✓ Time window: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  console.log(`  Duration: ${durationDays} days\n`);

  return {
    startDate,
    endDate,
    durationDays
  };
}

async function getTopicKeywords(): Promise<string[]> {
  console.log('\n=== TOPIC KEYWORDS ===');
  console.log('Enter keywords to filter relevant posts (comma-separated).\n');

  const input = await question('Keywords (default: blockchain,nft,github,python,javascript): ');
  
  if (input.trim() === '') {
    const defaults = ['blockchain', 'nft', 'github', 'python', 'javascript'];
    console.log(`Using defaults: ${defaults.join(', ')}\n`);
    return defaults;
  }

  const keywords = input.split(',').map(k => k.trim()).filter(k => k.length > 0);
  console.log(`✓ Keywords: ${keywords.join(', ')}\n`);
  return keywords;
}

export async function collectAnalysisParameters(): Promise<AnalysisParameters> {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║   INFLUENT PARAMETER CONFIGURATION                ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const weightPreferences = await getWeightPreferences();
  const sentimentImportance = await getSentimentImportance();
  const temporalDecay = await getTemporalDecay();
  const timeWindow = await getTimeWindow();
  const topicKeywords = await getTopicKeywords();

  const params: AnalysisParameters = {
    timeWindow,
    topicKeywords,
    regionAudience: 'Philippines',
    weightPreferences,
    sentimentImportance,
    temporalDecay
  };

  // Display summary
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║   PARAMETER SUMMARY                                ║');
  console.log('╚════════════════════════════════════════════════════╝\n');
  console.log(`Time Window: ${timeWindow.startDate.toISOString().split('T')[0]} to ${timeWindow.endDate.toISOString().split('T')[0]}`);
  console.log(`Keywords: ${topicKeywords.join(', ')}`);
  console.log(`\nEngagement Weights:`);
  console.log(`  Shares/Retweets: ${(weightPreferences.ws * 100).toFixed(1)}%`);
  console.log(`  Comments/Replies: ${(weightPreferences.wc * 100).toFixed(1)}%`);
  console.log(`  Likes: ${(weightPreferences.wi * 100).toFixed(1)}%`);
  console.log(`\nSentiment Importance: ${sentimentImportance}`);
  console.log(`Temporal Decay (λ): ${temporalDecay}\n`);

  const confirm = await question('Proceed with these parameters? (y/n): ');
  
  if (confirm.toLowerCase() !== 'y') {
    console.log('\nParameter configuration cancelled.');
    process.exit(0);
  }

  rl.close();
  return params;
}
