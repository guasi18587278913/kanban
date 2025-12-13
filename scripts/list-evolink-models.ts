import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const apiKey = process.env.EVOLINK_API_KEY;
const baseUrl = process.env.EVOLINK_BASE_URL || 'https://api.evolink.ai';

if (!apiKey) {
  console.error('❌ Error: EVOLINK_API_KEY is not set in .env');
  process.exit(1);
}

async function listModels() {
  console.log('Listing Models...');
  const url = `${baseUrl}/v1/models`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      console.log('✅ Available Models:');
      const models = (data.data || []).map((m: any) => m.id);
      console.log(models.sort().join('\n'));
      
      // Check for specific flash models
      const flashModels = models.filter(m => m.includes('flash'));
      if (flashModels.length > 0) {
          console.log('\n✨ Flash Models found:');
          console.log(flashModels.join('\n'));
      }
    } else {
      console.log(`❌ Failed: ${res.status}`);
      console.log(await res.text());
    }
  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

listModels();
