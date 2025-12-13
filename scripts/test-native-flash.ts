import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const apiKey = process.env.EVOLINK_API_KEY;
const baseUrl = process.env.EVOLINK_BASE_URL || 'https://api.evolink.ai';

async function testNativeFlash() {
  console.log('--- Testing Gemini 2.5 Flash (Native API) ---');
  
  // URL from OpenAPI: https://api.evolink.ai/v1beta/models/gemini-2.5-flash:generateContent
  // Method: POST
  // Headers: Authorization: Bearer <key>
  
  const url = `${baseUrl}/v1beta/models/gemini-2.5-flash:generateContent`;
  console.log(`URL: ${url}`);
  
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: "Hello, just reply with 'OK'." }
        ]
      }
    ],
    // Optional config from doc
    generationConfig: {
        maxOutputTokens: 10
    }
  };
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.log(`Body: ${text}`);

    if (res.ok) {
        console.log("✅ Native API Success!");
    } else {
        console.log("❌ Native API Failed.");
    }
  } catch (err) {
      console.error("❌ Exception:", err);
  }
}

testNativeFlash();
