//######## APIFY SCRAPER TEST - MINIMAL SCRAPE #########################

import 'dotenv/config';
import { ApifyClient } from 'apify-client';

async function testApifyScraper() {
  console.log('\n🧪 APIFY SCRAPER TEST\n');

  const apiToken = process.env.APIFY_API_TOKEN;
  if (!apiToken) {
    console.error('❌ APIFY_API_TOKEN not found in .env');
    return;
  }

  const client = new ApifyClient({ token: apiToken });

  // MINIMAL TEST - Just 1 keyword, 5 items
  const testInput = {
    searchTerms: ['AI'],
    maxItems: 5,
    tweetsDesired: 5,
    sort: 'Latest',
    tweetLanguage: 'en'
  };

  console.log('📋 Test Input:');
  console.log(JSON.stringify(testInput, null, 2));
  console.log('\n⏳ Starting scrape...\n');

  try {
    const run = await client.actor('61RPP7dywgiy0JPD0').call({ input: testInput });

    console.log('\n✅ Scrape completed!');
    console.log(`Status: ${run.status}`);
    console.log(`Dataset ID: ${run.defaultDatasetId}`);

    if (run.defaultDatasetId) {
      const dataset = client.dataset(run.defaultDatasetId);
      const { items } = await dataset.listItems();
      
      console.log(`\n📊 Items returned: ${items.length}`);
      
      if (items.length > 0) {
        console.log('\n✅ SUCCESS! Scraper is working!\n');
        console.log('Sample item:');
        const sample = items[0] as any;
        console.log('- Text:', sample.fullText?.substring(0, 100) + '...');
        console.log('- Author:', sample.author?.userName);
        console.log('- Likes:', sample.likeCount);
        console.log('- Created:', sample.createdAt);
      } else {
        console.log('\n⚠️  No items returned. This might indicate:');
        console.log('   - Twitter search returned no results for "AI"');
        console.log('   - Actor configuration issue');
        console.log('   - Rate limiting');
      }
    } else {
      console.log('\n❌ No dataset created');
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

testApifyScraper();
