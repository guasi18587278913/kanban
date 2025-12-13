import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const apiKey = process.env.EVOLINK_API_KEY;
const baseUrl = process.env.EVOLINK_BASE_URL || 'https://api.evolink.ai';

async function testGemini(modelName: string) {
  console.log(`Testing Gemini-style: ${modelName}...`);
  // Evolink Native API often uses /v1beta/models/{model}:generateContent
  const url = `${baseUrl}/v1beta/models/${modelName}:generateContent`;
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`, // Evolink uses Bearer usually
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 5 }
      }),
    });

    if (res.ok) {
        console.log(`✅ SUCCESS (Gemini-style): ${modelName}`);
        return true;
    } else {
        // const text = await res.text();
        console.log(`❌ FAILED (Gemini-style): ${modelName} - ${res.status}`);
        return false;
    }
  } catch (error) {
    console.error('❌ Exception:', error);
    return false;
  }
}

async function listNativeModels() {
  console.log('Listing Native Models (/v1beta/models)...');
  const url = `${baseUrl}/v1beta/models`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      console.log('✅ Native Models Response:');
      // Google API returns { models: [ { name: 'models/gemini-pro', ... } ] }
      // Evolink might mirror this.
      console.log(JSON.stringify(data, null, 2));
      
      const models = (data.models || []).map((m: any) => m.name);
      return models;
    } else {
      console.log(`❌ Failed to list native models: ${res.status}`);
      // console.log(await res.text());
      return [];
    }
  } catch (err) {
    console.error('❌ Exception:', err);
    return [];
  }
}

async function run() {
    await listNativeModels();

    const candidates = [
        'gemini-2.5-flash', 
        'gemini-1.5-flash',
    ];
    
    for (const m of candidates) {
         await testGemini(m);
    }
}

run();
