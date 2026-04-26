//######## RUN APIFY SCRAPER - COLLECT REAL DATA #########################

import 'dotenv/config';
import { runApifyScrape } from './apify-scraper';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function collectScrapeConfig() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║   APIFY TWITTER SCRAPER CONFIGURATION              ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Keywords
  const keywordsInput = await question('Enter search keywords (comma-separated, e.g., "AI,blockchain,web3"): ');
  const keywords = keywordsInput.split(',').map(k => k.trim()).filter(k => k.length > 0);

  // Min followers
  const minFollowersInput = await question('Minimum followers (default 100): ');
  const minFollowers = minFollowersInput.trim() === '' ? 100 : parseInt(minFollowersInput);

  // Min likes
  const minLikesInput = await question('Minimum average likes (default 5): ');
  const minAvgLikes = minLikesInput.trim() === '' ? 5 : parseInt(minLikesInput);

  // Date range (optional)
  const startDate = await question('Start date (YYYY-MM-DD, or blank): ');
  const endDate = await question('End date (YYYY-MM-DD, or blank): ');

  // Language
  const languageInput = await question('Language (e.g., "en" for English, default "en"): ');
  const language = languageInput.trim() === '' ? 'en' : languageInput.trim();

  // Max items
  const maxItemsInput = await question('Max items to scrape (default 100): ');
  const maxItems = maxItemsInput.trim() === '' ? 100 : parseInt(maxItemsInput);

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║   CONFIGURATION SUMMARY                            ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log(`Keywords: ${keywords.join(', ')}`);
  console.log(`Min Followers: ${minFollowers}`);
  console.log(`Min Likes: ${minAvgLikes}`);
  console.log(`Date Range: ${startDate || 'any'} to ${endDate || 'any'}`);
  console.log(`Language: ${language}`);
  console.log(`Max Items: ${maxItems}\n`);

  const confirm = await question('Proceed with scraping? (y/n): ');
  rl.close();

  if (confirm.toLowerCase() !== 'y') {
    console.log('\nScraping cancelled.\n');
    process.exit(0);
  }

  return {
    keywords,
    minFollowers,
    minAvgLikes,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    language,
    maxItems
  };
}

async function main() {
  console.log('\nINFLUENT Apify Scraper\n');

  // Check for API token
  if (!process.env.APIFY_API_TOKEN) {
    console.error('❌ Error: APIFY_API_TOKEN not found in .env file');
    console.error('Please add your Apify API token to .env:\n');
    console.error('APIFY_API_TOKEN=your_token_here\n');
    process.exit(1);
  }

  try {
    const config = await collectScrapeConfig();
    await runApifyScrape(config);
  } catch (error) {
    console.error('\n❌ Error during scraping:', error);
    process.exit(1);
  }
}

main();
