import 'dotenv/config';
import { ApifyClient } from 'apify-client';

async function testApify() {
  console.log('🧪 Testing Apify scraper directly...\n');

  const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

  // Simpler input
  const testInput = {
    "handles": ["elonmusk"],
    "tweetsDesired": 5
  };

  console.log('📋 Input:', JSON.stringify(testInput, null, 2));
  console.log('\n⏳ Calling Twitter scraper...');

  try {
    const run = await client.actor('quacker~twitter-scraper').call(testInput, {
      waitSecs: 120
    });

    console.log('\n✅ Run completed!');
    console.log('Status:', run.status);

    if (run.defaultDatasetId && run.status === 'SUCCEEDED') {
      const dataset = client.dataset(run.defaultDatasetId);
      const { items } = await dataset.listItems();
      
      console.log(`\n📊 Got ${items.length} items\n`);
      
      if (items.length > 0) {
        const sample = items[0] as any;
        console.log('✅ Sample tweet:');
        console.log('Text:', sample.text?.substring(0, 100));
        console.log('Author:', sample.author?.userName);
      }
    } else {
      console.log('❌ Run failed:', run.status);
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  }
}

testApify().then(() => process.exit(0));